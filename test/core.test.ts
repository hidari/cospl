import { describe, expect, test } from "vitest";
import {
  aiMD,
  cleanFields,
  DEFAULT_FIELDS,
  EMPTY_FIELDS,
  emptyState,
  type Fields,
  humanMD,
  humanText,
  ident,
  parseFormat,
  parseHash,
  parseTag,
  parseTags,
  parseView,
  SITE_URL,
  type State,
  sanitizeFields,
  serializeHash,
  siteShareMessage,
  tagsFrom,
} from "../src/core";
import golden from "./__fixtures__/golden.json";

// golden.json は現在の core 出力を固定した回帰用フィクスチャ。`pnpm regen:golden` で更新する。
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

describe("parseFormat", () => {
  test("null と markdown は markdown", () => {
    expect(parseFormat(null)).toEqual({ success: true, data: "markdown" });
    expect(parseFormat("markdown")).toEqual({ success: true, data: "markdown" });
  });

  test("text は text（大文字小文字を問わない）", () => {
    expect(parseFormat("text")).toEqual({ success: true, data: "text" });
    expect(parseFormat("TEXT")).toEqual({ success: true, data: "text" });
  });

  test("未知の format は invalid_format で失敗する", () => {
    const result = parseFormat("pdf");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.kind).toBe("invalid_format");
      expect(result.error.input).toBe("pdf");
    }
  });
});

describe("humanText", () => {
  test("文面は humanMD と同一で、見出し記号(# / ##)だけを外す", () => {
    const state = unwrapState("BY-NC-NAI-TD");
    const text = humanText(state);
    expect(text).not.toMatch(/^#/m);
    expect(text).toBe(humanMD(state).replace(/^#{1,6}\s+/gm, ""));
  });

  test("箇条書きや区切り線はそのまま残す", () => {
    const text = humanText(unwrapState("none"));
    expect(text).toContain("- 現像済みJPEGデータ");
    expect(text).toContain("----");
  });
});

describe("ident", () => {
  test("タグありはハイフン連結、タグなしはバージョンのみ", () => {
    expect(ident(unwrapState("BY-NC-NAI-TD"))).toBe("CosPL 1.0 / BY-NC-NAI-TD");
    expect(ident(unwrapState("none"))).toBe("CosPL 1.0");
  });
});

describe("cleanFields / sanitizeFields", () => {
  const empty: Fields = { date: "", photographer: "", contact: "" };

  test("空入力は sanitizeFields で既定プレースホルダに畳まれる", () => {
    expect(sanitizeFields(empty)).toEqual(DEFAULT_FIELDS);
  });

  test("空入力は cleanFields では空のまま（プレースホルダにしない）", () => {
    expect(cleanFields(empty)).toEqual(empty);
  });

  test("改行・C0 制御文字を除去する", () => {
    expect(cleanFields({ ...empty, photographer: "Hi\n\tdari" }).photographer).toBe("Hidari");
  });

  test("双方向テキスト制御文字（Trojan Source）を除去する", () => {
    expect(cleanFields({ ...empty, photographer: "a\u202Eb\u2066c" }).photographer).toBe("abc");
  });

  test("山括弧を除去する（休眠 XSS の保険）", () => {
    expect(cleanFields({ ...empty, contact: "<script>x</script>" }).contact).toBe("scriptx/script");
  });

  test("撮影者名はコードポイント 50 で切る", () => {
    const long = "あ".repeat(60);
    expect([...cleanFields({ ...empty, photographer: long }).photographer].length).toBe(50);
  });

  test("連絡先はコードポイント 100 で切る", () => {
    const long = "x".repeat(120);
    expect(cleanFields({ ...empty, contact: long }).contact.length).toBe(100);
  });

  test("サロゲートペア（絵文字）を途中で割らない", () => {
    const emoji = "😀".repeat(60);
    const cut = cleanFields({ ...empty, photographer: emoji }).photographer;
    expect([...cut].length).toBe(50);
    expect(cut).toBe("😀".repeat(50));
  });

  test("形式不正・非実在日はフォールバック（cleanFields は空・sanitizeFields はプレースホルダ）", () => {
    for (const bad of [
      "2026-13-40",
      "2026-02-30",
      "2026/06/17",
      "20260617",
      "abc",
      "0000-01-01", // year < 1000 は弾く（JS Date の 0-99 解釈ずれ回避）
      "0099-02-29",
    ]) {
      expect(cleanFields({ ...empty, date: bad }).date).toBe("");
      expect(sanitizeFields({ ...empty, date: bad }).date).toBe(DEFAULT_FIELDS.date);
    }
  });

  test("実在する暦日は保持する（閏日含む）", () => {
    for (const ok of ["2026-06-17", "2026-02-28", "2024-02-29"]) {
      expect(cleanFields({ ...empty, date: ok }).date).toBe(ok);
      expect(sanitizeFields({ ...empty, date: ok }).date).toBe(ok);
    }
  });
});

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

describe("humanMD のフィールド反映", () => {
  const filled: Fields = {
    date: "2026-06-17",
    photographer: "Hidari",
    contact: "mail@example.com",
  };

  test("引数なしは従来どおりプレースホルダを残す（既定出力の不変）", () => {
    const md = humanMD(unwrapState("BY-NC-NAI-TD"));
    expect(md).toContain("最終更新: [YYYY-MM-DD]");
    expect(md).toContain("Photo. [撮影者名] / Model. [モデル名]");
    expect(md).toContain("著作権は撮影者（[撮影者名]）");
    expect(md).toContain("文責: [撮影者名]");
    expect(md).toContain("- [連絡先をここに記入]");
  });

  test("fields 指定で日付・撮影者名（3 箇所）・連絡先が置換される", () => {
    const md = humanMD(unwrapState("BY-NC-NAI-TD"), filled);
    expect(md).toContain("最終更新: 2026-06-17");
    expect(md).toContain("Photo. Hidari / Model. [モデル名]");
    expect(md).toContain("著作権は撮影者（Hidari）");
    expect(md).toContain("文責: Hidari");
    expect(md).toContain("- mail@example.com");
    expect(md).toContain("[モデル名]");
  });

  test("humanText でも置換され見出し記号だけ外れる", () => {
    const text = humanText(unwrapState("BY-NC-NAI-TD"), filled);
    expect(text).toContain("文責: Hidari");
    expect(text).not.toMatch(/^#/m);
  });

  test("aiMD はフィールド非対応で不変", () => {
    expect(aiMD(unwrapState("BY-NC-NAI-TD"))).not.toContain("Hidari");
  });
});

describe("サイト共有", () => {
  test("SITE_URL は cospl.org のルート", () => {
    expect(SITE_URL).toBe("https://cospl.org/");
  });

  test("siteShareMessage は SNS 貼り付け用の3行（タイトル・タグライン・URL）", () => {
    expect(siteShareMessage()).toBe(
      "CosPL — Cosplay Public License\n撮った写真の ”使っていい範囲” を言葉にする\nhttps://cospl.org/",
    );
  });

  test("siteShareMessage は SITE_URL で終わる", () => {
    expect(siteShareMessage().endsWith(SITE_URL)).toBe(true);
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

describe("生成文書は golden と byte 一致する（回帰）", () => {
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
