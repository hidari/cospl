// マスターと配信物から作る、写しと描画以外の生成物。ロゴのダーク版と、index.html に差し込む値。
// vitest（workerd）・scripts/build-images.mjs（loadTs で bundle した Node）・vite.config.ts が読む。
// vite.config.ts から読むので、この連鎖の import には拡張子を付ける（biome.json の useImportExtensions）。

import { SITE_URL } from "../license/share.ts";
import { fail, type Result, success } from "../types/result.ts";
import { inspectMaster, LOGO, OGP_LANDSCAPE, sha256HexBytes } from "./masters.ts";

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

// og:image が指す画像（public/ からの相対）。?v= はこのファイルのバイト列のハッシュから作る。
// X のカードキャッシュが見ているのは配信される中身なので、マスターが同じでも描き直して変われば ?v= も変わる。
export const OGP_IMAGE = `${OGP_LANDSCAPE.raster.to}.jpg`;

type Size = { width: number; height: number };
export type IndexHtmlValues = { ogpVersion: string; logo: Size };

// トークンを置いてよいタグ（トークンを含む < から > まで）と、差し込む値。
type Slot = {
  inTag: (tag: string, token: string) => boolean;
  value: (values: IndexHtmlValues) => string;
};

const ogImageUrl = ({ ogpVersion }: IndexHtmlValues): string =>
  `${SITE_URL}${OGP_IMAGE}?v=${ogpVersion}`;

// 値を差し込む meta。どれも index.html にちょうど 1 つだけ置く。
const METAS = [
  { slot: "COSPL_OG_IMAGE", attr: "property", key: "og:image", value: ogImageUrl },
  {
    slot: "COSPL_OG_IMAGE_WIDTH",
    attr: "property",
    key: "og:image:width",
    value: () => `${OGP_LANDSCAPE.raster.width}`,
  },
  {
    slot: "COSPL_OG_IMAGE_HEIGHT",
    attr: "property",
    key: "og:image:height",
    value: () => `${OGP_LANDSCAPE.raster.height}`,
  },
  { slot: "COSPL_TWITTER_IMAGE", attr: "name", key: "twitter:image", value: ogImageUrl },
] as const;

const isLogoImg = (tag: string): boolean =>
  /^<img\s/.test(tag) && tag.includes(` src="/${LOGO.light}"`);

export const INDEX_HTML_SLOTS: Readonly<Record<string, Slot>> = {
  ...Object.fromEntries(
    METAS.map(({ slot, attr, key, value }) => [
      slot,
      { inTag: (tag, token) => tag === `<meta ${attr}="${key}" content="${token}">`, value },
    ]),
  ),
  COSPL_LOGO_WIDTH: { inTag: isLogoImg, value: ({ logo }) => `${logo.width}` },
  COSPL_LOGO_HEIGHT: { inTag: isLogoImg, value: ({ logo }) => `${logo.height}` },
};

const TOKEN = /\{\{([A-Z_]+)\}\}/g;
const VERSION = /^[0-9a-f]{8}$/;
const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const count = (html: string, re: RegExp): number => (html.match(re) ?? []).length;
const META_COUNTS = METAS.map(({ attr, key }) => ({
  key,
  re: new RegExp(`<meta\\b[^>]*\\s${attr}="${escapeRegExp(key)}"`, "g"),
}));
const LOGO_IMG = new RegExp(`<img\\b[^>]*\\ssrc="/${escapeRegExp(LOGO.light)}"`, "g");

// トークンを含むタグ。トークンは属性値の中に置くので、直前の < から直後の > までを取る。
const enclosingTag = (html: string, index: number): string =>
  html.slice(html.lastIndexOf("<", index), html.indexOf(">", index) + 1);

// テンプレートの形の検査。最初に見つけた問題を返す。手で足した meta や img も数えるので、
// トークンのある 1 つとは別に値の書かれたタグが残っていれば失敗する。
const templateProblem = (html: string): string | undefined => {
  const tokens = Array.from(html.matchAll(TOKEN));
  const unknown = tokens.find((m) => INDEX_HTML_SLOTS[m[1] ?? ""] === undefined);
  if (unknown !== undefined) return `未知のトークン: ${unknown[0]}`;
  if (/\{\{|\}\}/.test(html.replace(TOKEN, ""))) return "形の崩れたトークンがある";
  const miscounted = Object.keys(INDEX_HTML_SLOTS)
    .map((slot) => ({ slot, n: tokens.filter((m) => m[1] === slot).length }))
    .find(({ n }) => n !== 1);
  if (miscounted !== undefined) {
    return `トークン {{${miscounted.slot}}} が ${miscounted.n} 個ある（1 個だけ置く）`;
  }
  const misplaced = tokens.find(
    (m) => !INDEX_HTML_SLOTS[m[1] ?? ""]?.inTag(enclosingTag(html, m.index), m[0]),
  );
  if (misplaced !== undefined) {
    return `${misplaced[0]} が置いてよいタグにない: ${enclosingTag(html, misplaced.index)}`;
  }
  const meta = META_COUNTS.map(({ key, re }) => ({ key, n: count(html, re) })).find(
    ({ n }) => n !== 1,
  );
  if (meta !== undefined) return `${meta.key} の meta が ${meta.n} 個ある（1 個だけ置く）`;
  const logos = count(html, LOGO_IMG);
  if (logos !== 1) return `ロゴの img が ${logos} 個ある（1 個だけ置く）`;
  return undefined;
};

// index.html のトークンを値で置き換える。目印が欠けたまま成功するとトークンの文字列や古い値が
// 配信されるので、形が崩れていれば失敗する。
export const renderIndexHtml = (html: string, values: IndexHtmlValues): Result<string, string> => {
  const problem = templateProblem(html);
  if (problem !== undefined) return fail(problem);
  if (!VERSION.test(values.ogpVersion)) {
    return fail(`?v= の値が 8 桁の小文字 16 進でない: ${values.ogpVersion}`);
  }
  const logo = { width: Math.round(values.logo.width), height: Math.round(values.logo.height) };
  if (![logo.width, logo.height].every((n) => Number.isSafeInteger(n) && n > 0)) {
    return fail(`ロゴの寸法が正の整数にならない: ${values.logo.width}x${values.logo.height}`);
  }
  const resolved = { ...values, logo };
  return success(
    html.replace(TOKEN, (token, slot: string) => INDEX_HTML_SLOTS[slot]?.value(resolved) ?? token),
  );
};

// 配信するファイルの中身から値を作って差し込む。読むのは呼び出し側（vite.config.ts）。
export const buildIndexHtml = async (
  html: string,
  files: { ogpJpg: Uint8Array<ArrayBuffer>; logoSvg: string },
): Promise<Result<string, string>> => {
  if (files.ogpJpg.length === 0) return fail("OG 画像が空");
  const logo = inspectMaster(files.logoSvg);
  if (!logo.success) return fail(`ロゴ: ${logo.error}`);
  const ogpVersion = (await sha256HexBytes(files.ogpJpg)).slice(0, 8);
  return renderIndexHtml(html, { ogpVersion, logo: logo.data.viewBox });
};
