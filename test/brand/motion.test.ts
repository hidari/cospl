import { describe, expect, test } from "vitest";
import { declarationsOf, stripComments, stylesCss } from "./css";

// 任意入力の開閉の動き。summary 以外の中身だけが、開いたときに 200ms で現れる。
// 高さの補間（interpolate-size / calc-size）は Chrome 系のみなので使わず、
// 全ブラウザで効く不透明度と transform だけで見せる。閉じるときは動かさない。
const REVEALED = ":global(.inputs[open] > :not(summary))";

describe("任意入力を開いたときの動き", () => {
  test("開いた状態の summary 以外の中身に 200ms ease-out のアニメーションが付く", () => {
    const block = declarationsOf(stylesCss, REVEALED);
    expect(block).toMatch(/animation:\s*inputs-reveal\s+200ms\s+ease-out\s*;/);
  });

  test("keyframes は不透明度 0 から 1、上に 4px ずれた位置から元の位置へ", () => {
    const plain = stripComments(stylesCss);
    const frames =
      /@keyframes\s+inputs-reveal\s*\{\s*from\s*\{([^}]*)\}\s*to\s*\{([^}]*)\}\s*\}/.exec(plain);
    expect(frames, "inputs-reveal の keyframes が from / to で定義されている").not.toBeNull();
    const [, from = "", to = ""] = frames ?? [];
    expect(from).toMatch(/opacity:\s*0\s*;/);
    expect(from).toMatch(/transform:\s*translateY\(-4px\)\s*;/);
    expect(to).toMatch(/opacity:\s*1\s*;/);
    expect(to).toMatch(/transform:\s*none\s*;/);
  });

  test("prefers-reduced-motion: reduce ではアニメーションを無効にする", () => {
    const plain = stripComments(stylesCss);
    const media = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/.exec(plain);
    expect(media, "reduced-motion の @media がある").not.toBeNull();
    const inner = media?.[1] ?? "";
    expect(declarationsOf(inner, REVEALED)).toMatch(/animation:\s*none\s*;/);
  });
});
