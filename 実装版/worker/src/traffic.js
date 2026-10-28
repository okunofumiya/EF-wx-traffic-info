// 道路交通情報（区間所要時間）の定義と取得・算出ロジック
// Google Maps Platform Routes API (computeRoutes / computeRouteMatrix) 対応
// 無料枠（各SKU 月5,000回）を絶対に超えないための片道ルート集約＆月間クォータ保護付き

export const TRAFFIC_SECTIONS = [
  // 1. 国道175号 南行き (滝野社IC -> 森友)
  {
    id: "r175-s-1",
    road: "r175",
    roadName: "国道175号",
    direction: "south",
    directionLabel: "南行（明石方面）",
    name: "滝野社IC → 天神町",
    from: "滝野社IC",
    to: "天神町",
    origin: { lat: 34.933809, lng: 134.961136 },
    destination: { lat: 34.846492, lng: 134.949902 },
    baseDurationSec: 1020, // 17分
    distanceKm: 9.8,
  },
  {
    id: "r175-s-2",
    road: "r175",
    roadName: "国道175号",
    direction: "south",
    directionLabel: "南行（明石方面）",
    name: "天神町 → 田井西",
    from: "天神町",
    to: "田井西",
    origin: { lat: 34.846492, lng: 134.949902 },
    destination: { lat: 34.743529, lng: 134.984323 },
    baseDurationSec: 1260, // 21分
    distanceKm: 11.9,
  },
  {
    id: "r175-s-3",
    road: "r175",
    roadName: "国道175号",
    direction: "south",
    directionLabel: "南行（明石方面）",
    name: "田井西 → 森友",
    from: "田井西",
    to: "森友",
    origin: { lat: 34.743529, lng: 134.984323 },
    destination: { lat: 34.668495, lng: 134.980316 },
    baseDurationSec: 1080, // 18分
    distanceKm: 8.4,
  },

  // 2. 国道175号 北行き (森友 -> 滝野社IC)
  {
    id: "r175-n-1",
    road: "r175",
    roadName: "国道175号",
    direction: "north",
    directionLabel: "北行（社方面）",
    name: "森友 → 田井西",
    from: "森友",
    to: "田井西",
    origin: { lat: 34.668495, lng: 134.980316 },
    destination: { lat: 34.743529, lng: 134.984323 },
    baseDurationSec: 1080, // 18分
    distanceKm: 8.4,
  },
  {
    id: "r175-n-2",
    road: "r175",
    roadName: "国道175号",
    direction: "north",
    directionLabel: "北行（社方面）",
    name: "田井西 → 天神町",
    from: "田井西",
    to: "天神町",
    origin: { lat: 34.743529, lng: 134.984323 },
    destination: { lat: 34.846492, lng: 134.949902 },
    baseDurationSec: 1260, // 21分
    distanceKm: 11.9,
  },
  {
    id: "r175-n-3",
    road: "r175",
    roadName: "国道175号",
    direction: "north",
    directionLabel: "北行（社方面）",
    name: "天神町 → 滝野社IC",
    from: "天神町",
    to: "滝野社IC",
    origin: { lat: 34.846492, lng: 134.949902 },
    destination: { lat: 34.933941, lng: 134.961125 },
    baseDurationSec: 1020, // 17分
    distanceKm: 9.8,
  },

  // 3. 東播磨道 下り (加古川 -> 小野)
  {
    id: "hharima-d-1",
    road: "higashiharima",
    roadName: "東播磨道",
    direction: "down",
    directionLabel: "下り（小野方面）",
    name: "加古川 → 小野",
    from: "加古川",
    to: "小野",
    origin: { lat: 34.763194, lng: 134.855728 },
    destination: { lat: 34.823413, lng: 134.947590 },
    baseDurationSec: 720, // 12分
    distanceKm: 10.7,
  },

  // 4. 東播磨道 上り (小野 -> 加古川)
  {
    id: "hharima-u-1",
    road: "higashiharima",
    roadName: "東播磨道",
    direction: "up",
    directionLabel: "上り（加古川方面）",
    name: "小野 → 加古川",
    from: "小野",
    to: "加古川",
    origin: { lat: 34.822921, lng: 134.946674 },
    destination: { lat: 34.763713, lng: 134.858420 },
    baseDurationSec: 720, // 12分
    distanceKm: 10.7,
  },

  // 5. 明姫幹線 東行き (中筋西 -> 森友)
  {
    id: "meiki-e-1",
    road: "meiki",
    roadName: "明姫幹線",
    direction: "east",
    directionLabel: "東行（明石方面）",
    name: "中筋西 → 坂井",
    from: "中筋西",
    to: "坂井",
    origin: { lat: 34.786743, lng: 134.776972 },
    destination: { lat: 34.736955, lng: 134.850148 },
    baseDurationSec: 960, // 16分
    distanceKm: 8.7,
  },
  {
    id: "meiki-e-2",
    road: "meiki",
    roadName: "明姫幹線",
    direction: "east",
    directionLabel: "東行（明石方面）",
    name: "坂井 → 谷池",
    from: "坂井",
    to: "谷池",
    origin: { lat: 34.736955, lng: 134.850148 },
    destination: { lat: 34.682632, lng: 134.927705 },
    baseDurationSec: 1080, // 18分
    distanceKm: 9.3,
  },
  {
    id: "meiki-e-3",
    road: "meiki",
    roadName: "明姫幹線",
    direction: "east",
    directionLabel: "東行（明石方面）",
    name: "谷池 → 森友",
    from: "谷池",
    to: "森友",
    origin: { lat: 34.682632, lng: 134.927705 },
    destination: { lat: 34.668495, lng: 134.980316 },
    baseDurationSec: 660, // 11分
    distanceKm: 5.1,
  },

  // 6. 明姫幹線 西行き (森友 -> 中筋西)
  {
    id: "meiki-w-1",
    road: "meiki",
    roadName: "明姫幹線",
    direction: "west",
    directionLabel: "西行（姫路方面）",
    name: "森友 → 谷池",
    from: "森友",
    to: "谷池",
    origin: { lat: 34.668495, lng: 134.980316 },
    destination: { lat: 34.682632, lng: 134.927705 },
    baseDurationSec: 660, // 11分
    distanceKm: 5.1,
  },
  {
    id: "meiki-w-2",
    road: "meiki",
    roadName: "明姫幹線",
    direction: "west",
    directionLabel: "西行（姫路方面）",
    name: "谷池 → 坂井",
    from: "谷池",
    to: "坂井",
    origin: { lat: 34.682632, lng: 134.927705 },
    destination: { lat: 34.736955, lng: 134.850148 },
    baseDurationSec: 1080, // 18分
    distanceKm: 9.3,
  },
  {
    id: "meiki-w-3",
    road: "meiki",
    roadName: "明姫幹線",
    direction: "west",
    directionLabel: "西行（姫路方面）",
    name: "坂井 → 中筋西",
    from: "坂井",
    to: "中筋西",
    origin: { lat: 34.736955, lng: 134.850148 },
    destination: { lat: 34.786743, lng: 134.776972 },
    baseDurationSec: 960, // 16分
    distanceKm: 8.7,
  },

  // 7. 加古川・姫路バイパス 東行き (別所SA -> 明石西)
  {
    id: "bypass-e-1",
    road: "bypass",
    roadName: "加古川・姫路バイパス",
    direction: "east",
    directionLabel: "東行（明石方面）",
    name: "別所SA → 加古川中央",
    from: "別所SA",
    to: "加古川中央",
    origin: { lat: 34.800136, lng: 134.752396 },
    destination: { lat: 34.762376, lng: 134.854114 },
    baseDurationSec: 660, // 11分
    distanceKm: 10.2,
  },
  {
    id: "bypass-e-2",
    road: "bypass",
    roadName: "加古川・姫路バイパス",
    direction: "east",
    directionLabel: "東行（明石方面）",
    name: "加古川中央 → 明石西",
    from: "加古川中央",
    to: "明石西",
    origin: { lat: 34.762376, lng: 134.854114 },
    destination: { lat: 34.721468, lng: 134.896842 },
    baseDurationSec: 420, // 7分
    distanceKm: 6.0,
  },

  // 8. 加古川・姫路バイパス 西行き (明石西 -> 別所SA)
  {
    id: "bypass-w-1",
    road: "bypass",
    roadName: "加古川・姫路バイパス",
    direction: "west",
    directionLabel: "西行（姫路方面）",
    name: "明石西 → 加古川中央",
    from: "明石西",
    to: "加古川中央",
    origin: { lat: 34.721468, lng: 134.896842 },
    destination: { lat: 34.762729, lng: 134.853540 },
    baseDurationSec: 420, // 7分
    distanceKm: 6.0,
  },
  {
    id: "bypass-w-2",
    road: "bypass",
    roadName: "加古川・姫路バイパス",
    direction: "west",
    directionLabel: "西行（姫路方面）",
    name: "加古川中央 → 別所SA",
    from: "加古川中央",
    to: "別所SA",
    origin: { lat: 34.762729, lng: 134.853540 },
    destination: { lat: 34.799512, lng: 134.755185 },
    baseDurationSec: 660, // 11分
    distanceKm: 10.2,
  },
];

