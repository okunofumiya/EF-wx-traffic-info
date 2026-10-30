import test from "node:test";
import assert from "node:assert/strict";
import { parseShintetsu, parseJrWest, parseYahooSanyo, isJrKobeSectionInTarget } from "../src/rail.js";
import { buildRailAlertMessage } from "../src/chatwork.js";

test("parseShintetsu: 平常運転(kind_code=0)と運行情報あり(kind_code=1)を正しく判定する", () => {
  const ok = parseShintetsu({ kind_code: "0" });
  assert.equal(ok.status, "ok");
  assert.equal(ok.hasAlert, false);

  const delay = parseShintetsu({ kind_code: "1" });
  assert.equal(delay.status, "delay");
  assert.equal(delay.hasAlert, true);

  const na = parseShintetsu(null);
  assert.equal(na.status, "na");
  assert.equal(na.hasAlert, false);
});

test("isJrKobeSectionInTarget: JR神戸線は西明石〜姫路の間を含む区間のみ true を返す", () => {
  // 西明石以東のみ（大阪〜西明石、大阪〜神戸、京都〜大阪）は除外
  assert.equal(isJrKobeSectionInTarget("大阪", "西明石"), false);
  assert.equal(isJrKobeSectionInTarget("西明石", "大阪"), false);
  assert.equal(isJrKobeSectionInTarget("大阪", "神戸"), false);
  assert.equal(isJrKobeSectionInTarget("芦屋", "三ノ宮"), false);
  assert.equal(isJrKobeSectionInTarget("京都", "大阪"), false);

  // 姫路以西のみ（姫路〜網干）も除外
  assert.equal(isJrKobeSectionInTarget("姫路", "網干"), false);

  // 西明石〜姫路の間を含む区間は対象
  assert.equal(isJrKobeSectionInTarget("西明石", "姫路"), true);
  assert.equal(isJrKobeSectionInTarget("姫路", "西明石"), true);
  assert.equal(isJrKobeSectionInTarget("大阪", "加古川"), true);
  assert.equal(isJrKobeSectionInTarget("加古川", "大阪"), true);
  assert.equal(isJrKobeSectionInTarget("大阪", "姫路"), true);
  assert.equal(isJrKobeSectionInTarget("神戸", "姫路"), true);
  assert.equal(isJrKobeSectionInTarget("加古川", "姫路"), true);
});

test("parseJrWest: JR神戸線(西明石〜姫路のみ)・JR加古川線の運行有無を正しく判定する", () => {
  const normalData = {
    masterData: {
      areas: [
        {
          id: 2,
          places: [
            {
              id: 1,
              lines: [
                { id: 4, name: "ＪＲ神戸線" },
                { id: 16, name: "加古川線" },
              ],
            },
          ],
        },
      ],
    },
    areaTrafficInfos: [
      {
        id: 2,
        conventionalLineDelayInfos: [],
        dailyData: [
          {
            placeTrafficInfos: [
              {
                id: 1,
                conventionalLineTrafficInfos: [],
              },
            ],
          },
        ],
      },
    ],
  };

  const resNormal = parseJrWest(normalData);
  assert.equal(resNormal["jr-kobe"].status, "ok");
  assert.equal(resNormal["jr-kobe"].hasAlert, false);
  assert.equal(resNormal["jr-kakogawa"].status, "ok");
  assert.equal(resNormal["jr-kakogawa"].hasAlert, false);

  // 1) JR神戸線で「大阪〜西明石」のみの遅延（＋うれしートお知らせ）の場合は ok（通知・表示しない）
  const eastOnlyData = structuredClone(normalData);
  eastOnlyData.areaTrafficInfos[0].conventionalLineDelayInfos.push({ id: 4 });
  eastOnlyData.areaTrafficInfos[0].dailyData[0].placeTrafficInfos[0].conventionalLineTrafficInfos.push({
    id: 4,
    conventionalLineTrafficInfoDetails: [
      {
        iconType: "0003",
        conditionName: "遅延",
        sections: [{ conditionName: "遅延", startStation: "大阪", endStation: "西明石" }],
      },
      {
        iconType: "0000",
        conditionName: "お知らせ",
        sections: [{ conditionName: "お知らせ", startStation: "大阪", endStation: "姫路" }],
      },
    ],
  });
  const resEastOnly = parseJrWest(eastOnlyData);
  assert.equal(resEastOnly["jr-kobe"].status, "ok");
  assert.equal(resEastOnly["jr-kobe"].hasAlert, false);

  // 2) JR神戸線で「西明石〜姫路」（または「大阪〜加古川」）を含む遅延がある場合は delay
  const targetKobeData = structuredClone(normalData);
  targetKobeData.areaTrafficInfos[0].dailyData[0].placeTrafficInfos[0].conventionalLineTrafficInfos.push({
    id: 4,
    conventionalLineTrafficInfoDetails: [
      {
        iconType: "0003",
        conditionName: "遅延",
        sections: [{ conditionName: "遅延", startStation: "西明石", endStation: "姫路" }],
      },
    ],
  });
  const resKobe = parseJrWest(targetKobeData);
  assert.equal(resKobe["jr-kobe"].status, "delay");
  assert.equal(resKobe["jr-kobe"].hasAlert, true);

  // 3) 加古川線(id=16)に conventionalLineDelayInfos がある場合
  const kakogawaTroubleData = structuredClone(normalData);
  kakogawaTroubleData.areaTrafficInfos[0].conventionalLineDelayInfos.push({ id: 16 });
  const resKakogawa = parseJrWest(kakogawaTroubleData);
  assert.equal(resKakogawa["jr-kobe"].status, "ok");
  assert.equal(resKakogawa["jr-kakogawa"].status, "delay");
  assert.equal(resKakogawa["jr-kakogawa"].hasAlert, true);
});

