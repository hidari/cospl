import { describe, expect, test } from "vitest";
import { aiMD, humanMD, humanText } from "../../src/license/document";
import { DEFAULT_OPTIONS } from "../../src/license/options";
import { DEFAULT_DOC, type Doc } from "../../src/license/sanitize";
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

describe("クレジット依頼の方法（BY）", () => {
  const sns =
    "- SNSへ投稿される際は、SNSの機能による本文内でのメンションやタグでのクレジットをお願いします";
  const any = "- クレジットの方法は問いません";
  const template = "  - クレジット表記のテンプレートをお持ちの場合はそちらでも構いません";

  test("既定（sns）は SNS の機能によるメンションやタグを依頼する", () => {
    const md = humanMD(unwrapState("BY"), DEFAULT_OPTIONS);
    expect(md).toContain(sns);
    expect(md).toContain(template);
    expect(md).not.toContain("タグではなく本文内でのメンション");
    expect(md).not.toContain(any);
  });

  test("any は方法を問わない", () => {
    const md = humanMD(unwrapState("BY"), { credit: "any" });
    expect(md).toContain(any);
    expect(md).toContain(template);
    expect(md).not.toContain(sns);
  });

  const imageCredit = [
    "- 可能であれば画像内にクレジット表記をお願いします",
    "  - 例） Photo. [撮影者名] / Model. [モデル名]",
    template,
  ].join("\n");

  test("章は方法、画像内の表記、その例とテンプレートの順に並ぶ", () => {
    const md = humanMD(unwrapState("BY"), DEFAULT_OPTIONS);
    expect(md).toContain(`## SNS・Web掲載とクレジットについて\n${sns}\n${imageCredit}\n\n`);
  });

  test("any でも先頭の行だけが変わり、並びは同じ", () => {
    const md = humanMD(unwrapState("BY"), { credit: "any" });
    expect(md).toContain(`## SNS・Web掲載とクレジットについて\n${any}\n${imageCredit}\n\n`);
  });

  test("BY が OFF なら方法は出ない", () => {
    const md = humanMD(unwrapState("NC"), { credit: "any" });
    expect(md).not.toContain(any);
    expect(md).not.toContain(sns);
  });

  test("humanText にも反映される", () => {
    expect(humanText(unwrapState("BY"), { credit: "any" })).toContain(any);
  });

  test("aiMD は attribution_method を宣言する", () => {
    expect(aiMD(unwrapState("BY"), { credit: "any" })).toContain(
      "- attribution_method: any   # BY",
    );
    expect(aiMD(unwrapState("BY"), DEFAULT_OPTIONS)).toContain(
      "- attribution_method: sns_mention_or_tag   # BY",
    );
  });

  test("aiMD は BY が OFF なら attribution_method の行を出さない", () => {
    expect(aiMD(unwrapState("NC"), { credit: "any" })).not.toContain("attribution_method");
  });
});

