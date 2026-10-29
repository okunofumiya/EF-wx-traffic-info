/* 設定と、Workers のスナップショット（snapshot.json）を画面用のデータに変換する処理 */

// 読み込むスナップショット。Workers の /api/snapshot（本番）。
// ?src=URL で一時的に差し替えられる（サンプル確認は ?src=data/snapshot.sample.json）
const SNAPSHOT_URL =
  new URLSearchParams(location.search).get("src") || "https://keihou-dashboard.keihou-dashboard-worker.workers.dev/api/snapshot";
const RAIL_URL =
  new URLSearchParams(location.search).get("rail_src") ||
  (SNAPSHOT_URL.includes("/api/snapshot")
    ? SNAPSHOT_URL.replace("/api/snapshot", "/api/rail")
    : "https://keihou-dashboard.keihou-dashboard-worker.workers.dev/api/rail");
const SHINTETSU_URL =
  new URLSearchParams(location.search).get("shintetsu_src") ||
  (SNAPSHOT_URL.includes("/api/snapshot")
    ? SNAPSHOT_URL.replace("/api/snapshot", "/api/shintetsu")
    : "https://keihou-dashboard.keihou-dashboard-worker.workers.dev/api/shintetsu");
const TRAFFIC_URL =
  new URLSearchParams(location.search).get("traffic_src") ||
  (SNAPSHOT_URL.includes("/api/snapshot")
    ? SNAPSHOT_URL.replace("/api/snapshot", "/api/traffic")
    : "data/traffic.sample.json");
const IS_SAMPLE = SNAPSHOT_URL.includes("sample");
const STALE_MINUTES = 30; // これより古いスナップショットは「古い可能性」を表示する

// 神戸電鉄の運行情報ステータス（後方互換用）
function parseShintetsuStatus(data) {
  if (!data || data.kind_code === undefined || data.kind_code === null) {
    return { status: "na", label: "確認中", cls: "status-na", hasAlert: false, text: "運行情報は公式HPでご確認ください" };
  }
  const isNormal = String(data.kind_code) === "0";
  if (isNormal) {
    return {
      status: "ok",
      label: "平常運転",
      cls: "status-ok",
      hasAlert: false,
      text: "現在、30分以上の遅れ等はありません",
    };
  }
  return {
    status: "delay",
    label: "運行情報あり",
    cls: "status-delay",
    hasAlert: true,
    text: "運行情報が発表されています。詳細は公式HPをご確認ください。",
  };
}

// 4路線の統合運行情報ステータスを画面表示用に変換（規約配慮のため、平常か運行情報ありかのみ表示）
function parseRailLineStatus(lineData, lineId) {
  if (!lineData || lineData.status === "na") {
    return {
      status: "na",
      label: "確認中",
      cls: "status-na",
      hasAlert: false,
      text: "運行情報は運行情報ページでご確認ください",
    };
  }
  if (lineData.status === "ok" && !lineData.hasAlert) {
    return {
      status: "ok",
      label: "平常運転",
      cls: "status-ok",
      hasAlert: false,
      text: lineId === "shintetsu" ? "現在、30分以上の遅れ等はありません" : "現在、事故・遅延等の運行情報はありません",
    };
  }
  return {
    status: "delay",
    label: "運行情報あり",
    cls: "status-delay",
    hasAlert: true,
    text: "遅延・運転見合わせ等の運行情報が発表されています。リンク先で詳細をご確認ください。",
  };
}

// 鉄道路線設定（4路線すべて自動検知連携）
const TRAIN_LINES = [
  { id: "jr-kobe", name: "JR神戸線", section: "姫路〜三ノ宮", color: "#1e6fd9", url: "https://trafficinfo.westjr.co.jp/kinki.html" },
  { id: "jr-kakogawa", name: "JR加古川線", section: "加古川〜谷川", color: "#14b8a6", url: "https://trafficinfo.westjr.co.jp/kinki.html" },
  { id: "shintetsu", name: "神戸電鉄 全線", section: "粟生線・有馬線・三田線など", color: "#f97316", url: "https://www.shintetsu.co.jp/railway/railinfo/" },
  { id: "sanyo", name: "山陽電車 本線", section: "神戸三宮〜山陽姫路", color: "#e11d48", url: "https://transit.yahoo.co.jp/diainfo/354/0" },
];