// 片道ずつ連続する区間グループ（折り返しによる迂回を防ぎつつ1リクエストに集約）
export const ROUTE_CHAINS = [
  { id: "r175-s", sectionIds: ["r175-s-1", "r175-s-2", "r175-s-3"] },
  { id: "r175-n", sectionIds: ["r175-n-1", "r175-n-2", "r175-n-3"] },
  { id: "meiki-e", sectionIds: ["meiki-e-1", "meiki-e-2", "meiki-e-3"] },
  { id: "meiki-w", sectionIds: ["meiki-w-1", "meiki-w-2", "meiki-w-3"] },
];

// 各SKUの無料枠（月5,000回）に対する安全上限（4,850回で自動停止）
export const MONTHLY_FREE_CAP_LIMIT = 4850;
// バイパス東行（2区間）を computeRoutes から computeRouteMatrix に切り替える閾値
export const BYPASS_SWITCH_THRESHOLD = 4750;

/**
 * Google Maps URL生成（経路案内）
 */
export function buildGoogleMapsRouteUrl(origin, destination) {
  return `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${destination.lat},${destination.lng}&travelmode=driving`;
}

/**
 * 更新スケジュール判定（日本時間 JST 基準）
 * - 7:00〜8:59、17:00〜18:59 : 10分ごとに更新（前回更新から8分以上経過で許可）
 * - 9:00〜16:59、19:00〜19:09 : 1時間ごとに更新（毎時0〜9分かつ前回更新から50分以上経過で許可）
 * - 19:10〜翌6:59 : 更新しない
 */
