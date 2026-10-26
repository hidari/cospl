// .ts を esbuild で bundle して一時ファイルに書き出し、動的 import で読み込む。
// src は拡張子なしの相対 import を持つため、Node にそのまま読ませられない。
//
// entry は次のどちらか。
//   { entryPoint: "<.ts のパス>" }                      ファイルを入口にする
//   { stdin: { contents, resolveDir } }                  re-export の文字列を入口にする
// name は一時ファイルの名前（拡張子なし）。

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import esbuild from "esbuild";

export async function loadTs(entry, name) {
  const built = await esbuild.build({
    ...(entry.entryPoint === undefined
      ? { stdin: { ...entry.stdin, loader: "ts" } }
      : { entryPoints: [entry.entryPoint] }),
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
  });
  const dir = await mkdtemp(join(tmpdir(), "cospl-"));
  const file = join(dir, `${name}.mjs`);
  // import が済めばモジュールはメモリにあるので、一時ディレクトリは成否によらず消す
  try {
    await writeFile(file, built.outputFiles[0].text);
    return await import(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
