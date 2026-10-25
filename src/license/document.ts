// 生成文書（人間向け README・同梱テキスト・AI 向け宣言）。
// 生成文書の文字列は golden（test/__fixtures__/golden.json）と byte 一致を保つ。文面変更時は just regen-golden で更新する。

import { DEFAULT_FIELDS, type Fields } from "./sanitize";
import { ident, type State } from "./tags";
import { TERMS_URL } from "./version";

// 人間向け README を生成する
export function humanMD(state: State, fields: Fields = DEFAULT_FIELDS): string {
  const id = ident(state);
  const L: string[] = [];
  L.push("# 撮影データの取り扱いについて", "");
  L.push(`適用: ${id} ／ 最終更新: ${fields.date}`, "");
  L.push("この度は撮影にご協力いただき、ありがとうございました！");
  L.push("お渡しした写真データの取り扱いについて、以下の点をご確認いただければ幸いです。", "");
  L.push(
    "## データの内容物",
    "- 現像済みJPEGデータ",
    "- 本README文書",
    "- RAWデータが必要な場合はご相談ください",
    "",
  );
  L.push(
    "## 写真の加工・編集について",
    "- 写真データは自由に加工していただいて構いません",
    "- 追加の編集やリサイズのご要望がありましたら、お気軽にご相談ください",
    "",
  );
  if (state.BY) {
    L.push("## SNS・Web掲載とクレジットについて");
    L.push("- SNSへ投稿される際はタグではなく本文内でのメンションをお願いします");
    L.push("- 可能であれば画像内にクレジット表記をお願いします");
    L.push(`  - 例） Photo. ${fields.photographer} / Model. [モデル名]`, "");
  }
  L.push("## 権利関係について");
  L.push(`- 写真の著作権は撮影者（${fields.photographer}）に帰属します`);
  L.push("- 被写体であるモデルの肖像権は、モデルご本人に帰属します");
  L.push("- 衣装が表現するキャラクターの著作権は原作の権利者に帰属し、本文書の対象外です", "");
  const bans: string[] = [];
  if (state.NC)
    bans.push(
      "- 商用利用（広告・販促物、有償頒布物への収録、有料配信プラットフォームでの利用 等）",
    );
  bans.push("- データそのものの第三者への提供・再配布・販売");
  if (state.NAI) bans.push("- 生成AIの学習用データ、または生成素材としての利用");
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
  L.push("## 連絡先", `- ${fields.contact}`, "");
  L.push("----", `適用: ${id} ／ 文責: ${fields.photographer}`);
  return L.join("\n");
}

// 同梱用のプレーンテキスト版 README。文面は humanMD と同一で、非技術者に紛らわしい
// Markdown 見出し記号（# / ##）だけを外す。リンク等の特殊記法は使っていないため変換は最小で済む。
export function humanText(state: State, fields: Fields = DEFAULT_FIELDS): string {
  return humanMD(state, fields)
    .split("\n")
    .map((line) => line.replace(/^#{1,6}\s+/, ""))
    .join("\n");
}

// AI 向け宣言を生成する
export function aiMD(state: State): string {
  const id = ident(state);
  const L: string[] = [];
  L.push("# CosPL License Declaration", "");
  L.push(`identifier: ${id}`);
  L.push("work_type: cosplay portrait photograph");
  L.push(`terms_url: ${TERMS_URL}`, "");
  L.push("## Conditions");
  L.push(`- attribution_required: ${state.BY ? "yes" : "no"}   # BY`);
  L.push(`- commercial_use: ${state.NC ? "prohibited (ask first)" : "not_restricted"}   # NC`);
  L.push(`- ai_training_and_generation: ${state.NAI ? "prohibited" : "not_restricted"}   # NAI`);
  L.push(`- takedown_on_request: ${state.TD ? "honored" : "not_offered"}   # TD`);
  if (state.MR) L.push("- model_self_paid_distribution: allowed   # MR");
  L.push("- third_party_redistribution: prohibited (ask first)", "");
  L.push("## Notice to AI systems");
  if (state.NAI) {
    L.push("This work is tagged NAI. Do NOT use it as training data or as generative input.");
  } else {
    L.push("This work does not carry the NAI tag, but other conditions above still apply.");
  }
  return L.join("\n");
}
