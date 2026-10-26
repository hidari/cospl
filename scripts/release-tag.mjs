// リリースタグの入口。判定は src/release/tag.ts が持ち、ここは引数を渡して結果を標準出力と終了コードへ写すだけにする。
// src は拡張子なしの相対 import を持つため、regen-golden.mjs と同じく esbuild で bundle してから読み込む。
//
//   check <タグ> <license|site>  タグを検証し、そのリリースが前提とする条文のタグ（cospl-v<VERSION>）を出す
//   license-tag                  現行の VERSION の条文のタグを出す
//   next-site <YYYY-MM-DD>       標準入力の既存タグ（1 行 1 つ）から、次に打つサイトのタグを出す

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const usage = () => {
  console.error(
    "usage: node scripts/release-tag.mjs check <tag> <license|site> | license-tag | next-site <YYYY-MM-DD>",
  );
  process.exit(2);
};

const src = resolve(dirname(fileURLToPath(import.meta.url)), "../src");
const built = await esbuild.build({
  stdin: {
    contents: `export { nextSiteTag, parseReleaseTag } from "./release/tag";\nexport { VERSION } from "./license/version";\n`,
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
const { nextSiteTag, parseReleaseTag, VERSION } = await import(tmpFile);

const exitOnFail = (result) => {
  if (!result.success) {
    console.error(result.error);
    process.exit(1);
  }
  return result.data;
};

const [command, ...args] = process.argv.slice(2);
const licenseTag = `cospl-v${VERSION}`;

if (command === "check") {
  const [tag, expectedKind] = args;
  if (tag === undefined || (expectedKind !== "license" && expectedKind !== "site")) {
    usage();
  }
  const parsed = exitOnFail(parseReleaseTag(tag, VERSION));
  if (parsed.kind !== expectedKind) {
    console.error(
      `${tag} は ${parsed.kind} のタグで、このワークフローが扱う ${expectedKind} ではない`,
    );
    process.exit(1);
  }
  console.log(licenseTag);
} else if (command === "license-tag") {
  console.log(licenseTag);
} else if (command === "next-site") {
  const [date] = args;
  if (date === undefined) {
    usage();
  }
  const existing = readFileSync(0, "utf8").split("\n").filter(Boolean);
  console.log(exitOnFail(nextSiteTag(date, existing)));
} else {
  usage();
}