export function shouldUpdateTraffic(nowMs = Date.now(), lastCheckedMs = 0) {
  const jst = new Date(nowMs + 9 * 3600 * 1000);
  const hour = jst.getUTCHours();
  const min = jst.getUTCMinutes();
  const elapsedMin = (nowMs - lastCheckedMs) / 60000;

  // 7:00〜8:59 または 17:00〜18:59 → 10分間隔
  if (hour === 7 || hour === 8 || hour === 17 || hour === 18) {
    return elapsedMin >= 8 && min % 10 < 5;
  }

  // 9:00〜16:59 または 19:00台（19:00の最終更新） → 毎時0分台（0〜4分）の1回のみ更新
  if ((hour >= 9 && hour <= 16) || hour === 19) {
    return elapsedMin >= 8 && min < 5;
  }

  // 夜間・早朝（19:05〜翌6:59）は更新しない
  return false;
}

/**
 * 日本時間の年月キー（例: "2026-10"）を返す
 */
export function getJstMonthKey(nowMs = Date.now()) {
  const jst = new Date(nowMs + 9 * 3600 * 1000);
  return jst.toISOString().slice(0, 7);
}

/**
 * 秒数文字列（例: "1020s"）を数値（秒）に変換
 */
export function parseDurationSec(durationStr, fallbackSec) {
  if (!durationStr || typeof durationStr !== "string") return fallbackSec;
  const val = parseFloat(durationStr.replace("s", ""));
  return Number.isFinite(val) && val > 0 ? Math.round(val) : fallbackSec;
}

/**
 * 秒数から画面表示用の区間オブジェクトを組み立てる
 */