// 警戒レベル（気象庁の数値）→ 画面のクラス名
const LEVEL_KEY = { 2: "advisory", 3: "warning", 4: "danger", 5: "emergency" };
const LEVEL_JA = { 2: "注意報", 3: "警報", 4: "危険警報", 5: "特別警報" };

// 発表中の警報の種別 → 見通し（時系列）側の名前
const WARN_TO_HAZARD = { 強風: "風", 暴風: "風", 暴風雪: "風", 風雪: "風", 大雪: "雪" };

// Yahoo!天気の市町ページ。気象庁の市町村コード（7桁）の先頭5桁が Yahoo の市町コードと一致する。
// 28=兵庫県、6310=兵庫県南部（対象17市区町すべて実在を確認済み）
const yahooUrl = (areaCode) => `https://weather.yahoo.co.jp/weather/jp/28/6310/${areaCode.slice(0, 5)}.html`;

// ISO文字列（+09:00）をそのまま切り出して表示する。ブラウザの時差設定に左右されない
const pad2 = (s) => String(Number(s));
const fmtHour = (iso) => `${pad2(iso.slice(8, 10))}日 ${pad2(iso.slice(11, 13))}時`;
const fmtDay = (iso) => `${pad2(iso.slice(8, 10))}日 ${iso.slice(11, 16)}`;

