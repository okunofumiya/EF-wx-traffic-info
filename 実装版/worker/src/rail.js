// 鉄道4路線（JR神戸線・JR加古川線・神戸電鉄 全線・山陽電車 本線）の運行有無取得・解析モジュール
// 案B（ハイブリッド方式）：
//   - 神戸電鉄: 公式運行情報サマリ JSON
//   - JR神戸線 / JR加古川線: JR西日本 公式運行情報 JSON (api/v1/trafficinfo.json)
//   - 山陽電車 本線: Yahoo!路線情報 近畿エリアページ (__NEXT_DATA__ ＆ HTMLテーブル)
// ※著作権・利用規約配慮のため、詳細本文の転載は行わず「平常運転(ok) / 運行情報あり(delay)」のステータスのみを扱う。

import { RAIL_SOURCES, RAIL_LINES } from "./config.js";

const LINE_META = Object.fromEntries(RAIL_LINES.map((l) => [l.id, l]));

function makeStatus(id, status) {
  const meta = LINE_META[id] || { id, name: id, infoUrl: "" };
  if (status === "delay") {
    return {
      id,
      name: meta.name,
      status: "delay",
      label: "運行情報あり",
      hasAlert: true,
      infoUrl: meta.infoUrl,
    };
  }
  if (status === "ok") {
    return {
      id,
      name: meta.name,
      status: "ok",
      label: "平常運転",
      hasAlert: false,
      infoUrl: meta.infoUrl,
    };
  }
  return {
    id,
    name: meta.name,
    status: "na",
    label: "確認中",
    hasAlert: false,
    infoUrl: meta.infoUrl,
  };
}

/**
 * 1. 神戸電鉄 公式JSONの解析
 */
export function parseShintetsu(data) {
  if (!data || data.kind_code === undefined || data.kind_code === null) {
    return makeStatus("shintetsu", "na");
  }
  const isNormal = String(data.kind_code) === "0";
  return {
    ...makeStatus("shintetsu", isNormal ? "ok" : "delay"),
    kind_code: String(data.kind_code),
  };
}

/**
 * 2. JR西日本 公式JSON (api/v1/trafficinfo.json) の解析
 *    対象: JR神戸線 (masterData id=4) / JR加古川線 (masterData id=16)
 */
export function parseJrWest(trafficData) {
  if (!trafficData || !Array.isArray(trafficData.areaTrafficInfos)) {
    return {
      "jr-kobe": makeStatus("jr-kobe", "na"),
      "jr-kakogawa": makeStatus("jr-kakogawa", "na"),
    };
  }

  // masterData から路線IDを解決（フォールバック: ＪＲ神戸線=4, 加古川線=16）
  let kobeId = 4;
  let kakogawaId = 16;
  const masterAreas = trafficData.masterData?.areas;
  if (Array.isArray(masterAreas)) {
    for (const area of masterAreas) {
      for (const place of area.places || []) {
        for (const line of place.lines || []) {
          const name = String(line.name || "");
          if (name.includes("神戸線")) kobeId = Number(line.id);
          if (name.includes("加古川線")) kakogawaId = Number(line.id);
        }
      }
    }
  }

  const hasLineTrouble = (targetId, nameKeyword) => {
    for (const area of trafficData.areaTrafficInfos) {
      // 1) conventionalLineDelayInfos のチェック
      const delayInfos = area.conventionalLineDelayInfos || [];
      for (const d of delayInfos) {
        if (Number(d.id) === targetId || String(d.lineName || d.name || "").includes(nameKeyword)) {
          return true;
        }
      }

      // 2) dailyData[0]（当日）の placeTrafficInfos -> conventionalLineTrafficInfos のチェック
      const today = Array.isArray(area.dailyData) ? area.dailyData[0] : null;
      const places = today?.placeTrafficInfos || [];
      for (const place of places) {
        const lineInfos = place.conventionalLineTrafficInfos || [];
        for (const info of lineInfos) {
          const idMatch = Number(info.id) === targetId || Number(info.lineId) === targetId;
          const nameMatch = String(info.lineName || info.name || "").includes(nameKeyword);
          if (idMatch || nameMatch) {
            // conventionalLineTrafficInfoDetails が存在し1件以上ある場合（または details 配列自体が省略されている場合）
            if (!Array.isArray(info.conventionalLineTrafficInfoDetails) || info.conventionalLineTrafficInfoDetails.length > 0) {
              return true;
            }
          }
        }
      }
    }
    return false;
  };

  const kobeAlert = hasLineTrouble(kobeId, "神戸線");
  const kakogawaAlert = hasLineTrouble(kakogawaId, "加古川線");

  return {
    "jr-kobe": makeStatus("jr-kobe", kobeAlert ? "delay" : "ok"),
    "jr-kakogawa": makeStatus("jr-kakogawa", kakogawaAlert ? "delay" : "ok"),
  };
}

/**
 * 3. Yahoo!路線情報 近畿エリアページから「山陽電鉄本線 (railCode: 354)」の運行有無を解析
 */
