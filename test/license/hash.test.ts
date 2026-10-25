import { describe, expect, test } from "vitest";
import { parseHash, serializeHash } from "../../src/license/hash";
import { DEFAULT_OPTIONS } from "../../src/license/options";
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
    expect(Object.keys(parsed)).toEqual(["tags", "options"]);
  });

  test("不正タグは既定タグにフォールバックする", () => {
    expect(tagsFrom(parseHash("#tags=ZZZ").tags)).toEqual(["BY", "NC", "NAI", "TD"]);
  });

  test("serializeHash は既定のオプションを出力しない", () => {
    expect(serializeHash(unwrapState("BY-NC"), DEFAULT_OPTIONS)).toBe("#tags=BY-NC");
  });

  test("serializeHash はタグなしを none で表す", () => {
    expect(serializeHash(unwrapState("none"), DEFAULT_OPTIONS)).toBe("#tags=none");
  });

  test("serialize → parse はタグをラウンドトリップする", () => {
    const round = parseHash(serializeHash(unwrapState("BY-TD"), DEFAULT_OPTIONS));
    expect(tagsFrom(round.tags)).toEqual(["BY", "TD"]);
  });
});

describe("credit オプションの hash", () => {
  test("BY が ON で既定以外のときだけ credit を付ける", () => {
    expect(serializeHash(unwrapState("BY"), { credit: "any" })).toBe("#tags=BY&credit=any");
    expect(serializeHash(unwrapState("BY"), DEFAULT_OPTIONS)).toBe("#tags=BY");
  });

  test("BY が OFF なら credit を付けない", () => {
    expect(serializeHash(unwrapState("NC"), { credit: "any" })).toBe("#tags=NC");
  });

  test("credit=any をラウンドトリップする", () => {
    const hash = serializeHash(unwrapState("BY-NC"), { credit: "any" });
    expect(parseHash(hash).options).toEqual({ credit: "any" });
  });

  test("不正な credit は既定へフォールバックする", () => {
    expect(parseHash("#tags=BY&credit=zzz").options).toEqual(DEFAULT_OPTIONS);
  });

  test("credit の無い hash は既定", () => {
    expect(parseHash("#tags=BY").options).toEqual(DEFAULT_OPTIONS);
    expect(parseHash("#BY-NC").options).toEqual(DEFAULT_OPTIONS);
    expect(parseHash("").options).toEqual(DEFAULT_OPTIONS);
  });
});
