// 設定値。気象庁のパスや対象地域はここだけで管理する。

// 令和8年のデータは data/r8/ にある。年度が変わるとパスが変わる可能性があるため設定値にしている
export const JMA = {
  base: "https://www.jma.go.jp/bosai",
  prefecture: "280000", // 兵庫県
  dataDir: "r8",
};

export function sourceUrls(jma = JMA) {
  return {
    warning: `${jma.base}/warning/data/${jma.dataDir}/${jma.prefecture}.json`,
    timeline: `${jma.base}/warning_timeline/data/${jma.prefecture}.json`,
    probability: `${jma.base}/probability/data/probability/${jma.dataDir}/${jma.prefecture}.json`,
  };
}

// 対象の市町村。code は気象庁の class20s（市町村等）コード。
// class10 は予報区（警報級の可能性の単位）。対象はすべて兵庫県南部（280010）
export const AREAS = [
  { code: "2821800", name: "小野市", group: "北播磨", class10: "280010" },
  { code: "2821500", name: "三木市", group: "北播磨", class10: "280010" },
  { code: "2822800", name: "加東市", group: "北播磨", class10: "280010" },
  { code: "2822000", name: "加西市", group: "北播磨", class10: "280010" },
  { code: "2821300", name: "西脇市", group: "北播磨", class10: "280010" },
  { code: "2836500", name: "多可町", group: "北播磨", class10: "280010" },
  { code: "2811100", name: "神戸市西区", group: "神戸市", class10: "280010" },
  { code: "2810800", name: "神戸市垂水区", group: "神戸市", class10: "280010" },
  { code: "2810900", name: "神戸市北区", group: "神戸市", class10: "280010" },
  { code: "2820300", name: "明石市", group: "東播磨", class10: "280010" },
  { code: "2821000", name: "加古川市", group: "東播磨", class10: "280010" },
  { code: "2821600", name: "高砂市", group: "東播磨", class10: "280010" },
  { code: "2838100", name: "稲美町", group: "東播磨", class10: "280010" },
  { code: "2838200", name: "播磨町", group: "東播磨", class10: "280010" },
  { code: "2820100", name: "姫路市", group: "中播磨", class10: "280010" },
  { code: "2844300", name: "福崎町", group: "中播磨", class10: "280010" },
  { code: "2821900", name: "三田市", group: "阪神北", class10: "280010" },
];

// 警戒レベル。significancy コードの十の位から求める（20・21=注意報、30・31=警報 …）
export const LEVEL_NAMES = {
  0: "なし",
  2: "注意報",
  3: "警報",
  4: "危険警報",
  5: "特別警報",
};

// 警報・注意報の種別コード。
// verified: true は実データで名称を確認できたもの。それ以外は推定で、実際に出たときに確認する。
// level は significancy が付いていない電文のための既定値（付いていればそちらを優先する）
export const KINDS = {
  "02": { name: "暴風雪", level: 3, verified: false },
  "03": { name: "大雨", level: 3, verified: true },
  "04": { name: "洪水", level: 3, verified: false },
  "05": { name: "暴風", level: 3, verified: true },
  "06": { name: "大雪", level: 3, verified: false },
  "07": { name: "波浪", level: 3, verified: true },
  "08": { name: "高潮", level: 3, verified: false },
  "10": { name: "大雨", level: 2, verified: true },
  "12": { name: "大雪", level: 2, verified: false },
  "13": { name: "風雪", level: 2, verified: false },
  "14": { name: "雷", level: 2, verified: true },
  "15": { name: "強風", level: 2, verified: true },
  "16": { name: "波浪", level: 2, verified: true },
  "17": { name: "融雪", level: 2, verified: false },
  "18": { name: "洪水", level: 2, verified: false },
  "19": { name: "高潮", level: 2, verified: false },
  "20": { name: "濃霧", level: 2, verified: true },
  "21": { name: "乾燥", level: 2, verified: true },
  "22": { name: "なだれ", level: 2, verified: false },
  "23": { name: "低温", level: 2, verified: false },
  "24": { name: "霜", level: 2, verified: true },
  "25": { name: "着氷", level: 2, verified: false },
  "26": { name: "着雪", level: 2, verified: false },
  "29": { name: "土砂災害", level: 2, verified: true },
  "48": { name: "土砂災害", level: 4, verified: false },
  "49": { name: "土砂災害", level: 4, verified: true },
};

// 時系列データの危険度の種類名 → 表示名
export const HAZARD_LABELS = {
  大雨浸水危険度: "大雨",
  土砂災害危険度: "土砂災害",
  洪水危険度: "洪水",
  風危険度: "風",
  雪危険度: "雪",
  雷危険度: "雷",
  波危険度: "波",
  高潮危険度: "高潮",
  融雪危険度: "融雪",
  濃霧危険度: "濃霧",
  乾燥危険度: "乾燥",
  着氷危険度: "着氷",
  着雪危険度: "着雪",
  低温危険度: "低温",
  霜危険度: "霜",
  なだれ危険度: "なだれ",
};

// 神戸電鉄の運行情報URL
export const SHINTETSU = {
  summaryUrl: "https://www.shintetsu.co.jp/railinfo_common/json/top_summary.json",
  infoUrl: "https://www.shintetsu.co.jp/railway/railinfo/",
};

// 通知に添える交通情報リンク
export const RAIL_LINKS = [
  { name: "神戸電鉄", url: "https://www.shintetsu.co.jp/railway/railinfo/" },
  { name: "JR西日本（加古川線・神戸線）", url: "https://trafficinfo.westjr.co.jp/kinki.html" },
  { name: "山陽電車", url: "https://www.sanyo-railway.co.jp/" },
];

export const DASHBOARD_URL = "https://keihou-dashboard-web.keihou-dashboard-worker.workers.dev/";

