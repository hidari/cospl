// マスターから作る、写しと描画以外の生成物。ロゴのダーク版と、index.html に書き込む値。
// vitest（workerd）と scripts/build-images.mjs（loadTs で bundle した Node）の両方が読む。

import { fail, type Result, success } from "../types/result";
import { LOGO, OGP_LANDSCAPE } from "./masters";

// ライト版で使ってよい色と、ダーク版での色。ダークの文字色はサイトのダークの --ink に揃える。
export const LOGO_DARK_COLORS: Readonly<Record<string, string>> = {
  "#7b54ff": "#a98bff",
  "#ff7a2f": "#ff9e5c",
  "#333137": "#f4f0ff",
};

// 色を取るプロパティの値。表示属性（fill="…"）と CSS（fill:…）のどちらも拾う。
// 前後の [\w-] を除くのは fill-rule や stroke-width を拾わないため。
const PAINT =
  /(?<![\w-])(fill|stroke|stop-color|flood-color|lighting-color|color)(\s*[:=]\s*["']?)([^;"'<>}]+)/gi;
// 色を持たない値。url() は文書内の id だけ（外部は inspectMaster が拒否する）。
const NOT_A_COLOR = /^(?:none|transparent|url\(\s*#[^)]*\))$/i;
// animate / set の values・to が持つ色は PAINT で拾えない。
const ANIMATION = /<(?:[\w.-]+:)?(animate|set)\b/i;

const normalizeHex = (value: string): string | undefined => {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (m === null) return undefined;
  const hex = (m[1] ?? "").toLowerCase();
  return `#${hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex}`;
};

// 対応表で置き換えられない色を含むと失敗する。黙って残すとダーク版の一部がライトの色になる。
export const darkLogo = (svg: string): Result<string, string> => {
  const animation = svg.match(ANIMATION);
  if (animation !== null) return fail(`ダーク版を作れない ${animation[1]} 要素を含む`);
  const unknown: string[] = [];
  const dark = svg.replace(PAINT, (whole, name: string, sep: string, raw: string) => {
    const value = raw.trim();
    if (NOT_A_COLOR.test(value)) return whole;
    const mapped = LOGO_DARK_COLORS[normalizeHex(value) ?? ""];
    if (mapped === undefined) {
      unknown.push(value);
      return whole;
    }
    return `${name}${sep}${raw.replace(value, mapped)}`;
  });
  return unknown.length === 0
    ? success(dark)
    : fail(`ダーク版の対応表に無い色: ${[...new Set(unknown)].join(", ")}`);
};

// og:image / twitter:image の ?v= はマスターのハッシュから作る。中身が変われば X のカードキャッシュを外せる。
export const ogpVersion = (sha256: string): string => sha256.slice(0, 8);

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const OGP_QUERY = new RegExp(
  `(<meta (?:property="og:image"|name="twitter:image") content="[^"]*/${escapeRegExp(OGP_LANDSCAPE.raster.to)}\\.(?:jpg|png|webp)\\?v=)[^"]*`,
  "g",
);
const OGP_SIZE = /(<meta property="og:image:(width|height)" content=")[^"]*/g;
const LOGO_IMG = new RegExp(`<img\\b[^>]*\\bsrc="/${escapeRegExp(LOGO.light)}"[^>]*>`, "g");
const SIZE = /\b(width|height)="[^"]*"/g;

type Size = { width: number; height: number };
const round = (size: Size): Size => ({
  width: Math.round(size.width),
  height: Math.round(size.height),
});

// just images が index.html に書く値。テストは書き換えても変わらない（不動点である）ことを確かめる。
// 目印が欠けたまま成功すると、書き換えたつもりで古い値が配信されるので、欠けたら失敗する。
export const syncIndexHtml = (
  html: string,
  expected: { ogpVersion: string; logo: Size },
): Result<string, string> => {
  if ((html.match(OGP_QUERY) ?? []).length !== 2) {
    return fail("index.html の og:image と twitter:image の両方に ?v= が無い");
  }
  if ((html.match(OGP_SIZE) ?? []).length !== 2) {
    return fail("index.html に og:image:width と og:image:height が無い");
  }
  const imgs = html.match(LOGO_IMG) ?? [];
  if (imgs.length !== 1) return fail(`index.html のロゴの img が 1 つでない: ${imgs.length}`);
  const img = imgs[0] ?? "";
  const attrs = Array.from(img.matchAll(SIZE), (m) => m[1]);
  if (!attrs.includes("width") || !attrs.includes("height")) {
    return fail("index.html のロゴの img に width と height が無い");
  }
  const logo = round(expected.logo);
  const ogp = OGP_LANDSCAPE.raster;
  const resized = img.replace(SIZE, (_whole, name: keyof Size) => `${name}="${logo[name]}"`);
  return success(
    html
      .replace(OGP_QUERY, `$1${expected.ogpVersion}`)
      .replace(OGP_SIZE, (_whole, head: string, name: keyof Size) => `${head}${ogp[name]}`)
      .replace(img, () => resized),
  );
};
