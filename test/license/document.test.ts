import { describe, expect, test } from "vitest";
import { aiMD, humanMD, humanText } from "../../src/license/document";
import type { Fields } from "../../src/license/sanitize";
import { ident, tagsFrom } from "../../src/license/tags";
import { TERMS_URL } from "../../src/license/version";
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

describe("本体の章（2.0）", () => {
  const free = "- 写真データは自由に加工していただいて構いません";
  const noDerivatives = "- 写真の加工はご遠慮ください（トリミング・リサイズは構いません）";

  test("ND が OFF なら加工の許可を権利関係の章の末尾に 1 行置く", () => {
    const md = humanMD(unwrapState("BY"));
    expect(md).toContain(free);
    expect(md).not.toContain(noDerivatives);
    const rights = md.slice(md.indexOf("## 権利関係について"));
    expect(rights.indexOf(free)).toBeGreaterThan(rights.indexOf("対象外です"));
    expect(rights.indexOf(free)).toBeLessThan(rights.indexOf("\n## ", 5));
  });

  test("ND が ON なら加工の許可の代わりに加工のご遠慮を置く", () => {
    const md = humanMD(unwrapState("ND"));
    expect(md).toContain(noDerivatives);
    expect(md).not.toContain(free);
  });

  test("内容物と加工の章は本体に無い", () => {
    const md = humanMD(unwrapState("BY-NC-NAI-TD"));
    expect(md).not.toContain("## データの内容物");
    expect(md).not.toContain("## 写真の加工・編集について");
  });

  test("SB が ON ならデータバックの章を TD の章の直後に置く", () => {
    const md = humanMD(unwrapState("TD-SB"));
    expect(md).toContain("## データバックについて");
    expect(md).toContain("- SNSやポートフォリオなどに掲載するため、写真の返送をお願いします");
    expect(md.indexOf("## データバックについて")).toBeGreaterThan(
      md.indexOf("## 掲載の取り下げについて"),
    );
    expect(md.indexOf("## データバックについて")).toBeLessThan(md.indexOf("## 連絡先"));
  });

  test("SB が OFF ならデータバックの章は無い", () => {
    const md = humanMD(unwrapState("BY-NC-NAI-TD"));
    expect(md).not.toContain("## データバックについて");
    expect(md).not.toContain("写真の返送をお願いします");
  });

  test("NAI の禁止行は加工のための AI 利用を除外する", () => {
    const md = humanMD(unwrapState("NAI"));
    expect(md).toContain(
      "- 生成AIの学習用データとしての利用、およびこの写真を元にした別の画像・動画の生成（AIによるノイズ除去・レタッチ・背景の拡張など、この写真を仕上げるための加工は除きます）",
    );
    expect(md).not.toContain("生成素材");
  });
});

describe("aiMD（2.0）", () => {
  test("ND は加工の可否を宣言する", () => {
    expect(aiMD(unwrapState("ND"))).toContain(
      "- derivatives: prohibited (cropping and resizing allowed)   # ND",
    );
    expect(aiMD(unwrapState("BY"))).toContain("- derivatives: allowed   # ND");
  });

  test("SB はデータバックの依頼を宣言する", () => {
    expect(aiMD(unwrapState("SB"))).toContain("- photo_send_back_requested: yes   # SB");
    expect(aiMD(unwrapState("BY"))).toContain("- photo_send_back_requested: no   # SB");
  });

  test("NAI の Notice は学習と派生生成を禁じ、写真自体の加工は許可する", () => {
    const ai = aiMD(unwrapState("NAI"));
    expect(ai).toContain(
      "This work is tagged NAI. Do NOT use it as AI training data, and do NOT generate new images or videos from it. Editing this photograph itself with AI-assisted tools, including partial generative fill, is permitted.",
    );
    expect(ai).not.toContain("generative input");
  });

  test("terms_url は TERMS_URL を指す", () => {
    expect(aiMD(unwrapState("BY"))).toContain(`terms_url: ${TERMS_URL}`);
    expect(TERMS_URL).toBe("https://github.com/hidari/cospl/blob/main/v2.0/CosPL-2.0.md");
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
    expect(text).toContain("- 写真の著作権は撮影者");
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
