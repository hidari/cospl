import { describe, expect, test } from "vitest";
import { ident, parseTag, parseTags, tagsFrom } from "../../src/license/tags";
import { unwrapState } from "./helpers";

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

  test("未知タグが1つでもあれば unknown_tag で失敗する", () => {
    const result = parseTags("BY-ZZZ");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.kind).toBe("unknown_tag");
      expect(result.error.input).toBe("ZZZ");
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
    expect(ident(unwrapState("BY-NC-NAI-TD"))).toBe("CosPL 1.0 / BY-NC-NAI-TD");
    expect(ident(unwrapState("none"))).toBe("CosPL 1.0");
  });
});
