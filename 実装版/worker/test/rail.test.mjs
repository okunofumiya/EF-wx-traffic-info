import test from "node:test";
import assert from "node:assert/strict";
import { parseShintetsu, parseJrWest, parseYahooSanyo } from "../src/rail.js";
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

test("parseJrWest: JR神戸線(id=4)・JR加古川線(id=16)の運行有無を正しく判定する", () => {
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

  // JR神戸線(id=4)に運行情報がある場合
  const kobeTroubleData = structuredClone(normalData);
  kobeTroubleData.areaTrafficInfos[0].dailyData[0].placeTrafficInfos[0].conventionalLineTrafficInfos.push({
    id: 4,
    conventionalLineTrafficInfoDetails: [{ iconType: "0003" }],
  });

  const resKobe = parseJrWest(kobeTroubleData);
  assert.equal(resKobe["jr-kobe"].status, "delay");
  assert.equal(resKobe["jr-kobe"].hasAlert, true);
  assert.equal(resKobe["jr-kakogawa"].status, "ok");
  assert.equal(resKobe["jr-kakogawa"].hasAlert, false);

  // 加古川線(id=16)に conventionalLineDelayInfos がある場合
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
      "jr-kobe": { id: "jr-kobe", name: "JR神戸線", status: "ok", hasAlert: false },
      "jr-kakogawa": { id: "jr-kakogawa", name: "JR加古川線", status: "ok", hasAlert: false },
      shintetsu: { id: "shintetsu", name: "神戸電鉄 全線", status: "ok", hasAlert: false },
      sanyo: { id: "sanyo", name: "山陽電車 本線", status: "ok", hasAlert: false },
    },
  };

  // 変化なし
  assert.equal(buildRailAlertMessage(allOk, allOk), null);

  // JR神戸線が遅延へ変化
  const kobeDelay = structuredClone(allOk);
  kobeDelay.lines["jr-kobe"] = { id: "jr-kobe", name: "JR神戸線", status: "delay", hasAlert: true };

  const msgAlert = buildRailAlertMessage(kobeDelay, allOk);
  assert.ok(msgAlert);
  assert.match(msgAlert, /【JR神戸線】運行情報にお知らせがあります/);
  assert.match(msgAlert, /https:\/\/trafficinfo\.westjr\.co\.jp\/kinki\.html/);

  // JR神戸線が平常運転に復帰
  const msgRecover = buildRailAlertMessage(allOk, kobeDelay);
  assert.ok(msgRecover);
  assert.match(msgRecover, /【JR神戸線】平常運転に復帰しました/);

  // 山陽電車と加古川線が同時に変化
  const multiChange = structuredClone(allOk);
  multiChange.lines["jr-kakogawa"] = { id: "jr-kakogawa", name: "JR加古川線", status: "delay", hasAlert: true };
  multiChange.lines["sanyo"] = { id: "sanyo", name: "山陽電車 本線", status: "delay", hasAlert: true };

  const msgMulti = buildRailAlertMessage(multiChange, kobeDelay);
  assert.ok(msgMulti);
  assert.match(msgMulti, /JR加古川線/);
  assert.match(msgMulti, /山陽電車 本線/);
  assert.match(msgMulti, /【✅ 平常運転に復帰】[\s\S]*JR神戸線/);
});

