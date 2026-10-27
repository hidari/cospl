// brand/ に置く SVG マスターの一覧と、配信してよい中身かの検査。
// vitest（workerd）と scripts/build-images.mjs（loadTs で bundle した Node）の両方が読むので、
// Node と DOM の API は使わない（crypto.subtle と TextEncoder はどちらの実行環境にもある）。
//
// 検査は正規表現で、文書全体の文字列に対して行う。要素や属性の構造を読み取ってから判定すると、
// 読み取れなかった箇所が検査から漏れるので、危険な字句は現れる場所を問わず拒否する。
// 過剰に拒否しても困らない想定（マスターは Affinity の書き出しで、該当する書き方をしないと見ている。
// 実際の書き出しで落ちたら、その書き方を見てから許可リストを広げる）。

import { fromNullable, mapOption, none, type Option, some } from "../types/option";
import { fail, mapResult, type Result, success } from "../types/result";

export type ViewBox = { x: number; y: number; width: number; height: number };
export type BrandMaster = { file: string; ratio: number; copyTo?: string };

// copyTo は public/ からの相対パス。
export const BRAND_MASTERS: readonly BrandMaster[] = [
  { file: "icon.svg", ratio: 1, copyTo: "favicon.svg" },
  { file: "icon-full.svg", ratio: 1 },
  { file: "icon-maskable.svg", ratio: 1 },
];

// 宣言してよい名前空間。XHTML や MathML の要素（img の src など、href 以外で外部を読むもの）を
// 混ぜられなくする。
const NAMESPACES: readonly string[] = [
  "http://www.w3.org/2000/svg",
  "http://www.w3.org/1999/xlink",
  "http://www.serif.com/",
];

// href と url() が指してよい先。文書内の id か、埋め込みのラスタ画像だけ。
// 許可リストなので、符号化した javascript: や空白入りは一致せず自然に落ちる。
const ID_REF = /^#[A-Za-z_][\w.-]*$/;
const RASTER_DATA_URL = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=\s]*$/i;

// 名前空間の接頭辞付きの名前（svg:script など）も同じ名前として扱う。
const PREFIX = String.raw`(?:[\w.-]+:)?`;
// 属性値。XML では引用符が要るが、引用符の無い書き方も読み飛ばさずに許可リストへ当てる。
const VALUE = String.raw`\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*))`;
const attributeValue = (m: RegExpMatchArray): string => m[1] ?? m[2] ?? m[3] ?? "";
const attribute = (name: string): RegExp => new RegExp(`${name}${VALUE}`, "gi");

// 名前空間の宣言。
const XMLNS = attribute(String.raw`xmlns(?::[\w.-]+)?`);
// 動かしてはいけない要素。script は実行、foreignObject は HTML の混入、text はフォント未達。
const ELEMENT = new RegExp(String.raw`<${PREFIX}(script|foreignObject|text)(?=[\s/>])`, "i");
// 属性名は空白の後に始まる。data URL の base64 の中の on...= を拾わないため。
const EVENT_ATTRIBUTE = /\s(on[a-z]+)\s*=/i;
// animate / set で href を書き換える形。静的な href の許可リストをすり抜けさせない。
const ANIMATED_HREF = new RegExp(`^${PREFIX}href$`, "i");
const ATTRIBUTE_NAME = attribute("attributeName");
const HREF = attribute("href");
// CSS の url()。style 属性・style 要素・animate の値など、場所を問わず拾う。
const CSS_URL = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s"']*))/gi;

type Check = (svg: string) => Option<string>;

const firstBad = (values: readonly string[], allowed: (v: string) => boolean): Option<string> =>
  fromNullable(values.find((v) => !allowed(v)));

// re が拾った値のうち、allowed に当たらない最初のものを label 付きで返す。
const allowOnly =
  (re: RegExp, allowed: (v: string) => boolean, label: string): Check =>
  (svg) =>
    mapOption(
      firstBad(Array.from(svg.matchAll(re), attributeValue), allowed),
      (v) => `${label}: ${v}`,
    );

const namespaces = allowOnly(XMLNS, (v) => NAMESPACES.includes(v), "許可しない名前空間");

const forbiddenElement: Check = (svg) =>
  mapOption(fromNullable(svg.match(ELEMENT)), (m) => `${m[1]} 要素を含む`);

const eventAttribute: Check = (svg) =>
  mapOption(fromNullable(svg.match(EVENT_ATTRIBUTE)), (m) => `イベント属性 ${m[1]} を含む`);

const hrefAnimation: Check = (svg) =>
  Array.from(svg.matchAll(ATTRIBUTE_NAME), attributeValue).some((v) => ANIMATED_HREF.test(v.trim()))
    ? some("href を書き換える animate / set を含む")
    : none();

const hrefs = allowOnly(HREF, (v) => ID_REF.test(v) || RASTER_DATA_URL.test(v), "許可しない href");

const cssUrls = allowOnly(CSS_URL, (v) => ID_REF.test(v), "許可しない url()");

// 文書内を指す @import は無いので丸ごと拒否する。
const cssImport: Check = (svg) => (/@import/i.test(svg) ? some("@import を含む") : none());

