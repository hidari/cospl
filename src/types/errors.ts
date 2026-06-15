/**
 * CosPL のパースエラー型
 *
 * タグ文字列・view クエリの検証失敗を型安全に表現する。
 * relay-desktop の errors.ts と同じく、const リストから kind の union と
 * ランタイム検証用 Set を一元的に起こす。
 */

// エラーの種別一覧（ランタイム検証とコンパイル時型の両方を一元管理）
const PARSE_ERROR_KIND_LIST = ["unknown_tag", "invalid_view"] as const;

export type ParseErrorKind = (typeof PARSE_ERROR_KIND_LIST)[number];
export const PARSE_ERROR_KINDS: ReadonlySet<string> = new Set<ParseErrorKind>(
  PARSE_ERROR_KIND_LIST,
);

// パース失敗の統一エラー型。input は問題となった生の入力値を保持する。
export type ParseError = {
  kind: ParseErrorKind;
  message: string;
  input: string;
};

// エラー構築ヘルパー
export const unknownTagError = (input: string): ParseError => ({
  kind: "unknown_tag",
  message: `Unknown tag: "${input}". Allowed tags are BY, NC, NAI, TD, MR.`,
  input,
});

export const invalidViewError = (input: string): ParseError => ({
  kind: "invalid_view",
  message: `Invalid view: "${input}". Allowed views are human, ai.`,
  input,
});
