import { describe, expect, test } from "vitest";
import { parseFormat, parseView } from "../../src/license/query.ts";

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
