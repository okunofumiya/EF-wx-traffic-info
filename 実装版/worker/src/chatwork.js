import { RAIL_LINKS, DASHBOARD_URL, SHINTETSU } from "./config.js";

/**
 * Chatwork にメッセージを送信する
 */
export async function sendChatworkMessage({ token, roomId, body }) {
  if (!token || !roomId) {
    console.warn("Chatwork token or roomId is not set; skipping notification.");
    return false;
  }
  const url = `https://api.chatwork.com/v2/rooms/${roomId}/messages`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "X-ChatWorkToken": token,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ body }).toString(),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error(`Chatwork API failed: ${res.status} ${err}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Chatwork fetch error:", err);
    return false;
  }
}

/**
 * 気象警報の変更イベントから Chatwork 用メッセージを生成する
 * 警報級（level >= 3: 警報・危険警報・特別警報）の発表・解除・レベル変化のみを対象とする
 */
export function buildWeatherAlertMessage(events) {
  if (!events || events.length === 0) return null;

  // 警報級以上（level >= 3 または 解除前が level >= 3）のみ抽出
  const alertEvents = events.filter((e) => {
    if (e.level >= 3) return true;
    if (e.type === "cleared" && (e.fromLevel >= 3 || e.level >= 3)) return true;
    if (e.type === "downgraded" && e.fromLevel >= 3) return true;
    return false;
  });

  if (alertEvents.length === 0) return null;

  // 発表・引き上げ（issued / upgraded）
  const issued = alertEvents.filter((e) => e.type === "issued" || e.type === "upgraded");
  // 解除・注意報へ引き下げ（cleared / downgraded）
  const cleared = alertEvents.filter((e) => e.type === "cleared" || e.type === "downgraded");

  const lines = ["[info][title]⚠ 【気象警報】発表・解除のお知らせ[/title]"];
  lines.push("対象地域で気象警報の発表または解除が検知されました。");
  lines.push("通勤経路の安全確保や運行状況の確認を行ってください。\n");

  if (issued.length > 0) {
    lines.push("【発表・警戒レベル引き上げ】");
    const byArea = groupEventsByArea(issued);
    for (const [area, items] of byArea) {
      const labels = items.map((i) => i.label || `${i.kindName}${i.levelName}`).join("・");
      lines.push(`・${area}：${labels}`);
    }
    lines.push("");
  }

  if (cleared.length > 0) {
    lines.push("【解除・注意報へ移行】");
    const byArea = groupEventsByArea(cleared);
    for (const [area, items] of byArea) {
      const labels = items
        .map((i) => {
          if (i.type === "downgraded") return `${i.kindName}（${i.levelName}へ引下げ）`;
          return `${i.kindName}（解除）`;
        })
        .join("・");
      lines.push(`・${area}：${labels}`);
    }
    lines.push("");
  }

  lines.push("▼ 鉄道運行情報");
  for (const r of RAIL_LINKS) {
    lines.push(`・${r.name}： ${r.url}`);
  }
  lines.push(`\n▼ 警報ダッシュボード\n${DASHBOARD_URL}`);
  lines.push("[/info]");

  return lines.join("\n");
}

function groupEventsByArea(events) {
  const map = new Map();
  for (const e of events) {
    const list = map.get(e.areaName) ?? [];
    list.push(e);
    map.set(e.areaName, list);
  }
  return map;
}

/**
 * 神戸電鉄のお知らせ状態変化から Chatwork 用メッセージを生成する
 */
export function buildShintetsuAlertMessage(curr, prev) {
  if (!curr) return null;

  const currCode = String(curr.kind_code ?? "0");
  const prevCode = prev ? String(prev.kind_code ?? "0") : "0";

  // 平常(0) → お知らせあり(0以外)
  if (currCode !== "0" && prevCode === "0") {
    return [
      "[info][title]⚠ 【神戸電鉄】運行情報にお知らせがあります[/title]",
      "神戸電鉄の運行情報にお知らせ（遅延・運転見合わせ等）が発表されています。",
      "運転状況や対象区間の詳細は、以下の公式ページをご確認ください。\n",
      `▼ 神戸電鉄 運行情報\n${SHINTETSU.infoUrl}\n`,
      `▼ 警報ダッシュボード\n${DASHBOARD_URL}`,
      "[/info]",
    ].join("\n");
  }

  // お知らせあり(0以外) → 平常(0)
  if (currCode === "0" && prevCode !== "0") {
    return [
      "[info][title]✅ 【神戸電鉄】平常運転に復帰しました[/title]",
      "神戸電鉄の運行情報のお知らせが解除され、平常運転に戻りました。\n",
      `▼ 神戸電鉄 運行情報\n${SHINTETSU.infoUrl}`,
      "[/info]",
    ].join("\n");
  }

  return null;
}
