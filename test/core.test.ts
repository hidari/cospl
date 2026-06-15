import { describe, expect, test } from "vitest";
import {
  aiMD,
  humanMD,
  ident,
  parseTag,
  parseTags,
  parseView,
  type State,
  tagsFrom,
} from "../src/core";
import golden from "./__fixtures__/golden.json";

// golden.json は旧 docs/cospl.mjs の出力を捕捉したもの。生成 Markdown の byte 一致を保証する。
type GoldenCase = {
  tags: string[];
  ident: string;
  human: string;
  ai: string;
};
const goldenCases = golden as Record<string, GoldenCase>;

// テスト内で Result を剥がすヘルパー（失敗時は明示的に失敗させる）
const unwrapState = (raw: string): State => {
  const result = parseTags(raw);
  if (!result.success) {
    throw new Error(`expected success for "${raw}" but got ${result.error.kind}`);
  }
  return result.data;
};

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

describe("MR の免責文", () => {
  const mrSentence =
    "なお、モデルご本人がクレジット付きで自身の有償頒布物（ROM・写真集等）に使用することは許可します。";

  // 禁止事項節は第三者提供の禁止を常に含むため常に描画される。よって MR が ON なら NC/NAI の有無に依らず免責文が出る。
  test("MR が ON なら NC/NAI の有無に依らず免責文が現れる", () => {
    expect(humanMD(unwrapState("MR"))).toContain(mrSentence);
    expect(humanMD(unwrapState("NC-MR"))).toContain(mrSentence);
  });

  test("MR が OFF なら免責文は現れない", () => {
    expect(humanMD(unwrapState("NC"))).not.toContain(mrSentence);
  });
});

describe("parseView", () => {
  test("null と human は human", () => {
    expect(parseView(null)).toEqual({ success: true, data: "human" });
    expect(parseView("human")).toEqual({ success: true, data: "human" });
  });

  test("ai は ai（大文字小文字を問わない）", () => {
    expect(parseView("ai")).toEqual({ success: true, data: "ai" });
    expect(parseView("AI")).toEqual({ success: true, data: "ai" });
  });

  test("未知の view は invalid_view で失敗する", () => {
    const result = parseView("xml");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.kind).toBe("invalid_view");
      expect(result.error.input).toBe("xml");
    }
  });
});

describe("ident", () => {
  test("タグありはハイフン連結、タグなしはバージョンのみ", () => {
    expect(ident(unwrapState("BY-NC-NAI-TD"))).toBe("CosPL 1.0 / BY-NC-NAI-TD");
    expect(ident(unwrapState("none"))).toBe("CosPL 1.0");
  });
});

describe("生成 Markdown は旧実装と byte 一致する（golden）", () => {
  for (const [raw, expected] of Object.entries(goldenCases)) {
    test(`${raw}: tags / ident / humanMD / aiMD`, () => {
      const state = unwrapState(raw);
      expect(tagsFrom(state)).toEqual(expected.tags);
      expect(ident(state)).toBe(expected.ident);
      expect(humanMD(state)).toBe(expected.human);
      expect(aiMD(state)).toBe(expected.ai);
    });
  }
});
