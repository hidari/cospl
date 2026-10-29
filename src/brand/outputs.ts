// マスターと配信物から作る、写しと描画以外の生成物。ロゴのダーク版と、index.html に差し込む値。
// vitest（workerd）・scripts/build-images.mjs（loadTs で bundle した Node）・vite.config.ts が読む。

import { SITE_URL } from "../license/share.ts";
import { none, type Option, some } from "../types/option.ts";
import { fail, mapError, type Result, success } from "../types/result.ts";
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

// index.html にちょうど 1 つだけあるべきタグ。手で足した同じタグも数える。
type Unique = { label: string; re: RegExp };

// トークンを置いてよいタグ（トークンを含む < から > まで）と、差し込む値。
type Slot = {
  inTag: (tag: string, token: string) => boolean;
  value: (values: IndexHtmlValues) => string;
  unique: Unique;
};

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const ogImageUrl = ({ ogpVersion }: IndexHtmlValues): string =>
  `${SITE_URL}${OGP_IMAGE}?v=${ogpVersion}`;

const metaSlot = (attr: "property" | "name", key: string, value: Slot["value"]): Slot => ({
  inTag: (tag, token) => tag === `<meta ${attr}="${key}" content="${token}">`,
  value,
  unique: {
    label: `${key} の meta`,
    re: new RegExp(`<meta\\b[^>]*\\s${attr}="${escapeRegExp(key)}"`, "g"),
  },
});

const LOGO_IMG: Unique = {
  label: "ロゴの img",
  re: new RegExp(`<img\\b[^>]*\\ssrc="/${escapeRegExp(LOGO.light)}"`, "g"),
};
const logoSlot = (value: Slot["value"]): Slot => ({
  inTag: (tag) => /^<img\s/.test(tag) && tag.includes(` src="/${LOGO.light}"`),
  value,
  unique: LOGO_IMG,
});

export const INDEX_HTML_SLOTS = {
  COSPL_OG_IMAGE: metaSlot("property", "og:image", ogImageUrl),
  COSPL_OG_IMAGE_WIDTH: metaSlot(
    "property",
    "og:image:width",
    () => `${OGP_LANDSCAPE.raster.width}`,
  ),
  COSPL_OG_IMAGE_HEIGHT: metaSlot(
    "property",
    "og:image:height",
    () => `${OGP_LANDSCAPE.raster.height}`,
  ),
  COSPL_TWITTER_IMAGE: metaSlot("name", "twitter:image", ogImageUrl),
  COSPL_LOGO_WIDTH: logoSlot(({ logo }) => `${logo.width}`),
  COSPL_LOGO_HEIGHT: logoSlot(({ logo }) => `${logo.height}`),
} as const satisfies Record<string, Slot>;

type SlotName = keyof typeof INDEX_HTML_SLOTS;
const SLOT_NAMES = Object.keys(INDEX_HTML_SLOTS).filter(
  (name): name is SlotName => name in INDEX_HTML_SLOTS,
);
const isSlotName = (name: string): name is SlotName => SLOT_NAMES.some((s) => s === name);
// ロゴの 2 つのスロットは同じ img を数えるので、ラベルで重ねて 1 回だけ数える。
const UNIQUES = [
  ...new Map(
    SLOT_NAMES.map((s) => [INDEX_HTML_SLOTS[s].unique.label, INDEX_HTML_SLOTS[s].unique]),
  ).values(),
];

const TOKEN = /\{\{([A-Z_]+)\}\}/g;
const VERSION = /^[0-9a-f]{8}$/;
const count = (html: string, re: RegExp): number => (html.match(re) ?? []).length;

// トークンを含むタグ。トークンは属性値の中に置くので、直前の < から直後の > までを取る。
const enclosingTag = (html: string, index: number): string =>
  html.slice(html.lastIndexOf("<", index), html.indexOf(">", index) + 1);

// テンプレートの形の検査。最初に見つけた問題を返す。
const templateProblem = (html: string): Option<string> => {
  const tokens = Array.from(html.matchAll(TOKEN), (m) => ({
    raw: m[0],
    name: m[1] ?? "",
    tag: enclosingTag(html, m.index),
  }));
  const unknown = tokens.find(({ name }) => !isSlotName(name));
  if (unknown !== undefined) return some(`未知のトークン: ${unknown.raw}`);
  if (/\{\{|\}\}/.test(html.replace(TOKEN, ""))) return some("形の崩れたトークンがある");
  const miscounted = SLOT_NAMES.map((slot) => ({
    slot,
    n: tokens.filter(({ name }) => name === slot).length,
  })).find(({ n }) => n !== 1);
  if (miscounted !== undefined) {
    return some(`トークン {{${miscounted.slot}}} が ${miscounted.n} 個ある（1 個だけ置く）`);
  }
  const misplaced = tokens.find(
    ({ raw, name, tag }) => isSlotName(name) && !INDEX_HTML_SLOTS[name].inTag(tag, raw),
  );
  if (misplaced !== undefined) {
    return some(`${misplaced.raw} が置いてよいタグにない: ${misplaced.tag}`);
  }
  const duplicated = UNIQUES.map(({ label, re }) => ({ label, n: count(html, re) })).find(
    ({ n }) => n !== 1,
  );
  if (duplicated !== undefined) {
    return some(`${duplicated.label} が ${duplicated.n} 個ある（1 個だけ置く）`);
  }
  return none();
};

// index.html のトークンを値で置き換える。目印が欠けたまま成功するとトークンの文字列や古い値が
// 配信されるので、形が崩れていれば失敗する。
export const renderIndexHtml = (html: string, values: IndexHtmlValues): Result<string, string> => {
  const problem = templateProblem(html);
  if (problem.some) return fail(problem.value);
  if (!VERSION.test(values.ogpVersion)) {
    return fail(`?v= の値が 8 桁の小文字 16 進でない: ${values.ogpVersion}`);
  }
  const logo = { width: Math.round(values.logo.width), height: Math.round(values.logo.height) };
  if (![logo.width, logo.height].every((n) => Number.isSafeInteger(n) && n > 0)) {
    return fail(`ロゴの寸法が正の整数にならない: ${values.logo.width}x${values.logo.height}`);
  }
  const resolved = { ...values, logo };
  // 各トークンはちょうど 1 つと確かめたので、スロットごとに 1 回ずつ置き換える。
  return success(
    SLOT_NAMES.reduce(
      (out, slot) => out.replace(`{{${slot}}}`, () => INDEX_HTML_SLOTS[slot].value(resolved)),
      html,
    ),
  );
};

// 配信するファイルの中身から値を作って差し込む。読むのは呼び出し側（vite.config.ts）。
export const buildIndexHtml = async (
  html: string,
  files: { ogpJpg: Uint8Array<ArrayBuffer>; logoSvg: string },
): Promise<Result<string, string>> => {
  if (files.ogpJpg.length === 0) return fail("OG 画像が空");
  const logo = mapError(inspectMaster(files.logoSvg), (error) => `ロゴ: ${error}`);
  if (!logo.success) return logo;
  const ogpVersion = (await sha256HexBytes(files.ogpJpg)).slice(0, 8);
  return renderIndexHtml(html, { ogpVersion, logo: logo.data.viewBox });
};
