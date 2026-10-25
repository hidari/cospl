// タグの定義と厳格パース。DOM にも他の license モジュールにも依存しない（version のみ）。

import { type ParseError, unknownTagError } from "../types/errors";
import { none, type Option, some } from "../types/option";
import { fail, getOrElse, type Result, success } from "../types/result";
import { VERSION } from "./version";

// タグの定義順（単一ソース）。union 型と検証用 Set をここから起こす。
export const ORDER = ["BY", "NC", "ND", "NAI", "TD", "SB", "MR"] as const;
export type Tag = (typeof ORDER)[number];
const TAGS: ReadonlySet<string> = new Set<Tag>(ORDER);

export type State = Readonly<Record<Tag, boolean>>;

// 既定のタグ選択（tags 省略時・hash 不正時のフォールバック・OpenAPI 既定値の単一ソース）。
export const DEFAULT_TAGS = "BY-NC-NAI-TD";

// 全タグ false の初期状態を作る純粋関数。リテラルで全 Tag を網羅し、
// ORDER に Tag を追加すると型エラーで気付ける（as アサーション不要）。
export const emptyState = (): State => ({
  BY: false,
  NC: false,
  ND: false,
  NAI: false,
  TD: false,
  SB: false,
  MR: false,
});

// ON のタグを定義順に取り出す
export function tagsFrom(state: State): Tag[] {
  return ORDER.filter((tag) => state[tag]);
}

// 識別子の構成要素。プレーンテキスト版（ident）と HTML 版（client の identHTML）が共有する。
export function identParts(state: State): { version: string; tags: string[] } {
  return { version: VERSION, tags: tagsFrom(state) };
}

// 識別子文字列。タグなしはバージョンのみ。
export function ident(state: State): string {
  const { version, tags } = identParts(state);
  return `CosPL ${version}${tags.length ? ` / ${tags.join("-")}` : ""}`;
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

// DEFAULT_TAGS は必ずパースに成功するが、型上 Result なので安全に State へ畳むヘルパー。
export function defaultTagState(): State {
  return getOrElse(parseTags(DEFAULT_TAGS), emptyState());
}
