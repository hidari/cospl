import { describe, expect, test } from "vitest";
// workerd では node:fs が使えないため Vite の ?raw で本文を文字列として埋め込む。
import buildImages from "../../scripts/build-images.mjs?raw";

// 画像の生成は外部のフォント配信に依存しない。フォントはリポジトリに置いたものだけを使う。
describe("画像の生成に使うフォント", () => {
  test("外部のフォント配信を読まない", () => {
    expect(buildImages).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
    expect(buildImages).not.toMatch(/<link[^>]+stylesheet/);
  });

  test("OGP の和文は同梱した Zen Kaku Gothic New の 500 と 700 で描く", () => {
    expect(buildImages).toContain("ZenKakuGothicNew-Medium.ttf");
    expect(buildImages).toContain("ZenKakuGothicNew-Bold.ttf");
  });
});