function buildSectionResult(sec, durationSec, durationInTrafficSec) {
  const delaySec = Math.max(0, durationInTrafficSec - durationSec);
  const durationMin = Math.round(durationSec / 60);
  const durationInTrafficMin = Math.round(durationInTrafficSec / 60);
  const delayMin = Math.round(delaySec / 60);
  const status = delayMin >= 8 ? "heavy" : delayMin >= 3 ? "crowded" : "normal";

  return {
    id: sec.id,
    road: sec.road,
    roadName: sec.roadName,
    direction: sec.direction,
    directionLabel: sec.directionLabel,
    name: sec.name,
    from: sec.from,
    to: sec.to,
    distanceKm: sec.distanceKm,
    durationMin,
    durationInTrafficMin,
    delayMin,
    status,
    mapUrl: buildGoogleMapsRouteUrl(sec.origin, sec.destination),
  };
}

/**
 * モック交通データの生成（APIキー未設定時・テスト用）
 */
export function generateMockTraffic(now = Date.now()) {
  const jst = new Date(now + 9 * 3600 * 1000);
  const hour = jst.getUTCHours();
  const isRush = (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19);

  const sections = TRAFFIC_SECTIONS.map((sec, idx) => {
    let delayMin = 0;
    if (isRush) {
      if (sec.road === "bypass" && sec.id.includes("1")) delayMin = 6;
      else if (sec.road === "meiki" && sec.id.includes("2")) delayMin = 4;
      else if (sec.road === "r175" && sec.id.includes("2")) delayMin = 3;
    } else {
      if (idx % 5 === 1) delayMin = 2;
    }

    const durationMin = Math.round(sec.baseDurationSec / 60);
    const durationInTrafficMin = durationMin + delayMin;
    const status = delayMin >= 8 ? "heavy" : delayMin >= 3 ? "crowded" : "normal";

    return {
      id: sec.id,
      road: sec.road,
      roadName: sec.roadName,
      direction: sec.direction,
      directionLabel: sec.directionLabel,
      name: sec.name,
      from: sec.from,
      to: sec.to,
      distanceKm: sec.distanceKm,
      durationMin,
      durationInTrafficMin,
      delayMin,
      status,
      mapUrl: buildGoogleMapsRouteUrl(sec.origin, sec.destination),
    };
  });

  return {
    isMock: true,
    checkedAt: new Date(now).toISOString(),
    sections,
  };
}

/**
 * Google Routes API: computeRoutes（片道複数区間を1リクエストで取得）
 */
async function callComputeRoutes(apiKey, chainSections) {
  const first = chainSections[0];
  const last = chainSections[chainSections.length - 1];
  const intermediates = chainSections.slice(0, -1).map((s) => ({
    location: { latLng: { latitude: s.destination.lat, longitude: s.destination.lng } },
  }));

  const body = {
    origin: { location: { latLng: { latitude: first.origin.lat, longitude: first.origin.lng } } },
    destination: { location: { latLng: { latitude: last.destination.lat, longitude: last.destination.lng } } },
    intermediates,
    travelMode: "DRIVE",
    routingPreference: "TRAFFIC_AWARE",
  };

  const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "routes.legs.duration,routes.legs.staticDuration",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`computeRoutes HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  const legs = data?.routes?.[0]?.legs;
  if (!Array.isArray(legs) || legs.length !== chainSections.length) {
    throw new Error(`computeRoutes legs mismatch: expected ${chainSections.length}, got ${legs?.length}`);
  }

  return chainSections.map((sec, idx) => {
    const leg = legs[idx];
    const staticSec = parseDurationSec(leg.staticDuration, sec.baseDurationSec);
    const trafficSec = parseDurationSec(leg.duration, staticSec);
    return buildSectionResult(sec, staticSec, trafficSec);
  });
}

/**
 * Google Routes API: computeRouteMatrix（1区間＝1要素で取得）
 */
async function callComputeRouteMatrixSingle(apiKey, sec) {
  const body = {
    origins: [{ waypoint: { location: { latLng: { latitude: sec.origin.lat, longitude: sec.origin.lng } } } }],
    destinations: [{ waypoint: { location: { latLng: { latitude: sec.destination.lat, longitude: sec.destination.lng } } } }],
    travelMode: "DRIVE",
    routingPreference: "TRAFFIC_AWARE",
  };

  const res = await fetch("https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "originIndex,destinationIndex,duration,staticDuration,condition",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`computeRouteMatrix HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  const elem = Array.isArray(data) ? data[0] : null;
  if (!elem || (elem.condition && elem.condition !== "ROUTE_EXISTS")) {
    throw new Error(`computeRouteMatrix condition: ${elem?.condition || "EMPTY"}`);
  }

  const staticSec = parseDurationSec(elem.staticDuration, sec.baseDurationSec);
  const trafficSec = parseDurationSec(elem.duration, staticSec);
  return buildSectionResult(sec, staticSec, trafficSec);
}

