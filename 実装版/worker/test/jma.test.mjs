import { test } from "node:test";
import assert from "node:assert/strict";
import { levelOf, parseDuration, buildWarningState, diffSnapshots, buildSnapshot } from "../src/jma.js";
import { sample, sampleSnapshot } from "./sample.mjs";

const area = (snap, name) => snap.areas.find((a) => a.name === name);

test("levelOf: 十の位から警戒レベルを求める", () => {
  assert.equal(levelOf("01"), 0);
  assert.equal(levelOf("11"), 0);
  assert.equal(levelOf("20"), 2);
  assert.equal(levelOf("31"), 3);
  assert.equal(levelOf("41"), 4);
  assert.equal(levelOf("50"), 5);
});

test("parseDuration", () => {
  assert.equal(parseDuration("PT3H"), 3 * 3600e3);
  assert.equal(parseDuration("PT12H"), 12 * 3600e3);
  assert.equal(parseDuration("P1D"), 24 * 3600e3);
});

test("サンプル: 小野市は強風注意報のみ（公式ページの表示と一致）", () => {
  const ono = area(sampleSnapshot(), "小野市");
  assert.deepEqual(ono.warnings.map((w) => [w.code, w.level]), [["15", 2]]);
  assert.equal(ono.level, 2);
});

test("サンプル: 解除済みの種別は含まれない", () => {
  for (const a of sampleSnapshot().areas) {
    for (const w of a.warnings) assert.notEqual(w.status, "解除");
    assert.ok(!a.warnings.some((w) => ["10", "14", "29", "48"].includes(w.code)));
  }
});

test("サンプル: 沿岸の区は波浪注意報（継続）も持つ", () => {
  const tarumi = area(sampleSnapshot(), "神戸市垂水区");
  assert.deepEqual(tarumi.warnings.map((w) => w.code).sort(), ["15", "16"]);
  assert.equal(area(sampleSnapshot(), "明石市").warnings.length, 2);
  assert.equal(area(sampleSnapshot(), "三木市").warnings.length, 1);
});

test("サンプル: 見通しから解除見込みを推定できる", () => {
  const wind = area(sampleSnapshot(), "小野市").outlook.find((h) => h.hazard === "風");
  assert.ok(wind, "風の見通しがある");
  // 12時〜（3時間×6スロット）が注意報級 → 翌2時間後の 2026-10-24 の 06 スロット目から低下
  assert.equal(wind.start, "2026-10-24T12:00:00+09:00");
  assert.equal(wind.clearsAt, "2026-10-25T06:00:00+09:00");
  assert.equal(wind.continuesBeyondOutlook, false);
});

test("サンプル: 警報級の可能性が取り込まれる", () => {
  const p = sampleSnapshot().probability;
  assert.ok(p.length >= 2);
  const south = p[0].areas.find((a) => a.code === "280010");
  assert.match(south.text, /大雨警報/);
  assert.deepEqual(south.rows[0].values.slice(4), ["中", "中", "中", "中"]);
});

test("警報・危険警報が出ている場合: 最新の電文が優先され、レベルは significancy から決まる", () => {
  const mk = (time, code, status, level) => ({
    reportDatetime: time,
    publishingOffice: "神戸地方気象台",
    headlineText: "",
    warning: {
      class20Items: [
        {
          areaCode: "2821800",
          kinds: [
            {
              code,
              status,
              ...(level && {
                properties: [{ type: "土砂災害危険度", significancyPart: { locals: [{ code: level }] } }],
              }),
            },
          ],
        },
      ],
    },
  });
  const state = (list) => buildWarningState(list).get("2821800");
  // 注意報 → 危険警報(49, レベル4) が出た
  let s = state([mk("2026-10-24T09:00:00+09:00", "29", "発表", "21"), mk("2026-10-24T10:00:00+09:00", "49", "発表", "41")]);
  assert.deepEqual(s.map((w) => [w.code, w.level, w.levelName]), [["49", 4, "危険警報"], ["29", 2, "注意報"]]);
  // 順序が逆でも、時刻が新しい方（解除）が優先される
  s = state([mk("2026-10-24T12:00:00+09:00", "49", "解除"), mk("2026-10-24T10:00:00+09:00", "49", "発表", "41")]);
  assert.equal(s.length, 0);
});

test("diffSnapshots: 発表・解除・レベル変化を検出し、変化がなければ空", () => {
  const prev = sampleSnapshot();
  assert.deepEqual(diffSnapshots(prev, prev), []);

  const next = structuredClone(prev);
  const ono = area(next, "小野市");
  ono.warnings = []; // 強風注意報が解除された
  const akashi = area(next, "明石市");
  akashi.warnings[0].level = 3; // 強風が警報に
  const miki = area(next, "三木市");
  miki.warnings.push({ code: "14", name: "雷", level: 2, levelName: "注意報", label: "雷注意報" }); // 雷が発表

  const types = diffSnapshots(prev, next).map((e) => `${e.areaName}:${e.type}:${e.kindName}`).sort();
  assert.deepEqual(types, ["三木市:issued:雷", "小野市:cleared:強風", "明石市:upgraded:強風"].sort());

  // 初回（前回なし）はすべて発表扱い
  assert.equal(diffSnapshots(null, prev).length, prev.areas.reduce((n, a) => n + a.warnings.length, 0));
});

test("対象外の地域が混ざっていても無視される", () => {
  const snap = buildSnapshot(sample, Date.now());
  assert.equal(snap.areas.length, 17);
});
