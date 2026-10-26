// golden fixture を現在の src/core.ts の出力から再生成する。
// 文面（humanMD/aiMD）を編集したら `just regen-golden` を実行して固定値を更新する。
// core.ts は拡張子なしの相対 import を持つため、esbuild で bundle してから読み込む。

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadTs } from "./lib/load-ts.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const corePath = resolve(here, "../src/core.ts");
const goldenPath = resolve(here, "../test/__fixtures__/golden.json");

const { parseTags, humanMD, aiMD, ident, tagsFrom } = await loadTs(
  { entryPoint: corePath },
  "core",
);

// 既存 golden の case キーを引き継ぎ、現在の core で値だけを更新する。
const existing = JSON.parse(readFileSync(goldenPath, "utf8"));
const golden = {};
for (const raw of Object.keys(existing)) {
  const result = parseTags(raw);
  if (!result.success) {
    throw new Error(`golden case "${raw}" failed to parse: ${result.error.kind}`);
  }
  const state = result.data;
  golden[raw] = {
    tags: tagsFrom(state),
    ident: ident(state),
    human: humanMD(state),
    ai: aiMD(state),
  };
}

writeFileSync(goldenPath, `${JSON.stringify(golden, null, 2)}\n`);
console.log("regenerated golden cases:", Object.keys(golden).join(", "));
