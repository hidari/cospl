// view / format クエリの厳格パース。

import { invalidFormatError, invalidViewError, type ParseError } from "../types/errors";
import { fail, type Result, success } from "../types/result";

export type View = "human" | "ai";
export type Format = "markdown" | "text";

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
