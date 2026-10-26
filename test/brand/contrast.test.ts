import { describe, expect, test } from "vitest";
import indexHtml from "../../index.html?raw";
// workerd では node:fs が使えないため Vite の ?raw で本文を文字列として埋め込む。
import stylesRaw from "../../src/client/styles.module.css?raw";

// 対象外: マークの色（--logo-c / --logo-dot とアイコン・OGP の色）。
// マークは装飾図形で本文ではなく、ブランド色そのものを保つため比率の基準を課さない。
// ロゴの文字は --ink を使うので、下の (--ink, --paper) の検査に含まれる。

type Tokens = Readonly<Record<string, string>>;

const TOKEN_BLOCK = /:global\(:root\)\s*\{([^{}]*)\}/g;
const DARK_MEDIA = /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{/;

const parseDeclarations = (body: string): Tokens =>
  Object.fromEntries(
    [...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1] ?? "", (m[2] ?? "").trim()]),
  );

const blocksOf = (css: string): string[] => [...css.matchAll(TOKEN_BLOCK)].map((m) => m[1] ?? "");

const splitModes = (css: string): { light: Tokens; dark: Tokens } => {
  const nocomment = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const darkAt = nocomment.search(DARK_MEDIA);
  const lightPart = darkAt < 0 ? nocomment : nocomment.slice(0, darkAt);
  const darkPart = darkAt < 0 ? "" : nocomment.slice(darkAt);
  const light = Object.assign({}, ...blocksOf(lightPart).map(parseDeclarations));
  const darkOverrides = Object.assign({}, ...blocksOf(darkPart).map(parseDeclarations));
  // ダークは明示した分だけ差し替える。書かなかったトークンはライトの値を引き継ぐ。
  return { light, dark: { ...light, ...darkOverrides } };
};

const channel = (c: number): number => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

const parseHex = (value: string): [number, number, number] => {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  expect(m, `不透明な hex であること: ${value}`).not.toBeNull();
  const raw = m?.[1] ?? "";
  const h = raw.length === 3 ? [...raw].map((c) => c + c).join("") : raw;
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
};

const luminance = (hex: string): number => {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
};

describe("コントラスト計算器", () => {
  test("白と黒は 21:1", () => {
    expect(contrast("#fff", "#000000")).toBeCloseTo(21, 5);
  });
  test("同色は 1:1、引数の順序に依らない", () => {
    expect(contrast("#7b54ff", "#7b54ff")).toBeCloseTo(1, 5);
    expect(contrast("#1c1430", "#fff")).toBeCloseTo(contrast("#fff", "#1c1430"), 10);
  });
});

const { light, dark } = splitModes(stylesRaw);

describe("ダークモードのトークン", () => {
  test("ダーク用の @media があり、ライトと異なる値を持つ", () => {
    expect(stylesRaw).toMatch(DARK_MEDIA);
    expect(dark["--paper"]).toBe("#1c1430");
    expect(dark["--paper"]).not.toBe(light["--paper"]);
  });
  test("OS 設定に従う（color-scheme）", () => {
    expect(stylesRaw).toContain("color-scheme: light dark;");
  });
  test("ダークの --panel は地より一段明るい濃色のまま", () => {
    expect(luminance(dark["--panel"] ?? "#fff")).toBeGreaterThan(luminance(dark["--paper"] ?? ""));
    expect(luminance(dark["--panel"] ?? "#fff")).toBeLessThan(0.05);
  });
  test.each(["--logo-c", "--logo-dot"])("%s は両モードで定義される", (name) => {
    expect(light[name]).toMatch(/^#[0-9a-f]{6}$/i);
    expect(dark[name]).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

// [前景, 背景, 最小比]
const PAIRS: ReadonlyArray<readonly [string, string, number]> = [
  ["--ink", "--paper", 4.5],
  ["--muted", "--paper", 4.5],
  ["--on-panel", "--panel", 4.5],
  ["--accent-ink", "--paper", 4.5],
  ["--on-accent", "--accent", 4.5],
  ["--warm-ink", "--paper", 3],
  // リンクは本文の一部で、地にもカードにも載る。
  ["--link", "--paper", 4.5],
  ["--link", "--card", 4.5],
  // フォーカスの輪郭は UI 部品として 3:1。
  ["--accent", "--paper", 3],
  ["--accent", "--card", 3],
  ["--accent", "--accent-soft", 3],
  // 実際に重なる組。.id b、選択中のチップ・タブ、pre の出力、.ext のラベル、入力のフォーカス枠。
  ["--warm-on-dark", "--panel", 4.5],
  ["--accent-ink", "--accent-soft", 4.5],
  ["--code-ink", "--surface", 4.5],
  ["--muted", "--accent-soft", 4.5],
  ["--accent", "--surface", 3],
];

describe.each([
  ["ライト", light],
  ["ダーク", dark],
] as const)("コントラスト比 (%s)", (_mode, tokens) => {
  test.each(PAIRS)("%s on %s は %s:1 以上", (fg, bg, min) => {
    const f = tokens[fg];
    const b = tokens[bg];
    expect(f, `${fg} が定義されている`).toBeDefined();
    expect(b, `${bg} が定義されている`).toBeDefined();
    expect(contrast(f ?? "", b ?? "")).toBeGreaterThanOrEqual(min);
  });
});

describe("theme-color", () => {
  const metas = [...indexHtml.matchAll(/<meta\s+name="theme-color"[^>]*>/g)].map((m) => m[0]);
  test.each([
    ["light", "#7b54ff"],
    ["dark", "#1c1430"],
  ])("%s 用は %s", (scheme, color) => {
    expect(metas).toContain(
      `<meta name="theme-color" media="(prefers-color-scheme: ${scheme})" content="${color}">`,
    );
  });
  test("media 無しの theme-color は残さない", () => {
    expect(metas.every((m) => m.includes("media="))).toBe(true);
    expect(metas).toHaveLength(2);
  });
});
