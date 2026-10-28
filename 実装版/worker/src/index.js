// Cloudflare Workers の入口。
// - scheduled: 定期的に気象庁・神戸電鉄・道路交通情報を取得 → 整形 → KV に保存 ＆ Chatwork 通知
// - fetch: ダッシュボード向けに保存済みのスナップショット等を返す

import { sourceUrls, SHINTETSU } from "./config.js";
import { buildSnapshot, diffSnapshots } from "./jma.js";
import {
  sendChatworkMessage,
  buildWeatherAlertMessage,
  buildShintetsuAlertMessage,
} from "./chatwork.js";
import { fetchGoogleTraffic, shouldUpdateTraffic, generateMockTraffic } from "./traffic.js";

const KEY_SNAPSHOT = "snapshot";
const KEY_CHECKED = "checkedAt"; // 最後に気象庁から取得できた時刻
const KEY_EVENTS = "events"; // 直近の変化
const KEY_SHINTETSU = "shintetsu_summary"; // 神戸電鉄の直近ステータス
const KEY_TRAFFIC = "traffic_snapshot"; // 道路交通情報
const KEY_TRAFFIC_CHECKED = "traffic_checkedAt"; // 道路情報の取得時刻（ミリ秒）
const MAX_EVENTS = 100;

async function fetchJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": "keihou-dashboard/0.1" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

/**
 * 道路交通情報のスケジュール更新（7〜9時・17〜19時は10分毎、9〜17時は1時間毎）
 */
export async function refreshTrafficIfNeeded(env, now = Date.now()) {
  try {
    const lastCheckedStr = await env.KV.get(KEY_TRAFFIC_CHECKED);
    const lastChecked = lastCheckedStr ? Number(lastCheckedStr) : 0;
    const existing = await env.KV.get(KEY_TRAFFIC);
    const parsedExisting = existing ? JSON.parse(existing) : null;
    const isUpgradingFromMock = Boolean(env.GOOGLE_MAPS_API_KEY && (!parsedExisting || parsedExisting.isMock || !parsedExisting.quota));

    // 既に実データがあり、かつスケジュール更新タイミングでない場合はスキップ（無料枠の厳格保護）
    if (existing && !isUpgradingFromMock && !shouldUpdateTraffic(now, lastChecked)) {
      return { updated: false };
    }

    // APIキー未設定の初回で夜間（スケジュール外）の場合は、モック/基準値で初期化
    if (!existing && !env.GOOGLE_MAPS_API_KEY && !shouldUpdateTraffic(now, 0)) {
      const initData = generateMockTraffic(now);
      await env.KV.put(KEY_TRAFFIC, JSON.stringify(initData));
      await env.KV.put(KEY_TRAFFIC_CHECKED, String(now));
      return { updated: true, initializedWithBase: true };
    }

    const trafficData = await fetchGoogleTraffic(env.GOOGLE_MAPS_API_KEY, now, env.KV);
    await env.KV.put(KEY_TRAFFIC, JSON.stringify(trafficData));
    await env.KV.put(KEY_TRAFFIC_CHECKED, String(now));
    return { updated: true, isMock: trafficData.isMock };
  } catch (err) {
    console.error("Traffic scheduled refresh error:", err);
    return { updated: false, error: err.message };
  }
}

