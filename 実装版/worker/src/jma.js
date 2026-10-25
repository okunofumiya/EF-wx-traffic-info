// 気象庁データの整形ロジック。外部通信や保存は行わない純粋関数だけを置く
// （サンプルデータでもWorkers上でも同じ関数で動かすため）。

import { AREAS, KINDS, LEVEL_NAMES, HAZARD_LABELS } from "./config.js";

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

function pad(n) {
  return String(n).padStart(2, "0");
}

// ミリ秒 → "2026-10-24T18:00:00+09:00"
export function toJst(ms) {
  const d = new Date(ms + JST_OFFSET_MS);
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+09:00`
  );
}

// "PT3H" "PT12H" "P1D" → ミリ秒
export function parseDuration(s) {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(s || "");
  if (!m) return 0;
  const [, d = 0, h = 0, min = 0] = m;
  return ((+d * 24 + +h) * 60 + +min) * 60 * 1000;
}

// significancy コード（"20" "31" "01" など）→ 警戒レベル（0 / 2〜5）。
// 十の位が 2 以上なら注意報級以上。0・1 は注意報に達しない
export function levelOf(code) {
  const n = Math.floor(Number(code) / 10);
  return n >= 2 ? n : 0;
}

function kindInfo(code) {
  return KINDS[code] || { name: `種別${code}`, level: 2, verified: false };
}

// 現在の警報・注意報
// 警報データは「種別ごとの最新電文の集まり」であり、現在の状態そのものではない。
// (市町村, 種別) ごとに reportDatetime が最新の電文を採用し、「解除」でないものを有効とみなす。
// 「発表警報・注意報はなし」（code なし）の項目は他種別の状態を表さないので無視する。
export function buildWarningState(bulletins, areas = AREAS) {
  const wanted = new Set(areas.map((a) => a.code));
  const latest = new Map(); // "地域|種別" → 記録
  const sorted = [...bulletins].sort(
    (a, b) => Date.parse(a.reportDatetime) - Date.parse(b.reportDatetime)
  );
  for (const b of sorted) {
    for (const item of b.warning?.class20Items ?? []) {
      if (!wanted.has(item.areaCode)) continue;
      for (const k of item.kinds ?? []) {
        if (!k.code) continue;
        latest.set(`${item.areaCode}|${k.code}`, {
          areaCode: item.areaCode,
          code: k.code,
          status: k.status,
          reportDatetime: b.reportDatetime,
          office: b.publishingOffice,
          headline: b.headlineText,
          additions: k.additions ?? [],
          level: significancyLevel(k) ?? kindInfo(k.code).level,
        });
      }
    }
  }
  const byArea = new Map(areas.map((a) => [a.code, []]));
  for (const rec of latest.values()) {
    if (rec.status === "解除") continue;
    const info = kindInfo(rec.code);
    byArea.get(rec.areaCode).push({
      code: rec.code,
      name: info.name,
      level: rec.level,
      levelName: LEVEL_NAMES[rec.level] ?? `レベル${rec.level}`,
      label: `${info.name}${LEVEL_NAMES[rec.level] ?? ""}`,
      status: rec.status,
      additions: rec.additions,
      reportDatetime: rec.reportDatetime,
      verified: info.verified,
    });
  }
  for (const list of byArea.values()) {
    list.sort((a, b) => b.level - a.level || a.code.localeCompare(b.code));
  }
  return byArea;
}

// 電文の kind が持つ危険度（significancyPart）の最大レベル。無ければ undefined
function significancyLevel(kind) {
  let max;
  for (const p of kind.properties ?? []) {
    for (const l of p.significancyPart?.locals ?? []) {
      const lv = levelOf(l.code);
      if (lv && (max === undefined || lv > max)) max = lv;
    }
  }
  return max;
}

// 明日までの見通し（時系列）から、危険度が注意報級以上になる時間帯と、下がる時刻を求める。
// 気象庁が「何時に解除」と明示しているわけではなく、危険度が注意報級を下回る最初の時刻を
// 解除の見込みとして扱う（見通し期間の終わりまで下がらない場合は clearsAt = null）。
export function buildOutlook(timeline, areas = AREAS) {
  const result = new Map(areas.map((a) => [a.code, []]));
  for (const series of timeline.timeSeries ?? []) {
    const slots = series.timeDefines.map((t) => ({
      start: Date.parse(t.dateTime),
      end: Date.parse(t.dateTime) + parseDuration(t.duration),
    }));
    for (const item of series.class20Items ?? []) {
      if (!result.has(item.areaCode)) continue;
      for (const kind of item.kinds ?? []) {
        for (const part of kind.significancyParts ?? []) {
          const hazard = buildHazard(part, slots);
          if (hazard) result.get(item.areaCode).push(hazard);
        }
      }
    }
  }
  for (const list of result.values()) {
    list.sort((a, b) => b.peakLevel - a.peakLevel || a.start.localeCompare(b.start));
  }
  return result;
}

function buildHazard(part, slots) {
  // 陸上・海上など複数の区分がある場合は、スロットごとの最大値を使う
  const levels = slots.map((_, i) =>
    Math.max(0, ...(part.locals ?? []).map((l) => levelOf(l.codes?.[i] ?? "00")))
  );
  if (!levels.some((l) => l >= 2)) return null;

  const first = levels.findIndex((l) => l >= 2);
  const last = levels.length - 1 - [...levels].reverse().findIndex((l) => l >= 2);
  const peakLevel = Math.max(...levels);
  const peakIdx = levels.indexOf(peakLevel);
  const continues = last === levels.length - 1;
  return {
    hazard: HAZARD_LABELS[part.type] ?? part.type,
    peakLevel,
    peakLevelName: LEVEL_NAMES[peakLevel],
    peakAt: toJst(slots[peakIdx].start),
    start: toJst(slots[first].start),
    clearsAt: continues ? null : toJst(slots[last].end),
    continuesBeyondOutlook: continues,
    additions: [...new Set((part.locals ?? []).flatMap((l) => l.additions ?? []))],
    slots: slots.map((s, i) => ({ start: toJst(s.start), end: toJst(s.end), level: levels[i] })),
  };
}

// 警報級の可能性（5日先まで）。気象庁の構造をほぼそのまま、扱いやすい形に整える。
// 確率は "高" "中" または空文字（可能性なし）
export function buildProbability(prob) {
  const out = [];
  for (const entry of prob ?? []) {
    for (const series of entry.timeSeries ?? []) {
      const times = (series.timeDefineArray ?? []).map((t) => ({
        start: t.dateTime,
        end: toJst(Date.parse(t.dateTime) + parseDuration(t.duration)),
      }));
      out.push({
        reportDatetime: entry.reportDatetime,
        office: entry.publishingOffice,
        times,
        areas: (series.areas ?? []).map((a) => ({
          code: a.code,
          text: a.text ?? null,
          rows: (a.properties ?? []).map((p) => ({
            type: p.type,
            values: p.probabilities ?? [],
          })),
        })),
      });
    }
  }
  return out;
}

// ダッシュボードに渡す全体のスナップショット
export function buildSnapshot({ warning, timeline, probability }, now = Date.now(), areas = AREAS) {
  const state = buildWarningState(warning, areas);
  const outlook = buildOutlook(timeline, areas);
  const areaList = areas.map((a) => {
    const warnings = state.get(a.code);
    return {
      code: a.code,
      name: a.name,
      group: a.group,
      class10: a.class10,
      level: Math.max(0, ...warnings.map((w) => w.level)),
      warnings,
      outlook: outlook.get(a.code),
    };
  });
  return {
    schema: 1,
    generatedAt: toJst(now),
    sources: {
      warning: latestReport(warning),
      timeline: timeline.reportDatetime,
    },
    summary: {
      maxLevel: Math.max(0, ...areaList.map((a) => a.level)),
      areasWithWarnings: areaList.filter((a) => a.warnings.length).length,
    },
    areas: areaList,
    probability: buildProbability(probability),
  };
}

function latestReport(bulletins) {
  return bulletins.map((b) => b.reportDatetime).sort().at(-1) ?? null;
}

// 前回と今回のスナップショットを比べ、BAND投稿の対象になる変化を返す。
// 発表・解除・レベルの上下を検出する（generatedAt などの変動だけでは何も返さない）
export function diffSnapshots(prev, next) {
  const index = (snap) => {
    const m = new Map();
    for (const a of snap?.areas ?? []) {
      for (const w of a.warnings) m.set(`${a.code}|${w.code}`, { area: a, w });
    }
    return m;
  };
  const before = index(prev);
  const after = index(next);
  const events = [];
  const make = (type, { area, w }, from) => ({
    type,
    areaCode: area.code,
    areaName: area.name,
    kindCode: w.code,
    kindName: w.name,
    level: w.level,
    levelName: w.levelName,
    label: w.label,
    fromLevel: from?.level ?? null,
  });
  for (const [key, cur] of after) {
    const old = before.get(key);
    if (!old) events.push(make("issued", cur));
    else if (cur.w.level > old.w.level) events.push(make("upgraded", cur, old.w));
    else if (cur.w.level < old.w.level) events.push(make("downgraded", cur, old.w));
  }
  for (const [key, old] of before) {
    if (!after.has(key)) events.push(make("cleared", old));
  }
  return events;
}
