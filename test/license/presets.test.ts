import { describe, expect, test } from "vitest";
import { EXTENSION_PRESETS } from "../../src/license/presets";

describe("EXTENSION_PRESETS", () => {
  test("id は editing / photographer-use の 2 件", () => {
    expect(EXTENSION_PRESETS.map((p) => p.id)).toEqual(["editing", "photographer-use"]);
  });

  test("「加工」の本文は渡したデータのみの使用を求める", () => {
    expect(EXTENSION_PRESETS.find((p) => p.id === "editing")?.body).toBe(
      "原則として、お渡ししたデータのみご使用ください",
    );
  });

  test("どの文面にも実在の名前・URL・受け取りコードを含めない", () => {
    for (const preset of EXTENSION_PRESETS) {
      expect(preset.heading).not.toBe("");
      expect(preset.body).not.toBe("");
      expect(preset.body).not.toContain("http");
      expect(preset.body).not.toContain("@");
    }
  });
});
