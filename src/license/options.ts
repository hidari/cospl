// タグ以外の文面オプション。いまはクレジット依頼の方法（BY の選択肢）だけ。

import { invalidCreditError, type ParseError } from "../types/errors.ts";
import { fail, type Result, success } from "../types/result.ts";

export const CREDITS = ["sns", "any"] as const;
export type CreditMethod = (typeof CREDITS)[number];
export type Options = Readonly<{ credit: CreditMethod }>;

export const DEFAULT_OPTIONS: Options = { credit: "sns" };

// credit クエリを厳格パースする。null→sns、sns / any（大文字小文字・前後空白は許容）、その他は失敗。
export function parseCredit(raw: string | null): Result<CreditMethod, ParseError> {
  const normalized = (raw ?? DEFAULT_OPTIONS.credit).trim().toLowerCase();
  const found = CREDITS.find((credit) => credit === normalized);
  return found === undefined ? fail(invalidCreditError(normalized, CREDITS)) : success(found);
}

// 効くときだけ URL に載せる credit の値。BY が OFF、または既定のときは null（効かないオプションを URL に残さない）。
export function creditParam(byOn: boolean, options: Options): CreditMethod | null {
  return byOn && options.credit !== DEFAULT_OPTIONS.credit ? options.credit : null;
}
