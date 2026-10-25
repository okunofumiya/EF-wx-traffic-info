// サンプルデータ（実装版/sample-data）を読み込む共通処理
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSnapshot } from "../src/jma.js";

const dir = fileURLToPath(new URL("../../sample-data/", import.meta.url));
const load = (name) => JSON.parse(readFileSync(dir + name, "utf-8"));

export const sample = {
  warning: load("warning_280000_20261024.json"),
  timeline: load("timeline_280000_20261024.json"),
  probability: load("probability_280000_20261024.json"),
};

// サンプル取得時点（2026-10-24 11:30 JST）
export const SAMPLE_NOW = Date.parse("2026-10-24T11:30:00+09:00");

export const sampleSnapshot = () => buildSnapshot(sample, SAMPLE_NOW);
