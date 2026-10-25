import { describe, expect, test } from "vitest";
import { parseHash, serializeHash } from "../../src/license/hash";
import { EMPTY_FIELDS } from "../../src/license/sanitize";
import { tagsFrom } from "../../src/license/tags";
import { unwrapState } from "./helpers";

describe("parseHash / serializeHash", () => {
  test("裸タグ hash は後方互換で読める", () => {
    expect(tagsFrom(parseHash("#BY-NC").tags)).toEqual(["BY", "NC"]);
  });

  test("空 hash は既定タグ", () => {
    expect(tagsFrom(parseHash("").tags)).toEqual(["BY", "NC", "NAI", "TD"]);
  });

  test("個人情報入りの旧 hash はタグだけ読み、フィールドは戻り値に持たない", () => {
    const parsed = parseHash("#tags=BY-NC&photographer=A&contact=B&date=2026-01-01");
    expect(tagsFrom(parsed.tags)).toEqual(["BY", "NC"]);
    expect(Object.keys(parsed)).toEqual(["tags"]);
  });

  test("不正タグは既定タグにフォールバックする", () => {
    expect(tagsFrom(parseHash("#tags=ZZZ").tags)).toEqual(["BY", "NC", "NAI", "TD"]);
  });

  test("serializeHash はタグだけを出力する", () => {
    expect(serializeHash(unwrapState("BY-NC"))).toBe("#tags=BY-NC");
  });

  test("serializeHash はタグなしを none で表す", () => {
    expect(serializeHash(unwrapState("none"))).toBe("#tags=none");
  });

  test("serialize → parse はタグをラウンドトリップする", () => {
    const round = parseHash(serializeHash(unwrapState("BY-TD")));
    expect(tagsFrom(round.tags)).toEqual(["BY", "TD"]);
  });
});

describe("EMPTY_FIELDS", () => {
  test("全フィールドが空文字", () => {
    expect(EMPTY_FIELDS).toEqual({ date: "", photographer: "", contact: "" });
  });
});
