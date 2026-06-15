// CosPL core — タグロジックと Markdown 生成の単一ソース。
// DOM に依存しない純粋関数群。Worker（src/worker.ts）と Client（src/client/main.ts）が共有する。
// 生成 Markdown の文字列は旧 docs/cospl.mjs と byte 一致を保つ（test/__fixtures__/golden.json で検証）。

import {
  invalidFormatError,
  invalidViewError,
  type ParseError,
  unknownTagError,
} from "./types/errors";
import { none, type Option, some } from "./types/option";
import { fail, type Result, success } from "./types/result";

// タグの定義順（単一ソース）。union 型と検証用 Set をここから起こす。
export const ORDER = ["BY", "NC", "NAI", "TD", "MR"] as const;
export type Tag = (typeof ORDER)[number];
const TAGS: ReadonlySet<string> = new Set<Tag>(ORDER);

export type State = Readonly<Record<Tag, boolean>>;
export type View = "human" | "ai";
export type Format = "markdown" | "text";

// 全タグ false の初期状態を作る純粋関数。リテラルで全 Tag を網羅し、
// ORDER に Tag を追加すると型エラーで気付ける（as アサーション不要）。
export const emptyState = (): State => ({
  BY: false,
  NC: false,
  NAI: false,
  TD: false,
  MR: false,
});

// ON のタグを定義順に取り出す
export function tagsFrom(state: State): Tag[] {
  return ORDER.filter((tag) => state[tag]);
}

// 識別子文字列。タグなしはバージョンのみ。
export function ident(state: State): string {
  const tags = tagsFrom(state);
  return `CosPL 1.0${tags.length ? ` / ${tags.join("-")}` : ""}`;
}

// 文字列が既知タグかどうかを判定する型述語
const isTag = (value: string): value is Tag => TAGS.has(value);

// 単一トークンを正規化して既知タグかどうか判定する
export function parseTag(token: string): Option<Tag> {
  const normalized = token.trim().toUpperCase();
  return isTag(normalized) ? some(normalized) : none();
}

// タグ列文字列を State に厳格パースする。未知トークンがあれば失敗。
export function parseTags(raw: string): Result<State, ParseError> {
  // parseView と同じく、全体の前後空白を先に落として挙動を対称にする。
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "none") {
    return success(emptyState());
  }
  // スプレッドで可変コピーを作る（as アサーション不要）
  const state: Record<Tag, boolean> = { ...emptyState() };
  for (const token of trimmed.split("-")) {
    const parsed = parseTag(token);
    if (!parsed.some) {
      return fail(unknownTagError(token.trim()));
    }
    state[parsed.value] = true;
  }
  return success(state);
}

// view クエリを厳格パースする。null/human→human、ai→ai、その他は失敗。
export function parseView(raw: string | null): Result<View, ParseError> {
  const normalized = (raw ?? "human").trim().toLowerCase();
  if (normalized === "human") {
    return success("human");
  }
  if (normalized === "ai") {
    return success("ai");
  }
  return fail(invalidViewError(normalized));
}

// format クエリを厳格パースする。null/markdown→markdown、text→text、その他は失敗。
export function parseFormat(raw: string | null): Result<Format, ParseError> {
  const normalized = (raw ?? "markdown").trim().toLowerCase();
  if (normalized === "markdown") {
    return success("markdown");
  }
  if (normalized === "text") {
    return success("text");
  }
  return fail(invalidFormatError(normalized));
}

// 人間向け README を生成する（旧 humanMD と 1:1）
export function humanMD(state: State): string {
  const id = ident(state);
  const L: string[] = [];
  L.push("# 撮影データの取り扱いについて", "");
  L.push(`適用: ${id} ／ 最終更新: [YYYY-MM-DD]`, "");
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
    L.push("  - 例） Photo. [撮影者名] / Model. [モデル名]", "");
  }
  L.push("## 権利関係について");
  L.push("- 写真の著作権は撮影者（[撮影者名]）に帰属します");
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
  L.push("## 連絡先", "- [連絡先をここに記入]", "");
  L.push("----", `適用: ${id} ／ 文責: [撮影者名]`);
  return L.join("\n");
}

// 同梱用のプレーンテキスト版 README。文面は humanMD と同一で、非技術者に紛らわしい
// Markdown 見出し記号（# / ##）だけを外す。リンク等の特殊記法は使っていないため変換は最小で済む。
export function humanText(state: State): string {
  return humanMD(state)
    .split("\n")
    .map((line) => line.replace(/^#{1,6}\s+/, ""))
    .join("\n");
}

// AI 向け宣言を生成する（旧 aiMD と 1:1）
export function aiMD(state: State): string {
  const id = ident(state);
  const L: string[] = [];
  L.push("# CosPL License Declaration", "");
  L.push(`identifier: ${id}`);
  L.push("work_type: cosplay portrait photograph");
  L.push("terms_url: https://cospl.org/", "");
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
