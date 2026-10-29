import { describe, expect, test } from "vitest";
import { ident, ORDER, parseTag, parseTags, tagsFrom } from "../../src/license/tags.ts";
import { unwrapState } from "./helpers.ts";

describe("parseTag", () => {
  test("既知タグは Some を返す", () => {
    expect(parseTag("BY")).toEqual({ some: true, value: "BY" });
    expect(parseTag("MR")).toEqual({ some: true, value: "MR" });
  });

  test("小文字や前後空白も正規化して受け付ける", () => {
    expect(parseTag(" by ")).toEqual({ some: true, value: "BY" });
  });

  test("未知トークンは None を返す", () => {
    expect(parseTag("ZZZ")).toEqual({ some: false });
  });
});

describe("parseTags", () => {
  test("有効なタグ列は成功して State を返す", () => {
    const result = parseTags("BY-NC");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(tagsFrom(result.data)).toEqual(["BY", "NC"]);
    }
  });

  test('"none" と空文字は全 false の成功', () => {
    expect(tagsFrom(unwrapState("none"))).toEqual([]);
    expect(tagsFrom(unwrapState(""))).toEqual([]);
  });

  test("ORDER 順に正規化される（入力順に依らない）", () => {
    expect(tagsFrom(unwrapState("TD-BY-NC"))).toEqual(["BY", "NC", "TD"]);
  });

  test("タグは集合で、入力順に依らず定義順（BY NC ND NAI TD SB MR）に並ぶ", () => {
    expect(tagsFrom(unwrapState("MR-SB-ND-BY"))).toEqual(["BY", "ND", "SB", "MR"]);
  });

  test("未知タグが1つでもあれば unknown_tag で失敗する", () => {
    const result = parseTags("BY-ZZZ");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.kind).toBe("unknown_tag");
      expect(result.error.input).toBe("ZZZ");
      expect(result.error.message).toContain(ORDER.join(", "));
    }
  });

  test("全体の前後空白は許容する（parseView と対称）", () => {
    expect(tagsFrom(unwrapState("  BY-NC  "))).toEqual(["BY", "NC"]);
  });

  test("末尾ハイフンなどの空トークンは unknown_tag で失敗する", () => {
    const result = parseTags("BY-");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.kind).toBe("unknown_tag");
    }
  });
});

describe("ident", () => {
  test("タグありはハイフン連結、タグなしはバージョンのみ", () => {
    expect(ident(unwrapState("BY-NC-NAI-TD"))).toBe("CosPL 2.0 / BY-NC-NAI-TD");
    expect(ident(unwrapState("none"))).toBe("CosPL 2.0");
  });

  test("全タグ ON は定義順 BY-NC-ND-NAI-TD-SB-MR になる", () => {
    expect(ident(unwrapState("MR-SB-TD-NAI-ND-NC-BY"))).toBe("CosPL 2.0 / BY-NC-ND-NAI-TD-SB-MR");
  });
});
