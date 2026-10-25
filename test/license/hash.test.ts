import { describe, expect, test } from "vitest";
import { parseHash, serializeHash } from "../../src/license/hash";
import { EMPTY_FIELDS, type Fields } from "../../src/license/sanitize";
import { emptyState, tagsFrom } from "../../src/license/tags";
import { unwrapState } from "./helpers";

describe("parseHash / serializeHash", () => {
  test("裸タグ hash は後方互換で読める（フィールドは空）", () => {
    const { tags, fields } = parseHash("#BY-NC");
    expect(tagsFrom(tags)).toEqual(["BY", "NC"]);
    expect(fields).toEqual({ date: "", photographer: "", contact: "" });
  });

  test("空 hash は既定タグ・空フィールド", () => {
    const { tags, fields } = parseHash("");
    expect(tagsFrom(tags)).toEqual(["BY", "NC", "NAI", "TD"]);
    expect(fields).toEqual({ date: "", photographer: "", contact: "" });
  });

  test("URLSearchParams 形式からタグとフィールドを復元する", () => {
    const { tags, fields } = parseHash(
      "#tags=BY&date=2026-06-17&photographer=Hidari&contact=mail@example.com",
    );
    expect(tagsFrom(tags)).toEqual(["BY"]);
    expect(fields).toEqual({
      date: "2026-06-17",
      photographer: "Hidari",
      contact: "mail@example.com",
    });
  });

  test("不正タグは既定タグにフォールバックする", () => {
    expect(tagsFrom(parseHash("#tags=ZZZ").tags)).toEqual(["BY", "NC", "NAI", "TD"]);
  });

  test("parseHash は値もサニタイズする（hash も外部入力）", () => {
    expect(parseHash("#tags=BY&photographer=a\u202Eb<x>").fields.photographer).toBe("abx");
  });

  test("serializeHash は既定 / 空フィールドを出力しない", () => {
    const tags = unwrapState("BY-NC-NAI-TD");
    expect(serializeHash(tags, { date: "", photographer: "", contact: "" })).toBe(
      "#tags=BY-NC-NAI-TD",
    );
  });

  test("serializeHash はタグなしを none で表す", () => {
    expect(serializeHash(unwrapState("none"), { date: "", photographer: "", contact: "" })).toBe(
      "#tags=none",
    );
  });

  test("serialize → parse はラウンドトリップする（日本語含む）", () => {
    const tags = unwrapState("BY-TD");
    const fields: Fields = { date: "2026-06-17", photographer: "ひだり", contact: "x@example.com" };
    const round = parseHash(serializeHash(tags, fields));
    expect(tagsFrom(round.tags)).toEqual(["BY", "TD"]);
    expect(round.fields).toEqual(fields);
  });
});

describe("EMPTY_FIELDS", () => {
  test("全フィールドが空文字", () => {
    expect(EMPTY_FIELDS).toEqual({ date: "", photographer: "", contact: "" });
  });

  test("空フィールドは serializeHash で tags=none のみになり PII を残さない", () => {
    expect(serializeHash(emptyState(), EMPTY_FIELDS)).toBe("#tags=none");
  });
});
