import { expect } from "vitest";
// workerd では node:fs が使えないため Vite の ?raw で本文を文字列として埋め込む。
import stylesCss from "../../src/client/styles.module.css?raw";

export { stylesCss };

export type Tokens = Readonly<Record<string, string>>;

// 色の定義が許されるのは :global(:root) のトークンブロックだけ。本体を第 1 グループに取る。
// （ダーク用の @media 内にある同名ブロックも同じ形なので同じ規則で扱われる。）
export const TOKEN_BLOCK = /:global\(:root\)\s*\{([^{}]*)\}/g;
export const DARK_MEDIA = /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{/;

export const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, "");

// コメントを除き、ダーク用 @media の手前（light）と、そこから後ろ（dark）に分ける。
export const splitByDarkMedia = (css: string): { light: string; dark: string } => {
  const plain = stripComments(css);
  const darkAt = plain.search(DARK_MEDIA);
  return darkAt < 0
    ? { light: plain, dark: "" }
    : { light: plain.slice(0, darkAt), dark: plain.slice(darkAt) };
};

// `--name: value;` の宣言を集める。同名は後ろが勝つ。
export const parseDeclarations = (body: string): Tokens =>
  Object.fromEntries(
    [...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1] ?? "", (m[2] ?? "").trim()]),
  );

// :global(:root) ブロックの宣言をすべて合わせる。
export const rootTokens = (css: string): Tokens =>
  Object.assign({}, ...[...css.matchAll(TOKEN_BLOCK)].map((m) => parseDeclarations(m[1] ?? "")));

// セレクタ `selector {` から最初の `}` までの宣言ブロックを返す。見つからなければテストを失敗させる。
export const declarationsOf = (css: string, selector: string): string => {
  const start = css.indexOf(`${selector} {`);
  expect(start, `${selector} が見つかる`).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("}", start));
};