test("parseYahooSanyo: Yahoo!路線情報のHTML・__NEXT_DATA__から山陽電鉄本線の運行有無を判定する", () => {
  const normalHtml = `
    <html><body>
      <table><tr><td><a href="/diainfo/354/0">山陽電鉄本線</a></td><td>平常運転</td><td>事故・遅延情報はありません</td></tr></table>
      <script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
        props: { pageProps: { troubleRails: [] } },
      })}</script>
    </body></html>
  `;
  const resOk = parseYahooSanyo(normalHtml);
  assert.equal(resOk.status, "ok");
  assert.equal(resOk.hasAlert, false);

  const delayHtml = `
    <html><body>
      <table><tr><td><a href="/diainfo/354/0">山陽電鉄本線</a></td><td><span class="colTrouble">列車遅延</span></td><td>遅れが出ています</td></tr></table>
      <script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
        props: { pageProps: { troubleRails: [{ railCode: "354", railName: "山陽電鉄本線" }] } },
      })}</script>
    </body></html>
  `;
  const resDelay = parseYahooSanyo(delayHtml);
  assert.equal(resDelay.status, "delay");
  assert.equal(resDelay.hasAlert, true);
});

test("buildRailAlertMessage: 4路線の状態遷移（平常→情報あり、情報あり→平常）でChatwork通知文を生成する", () => {
  const allOk = {
    lines: {
      "jr-kobe": { id: "jr-kobe", name: "JR神戸線（西明石〜姫路）", status: "ok", hasAlert: false },
      "jr-kakogawa": { id: "jr-kakogawa", name: "JR加古川線", status: "ok", hasAlert: false },
      shintetsu: { id: "shintetsu", name: "神戸電鉄 全線", status: "ok", hasAlert: false },
      sanyo: { id: "sanyo", name: "山陽電車 本線", status: "ok", hasAlert: false },
    },
  };

  assert.equal(buildRailAlertMessage(allOk, allOk), null);

  const kobeDelay = structuredClone(allOk);
  kobeDelay.lines["jr-kobe"] = { id: "jr-kobe", name: "JR神戸線（西明石〜姫路）", status: "delay", hasAlert: true };

  const msgAlert = buildRailAlertMessage(kobeDelay, allOk);
  assert.ok(msgAlert);
  assert.match(msgAlert, /【JR神戸線（西明石〜姫路）】運行情報にお知らせがあります/);
  assert.match(msgAlert, /https:\/\/transit\.yahoo\.co\.jp\/diainfo\/273\/0/);

  const msgRecover = buildRailAlertMessage(allOk, kobeDelay);
  assert.ok(msgRecover);
  assert.match(msgRecover, /【JR神戸線（西明石〜姫路）】平常運転に復帰しました/);
});
