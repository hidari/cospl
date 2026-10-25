import { describe, expect, test } from "vitest";
import { aiMD, humanMD, humanText } from "../../src/license/document";
import type { Fields } from "../../src/license/sanitize";
import { ident, tagsFrom } from "../../src/license/tags";
import golden from "../__fixtures__/golden.json";
import { unwrapState } from "./helpers";

// golden.json は現在の core 出力を固定した回帰用フィクスチャ。`just regen-golden` で更新する。
type GoldenCase = {
  tags: string[];
  ident: string;
  human: string;
  ai: string;
};
const goldenCases = golden as Record<string, GoldenCase>;

describe("MR の免責文", () => {
  const mrSentence =
    "なお、モデルご本人がクレジット付きで自身の有償頒布物（ROM・写真集等）に使用することは許可します。";

  // 禁止事項節は第三者提供の禁止を常に含むため常に描画される。よって MR が ON なら NC/NAI の有無に依らず免責文が出る。
  test("MR が ON なら NC/NAI の有無に依らず免責文が現れる", () => {
    expect(humanMD(unwrapState("MR"))).toContain(mrSentence);
    expect(humanMD(unwrapState("NC-MR"))).toContain(mrSentence);
  });

  test("MR が OFF なら免責文は現れない", () => {
    expect(humanMD(unwrapState("NC"))).not.toContain(mrSentence);
  });
});

describe("humanText", () => {
  test("文面は humanMD と同一で、見出し記号(# / ##)だけを外す", () => {
    const state = unwrapState("BY-NC-NAI-TD");
    const text = humanText(state);
    expect(text).not.toMatch(/^#/m);
    expect(text).toBe(humanMD(state).replace(/^#{1,6}\s+/gm, ""));
  });

  test("箇条書きや区切り線はそのまま残す", () => {
    const text = humanText(unwrapState("none"));
    expect(text).toContain("- 現像済みJPEGデータ");
    expect(text).toContain("----");
  });
});

describe("humanMD のフィールド反映", () => {
  const filled: Fields = {
    date: "2026-06-17",
    photographer: "Hidari",
    contact: "mail@example.com",
  };

  test("引数なしは従来どおりプレースホルダを残す（既定出力の不変）", () => {
    const md = humanMD(unwrapState("BY-NC-NAI-TD"));
    expect(md).toContain("最終更新: [YYYY-MM-DD]");
    expect(md).toContain("Photo. [撮影者名] / Model. [モデル名]");
    expect(md).toContain("著作権は撮影者（[撮影者名]）");
    expect(md).toContain("文責: [撮影者名]");
    expect(md).toContain("- [連絡先をここに記入]");
  });

  test("fields 指定で日付・撮影者名（3 箇所）・連絡先が置換される", () => {
    const md = humanMD(unwrapState("BY-NC-NAI-TD"), filled);
    expect(md).toContain("最終更新: 2026-06-17");
    expect(md).toContain("Photo. Hidari / Model. [モデル名]");
    expect(md).toContain("著作権は撮影者（Hidari）");
    expect(md).toContain("文責: Hidari");
    expect(md).toContain("- mail@example.com");
    expect(md).toContain("[モデル名]");
  });

  test("humanText でも置換され見出し記号だけ外れる", () => {
    const text = humanText(unwrapState("BY-NC-NAI-TD"), filled);
    expect(text).toContain("文責: Hidari");
    expect(text).not.toMatch(/^#/m);
  });

  test("aiMD はフィールド非対応で不変", () => {
    expect(aiMD(unwrapState("BY-NC-NAI-TD"))).not.toContain("Hidari");
  });
});

describe("生成文書は golden と byte 一致する（回帰）", () => {
  for (const [raw, expected] of Object.entries(goldenCases)) {
    test(`${raw}: tags / ident / humanMD / aiMD`, () => {
      const state = unwrapState(raw);
      expect(tagsFrom(state)).toEqual(expected.tags);
      expect(ident(state)).toBe(expected.ident);
      expect(humanMD(state)).toBe(expected.human);
      expect(aiMD(state)).toBe(expected.ai);
    });
  }
});
