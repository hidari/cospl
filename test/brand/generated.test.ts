import { describe, expect, test } from "vitest";
// workerd では node:fs が使えないため Vite の ?raw で本文を文字列として埋め込む。
import indexRaw from "../../index.html?raw";
import landscapeRaw from "../../public/ogp/ogp-landscape.svg?raw";
import squareRaw from "../../public/ogp/ogp-square.svg?raw";
import {
  BOX,
  LOGO,
  logoGroup,
  logoMarkSpan,
  markShapes,
  OGP_LOGO,
  PALETTE,
} from "../../src/brand/mark";
import { declarationsOf, stylesCss } from "./css";

const between = (svg: string): string | undefined => {
  const span = logoMarkSpan(svg);
  return span.success ? svg.slice(span.data.from, span.data.to) : undefined;
};

// ロゴの位置は mark.ts の OGP_LOGO が唯一の定義。
describe.each([
  { name: "ogp-landscape", raw: landscapeRaw },
  { name: "ogp-square", raw: squareRaw },
] as const)("$name のロゴ", ({ name, raw }) => {
  const { x, baseline, fontSize } = OGP_LOGO[name];

  test("目印をちょうど 1 組持つ", () => {
    expect(between(raw)).toBeDefined();
  });

  test("目印の間は logoGroup() の出力と一致する", () => {
    expect(between(raw)).toBe(logoGroup(x, baseline, fontSize, PALETTE.logoLight));
  });
});

// ヘッダーのロゴは index.html にインラインで置く。マークの形は markShapes と文字列まで一致させる。
describe("index.html のヘッダーロゴは mark.ts と一致する", () => {
  test("マークの弧と点は markShapes に CSS 変数の色を渡した出力と完全一致し、枠は 71 四方である", () => {
    const shapes = markShapes({ c: "var(--logo-c)", dot: "var(--logo-dot)" });
    expect(indexRaw).toContain(`<svg viewBox="${BOX.x} ${BOX.y} ${BOX.size} ${BOX.size}"`);
    expect(indexRaw).toContain(shapes);
  });
});

// ロゴの大きさと隙間の CSS は mark.ts の LOGO と同じ値を em で書く。
describe("styles.module.css のロゴは mark.ts の LOGO と一致する", () => {
  test(".logo の隙間と字間", () => {
    const block = declarationsOf(stylesCss, ":global(.logo)");
    expect(block).toContain(`gap: ${LOGO.gapEm}em;`);
    expect(block).toContain(`letter-spacing: ${LOGO.letterSpacingEm}em;`);
  });

  test(".logo svg の大きさ", () => {
    const block = declarationsOf(stylesCss, ":global(.logo svg)");
    expect(block).toContain(`width: ${LOGO.markEm}em;`);
    expect(block).toContain(`height: ${LOGO.markEm}em;`);
  });
});
