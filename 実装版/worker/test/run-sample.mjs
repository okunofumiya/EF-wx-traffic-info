// サンプルデータから整形結果を作り、out/snapshot.sample.json に書き出して概要を表示する
//   node test/run-sample.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sampleSnapshot } from "./sample.mjs";

const snap = sampleSnapshot();
const outDir = fileURLToPath(new URL("../out/", import.meta.url));
mkdirSync(outDir, { recursive: true });
writeFileSync(outDir + "snapshot.sample.json", JSON.stringify(snap, null, 2));

console.log(`生成: ${snap.generatedAt}  警報電文の最新: ${snap.sources.warning}  見通し: ${snap.sources.timeline}`);
console.log(`最大レベル: ${snap.summary.maxLevel}  発表のある地域: ${snap.summary.areasWithWarnings}/${snap.areas.length}`);
for (const a of snap.areas) {
  const w = a.warnings.map((x) => x.label).join("、") || "発表なし";
  const o = a.outlook.map((h) => `${h.hazard}(〜${h.clearsAt ?? "見通し期間内は継続"})`).join("、");
  console.log(`${a.name}\t${w}${o ? "\t見通し: " + o : ""}`);
}
console.log(`出力: ${outDir}snapshot.sample.json`);
