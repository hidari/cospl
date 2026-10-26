// リリースタグを検証する CI の入口。`node scripts/check-release-tag.mjs <タグ> <license|site>`。
// 判定は src/release/tag.ts が持ち、ここは引数を渡して結果を終了コードへ写すだけにする。
// src は拡張子なしの相対 import を持つため、regen-golden.mjs と同じく esbuild で bundle してから読み込む。

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const [tag, expectedKind] = process.argv.slice(2);
if (tag === undefined || (expectedKind !== "license" && expectedKind !== "site")) {
  console.error("usage: node scripts/check-release-tag.mjs <tag> <license|site>");
  process.exit(2);
}

const src = resolve(dirname(fileURLToPath(import.meta.url)), "../src");
const built = await esbuild.build({
  stdin: {
    contents: `export { parseReleaseTag } from "./release/tag";\nexport { VERSION } from "./license/version";\n`,
    resolveDir: src,
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
});
const tmpFile = join(mkdtempSync(join(tmpdir(), "cospl-")), "release-tag.mjs");
writeFileSync(tmpFile, built.outputFiles[0].text);
const { parseReleaseTag, VERSION } = await import(tmpFile);

const result = parseReleaseTag(tag, VERSION);
if (!result.success) {
  console.error(result.error);
  process.exit(1);
}
if (result.data.kind !== expectedKind) {
  console.error(
    `${tag} は ${result.data.kind} のタグで、このワークフローが扱う ${expectedKind} ではない`,
  );
  process.exit(1);
}
console.log(`${result.data.kind} ${result.data.version}`);
