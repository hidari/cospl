import { describe, expect, test } from "vitest";
// workerd では node:fs が使えないため Vite の ?raw で本文を文字列として埋め込む。
import indexHtml from "../../index.html?raw";
import llmsTxt from "../../public/llms.txt?raw";
import { ORDER } from "../../src/license/tags";
import { VERSION } from "../../src/license/version";

describe("手書きの面が VERSION と ORDER から drift しない", () => {
  test("index.html と llms.txt の識別子の例は現行の版を指す", () => {
    expect(indexHtml).toContain(`CosPL ${VERSION}`);
    expect(llmsTxt).toContain(`CosPL ${VERSION}`);
  });

  test.each(ORDER)("タグ %s のチップが index.html に、一覧の行が llms.txt にある", (tag) => {
    expect(indexHtml).toContain(`data-tag="${tag}"`);
    expect(llmsTxt).toMatch(new RegExp(`^- ${tag}:`, "m"));
  });

  test("index.html に ORDER 外の data-tag は無い", () => {
    const used = [...indexHtml.matchAll(/data-tag="([^"]+)"/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(0);
    for (const tag of used) {
      expect(ORDER as readonly string[]).toContain(tag);
    }
  });
});
