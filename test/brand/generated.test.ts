import { describe, expect, test } from "vitest";
// workerd では node:fs が使えないため Vite の ?raw で本文を文字列として埋め込む。
import faviconRaw from "../../public/favicon.svg?raw";
import maskableRaw from "../../public/icons/maskable.svg?raw";
import landscapeRaw from "../../public/ogp/ogp-landscape.svg?raw";
import squareRaw from "../../public/ogp/ogp-square.svg?raw";
import { appleTouchSvg, faviconSvg, logoGroup, maskableSvg, PALETTE } from "../../src/brand/mark";

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

// ロゴの位置は旧ワードマーク（基線 x / y・文字サイズ）に合わせる。
describe.each([
  { name: "ogp-landscape", raw: landscapeRaw, x: 84, baseline: 152, fontSize: 64 },
  { name: "ogp-square", raw: squareRaw, x: 96, baseline: 222, fontSize: 84 },
])("$name のロゴ", ({ raw, x, baseline, fontSize }) => {
  test("目印をちょうど 1 組持つ", () => {
    expect(between(raw)).toBeDefined();
  });

  test("目印の間は logoGroup() の出力と一致する", () => {
    expect(between(raw)).toBe(logoGroup(x, baseline, fontSize, PALETTE.logoLight));
  });
});
