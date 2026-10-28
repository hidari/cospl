// マスターから作る、写し以外の生成物の定義。ロゴのダーク版と、index.html に書き込む値。
// vitest（workerd）と scripts/build-images.mjs（loadTs で bundle した Node）の両方が読む。

import { fail, type Result, success } from "../types/result";

// ダーク版はマスターにせず、ライト版の色を置き換えて作る（Affinity での上書きと書き出し忘れを無くす）。
// to は public/ からの相対パス。
export const LOGO_DARK = { from: "logo-light.svg", to: "icons/logo-dark.svg" } as const;

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

const normalizeHex = (value: string): string | undefined => {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (m === null) return undefined;
  const hex = (m[1] ?? "").toLowerCase();
  return `#${hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex}`;
};

// 対応表に無い色を含むと、どの値かを挙げて失敗する。黙って残すとダーク版の一部がライトの色になる。
export const darkLogo = (svg: string): Result<string, string> => {
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

// og:image / twitter:image の ?v= を作るマスター。中身が変われば X のカードキャッシュを外せる。
export const OGP_VERSION_FROM = "ogp-landscape.svg";

export const ogpVersion = (sha256: string): string => sha256.slice(0, 8);

const OGP_QUERY = /(\/ogp\/ogp-landscape\.(?:jpg|png|webp)\?v=)[^"&]*/g;
const LOGO_IMG = /<img\b[^>]*\bsrc="\/icons\/logo-light\.svg"[^>]*>/g;
const SIZE = /\b(width|height)="[^"]*"/g;

// just images が index.html に書く値。テストは書き換えても変わらない（不動点である）ことを確かめる。
export const syncIndexHtml = (
  html: string,
  expected: { ogpVersion: string; logo: { width: number; height: number } },
): Result<string, string> => {
  if ((html.match(OGP_QUERY) ?? []).length === 0) {
    return fail("index.html に ogp-landscape の ?v= が無い");
  }
  const imgs = html.match(LOGO_IMG) ?? [];
  if (imgs.length !== 1) return fail(`index.html のロゴの img が 1 つでない: ${imgs.length}`);
  const img = imgs[0] ?? "";
  const attrs = Array.from(img.matchAll(SIZE), (m) => m[1]);
  if (!attrs.includes("width") || !attrs.includes("height")) {
    return fail("index.html のロゴの img に width と height が無い");
  }
  const size = { width: Math.round(expected.logo.width), height: Math.round(expected.logo.height) };
  const resized = img.replace(
    SIZE,
    (_whole, name: "width" | "height") => `${name}="${size[name]}"`,
  );
  return success(html.replace(OGP_QUERY, `$1${expected.ogpVersion}`).replace(img, () => resized));
};
