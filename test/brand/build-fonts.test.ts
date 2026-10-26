import { describe, expect, test } from "vitest";
// workerd では node:fs が使えないため Vite の ?raw で本文を文字列として埋め込む。
import buildImages from "../../scripts/build-images.mjs?raw";

// 画像の生成は外部に依存しない。フォントはリポジトリに置いたものだけを使い、
// このスクリプトには正当な URL が無いので、URL が現れたら外部の読み込みとみなす。
describe("画像の生成", () => {
  test("外部の URL を読まない", () => {
    expect(buildImages).not.toMatch(/https?:\/\//);
  });
});
