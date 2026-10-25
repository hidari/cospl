// タグ以外の文面オプション。いまはクレジット依頼の方法（BY の選択肢）だけ。

import { invalidCreditError, type ParseError } from "../types/errors";
import { fail, type Result, success } from "../types/result";

export type CreditMethod = "sns" | "any";
export type Options = Readonly<{ credit: CreditMethod }>;

export const DEFAULT_OPTIONS: Options = { credit: "sns" };

// credit クエリを厳格パースする。null→sns、sns / any（大文字小文字・前後空白は許容）、その他は失敗。
export function parseCredit(raw: string | null): Result<CreditMethod, ParseError> {
  const normalized = (raw ?? DEFAULT_OPTIONS.credit).trim().toLowerCase();
  if (normalized === "sns" || normalized === "any") {
    return success(normalized);
  }
  return fail(invalidCreditError(normalized));
}
