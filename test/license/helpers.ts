import type { State } from "../../src/license/tags";
import { parseTags } from "../../src/license/tags";

// テスト内で Result を剥がすヘルパー（失敗時は明示的に失敗させる）
export const unwrapState = (raw: string): State => {
  const result = parseTags(raw);
  if (!result.success) {
    throw new Error(`expected success for "${raw}" but got ${result.error.kind}`);
  }
  return result.data;
};