// 発表中の警報について、見通しから「見込み期間」と「解除見込み」の文を作る。
// 警報の危険度（level）が基準。その危険度を下回る最初の時刻を、切り替わり・解除の見込みとする
function describeOutlook(hz, level) {
  if (!hz) return { span: "—", text: "見通しのデータがありません" };
  const idx = hz.slots.map((s, i) => (s.level >= level ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return { span: "—", text: `見通しでは${LEVEL_JA[level] ?? ""}の基準を下回っています` };
  const first = hz.slots[idx[0]];
  const last = hz.slots[idx.at(-1)];
  const span = `${fmtHour(first.start)}〜${idx.at(-1) === hz.slots.length - 1 ? "見通し期間の終わり以降" : fmtHour(last.end)}`;
  const text =
    idx.at(-1) === hz.slots.length - 1
      ? "見通し期間内は継続の見込み"
      : `${fmtHour(last.end)}ごろに${LEVEL_JA[level] ?? ""}の基準を下回る見込み`;
  return { span, text };
}

const RANK = { "": 0, 中: 1, 高: 2 };
const PROB_ROWS = ["大雨", "土砂災害", "風", "雪", "波", "潮位"];

function normalizeProbType(t) {
  const s = t.replace("の警報級の可能性", "");
  if (s === "雨") return "大雨";
  if (s.startsWith("風")) return "風";
  return s;
}

// 警報級の可能性を「日付 × 種類」の表にまとめる（同じ日に複数の時間帯があれば最大値）
function adaptProbability(snap) {
  const JST = 9 * 3600e3;
  const dayKey = (ms) => new Date(ms + JST).toISOString().slice(0, 10);
  const base = Date.parse(snap.generatedAt.slice(0, 10) + "T00:00:00+09:00");
  const dayList = [...Array(5)].map((_, i) => base + i * 864e5);
  const keys = dayList.map(dayKey);
  const days = dayList.map((ms) => {
    const w = new Date(ms + JST).getUTCDay();
    return { d: String(new Date(ms + JST).getUTCDate()), w: "日月火水木金土"[w], cls: w === 6 ? "sat" : w === 0 ? "sun" : "" };
  });

  const rows = {};
  let text = null;
  for (const series of snap.probability) {
    const area = series.areas.find((a) => a.code === "280010") || series.areas.find((a) => a.code === "280000");
    if (!area) continue;
    if (area.text && !text) text = area.text;
    for (const r of area.rows) {
      const type = normalizeProbType(r.type);
      const cells = (rows[type] ??= Array(5).fill(""));
      r.values.forEach((v, i) => {
        const t = series.times[i];
        if (!t) return;
        const from = dayKey(Date.parse(t.start));
        const to = dayKey(Date.parse(t.end) - 1);
        keys.forEach((k, di) => {
          if (k >= from && k <= to && RANK[v] > RANK[cells[di]]) cells[di] = v;
        });
      });
    }
  }
  const ordered = {};
  PROB_ROWS.filter((t) => rows[t]).forEach((t) => (ordered[t] = rows[t]));
  return { days, rows: ordered, text };
}

function adaptSnapshot(snap) {
  const warnings = {};
  const outlook = {};
  const codes = {};
  const groups = [];
  for (const a of snap.areas) {
    codes[a.name] = a.code;
    outlook[a.name] = a.outlook;
    let g = groups.find((x) => x.name === a.group);
    if (!g) groups.push((g = { name: a.group, areas: [] }));
    g.areas.push(a.name);
    warnings[a.name] = a.warnings.map((w) => {
      const hz = a.outlook.find((h) => h.hazard === (WARN_TO_HAZARD[w.name] || w.name));
      const o = describeOutlook(hz, w.level);
      return {
        type: w.label,
        level: LEVEL_KEY[w.level] || "advisory",
        issued: `${fmtDay(w.reportDatetime)}（${w.status}）`,
        peak: o.span,
        outlook: o.text,
      };
    });
  }
  return {
    // 取得に成功した最新時刻（サンプルには無いので generatedAt で代用）
    generatedAt: snap.checkedAt || snap.generatedAt,
    updated: `${fmtDay(snap.checkedAt || snap.generatedAt)}`,
    reportedAt: snap.sources.timeline,
    groups,
    codes,
    warnings,
    outlook,
    early: adaptProbability(snap),
  };
}

// 道路路線定義
const ROAD_LINES = [
  { id: "r175", name: "国道175号", color: "#10b981", desc: "滝野社IC〜天神町〜田井西〜森友" },
  { id: "higashiharima", name: "東播磨道", color: "#a855f7", desc: "加古川〜小野" },
  { id: "bypass", name: "加古川・姫路バイパス", color: "#ef4444", desc: "別所SA〜加古川中央〜明石西" },
  { id: "meiki", name: "明姫幹線", color: "#3b82f6", desc: "中筋西〜坂井〜谷池〜森友" },
];

// SVG路線図のトポロジーノード（手書き図の配置関係を忠実に再現）
const ROAD_MAP_NODES = {
  takino: { x: 510, y: 40, label: "滝野社IC", align: "right" },
  tenjin: { x: 530, y: 160, label: "天神町（小野）", align: "right" },
  tainishi: { x: 550, y: 270, label: "田井西（三木）", align: "right" },
  moritomo: { x: 570, y: 380, label: "森友（明石・神戸西）", align: "bottom" },
  bessho: { x: 50, y: 290, label: "別所SA（姫路）", align: "top" },
  chuo: { x: 290, y: 290, label: "加古川中央", align: "top" },
  akashinishi: { x: 410, y: 290, label: "明石西", align: "top" },
  nakasuji: { x: 90, y: 380, label: "中筋西（高砂）", align: "bottom" },
  sakai: { x: 250, y: 380, label: "坂井（別府）", align: "bottom" },
  taniike: { x: 410, y: 380, label: "谷池（播磨）", align: "bottom" },
};

// SVG上の区間リンク設定（各区間の中点・バッジ配置位置）
const ROAD_MAP_EDGES = {
  // 国道175号
  "r175-1": { from: "takino", to: "tenjin", mid: { x: 520, y: 95 }, road: "r175" },
  "r175-2": { from: "tenjin", to: "tainishi", mid: { x: 540, y: 215 }, road: "r175" },
  "r175-3": { from: "tainishi", to: "moritomo", mid: { x: 560, y: 325 }, road: "r175" },
  // 東播磨道
  "hharima-1": { from: "chuo", to: "tenjin", mid: { x: 410, y: 220 }, road: "higashiharima" },
  // 加古川・姫路バイパス
  "bypass-1": { from: "bessho", to: "chuo", mid: { x: 170, y: 290 }, road: "bypass" },
  "bypass-2": { from: "chuo", to: "akashinishi", mid: { x: 350, y: 290 }, road: "bypass" },
  // 明姫幹線
  "meiki-1": { from: "nakasuji", to: "sakai", mid: { x: 170, y: 380 }, road: "meiki" },
  "meiki-2": { from: "sakai", to: "taniike", mid: { x: 330, y: 380 }, road: "meiki" },
  "meiki-3": { from: "taniike", to: "moritomo", mid: { x: 490, y: 380 }, road: "meiki" },
  // 接続線 (別所SA側から中筋西への斜め接続)
  "conn-nakasuji": { from: "bessho", to: "nakasuji", isConnector: true },
};