/**
 * Google Maps Routes API を呼び出して全18区間のリアルタイム交通情報を取得
 * - 片道ずつ正確に取得（折り返しなし）
 * - Compute Routes Pro と Compute Route Matrix Pro の2つの無料枠（各月5,000回）に分散
 * - KV の月間カウンターで無料枠上限（4,850回）を厳守
 */
export async function fetchGoogleTraffic(apiKey, now = Date.now(), kv = null) {
  if (!apiKey) {
    return generateMockTraffic(now);
  }

  const secById = Object.fromEntries(TRAFFIC_SECTIONS.map((s) => [s.id, s]));
  const monthKey = getJstMonthKey(now);
  const keyRoutesQuota = `traffic_quota_routes_${monthKey}`;
  const keyMatrixQuota = `traffic_quota_matrix_${monthKey}`;

  let routesUsed = 0;
  let matrixUsed = 0;
  if (kv) {
    routesUsed = Number((await kv.get(keyRoutesQuota)) || 0);
    matrixUsed = Number((await kv.get(keyMatrixQuota)) || 0);
  }

  const resolvedMap = {};
  const tasks = [];

  // 1. 4本の3区間ルート（175号南行・北行、明姫幹線東行・西行） -> computeRoutes (4リクエスト)
  const chainsToRun = [...ROUTE_CHAINS];
  // バイパス東行（2区間）は computeRoutes の使用量が 4,750 未満なら computeRoutes（1リクエスト）、それ以降は computeRouteMatrix（2要素）へ自動振替
  const useRoutesForBypassEast = routesUsed + 5 <= BYPASS_SWITCH_THRESHOLD;
  if (useRoutesForBypassEast) {
    chainsToRun.push({ id: "bypass-e", sectionIds: ["bypass-e-1", "bypass-e-2"] });
  }

  if (routesUsed + chainsToRun.length <= MONTHLY_FREE_CAP_LIMIT) {
    routesUsed += chainsToRun.length;
    for (const chain of chainsToRun) {
      const chainSecs = chain.sectionIds.map((id) => secById[id]);
      tasks.push(
        callComputeRoutes(apiKey, chainSecs).then((list) => {
          for (const item of list) resolvedMap[item.id] = item;
        })
      );
    }
  }

  // 2. 東播磨道（下り・上り）＋バイパス西行（2区間）[＋振替時のバイパス東行] -> computeRouteMatrix
  const matrixSecIds = ["hharima-d-1", "hharima-u-1", "bypass-w-1", "bypass-w-2"];
  if (!useRoutesForBypassEast) {
    matrixSecIds.push("bypass-e-1", "bypass-e-2");
  }

  if (matrixUsed + matrixSecIds.length <= MONTHLY_FREE_CAP_LIMIT) {
    matrixUsed += matrixSecIds.length;
    for (const id of matrixSecIds) {
      const sec = secById[id];
      tasks.push(
        callComputeRouteMatrixSingle(apiKey, sec).then((item) => {
          resolvedMap[item.id] = item;
        })
      );
    }
  }

  const results = await Promise.allSettled(tasks);
  const errors = results.filter((r) => r.status === "rejected").map((r) => r.reason?.message || String(r.reason));

  // 月間カウンターをKVに保存
  if (kv) {
    await Promise.allSettled([
      kv.put(keyRoutesQuota, String(routesUsed)),
      kv.put(keyMatrixQuota, String(matrixUsed)),
    ]);
  }

  // 取得成功した区間を採用し、万が一失敗した区間はベース値でフォールバック
  const sections = TRAFFIC_SECTIONS.map((sec) => {
    if (resolvedMap[sec.id]) return resolvedMap[sec.id];
    return buildSectionResult(sec, sec.baseDurationSec, sec.baseDurationSec);
  });

  return {
    isMock: false,
    liveCount: Object.keys(resolvedMap).length,
    errors: errors.length ? errors : undefined,
    checkedAt: new Date(now).toISOString(),
    quota: { month: monthKey, routesUsed, matrixUsed, limit: MONTHLY_FREE_CAP_LIMIT },
    sections,
  };
}
