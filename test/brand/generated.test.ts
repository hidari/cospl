import { describe, expect, test } from "vitest";
// workerd では node:fs が使えないため Vite の ?raw で本文を文字列として埋め込む。
import indexRaw from "../../index.html?raw";
import faviconRaw from "../../public/favicon.svg?raw";
import maskableRaw from "../../public/icons/maskable.svg?raw";
import landscapeRaw from "../../public/ogp/ogp-landscape.svg?raw";
import squareRaw from "../../public/ogp/ogp-square.svg?raw";
import {
  appleTouchSvg,
  BOX,
  faviconSvg,
  LOGO,
  logoGroup,
  markShapes,
  maskableSvg,
  OGP_LOGO,
  PALETTE,
} from "../../src/brand/mark";
import stylesRaw from "../../src/client/styles.module.css?raw";
import { declarationsOf } from "./css";

// 生成物が src/brand/mark.ts と食い違わないことを固定する。食い違ったら `just images` を実行する。
describe("生成された画像マスターは mark.ts と一致する", () => {
  test("favicon.svg は faviconSvg() と完全一致する", () => {
    expect(faviconRaw.trimEnd()).toBe(faviconSvg());
  });

  test("maskable.svg は maskableSvg() と完全一致する", () => {
    expect(maskableRaw.trimEnd()).toBe(maskableSvg());
  });

  test("apple-touch は favicon と別形（角丸なし・ダークなし）である", () => {
    expect(appleTouchSvg()).not.toContain("<style>");
    expect(appleTouchSvg()).not.toContain("rx=");
  });
});

const START = "<!-- brand:logo -->";
const END = "<!-- /brand:logo -->";

const between = (svg: string): string | undefined => {
  const starts = svg.split(START).length - 1;
  const ends = svg.split(END).length - 1;
  if (starts !== 1 || ends !== 1) return undefined;
  const from = svg.indexOf(START) + START.length;
  return svg.slice(from, svg.indexOf(END));
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
    const block = declarationsOf(stylesRaw, ":global(.logo)");
    expect(block).toContain(`gap: ${LOGO.gapEm}em;`);
    expect(block).toContain(`letter-spacing: ${LOGO.letterSpacingEm}em;`);
  });

  test(".logo svg の大きさ", () => {
    const block = declarationsOf(stylesRaw, ":global(.logo svg)");
    expect(block).toContain(`width: ${LOGO.markEm}em;`);
    expect(block).toContain(`height: ${LOGO.markEm}em;`);
  });
});
