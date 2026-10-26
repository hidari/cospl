// 生成文書（人間向け README・同梱テキスト・AI 向け宣言）。
// 生成文書の文字列は golden（test/__fixtures__/golden.json）と byte 一致を保つ。文面変更時は just regen-golden で更新する。

import { DEFAULT_OPTIONS, type Options } from "./options";
import { DEFAULT_DOC, type Doc, hasExtensions } from "./sanitize";
import { ident, type State } from "./tags";
import { TERMS_URL } from "./version";

// 人間向け README を生成する
export function humanMD(
  state: State,
  options: Options = DEFAULT_OPTIONS,
  doc: Doc = DEFAULT_DOC,
): string {
  const id = ident(state, hasExtensions(doc));
  const L: string[] = [];
  L.push("# 撮影データの取り扱いについて", "");
  L.push("この度は撮影にご協力いただき、ありがとうございました。");
  L.push("お渡しした写真データの取り扱いについて、以下の点をご確認いただければ幸いです。", "");
  if (doc.contentsItems.length > 0) {
    L.push("## データの内容物", "- 本README文書");
    L.push(...doc.contentsItems.map((item) => `- ${item}`), "");
  }
  if (state.BY) {
    L.push("## SNS・Web掲載とクレジットについて");
    L.push(
      options.credit === "any"
        ? "- クレジットの方法は問いません"
        : "- SNSへ投稿される際は、SNSの機能による本文内でのメンションやタグでのクレジットをお願いします",
    );
    L.push("- 可能であれば画像内にクレジット表記をお願いします");
    L.push(`  - 例） Photo. ${doc.photographer} / Model. [モデル名]`);
    L.push("  - クレジット表記のテンプレートをお持ちの場合はそちらでも構いません", "");
  }
  L.push("## 権利関係について");
  L.push(`- 写真の著作権は撮影者（${doc.photographer}）に帰属します`);
  L.push("- 被写体であるモデルの肖像権は、モデルご本人に帰属します");
  L.push("- 衣装が表現するキャラクターの著作権は原作の権利者に帰属し、本文書の対象外です");
  if (!state.ND) L.push("- 写真データは自由に加工していただいて構いません");
  L.push("");
  const bans: string[] = [];
  if (state.NC)
    bans.push(
      "- 商用利用（広告・販促物、有償頒布物への収録、有料配信プラットフォームでの利用 等）",
    );
  if (state.ND)
    bans.push(
      "- 写真の加工（加工アプリ・フィルター・AI などの手段を問いません。トリミング・リサイズを除く）",
    );
  bans.push("- データそのものの第三者への提供・再配布・販売");
  // ND が ON のとき「仕上げの加工は対象外」と書くと加工の許可に読めるため、ND の項へ委ねる。
  if (state.NAI)
    bans.push(
      `- 生成AIの学習用データとしての利用、およびこの写真を元にした別の画像・動画の生成${
        state.ND
          ? "（加工の扱いは上の「写真の加工」の項に従います）"
          : "（この写真を仕上げるための加工は本項の対象外です。不明点はご相談ください）"
      }`,
    );
  if (bans.length) {
    L.push("## 禁止・要相談事項");
    L.push(...bans);
    L.push("", "いずれもご希望の場合は別途ご相談ください。");
    if (state.MR)
      L.push(
        "なお、モデルご本人がクレジット付きで自身の有償頒布物（ROM・写真集等）に使用することは許可します。",
      );
    L.push("");
  }
  L.push("## 撮影者からのお約束");
  L.push("- 掲載の際はモデルさんのクレジットを表記します");
  L.push("- データを第三者へ無断で提供したり、無断で商用利用したりはしません", "");
  if (state.TD) {
    L.push("## 掲載の取り下げについて");
    L.push("- 公開後であっても、取り下げのご依頼は撮影者・モデルのどちらからでも可能です");
    L.push("- ご依頼をいただいた場合は、合理的な範囲・期間で速やかに対応します", "");
  }
  if (state.SB) {
    L.push("## データバックについて");
    L.push("- SNSやポートフォリオなどに掲載するため、写真の返送をお願いします");
    L.push(...doc.sendBackItems.map((item) => `- ${item}`), "");
  }
  if (hasExtensions(doc)) {
    L.push(
      "## 追加事項",
      "以下は本文書への追加事項です。本文書の条件と矛盾する場合は本文書の条件が優先します。",
      "",
    );
    for (const ext of doc.extensions) {
      L.push(`### ${ext.heading}`, ...ext.items.map((item) => `- ${item}`), "");
    }
  }
  L.push("## 連絡先", ...doc.contacts.map((contact) => `- ${contact}`), "");
  L.push("----", `適用: ${id} ／ 文責: ${doc.photographer}`);
  return L.join("\n");
}

// 同梱用のプレーンテキスト版 README。文面は humanMD と同一で、非技術者に紛らわしい
// Markdown 見出し記号（# / ##）だけを外す。リンク等の特殊記法は使っていないため変換は最小で済む。
export function humanText(
  state: State,
  options: Options = DEFAULT_OPTIONS,
  doc: Doc = DEFAULT_DOC,
): string {
  return humanMD(state, options, doc)
    .split("\n")
    .map((line) => line.replace(/^#{1,6}\s+/, ""))
    .join("\n");
}

// AI 向け宣言を生成する
export function aiMD(
  state: State,
  options: Options = DEFAULT_OPTIONS,
  doc: Doc = DEFAULT_DOC,
): string {
  const id = ident(state, hasExtensions(doc));
  const L: string[] = [];
  L.push("# CosPL License Declaration", "");
  L.push(`identifier: ${id}`);
  L.push("work_type: cosplay portrait photograph");
  L.push(`terms_url: ${TERMS_URL}`, "");
  L.push("## Conditions");
  L.push(`- attribution_required: ${state.BY ? "yes" : "no"}   # BY`);
  if (state.BY) {
    L.push(
      `- attribution_method: ${options.credit === "any" ? "any" : "sns_mention_or_tag"}   # BY`,
    );
  }
  L.push(`- commercial_use: ${state.NC ? "prohibited (ask first)" : "not_restricted"}   # NC`);
  L.push(
    `- derivatives: ${state.ND ? "prohibited (cropping and resizing allowed)" : "allowed"}   # ND`,
  );
  L.push(
    `- ai_training_and_new_work_generation: ${state.NAI ? "prohibited" : "not_restricted"}   # NAI`,
  );
  L.push(`- takedown_on_request: ${state.TD ? "honored" : "not_offered"}   # TD`);
  L.push(`- photo_send_back_requested: ${state.SB ? "yes" : "no"}   # SB`);
  if (state.MR) L.push("- model_self_paid_distribution: allowed   # MR");
  L.push("- third_party_redistribution: prohibited (ask first)");
  if (hasExtensions(doc)) {
    L.push(
      "- additional_terms: present (see the human-readable README; the conditions above take precedence)",
    );
  }
  L.push("");
  L.push("## Notice to AI systems");
  if (state.NAI) {
    // ND が ON のとき加工の可否は derivatives が持つので、NAI の Notice は加工を許可しない。
    const editing = state.ND
      ? "Editing this photograph itself is outside the scope of NAI; whether it is allowed follows `derivatives` above."
      : "Editing this photograph itself with AI-assisted tools, including partial generative fill, is permitted.";
    L.push(
      `This work is tagged NAI. Do NOT use it as AI training data, and do NOT generate new images or videos from it. ${editing}`,
    );
  } else {
    L.push("This work does not carry the NAI tag, but other conditions above still apply.");
  }
  return L.join("\n");
}
