import test from "node:test";
import assert from "node:assert/strict";
import {
  TRAFFIC_SECTIONS,
  generateMockTraffic,
  buildGoogleMapsRouteUrl,
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
