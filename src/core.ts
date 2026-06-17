// CosPL core — タグロジックと Markdown 生成の単一ソース。
// DOM に依存しない純粋関数群。Worker（src/worker.ts）と Client（src/client/main.ts）が共有する。
// 生成文書の文字列は golden（test/__fixtures__/golden.json）と byte 一致を保つ。文面変更時は pnpm regen:golden で更新する。

import {
  invalidFormatError,
  invalidViewError,
  type ParseError,
  unknownTagError,
} from "./types/errors";
import { none, type Option, some } from "./types/option";
import { fail, getOrElse, type Result, success } from "./types/result";

// タグの定義順（単一ソース）。union 型と検証用 Set をここから起こす。
export const ORDER = ["BY", "NC", "NAI", "TD", "MR"] as const;
export type Tag = (typeof ORDER)[number];
const TAGS: ReadonlySet<string> = new Set<Tag>(ORDER);

export type State = Readonly<Record<Tag, boolean>>;
export type View = "human" | "ai";
export type Format = "markdown" | "text";

// 既定のタグ選択（tags 省略時・hash 不正時のフォールバック・OpenAPI 既定値の単一ソース）。
export const DEFAULT_TAGS = "BY-NC-NAI-TD";

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

// 撮影者名・日付・連絡先のフィールド。未入力時は現行プレースホルダ文字列を既定にする。
export type Fields = Readonly<{ date: string; photographer: string; contact: string }>;

// 未入力時に文書へ残すプレースホルダ（現行テンプレートのリテラルと一致させる単一ソース）。
export const DEFAULT_FIELDS: Fields = {
  date: "[YYYY-MM-DD]",
  photographer: "[撮影者名]",
  contact: "[連絡先をここに記入]",
};

// 全フィールド空の初期値（入力欄クリアと hash 復元の単一ソース）。空のまま serializeHash すると
// date / photographer / contact は URL に出力されず、PII を残さない。
export const EMPTY_FIELDS: Fields = { date: "", photographer: "", contact: "" };

// サイト共有 -----------------------------------------------------------------

// サイトのトップ URL（設定を含まない素の共有先）。og:url とも一致させる。
export const SITE_URL = "https://cospl.org/";

// SNS 等へそのまま貼り付ける共有メッセージ（タイトル / タグライン / URL の3行）。
// ヒーロー・OGP の文言と整合させ、文面変更は単体テストで検知する。
export function siteShareMessage(): string {
  return `CosPL — Cosplay Public License\n撮った写真の ”使っていい範囲” を言葉にする\n${SITE_URL}`;
}

// 除去対象コードポイントの判定。C0/C1 制御文字（改行・タブ含む）と双方向テキスト制御文字
// （Trojan Source 型の視覚的文言偽装に使われる）を弾く。正規表現を避けてコードポイントで判定し、
// Biome の noControlCharactersInRegex を踏まず、かつサロゲートペアを安全に扱う。
function isStrippableCodePoint(cp: number): boolean {
  return (
    cp <= 0x1f || // C0 制御文字
    (cp >= 0x7f && cp <= 0x9f) || // DEL + C1 制御文字
    (cp >= 0x202a && cp <= 0x202e) || // 双方向埋め込み / 上書き
    (cp >= 0x2066 && cp <= 0x2069) // 双方向分離
  );
}

// フリーテキストを徹底サニタイズする。制御 / 双方向文字と山括弧を除去し、trim 後に
// コードポイント単位で長さを切る（UTF-16 単位で切るとサロゲートペアを割って壊すため）。
function cleanText(raw: string, maxCodePoints: number): string {
  const kept: string[] = [];
  for (const ch of raw) {
    const cp = ch.codePointAt(0) ?? 0;
    if (!isStrippableCodePoint(cp) && ch !== "<" && ch !== ">") {
      kept.push(ch);
    }
  }
  const trimmed = kept.join("").trim();
  // UTF-16 長はコードポイント数以上なので、上限以下なら必ず切り詰め不要。
  // 共通ケースでコードポイント配列への展開を省く。
  if (trimmed.length <= maxCodePoints) {
    return trimmed;
  }
  return [...trimmed].slice(0, maxCodePoints).join("");
}

// YYYY-MM-DD 形式かつ実在する暦日かを判定する。正規表現一致だけでは 2026-13-40 等を通すため、
// 月末日数（閏年含む）まで検証する。
function isValidDate(raw: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  // year < 1000 を弾く。0000-0099 は new Date(year, ...) が 1900 年代に解釈され閏判定が狂う
  // JS の既知挙動を避けつつ、撮影日として無意味な極端な年を排除する。
  if (year < 1000 || month < 1 || month > 12) {
    return false;
  }
  // new Date(year, month, 0) は「month の前月の最終日」= 当月（1-based month）の日数。
  const daysInMonth = new Date(year, month, 0).getDate();
  return day >= 1 && day <= daysInMonth;
}

// 生入力をクリーニングのみ行う（空・不正は空文字のまま）。hash 直列化と入力欄復元に使う。
export function cleanFields(input: Fields): Fields {
  const date = input.date.trim();
  return {
    date: isValidDate(date) ? date : "",
    photographer: cleanText(input.photographer, 50),
    contact: cleanText(input.contact, 100),
  };
}

// クリーニング後、空フィールドを既定プレースホルダへ畳んだ文書生成用 Fields。
export function sanitizeFields(input: Fields): Fields {
  const cleaned = cleanFields(input);
  return {
    date: cleaned.date || DEFAULT_FIELDS.date,
    photographer: cleaned.photographer || DEFAULT_FIELDS.photographer,
    contact: cleaned.contact || DEFAULT_FIELDS.contact,
  };
}

// DEFAULT_TAGS は必ずパースに成功するが、型上 Result なので安全に State へ畳むヘルパー。
function defaultTagState(): State {
  return getOrElse(parseTags(DEFAULT_TAGS), emptyState());
}

// hash 文字列（先頭 # は任意）からタグ状態とフィールドを復元する。
// "=" を含まない hash は従来の裸タグ列とみなして後方互換に扱う。フィールドは外部入力として
// cleanFields でサニタイズする（空・不正は空文字のまま）。
export function parseHash(hash: string): { tags: State; fields: Fields } {
  const raw = hash.replace(/^#/, "");
  if (!raw) {
    return { tags: defaultTagState(), fields: EMPTY_FIELDS };
  }
  if (!raw.includes("=")) {
    return { tags: getOrElse(parseTags(raw), defaultTagState()), fields: EMPTY_FIELDS };
  }
  const params = new URLSearchParams(raw);
  const tags = getOrElse(parseTags(params.get("tags") ?? DEFAULT_TAGS), defaultTagState());
  const fields = cleanFields({
    date: params.get("date") ?? "",
    photographer: params.get("photographer") ?? "",
    contact: params.get("contact") ?? "",
  });
  return { tags, fields };
}

// タグ状態とフィールドを hash 文字列（先頭 # 付き）へ直列化する。フィールドは再サニタイズし、
// 既定（空）の値は URL を汚さないよう出力しない。タグが空なら "none"。
export function serializeHash(state: State, fields: Fields): string {
  const tags = tagsFrom(state);
  const cleaned = cleanFields(fields);
  const params = new URLSearchParams();
  params.set("tags", tags.length ? tags.join("-") : "none");
  if (cleaned.date) {
    params.set("date", cleaned.date);
  }
  if (cleaned.photographer) {
    params.set("photographer", cleaned.photographer);
  }
  if (cleaned.contact) {
    params.set("contact", cleaned.contact);
  }
  return `#${params.toString()}`;
}

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
