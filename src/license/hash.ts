// URL hash とタグ状態の相互変換。hash は共有してよいタグだけを運び、個人情報（フィールド）は載せない。

import { getOrElse } from "../types/result";
import { DEFAULT_TAGS, defaultTagState, parseTags, type State, tagsFrom } from "./tags";

// hash 文字列（先頭 # は任意）からタグ状態を復元する。
// "=" を含まない hash は従来の裸タグ列とみなして後方互換に扱う。旧 URL に残る
// date / photographer / contact は読まずに捨てる。
export function parseHash(hash: string): { tags: State } {
  const raw = hash.replace(/^#/, "");
  if (!raw) {
    return { tags: defaultTagState() };
  }
  if (!raw.includes("=")) {
    return { tags: getOrElse(parseTags(raw), defaultTagState()) };
  }
  const params = new URLSearchParams(raw);
  return { tags: getOrElse(parseTags(params.get("tags") ?? DEFAULT_TAGS), defaultTagState()) };
}

// タグ状態を hash 文字列（先頭 # 付き）へ直列化する。タグが空なら "none"。
export function serializeHash(state: State): string {
  const tags = tagsFrom(state);
  return `#tags=${tags.length ? tags.join("-") : "none"}`;
}
