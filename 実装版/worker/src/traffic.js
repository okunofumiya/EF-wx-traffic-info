// 道路交通情報（区間所要時間）の定義と取得・算出ロジック

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

/**
 * Google Maps URL生成（経路案内）
 */
export function buildGoogleMapsRouteUrl(origin, destination) {
  return `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${destination.lat},${destination.lng}&travelmode=driving`;
}

/**
 * モック交通データの生成（APIキー未設定時・テスト用）
 * 基準所要時間をもとに、各区間の所要時間と遅延状態を算出
 */
export function generateMockTraffic(now = Date.now()) {
  const d = new Date(now);
  const hour = d.getHours();
  // 朝夕の通勤時間帯はやや混雑しやすいシミュレーション
  const isRush = (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19);

  const sections = TRAFFIC_SECTIONS.map((sec, idx) => {
    let delayMin = 0;
    // 擬似的な渋滞生成（一部のボトルネック区間：バイパスや明姫幹線）
    if (isRush) {
      if (sec.road === "bypass" && sec.id.includes("1")) delayMin = 6;
      else if (sec.road === "meiki" && sec.id.includes("2")) delayMin = 4;
      else if (sec.road === "r175" && sec.id.includes("2")) delayMin = 3;
    } else {
      // 日中・夜間の軽微なブレ（1〜2分）
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
      status, // "normal" (順調) | "crowded" (混雑) | "heavy" (渋滞)
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
 * Google Maps Distance Matrix API を呼び出してリアルタイム交通情報を取得
 */
export async function fetchGoogleTraffic(apiKey, now = Date.now()) {
  if (!apiKey) {
    return generateMockTraffic(now);
  }

  // 16区間を並行取得（16要素）
  const results = await Promise.allSettled(
    TRAFFIC_SECTIONS.map(async (sec) => {
      const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
      url.searchParams.set("origins", `${sec.origin.lat},${sec.origin.lng}`);
      url.searchParams.set("destinations", `${sec.destination.lat},${sec.destination.lng}`);
      url.searchParams.set("departure_time", "now");
      url.searchParams.set("traffic_model", "best_guess");
      url.searchParams.set("key", apiKey);

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`Google Maps API error: ${res.status}`);
      const data = await res.json();

      const element = data?.rows?.[0]?.elements?.[0];
      if (!element || element.status !== "OK") {
        throw new Error(`Route status: ${element?.status || "UNKNOWN"}`);
      }

      const durationSec = element.duration.value;
      const durationInTrafficSec = element.duration_in_traffic ? element.duration_in_traffic.value : durationSec;
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
    })
  );

  // 取得成功したものを採用し、失敗した区間はベース値でフォールバック
  const sections = TRAFFIC_SECTIONS.map((sec, i) => {
    const res = results[i];
    if (res.status === "fulfilled") return res.value;
    const durationMin = Math.round(sec.baseDurationSec / 60);
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
      durationInTrafficMin: durationMin,
      delayMin: 0,
      status: "normal",
      mapUrl: buildGoogleMapsRouteUrl(sec.origin, sec.destination),
    };
  });

  return {
    isMock: false,
    checkedAt: new Date(now).toISOString(),
    sections,
  };
}
