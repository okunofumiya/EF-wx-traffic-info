import test from "node:test";
import assert from "node:assert/strict";
import {
  TRAFFIC_SECTIONS,
  ROUTE_CHAINS,
  generateMockTraffic,
  buildGoogleMapsRouteUrl,
  shouldUpdateTraffic,
  parseDurationSec,
  getJstMonthKey,
} from "../src/traffic.js";

test("TRAFFIC_SECTIONS: 全18区間が正しく定義されている", () => {
  assert.equal(TRAFFIC_SECTIONS.length, 18);

  // 各区間の必須フィールドを検証
  for (const sec of TRAFFIC_SECTIONS) {
    assert.ok(sec.id, "idが存在すること");
    assert.ok(sec.road, "roadが存在すること");
    assert.ok(sec.roadName, "roadNameが存在すること");
    assert.ok(sec.direction, "directionが存在すること");
    assert.ok(sec.from, "fromが存在すること");
    assert.ok(sec.to, "toが存在すること");
    assert.ok(sec.origin.lat && sec.origin.lng, "origin座標が存在すること");
    assert.ok(sec.destination.lat && sec.destination.lng, "destination座標が存在すること");
    assert.ok(sec.baseDurationSec > 0, "baseDurationSecが正の値であること");
    assert.ok(sec.distanceKm > 0, "distanceKmが正の値であること");
  }

  // 路線別の区間数チェック
  const r175 = TRAFFIC_SECTIONS.filter((s) => s.road === "r175");
  const hharima = TRAFFIC_SECTIONS.filter((s) => s.road === "higashiharima");
  const meiki = TRAFFIC_SECTIONS.filter((s) => s.road === "meiki");
  const bypass = TRAFFIC_SECTIONS.filter((s) => s.road === "bypass");

  assert.equal(r175.length, 6, "175号線は南行3+北行3の計6区間");
  assert.equal(hharima.length, 2, "東播磨道は下り1+上り1の計2区間");
  assert.equal(meiki.length, 6, "明姫幹線は東行3+西行3の計6区間");
  assert.equal(bypass.length, 4, "バイパスは東行2+西行2の計4区間");
});

test("ROUTE_CHAINS: 片道3区間ルートが4本（計12区間）定義されている", () => {
  assert.equal(ROUTE_CHAINS.length, 4);
  for (const c of ROUTE_CHAINS) {
    assert.equal(c.sectionIds.length, 3);
  }
});

test("generateMockTraffic: モックデータが正しく生成される", () => {
  const mock = generateMockTraffic(Date.parse("2026-10-28T08:00:00+09:00"));
  assert.equal(mock.isMock, true);
  assert.ok(mock.checkedAt);
  assert.equal(mock.sections.length, 18);

  for (const s of mock.sections) {
    assert.ok(s.durationMin > 0);
    assert.ok(s.durationInTrafficMin >= s.durationMin);
    assert.ok(["normal", "crowded", "heavy"].includes(s.status));
    assert.ok(s.mapUrl.startsWith("https://www.google.com/maps/dir/"));
  }
});

test("buildGoogleMapsRouteUrl: 正しいGoogleマップ経路URLを生成する", () => {
  const url = buildGoogleMapsRouteUrl(
    { lat: 34.933809, lng: 134.961136 },
    { lat: 34.846492, lng: 134.949902 }
  );
  assert.ok(url.includes("origin=34.933809,134.961136"));
  assert.ok(url.includes("destination=34.846492,134.949902"));
  assert.ok(url.includes("travelmode=driving"));
});

test("shouldUpdateTraffic: 7〜9時・17〜19時は10分毎、9〜17時は1時間毎、夜間は更新しない", () => {
  // 1. 朝ラッシュ 7:00, 7:10 (10分ごと -> true), 7:05 (5分目 -> false)
  const t0700 = Date.parse("2026-10-28T07:00:00+09:00");
  const t0705 = Date.parse("2026-10-28T07:05:00+09:00");
  const t0710 = Date.parse("2026-10-28T07:10:00+09:00");
  assert.equal(shouldUpdateTraffic(t0700, 0), true, "7:00は更新する");
  assert.equal(shouldUpdateTraffic(t0705, t0700), false, "7:05は更新しない");
  assert.equal(shouldUpdateTraffic(t0710, t0700), true, "7:10は更新する");

  // 2. 日中 9:00〜16:59 (1時間ごと -> 毎時0分台のみtrue)
  const t0850 = Date.parse("2026-10-28T08:50:00+09:00");
  const t0900 = Date.parse("2026-10-28T09:00:00+09:00");
  const t0910 = Date.parse("2026-10-28T09:10:00+09:00");
  const t1000 = Date.parse("2026-10-28T10:00:00+09:00");
  assert.equal(shouldUpdateTraffic(t0900, 0), true, "9:00初回は更新する");
  assert.equal(shouldUpdateTraffic(t0910, t0900), false, "9:10は更新しない");
  assert.equal(shouldUpdateTraffic(t1000, t0900), true, "10:00は更新する");

  // 3. 夕方ラッシュ 17:00〜18:50 (10分ごと -> true), 19:00 (最終 -> true)
  const t1700 = Date.parse("2026-10-28T17:00:00+09:00");
  const t1710 = Date.parse("2026-10-28T17:10:00+09:00");
  assert.equal(shouldUpdateTraffic(t1700, t1000), true, "17:00は更新する");
  assert.equal(shouldUpdateTraffic(t1710, t1700), true, "17:10は更新する");

  // 4. 夜間 20:00〜翌6:55 (更新しない -> false)
  const t2000 = Date.parse("2026-10-28T20:00:00+09:00");
  const t0300 = Date.parse("2026-10-29T03:00:00+09:00");
  const t0650 = Date.parse("2026-10-29T06:50:00+09:00");
  assert.equal(shouldUpdateTraffic(t2000, t1710), false, "20:00は更新しない");
  assert.equal(shouldUpdateTraffic(t0300, t1710), false, "3:00は更新しない");
  assert.equal(shouldUpdateTraffic(t0650, t1710), false, "6:50は更新しない");
});

test("parseDurationSec / getJstMonthKey: ヘルパー関数の検証", () => {
  assert.equal(parseDurationSec("1020s", 600), 1020);
  assert.equal(parseDurationSec(null, 600), 600);
  assert.equal(getJstMonthKey(Date.parse("2026-10-28T22:00:00+09:00")), "2026-10");
});
