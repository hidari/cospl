import { describe, expect, test } from "vitest";
// workerd では node:fs が使えないため Vite の ?raw で本文を文字列として埋め込む。
import generatedRaw from "../../brand/generated.json?raw";
import { BRAND_MASTERS, inspectMaster, sha256Hex } from "../../src/brand/masters";

// brand/ の SVG を全部読む。BRAND_MASTERS に登録し忘れたマスターもキーに現れる。
const masters = import.meta.glob("../../brand/*.svg", {
  query: "?raw",
  import: "default",
  eager: true,
});
// copyTo は public/ のどこを指してもよいので、public/ の SVG を全部読む。
const published = import.meta.glob("/public/**/*.svg", {
  query: "?raw",
  import: "default",
  eager: true,
});
const master = (file: string): string | undefined => masters[`../../brand/${file}`];

describe("brand/ のマスター", () => {
  test("brand/ の SVG と BRAND_MASTERS は過不足なく対応し、3 枚ある", () => {
    const files = BRAND_MASTERS.map((m) => `../../brand/${m.file}`);
    expect(files).toHaveLength(3);
    expect(Object.keys(masters).sort()).toEqual(files.sort());
  });

  test.each(BRAND_MASTERS)("$file は検査を通り、viewBox の縦横比が ratio と一致する", (m) => {
    const result = inspectMaster(master(m.file) ?? "");
    expect(result.success).toBe(true);
    if (!result.success) return;
    const { width, height } = result.data.viewBox;
    expect(width / height).toBeCloseTo(m.ratio, 6);
  });

  test.each(BRAND_MASTERS.filter((m) => m.copyTo !== undefined))(
    "$file の写し public/$copyTo はマスターと完全一致する",
    (m) => {
      expect(published[`/public/${m.copyTo}`]).toBe(master(m.file));
    },
  );
});

// マスターを変えたのに `just images` を実行し忘れた状態を捕まえる。
describe("brand/generated.json", () => {
  test("BRAND_MASTERS の順に各マスターの SHA-256 を持つ", async () => {
    const entries = await Promise.all(
      BRAND_MASTERS.map(async (m) => [m.file, await sha256Hex(master(m.file) ?? "")] as const),
    );
    expect(generatedRaw).toBe(`${JSON.stringify(Object.fromEntries(entries), null, 2)}\n`);
  });
});