// url() 以外で画像を読む CSS の関数。image-set() などは引用符だけの文字列で外部を指せるので、
// url() の許可リストに掛からない。文書内を指す使い道は無いので丸ごと拒否する。
const CSS_IMAGE_FUNCTION = /((?:-webkit-)?image-set|image|src|cross-fade)\(/i;
const cssImageFunctions: Check = (svg) =>
  mapOption(fromNullable(svg.match(CSS_IMAGE_FUNCTION)), (m) => `CSS の ${m[1]}( を含む`);

// 数値文字参照は XML の読み込みで文字に戻るので、u&#114;l( のように CSS の字句を検査から隠せる。
// マスターは UTF-8 で直接書けるので要らず、丸ごと拒否する。
const charRefs: Check = (svg) => (svg.includes("&#") ? some("数値文字参照を含む") : none());

// CSS のエスケープ（u\72l( など）も同様。SVG の中でバックスラッシュが要る場所は無い。
const backslash: Check = (svg) => (svg.includes("\\") ? some("バックスラッシュを含む") : none());

// href の許可リストは、符号化の検査より先に当てる（符号化した javascript: も許可リストで落とす）。
const CHECKS: readonly Check[] = [
  namespaces,
  forbiddenElement,
  eventAttribute,
  hrefAnimation,
  hrefs,
  cssUrls,
  cssImport,
  cssImageFunctions,
  charRefs,
  backslash,
];

// 内部サブセットの実体は展開後に <script> などを作れ、属性の既定値（ATTLIST）は onload や href を
// 要素に書かずに付けられるので、どちらも生の文字列の検査をすり抜ける。
const INTERNAL_SUBSET = /<!DOCTYPE[^>]*\[|<!(?:ENTITY|ATTLIST|ELEMENT|NOTATION)/i;
// 読み飛ばしてよい DOCTYPE。XML のシステム識別子は > を含めるので、> までを DOCTYPE と見なすと
// 識別子の中の <!-- や <? で内部サブセットをコメント・処理命令に見せかけられる。識別子に
// < > [ ] を許さない形だけ読み飛ばし、それ以外の DOCTYPE はルート要素として読めずに落とす。
const LITERAL = String.raw`"[^"<>[\]]*"`;
const DOCTYPE = String.raw`<!DOCTYPE\s+svg(?:\s+PUBLIC\s+${LITERAL}\s+${LITERAL}|\s+SYSTEM\s+${LITERAL})?\s*>`;
// XML 宣言・処理命令・コメント・DOCTYPE・空白。この後の最初の要素をルートとする。
const PROLOG = new RegExp(String.raw`^(?:\s+|<\?[\s\S]*?\?>|<!--[\s\S]*?-->|${DOCTYPE})*`, "i");
// 属性が name="value" / name='value' の並びである svg の開始タグ。引用符の中の > で切れないよう
// 属性単位で読む。
const ROOT_SVG = /^<svg((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*\/?>/;
const ATTRIBUTE = /\s+([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

// ルート要素の開始タグの属性の並び。
const rootAttributes = (svg: string): Result<string, string> => {
  if (INTERNAL_SUBSET.test(svg)) return fail("DOCTYPE に内部サブセットを含む");
  const m = svg.replace(PROLOG, "").match(ROOT_SVG);
  return m === null ? fail("ルート要素が svg でないか、開始タグを読めない") : success(m[1] ?? "");
};

const NUMBER = String.raw`([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)`;
const VIEW_BOX = new RegExp(
  String.raw`^\s*${NUMBER}[\s,]+${NUMBER}[\s,]+${NUMBER}[\s,]+${NUMBER}\s*$`,
  "i",
);

const viewBoxOf = (attrs: string): Result<ViewBox, string> => {
  const raw = Array.from(attrs.matchAll(ATTRIBUTE)).find((m) => m[1] === "viewBox");
  if (raw === undefined) return fail("ルート要素に viewBox が無い");
  const value = raw[2] ?? raw[3] ?? "";
  const m = value.match(VIEW_BOX);
  if (m === null) return fail(`viewBox が 4 つの数でない: ${value}`);
  const viewBox = { x: Number(m[1]), y: Number(m[2]), width: Number(m[3]), height: Number(m[4]) };
  if (!(viewBox.width > 0 && viewBox.height > 0)) {
    return fail(`viewBox の幅と高さが正でない: ${value}`);
  }
  return success(viewBox);
};

export const inspectMaster = (svg: string): Result<{ viewBox: ViewBox }, string> => {
  const root = rootAttributes(svg);
  if (!root.success) return root;
  for (const check of CHECKS) {
    const violation = check(svg);
    if (violation.some) return fail(violation.value);
  }
  return mapResult(viewBoxOf(root.data), (viewBox) => ({ viewBox }));
};

// UTF-8 に符号化してから SHA-256。小文字 16 進で返す。
export const sha256Hex = async (text: string): Promise<string> => {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
};

// brand/generated.json の本文。just images が書き、テストがコミット済みのものと比べる。
export const generatedJson = async (
  masters: readonly { file: string; svg: string }[],
): Promise<string> => {
  const entries = await Promise.all(masters.map(async (m) => [m.file, await sha256Hex(m.svg)]));
  return `${JSON.stringify(Object.fromEntries(entries), null, 2)}\n`;
};
