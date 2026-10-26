/* 設定と、Workers のスナップショット（snapshot.json）を画面用のデータに変換する処理 */

// 読み込むスナップショット。Workers の /api/snapshot（本番）。
// ?src=URL で一時的に差し替えられる（サンプル確認は ?src=data/snapshot.sample.json）
const SNAPSHOT_URL =
  new URLSearchParams(location.search).get("src") || "https://keihou-dashboard.keihou-dashboard-worker.workers.dev/api/snapshot";
const IS_SAMPLE = SNAPSHOT_URL.includes("sample");
const STALE_MINUTES = 30; // これより古いスナップショットは「古い可能性」を表示する


// 鉄道は気象とは別に調査中のため、今は公式の運行情報ページへのリンクのみ
const TRAIN_LINES = [
  { id: "jr-kobe", name: "JR神戸線", section: "姫路〜三ノ宮", color: "#1e6fd9", url: "https://www.train-guide.westjr.co.jp/" },
  { id: "jr-kakogawa", name: "JR加古川線", section: "加古川〜谷川", color: "#14b8a6", url: "https://www.train-guide.westjr.co.jp/" },
  { id: "shintetsu-ao", name: "神戸電鉄 粟生線", section: "鈴蘭台〜粟生", color: "#f97316", url: "https://www.shintetsu.co.jp/railinfo/" },
  { id: "shintetsu-arima", name: "神戸電鉄 有馬線・三田線", section: "湊川〜有馬温泉／三田", color: "#fb923c", url: "https://www.shintetsu.co.jp/railinfo/" },
  { id: "sanyo", name: "山陽電車 本線", section: "神戸三宮〜山陽姫路", color: "#e11d48", url: "https://www.sanyo-railway.co.jp/" },
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
