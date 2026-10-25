import { describe, expect, test } from "vitest";
import { EXTENSION_PRESETS } from "../../src/license/presets";

describe("EXTENSION_PRESETS", () => {
  test("id は contents / editing / photographer-use の 3 件", () => {
    expect(EXTENSION_PRESETS.map((p) => p.id)).toEqual(["contents", "editing", "photographer-use"]);
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
