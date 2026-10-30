import test from "node:test";
import assert from "node:assert/strict";
import { buildWeatherAlertMessage, buildShintetsuAlertMessage } from "../src/chatwork.js";

test("buildWeatherAlertMessage: 注意報のみの場合はメッセージを生成しない", () => {
  const events = [
    {
      type: "issued",
      areaCode: "2821800",
      areaName: "小野市",
      kindCode: "15",
      kindName: "強風",
      level: 2,
      levelName: "注意報",
      label: "強風注意報",
      fromLevel: null,
    },
  ];
  const msg = buildWeatherAlertMessage(events);
  assert.equal(msg, null);
});

test("buildWeatherAlertMessage: 警報発表時に正しくメッセージを組み立てる", () => {
  const events = [
    {
      type: "issued",
      areaCode: "2821800",
      areaName: "小野市",
      kindCode: "03",
      kindName: "大雨",
      level: 3,
      levelName: "警報",
      label: "大雨警報",
      fromLevel: null,
    },
    {
      type: "issued",
      areaCode: "2821500",
      areaName: "三木市",
      kindCode: "05",
      kindName: "暴風",
      level: 3,
      levelName: "警報",
      label: "暴風警報",
      fromLevel: null,
    },
  ];
  const msg = buildWeatherAlertMessage(events);
  assert.ok(msg);
  assert.match(msg, /【気象警報】発表・解除のお知らせ/);
  assert.match(msg, /・小野市：大雨警報/);
  assert.match(msg, /・三木市：暴風警報/);
  assert.match(msg, /JR神戸線/);
  assert.match(msg, /JR加古川線/);
  assert.match(msg, /神戸電鉄/);
  assert.match(msg, /山陽電車/);
});

test("buildWeatherAlertMessage: 警報解除・引き下げ時に正しくメッセージを組み立てる", () => {
  const events = [
    {
      type: "cleared",
      areaCode: "2821800",
      areaName: "小野市",
      kindCode: "03",
      kindName: "大雨",
      level: 3,
      levelName: "警報",
      label: "大雨警報",
      fromLevel: 3,
    },
    {
      type: "downgraded",
      areaCode: "2821500",
      areaName: "三木市",
      kindCode: "05",
      kindName: "暴風",
      level: 2,
      levelName: "注意報",
      label: "強風注意報",
      fromLevel: 3,
    },
  ];
  const msg = buildWeatherAlertMessage(events);
  assert.ok(msg);
  assert.match(msg, /【解除・注意報へ移行】/);
  assert.match(msg, /・小野市：大雨（解除）/);
  assert.match(msg, /・三木市：暴風（注意報へ引下げ）/);
});

test("buildShintetsuAlertMessage: 平常からお知らせありに変化したとき通知メッセージを生成", () => {
  const curr = { kind_code: "1", message: "遅れが発生しています" };
  const prev = { kind_code: "0", message: "平常運転です" };
  const msg = buildShintetsuAlertMessage(curr, prev);
  assert.ok(msg);
  assert.match(msg, /【神戸電鉄】運行情報にお知らせがあります/);
  assert.match(msg, /https:\/\/transit\.yahoo\.co\.jp\/diainfo\/353\/0/);
});

test("buildShintetsuAlertMessage: お知らせありから平常復帰したとき通知メッセージを生成", () => {
  const curr = { kind_code: "0", message: "平常運転です" };
  const prev = { kind_code: "1", message: "遅れが発生しています" };
  const msg = buildShintetsuAlertMessage(curr, prev);
  assert.ok(msg);
  assert.match(msg, /【神戸電鉄】平常運転に復帰しました/);
});

test("buildShintetsuAlertMessage: 状態変化がないときは null", () => {
  const curr = { kind_code: "0", message: "平常運転です" };
  const prev = { kind_code: "0", message: "平常運転です" };
  const msg = buildShintetsuAlertMessage(curr, prev);
  assert.equal(msg, null);
});