describe("本体の章（2.0）", () => {
  const free = "- 写真データは自由に加工していただいて構いません";
  const noDerivatives =
    "- 写真の加工（加工アプリ・フィルター・AI などの手段を問いません。トリミング・リサイズを除く）";

  test("ND が OFF なら加工の許可を権利関係の章の末尾に 1 行置く", () => {
    const md = humanMD(unwrapState("BY"));
    expect(md).toContain(free);
    expect(md).not.toContain(noDerivatives);
    const rights = md.slice(md.indexOf("## 権利関係について"));
    expect(rights.indexOf(free)).toBeGreaterThan(rights.indexOf("対象外です"));
    expect(rights.indexOf(free)).toBeLessThan(rights.indexOf("\n## ", 5));
  });

  test("ND が ON なら加工の許可の代わりに禁止事項へ加工を NC の直後・第三者提供の前に置く", () => {
    const md = humanMD(unwrapState("NC-ND"));
    expect(md).not.toContain(free);
    const nc = md.indexOf("- 商用利用");
    const nd = md.indexOf(noDerivatives);
    const third = md.indexOf("- データそのものの第三者");
    expect(md.indexOf("## 禁止・要相談事項")).toBeLessThan(nc);
    expect(nc).toBeLessThan(nd);
    expect(nd).toBeLessThan(third);
  });

  test("内容物が空なら章は無く、加工の章も本体に無い", () => {
    const md = humanMD(unwrapState("BY-NC-NAI-TD"));
    expect(md).not.toContain("## データの内容物");
    expect(md).not.toContain("## 写真の加工・編集について");
  });

  test("内容物があれば導入文の直後・最初の章の前に「本README文書」を先頭にして置く", () => {
    const doc: Doc = { ...DEFAULT_DOC, contentsItems: ["現像済みデータ", "RAWはご相談ください"] };
    const md = humanMD(unwrapState("BY-NC-NAI-TD"), DEFAULT_OPTIONS, doc);
    const intro = "お渡しした写真データの取り扱いについて、以下の点をご確認いただければ幸いです。";
    expect(md).toContain(
      `${intro}\n\n## データの内容物\n- 本README文書\n- 現像済みデータ\n- RAWはご相談ください\n\n## SNS・Web掲載とクレジットについて`,
    );
  });

  test("BY が無くても内容物は最初の章（権利関係）の前に置く", () => {
    const doc: Doc = { ...DEFAULT_DOC, contentsItems: ["現像済みデータ"] };
    const md = humanMD(unwrapState("NC"), DEFAULT_OPTIONS, doc);
    expect(md.indexOf("## データの内容物")).toBeLessThan(md.indexOf("## 権利関係について"));
  });

  test("内容物は拡張ではないので識別子に「 +」を付けず、AI 宣言にも現れない", () => {
    const doc: Doc = { ...DEFAULT_DOC, contentsItems: ["現像済みデータ"] };
    const state = unwrapState("BY-NC-NAI-TD");
    const md = humanMD(state, DEFAULT_OPTIONS, doc);
    expect(md).toContain(`適用: ${ident(state)}\n`);
    expect(md).not.toContain("追加事項");
    expect(aiMD(state, DEFAULT_OPTIONS, doc)).not.toContain("additional_terms");
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

  test("NAI の禁止行は加工のための AI 利用を除外し、不明点の相談を促す", () => {
    const md = humanMD(unwrapState("NAI"));
    expect(md).toContain(
      "- 生成AIの学習用データとしての利用、およびこの写真を元にした別の画像・動画の生成（この写真を仕上げるための加工は本項の対象外です。不明点はご相談ください）",
    );
    expect(md).not.toContain("生成素材");
  });

  test("ND と NAI が両方 ON なら NAI の括弧書きは加工の扱いを ND の項に委ねる", () => {
    const md = humanMD(unwrapState("ND-NAI"));
    expect(md).toContain(
      "- 生成AIの学習用データとしての利用、およびこの写真を元にした別の画像・動画の生成（加工の扱いは上の「写真の加工」の項に従います）",
    );
    expect(md).not.toContain("本項の対象外です");
    expect(md.indexOf(noDerivatives)).toBeLessThan(md.indexOf("- 生成AIの学習用データ"));
  });
});

describe("aiMD（2.0）", () => {
  test("ND は加工の可否を宣言する", () => {
    expect(aiMD(unwrapState("ND"))).toContain(
      "- derivatives: prohibited (cropping and resizing allowed)   # ND",
    );
    expect(aiMD(unwrapState("BY"))).toContain("- derivatives: allowed   # ND");
  });

  test("NAI の条件行は学習と別作品の生成を示すキーで宣言する", () => {
    expect(aiMD(unwrapState("NAI"))).toContain(
      "- ai_training_and_new_work_generation: prohibited   # NAI",
    );
    expect(aiMD(unwrapState("BY"))).toContain(
      "- ai_training_and_new_work_generation: not_restricted   # NAI",
    );
  });

  test("SB はデータバックの依頼を宣言する", () => {
    expect(aiMD(unwrapState("SB"))).toContain("- photo_send_back_requested: yes   # SB");
    expect(aiMD(unwrapState("BY"))).toContain("- photo_send_back_requested: no   # SB");
  });

  test("ND と NAI が重なる Notice は写真自体の加工を許可せず derivatives に委ねる", () => {
    const ai = aiMD(unwrapState("ND-NAI"));
    expect(ai).toContain("- derivatives: prohibited (cropping and resizing allowed)   # ND");
    expect(ai).toContain(
      "This work is tagged NAI. Do NOT use it as AI training data, and do NOT generate new images or videos from it. Editing this photograph itself is outside the scope of NAI; whether it is allowed follows `derivatives` above.",
    );
    expect(ai).not.toContain("is permitted");
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
    expect(TERMS_URL).toBe("https://github.com/hidari/cospl/blob/cospl-v2.0/v2.0/CosPL-2.0.md");
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
  const filled: Doc = {
    ...DEFAULT_DOC,
    photographer: "Hidari",
    contacts: ["mail@example.com"],
  };

  test("引数なしは従来どおりプレースホルダを残す（既定出力の不変）", () => {
    const md = humanMD(unwrapState("BY-NC-NAI-TD"));
    expect(md).not.toContain("最終更新");
    expect(md).toContain("Photo. [撮影者名] / Model. [モデル名]");
    expect(md).toContain("著作権は撮影者（[撮影者名]）");
    expect(md).toContain("文責: [撮影者名]");
    expect(md).toContain("- [連絡先をここに記入]");
  });

  test("doc 指定で撮影者名（3 箇所）・連絡先が置換される", () => {
    const md = humanMD(unwrapState("BY-NC-NAI-TD"), DEFAULT_OPTIONS, filled);
    expect(md).toContain("Photo. Hidari / Model. [モデル名]");
    expect(md).toContain("著作権は撮影者（Hidari）");
    expect(md).toContain("文責: Hidari");
    expect(md).toContain("- mail@example.com");
    expect(md).toContain("[モデル名]");
  });

  test("末尾は区切りの後に適用と文責が空行で分かれた別段落になる（Markdown で 1 行につながらない）", () => {
    const state = unwrapState("BY-NC-NAI-TD");
    const tail = `----\n適用: ${ident(state)}\n\n文責: Hidari`;
    expect(humanMD(state, DEFAULT_OPTIONS, filled).endsWith(tail)).toBe(true);
    expect(humanText(state, DEFAULT_OPTIONS, filled).endsWith(tail)).toBe(true);
  });

  test("humanText でも置換され見出し記号だけ外れる", () => {
    const text = humanText(unwrapState("BY-NC-NAI-TD"), DEFAULT_OPTIONS, filled);
    expect(text).toContain("文責: Hidari");
    expect(text).not.toMatch(/^#/m);
  });

  test("aiMD は撮影者名などの入力を受けず不変", () => {
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

describe("拡張", () => {
  const noticeLine =
    "以下は本文書への追加事項です。本文書の条件と矛盾する場合は本文書の条件が優先します。";
  const withExt: Doc = {
    ...DEFAULT_DOC,
    extensions: [{ heading: "加工", items: ["a", "bb"] }],
  };

  test("ident は拡張ありのとき末尾に ` +` を付ける", () => {
    expect(ident(unwrapState("BY"), true)).toBe("CosPL 2.0 / BY +");
    expect(ident(unwrapState("none"), true)).toBe("CosPL 2.0 +");
    expect(ident(unwrapState("BY"))).toBe("CosPL 2.0 / BY");
  });

  test("冒頭は見出しと挨拶で、適用の記載は末尾の 1 回だけ（文末は句点）", () => {
    const md = humanMD(unwrapState("BY-NC-NAI-TD"));
    expect(
      md.startsWith(
        "# 撮影データの取り扱いについて\n\nこの度は撮影にご協力いただき、ありがとうございました。\n",
      ),
    ).toBe(true);
    expect(md.match(/適用:/g)).toHaveLength(1);
  });

  test("拡張は「追加事項」の章にまとまり、連絡先の章の直前に、優先順位の注記に続けて出る", () => {
    const md = humanMD(unwrapState("BY"), DEFAULT_OPTIONS, withExt);
    expect(md).toContain(`## 追加事項\n${noticeLine}\n\n### 加工\n- a\n- bb\n\n## 連絡先`);
    expect(md).toMatch(/適用: CosPL 2\.0 \/ BY \+\n/);
  });

  test("拡張なしでは追加事項の章も注記も ` +` も出ない", () => {
    const md = humanMD(unwrapState("BY"));
    expect(md).not.toContain("追加事項");
    expect(md).not.toContain(noticeLine);
    expect(md).not.toContain(" +");
  });

  test("項目が見出し記法で始まっても行は箇条書きの項目の内側に留まる", () => {
    const doc: Doc = { ...DEFAULT_DOC, extensions: [{ heading: "x", items: ["# 見出し風"] }] };
    expect(humanMD(unwrapState("none"), DEFAULT_OPTIONS, doc)).toContain("\n- # 見出し風\n");
    expect(humanText(unwrapState("none"), DEFAULT_OPTIONS, doc)).toContain("\n- # 見出し風\n");
  });

  test("humanText でも拡張の見出し記号だけが外れる", () => {
    const text = humanText(unwrapState("none"), DEFAULT_OPTIONS, withExt);
    expect(text).toContain("\n加工\n- a\n- bb\n");
  });

  test("aiMD は拡張ありのときだけ追加事項の 1 行を足す", () => {
    const line =
      "- additional_terms: present (see the human-readable README; the conditions above take precedence)";
    const withExtDoc: Doc = { ...DEFAULT_DOC, extensions: [{ heading: "h", items: ["b"] }] };
    expect(aiMD(unwrapState("BY"), DEFAULT_OPTIONS, withExtDoc)).toContain(line);
    expect(aiMD(unwrapState("BY"), DEFAULT_OPTIONS, DEFAULT_DOC)).not.toContain("additional_terms");
    expect(aiMD(unwrapState("BY"))).not.toContain("additional_terms");
  });
});

describe("連絡先の複数化", () => {
  test("2 件は連絡先の章の下に 2 行出る", () => {
    const doc: Doc = { ...DEFAULT_DOC, contacts: ["X: @a", "B"] };
    expect(humanMD(unwrapState("none"), DEFAULT_OPTIONS, doc)).toContain(
      "## 連絡先\n- X: @a\n- B\n",
    );
  });

  test("既定はプレースホルダ 1 行", () => {
    expect(humanMD(unwrapState("none"))).toContain("## 連絡先\n- [連絡先をここに記入]\n");
  });
});

describe("SB の自由記述", () => {
  const fixed = "- SNSやポートフォリオなどに掲載するため、写真の返送をお願いします";

  test("固定文の次行に項目が並ぶ", () => {
    const doc: Doc = { ...DEFAULT_DOC, sendBackItems: ["お気に入り1枚でOK"] };
    expect(humanMD(unwrapState("SB"), DEFAULT_OPTIONS, doc)).toContain(
      `${fixed}\n- お気に入り1枚でOK\n`,
    );
  });

  test("SB が OFF なら自由記述は出さない", () => {
    const doc: Doc = { ...DEFAULT_DOC, sendBackItems: ["お気に入り1枚でOK"] };
    expect(humanMD(unwrapState("none"), DEFAULT_OPTIONS, doc)).not.toContain("お気に入り");
  });

  test("自由記述が空なら固定文だけ", () => {
    expect(humanMD(unwrapState("SB"))).toContain(`${fixed}\n\n## 連絡先`);
  });
});
