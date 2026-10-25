import { describe, expect, test } from "vitest";
import { CREDITS, DEFAULT_OPTIONS, parseCredit } from "../../src/license/options";

describe("parseCredit", () => {
  test("省略（null）は既定の sns", () => {
    expect(parseCredit(null)).toEqual({ success: true, data: "sns" });
  });

  test("大文字小文字と前後空白を許容する", () => {
    expect(parseCredit(" ANY ")).toEqual({ success: true, data: "any" });
  });

  test("未知の値は invalid_credit で失敗する", () => {
    const result = parseCredit("x");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.kind).toBe("invalid_credit");
      expect(result.error.message).toBe('Invalid credit: "x". Allowed credits are sns, any.');
    }
  });

  test("CREDITS は許容値の一覧で、既定はその先頭", () => {
    expect(CREDITS).toEqual(["sns", "any"]);
    expect(DEFAULT_OPTIONS.credit).toBe(CREDITS[0]);
  });

  test("既定は sns", () => {
    expect(DEFAULT_OPTIONS).toEqual({ credit: "sns" });
  });
});
