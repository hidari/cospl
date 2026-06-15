// golden fixture を現在の src/core.ts の出力から再生成する。
// 文面（humanMD/aiMD）を編集したら `pnpm regen:golden` を実行して固定値を更新する。
// core.ts は拡張子なしの相対 import を持つため、esbuild で bundle してから読み込む。

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const corePath = resolve(here, "../src/core.ts");
const goldenPath = resolve(here, "../test/__fixtures__/golden.json");

const built = await esbuild.build({
  entryPoints: [corePath],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
});
const tmpFile = join(mkdtempSync(join(tmpdir(), "cospl-")), "core.mjs");
writeFileSync(tmpFile, built.outputFiles[0].text);
const { parseTags, humanMD, aiMD, ident, tagsFrom } = await import(tmpFile);

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
