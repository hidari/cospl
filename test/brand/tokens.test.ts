import { describe, expect, test } from "vitest";
// workerd では node:fs が使えないため Vite の ?raw で本文を文字列として埋め込む。
import stylesRaw from "../../src/client/styles.module.css?raw";
import { declarationsOf } from "./css";

// 色の定義が許されるのは :global(:root) のトークンブロックだけ
// （ダーク用の @media 内にある同名ブロックも同じ形なので同じ規則で除かれる）。
const TOKEN_BLOCK = /:global\(:root\)\s*\{[^{}]*\}/g;
const COMMENT = /\/\*[\s\S]*?\*\//g;
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/g;

const outsideTokenBlocks = (css: string): string =>
  css.replace(COMMENT, "").replace(TOKEN_BLOCK, "");
const colorLiteralsOutsideTokenBlocks = (css: string): string[] =>
  outsideTokenBlocks(css).match(COLOR_LITERAL) ?? [];

describe("色の直書き検査器", () => {
  test("トークンブロックの中の色は許す", () => {
    expect(
      colorLiteralsOutsideTokenBlocks(":global(:root) { --a: #fff; --b: rgba(0, 0, 0, 0.1); }"),
    ).toEqual([]);
  });
  test("ダーク用 @media 内のトークンブロックの色も許す", () => {
    const css = "@media (prefers-color-scheme: dark) { :global(:root) { --a: #000; } }";
    expect(colorLiteralsOutsideTokenBlocks(css)).toEqual([]);
  });
  test("ブロックの外の色は拾う", () => {
    expect(colorLiteralsOutsideTokenBlocks(".a { color: #fff; }")).toEqual(["#fff"]);
    expect(colorLiteralsOutsideTokenBlocks(".a { color: rgba(0, 0, 0, 1); }")).toEqual(["rgba("]);
  });
  test("コメント内の色は数えない", () => {
    expect(colorLiteralsOutsideTokenBlocks("/* #fff */ .a { color: var(--ink); }")).toEqual([]);
  });
  test("コメントの直後の色は隠れない", () => {
    expect(colorLiteralsOutsideTokenBlocks("/* x */ .a { color: #fff; } /* y */")).toEqual([
      "#fff",
    ]);
  });
  test("閉じていないコメントは除かれず、中の色も見逃さない", () => {
    expect(colorLiteralsOutsideTokenBlocks(".a { color: #fff; } /* 閉じ忘れ")).toEqual(["#fff"]);
  });
});

describe("styles.module.css の色トークン", () => {
  test("検査対象が空でない（トークンブロックがあり、その外にも宣言がある）", () => {
    expect(stylesRaw.match(TOKEN_BLOCK)?.length ?? 0).toBeGreaterThanOrEqual(1);
    expect(outsideTokenBlocks(stylesRaw).match(/var\(--/g)?.length ?? 0).toBeGreaterThan(50);
  });

  test("トークンブロックの外に色の直書きが 1 つも無い", () => {
    expect(colorLiteralsOutsideTokenBlocks(stylesRaw)).toEqual([]);
  });

  test.each([".id", ".tab-tip", ".help-tip"])(
    "%s は濃い地（--panel）に --on-panel の文字",
    (cls) => {
      const block = declarationsOf(stylesRaw, `:global(${cls})`);
      expect(block).toContain("background: var(--panel);");
      expect(block).toContain("color: var(--on-panel);");
    },
  );
});
