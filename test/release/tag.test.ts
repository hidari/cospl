import { describe, expect, test } from "vitest";
import { parseReleaseTag } from "../../src/release/tag";

// リリースはタグ駆動。条文は cospl-v<VERSION>（CC と同じ 2 段の版）、サイトは
// site-vYYYY.MM.DD（同日の 2 回目以降は .1, .2 ...）の CalVer。
describe("parseReleaseTag", () => {
  test("条文のタグは現行の VERSION と一致するときだけ受け付ける", () => {
    expect(parseReleaseTag("cospl-v2.0", "2.0")).toEqual({
      success: true,
      data: { kind: "license", version: "2.0" },
    });
    expect(parseReleaseTag("cospl-v2.1", "2.0").success).toBe(false);
  });

  test("サイトのタグは実在する日付の CalVer を受け付ける", () => {
    expect(parseReleaseTag("site-v2026.10.26", "2.0")).toEqual({
      success: true,
      data: { kind: "site", version: "2026.10.26" },
    });
    expect(parseReleaseTag("site-v2026.10.26.1", "2.0")).toEqual({
      success: true,
      data: { kind: "site", version: "2026.10.26.1" },
    });
    expect(parseReleaseTag("site-v2028.02.29", "2.0").success).toBe(true);
  });

  test.each([
    ["site-v2026.02.30", "存在しない日"],
    ["site-v2027.02.29", "閏年でない年の 2/29"],
    ["site-v2026.13.01", "存在しない月"],
    ["site-v2026.1.5", "ゼロ埋めしない月日"],
    ["site-v2026.10.26.0", "連番 0"],
    ["site-v2026.10.26.01", "ゼロ始まりの連番"],
    ["site-v2026.10.26-rc", "接尾辞つき"],
    ["cospl-v2", "1 段の版"],
    ["cospl-v2.0.0", "3 段の版"],
    ["v2.0", "接頭辞なし"],
    ["", "空"],
  ])("%s（%s）は拒否する", (tag) => {
    expect(parseReleaseTag(tag, "2.0").success).toBe(false);
  });
});
