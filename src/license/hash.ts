// URL hash とタグ・フィールド状態の相互変換。

import { getOrElse } from "../types/result";
import { cleanFields, EMPTY_FIELDS, type Fields } from "./sanitize";
import { DEFAULT_TAGS, defaultTagState, parseTags, type State, tagsFrom } from "./tags";

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