export async function refresh(env, now = Date.now()) {
  const urls = sourceUrls();
  const [warning, timeline, probability] = await Promise.all([
    fetchJson(urls.warning),
    fetchJson(urls.timeline),
    fetchJson(urls.probability),
  ]);
  const next = buildSnapshot({ warning, timeline, probability }, now);

  const prev = JSON.parse((await env.KV.get(KEY_SNAPSHOT)) ?? "null");
  const events = diffSnapshots(prev, next);

  // 取得に成功した時刻は毎回記録する（画面の「最終更新」と古さの判定に使う）
  await env.KV.put(KEY_CHECKED, next.generatedAt);

  // 1. 気象警報の Chatwork 通知判定（警報・危険警報・特別警報の発表/解除等）
  if (events.length) {
    const weatherMsg = buildWeatherAlertMessage(events);
    if (weatherMsg) {
      await sendChatworkMessage({
        token: env.CHATWORK_API_TOKEN,
        roomId: env.CHATWORK_ROOM_ID,
        body: weatherMsg,
      });
    }
  }

  // 2. 神戸電鉄のお知らせ検知・通知判定
  try {
    const shintetsuCurr = await fetchJson(SHINTETSU.summaryUrl);
    const shintetsuPrev = JSON.parse((await env.KV.get(KEY_SHINTETSU)) ?? "null");
    const shintetsuMsg = buildShintetsuAlertMessage(shintetsuCurr, shintetsuPrev);
    if (shintetsuMsg) {
      await sendChatworkMessage({
        token: env.CHATWORK_API_TOKEN,
        roomId: env.CHATWORK_ROOM_ID,
        body: shintetsuMsg,
      });
    }
    // 状態が変化したときのみ KV を更新
    if (!shintetsuPrev || String(shintetsuPrev.kind_code) !== String(shintetsuCurr.kind_code)) {
      await env.KV.put(KEY_SHINTETSU, JSON.stringify(shintetsuCurr));
    }
  } catch (err) {
    console.error("Shintetsu summary fetch error:", err);
  }

  // 3. 道路交通情報のスケジュール更新判定（7〜9時/17〜19時は10分毎、9〜17時は1時間毎）
  await refreshTrafficIfNeeded(env, now);

  // スナップショット本体は、内容が同じなら書き込まない（KV の書き込み回数の節約）
  const strip = (s) => JSON.stringify({ ...s, generatedAt: null });
  if (prev && strip(prev) === strip(next)) return { changed: false, events: [] };

  await env.KV.put(KEY_SNAPSHOT, JSON.stringify(next));
  if (events.length) {
    const log = JSON.parse((await env.KV.get(KEY_EVENTS)) ?? "[]");
    const stamped = events.map((e) => ({ ...e, detectedAt: next.generatedAt }));
    await env.KV.put(KEY_EVENTS, JSON.stringify([...stamped, ...log].slice(0, MAX_EVENTS)));
  }
  return { changed: true, events };
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, max-age=60",
};

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(refresh(env));
  },

  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    // 道路交通情報API (/api/traffic)
    // ※ブラウザからのアクセスでは原則KVキャッシュを返し、指定スケジュール時のみ更新する
    if (pathname === "/api/traffic") {
      try {
        const now = Date.now();
        await refreshTrafficIfNeeded(env, now);
        let cached = await env.KV.get(KEY_TRAFFIC);
        if (!cached) {
          cached = JSON.stringify(generateMockTraffic(now));
        }
        return new Response(cached, {
          headers: { "Content-Type": "application/json; charset=utf-8", ...CORS },
        });
      } catch (err) {
        console.error("Traffic API error:", err);
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { "Content-Type": "application/json; charset=utf-8", ...CORS },
        });
      }
    }

    const key =
      pathname === "/api/snapshot"
        ? KEY_SNAPSHOT
        : pathname === "/api/events"
        ? KEY_EVENTS
        : pathname === "/api/shintetsu"
        ? KEY_SHINTETSU
        : null;
    if (!key) return new Response("not found", { status: 404 });
    let body = await env.KV.get(key);
    if (!body) return new Response("not ready", { status: 503 });
    if (key === KEY_SNAPSHOT) {
      // generatedAt は内容が変わった時刻。取得できた最新時刻を checkedAt として添える
      const snap = JSON.parse(body);
      snap.checkedAt = (await env.KV.get(KEY_CHECKED)) ?? snap.generatedAt;
      body = JSON.stringify(snap);
    }
    return new Response(body, { headers: { "Content-Type": "application/json; charset=utf-8", ...CORS } });
  },
};
