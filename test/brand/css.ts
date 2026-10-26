import { expect } from "vitest";

// セレクタ `selector {` から最初の `}` までの宣言ブロックを返す。見つからなければテストを失敗させる。
export const declarationsOf = (css: string, selector: string): string => {
  const start = css.indexOf(`${selector} {`);
  expect(start, `${selector} が見つかる`).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("}", start));
};