export function parseYahooSanyo(html) {
  if (!html || typeof html !== "string") {
    return makeStatus("sanyo", "na");
  }

  let parsed = false;
  let hasAlert = false;

  // 方法A: __NEXT_DATA__ JSON 内の troubleRails / diainfoTrainFeatures を検査
  const nextMatch = html.match(/<script\s+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (nextMatch) {
    try {
      const nextJson = JSON.parse(nextMatch[1]);
      const pageProps = nextJson?.props?.pageProps;
      if (pageProps) {
        if (Array.isArray(pageProps.troubleRails)) {
          parsed = true;
          for (const item of pageProps.troubleRails) {
            const prop = item?.routeInfo?.property || item;
            const code = String(prop?.railCode || item?.railCode || "");
            const name = String(prop?.railName || prop?.displayName || item?.railName || "");
            if (code === "354" || name.includes("山陽電鉄本線") || name.includes("山陽電車本線")) {
              hasAlert = true;
            }
          }
        }
        if (Array.isArray(pageProps.diainfoTrainFeatures)) {
          const flat = pageProps.diainfoTrainFeatures.flat(2);
          for (const feat of flat) {
            const prop = feat?.routeInfo?.property;
            if (!prop) continue;
            if (String(prop.railCode) === "354" || String(prop.railName || "").includes("山陽電鉄本線")) {
              parsed = true;
              const diainfo = prop.diainfo;
              if (diainfo && diainfo.serviceStatus && diainfo.serviceStatus !== "平常運転") {
                hasAlert = true;
              }
            }
          }
        }
      }
    } catch (_e) {
      // JSON パース失敗時は HTML テーブル解析へフォールバック
    }
  }

  // 方法B: HTML テーブル内の `/diainfo/354/0` 行を検査
  const rowMatch = html.match(/<a[^>]+href="[^"]*\/diainfo\/354\/0[^"]*"[^>]*>[\s\S]*?<\/a>\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i);
  if (rowMatch) {
    const statusText = rowMatch[1].replace(/<[^>]+>/g, "").trim();
    if (statusText) {
      parsed = true;
      if (statusText !== "平常運転") {
        hasAlert = true;
      }
    }
  }

  if (!parsed) {
    return makeStatus("sanyo", "na");
  }
  return makeStatus("sanyo", hasAlert ? "delay" : "ok");
}

/**
 * 4路線の運行状況を並列取得して統合オブジェクトを返す
 */
export async function fetchRailStatuses(now = Date.now(), prevRail = null) {
  const headers = {
    "User-Agent": "Mozilla/5.0 (compatible; keihou-dashboard/0.10)",
    Accept: "application/json, text/html, */*",
  };

  const [shintetsuRes, jrRes, yahooRes] = await Promise.allSettled([
    fetch(RAIL_SOURCES.shintetsu, { headers }).then((r) => {
      if (!r.ok) throw new Error(`Shintetsu HTTP ${r.status}`);
      return r.json();
    }),
    fetch(RAIL_SOURCES.jrWestTraffic, { headers }).then((r) => {
      if (!r.ok) throw new Error(`JR West HTTP ${r.status}`);
      return r.json();
    }),
    fetch(RAIL_SOURCES.yahooKinki, { headers }).then((r) => {
      if (!r.ok) throw new Error(`Yahoo Transit HTTP ${r.status}`);
      return r.text();
    }),
  ]);

  const prevLines = prevRail?.lines || {};

  // 1. 神戸電鉄
  let shintetsuRaw = null;
  let shintetsuLine;
  if (shintetsuRes.status === "fulfilled") {
    shintetsuRaw = shintetsuRes.value;
    shintetsuLine = parseShintetsu(shintetsuRaw);
  } else {
    console.warn("Shintetsu fetch failed:", shintetsuRes.reason);
    shintetsuLine = prevLines["shintetsu"] || makeStatus("shintetsu", "na");
  }

  // 2. JR神戸線・JR加古川線
  let jrLines;
  if (jrRes.status === "fulfilled") {
    jrLines = parseJrWest(jrRes.value);
  } else {
    console.warn("JR West fetch failed:", jrRes.reason);
    jrLines = {
      "jr-kobe": prevLines["jr-kobe"] || makeStatus("jr-kobe", "na"),
      "jr-kakogawa": prevLines["jr-kakogawa"] || makeStatus("jr-kakogawa", "na"),
    };
  }

  // 3. 山陽電車 本線
  let sanyoLine;
  if (yahooRes.status === "fulfilled") {
    sanyoLine = parseYahooSanyo(yahooRes.value);
    if (sanyoLine.status === "na" && prevLines["sanyo"]) {
      sanyoLine = prevLines["sanyo"];
    }
  } else {
    console.warn("Yahoo Sanyo fetch failed:", yahooRes.reason);
    sanyoLine = prevLines["sanyo"] || makeStatus("sanyo", "na");
  }

  return {
    checkedAt: new Date(now).toISOString(),
    lines: {
      "jr-kobe": jrLines["jr-kobe"],
      "jr-kakogawa": jrLines["jr-kakogawa"],
      shintetsu: shintetsuLine,
      sanyo: sanyoLine,
    },
    shintetsuRaw,
  };
}

