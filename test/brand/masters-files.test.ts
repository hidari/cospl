import { describe, expect, test } from "vitest";
// workerd では node:fs が使えないため Vite の ?raw で本文を文字列として埋め込む。
import generatedRaw from "../../brand/generated.json?raw";
import iconRaw from "../../brand/icon.svg?raw";
import iconFullRaw from "../../brand/icon-full.svg?raw";
import iconMaskableRaw from "../../brand/icon-maskable.svg?raw";
import faviconRaw from "../../public/favicon.svg?raw";
import { BRAND_MASTERS, inspectMaster, sha256Hex } from "../../src/brand/masters";

// ?raw はパスを静的に書く必要があるので、BRAND_MASTERS の file / copyTo と本文をここで対応付ける。
const masters: Readonly<Record<string, string>> = {
  "icon.svg": iconRaw,
  "icon-full.svg": iconFullRaw,
  "icon-maskable.svg": iconMaskableRaw,
};
const copies: Readonly<Record<string, string>> = { "favicon.svg": faviconRaw };

describe("brand/ のマスター", () => {
  test("検査対象は 3 枚あり、本文の対応表と過不足が無い", () => {
    expect(BRAND_MASTERS.length).toBe(3);
    expect(BRAND_MASTERS.map((m) => m.file).sort()).toEqual(Object.keys(masters).sort());
  });

  test.each(BRAND_MASTERS)("$file は検査を通り、viewBox の縦横比が ratio と一致する", (master) => {
    const result = inspectMaster(masters[master.file] ?? "");
    expect(result.success).toBe(true);
    if (!result.success) return;
    const { width, height } = result.data.viewBox;
    expect(width / height).toBeCloseTo(master.ratio, 6);
  });

  test.each(BRAND_MASTERS.filter((m) => m.copyTo !== undefined))(
    "$file の写し public/$copyTo はマスターと完全一致する",
    (master) => {
      expect(copies[master.copyTo ?? ""]).toBe(masters[master.file]);
    },
  );
});

// マスターを変えたのに `just images` を実行し忘れた状態を捕まえる。
describe("brand/generated.json", () => {
  test("BRAND_MASTERS の順に各マスターの SHA-256 を持つ", async () => {
    const entries = await Promise.all(
      BRAND_MASTERS.map(async (m) => [m.file, await sha256Hex(masters[m.file] ?? "")] as const),
    );
    expect(generatedRaw).toBe(`${JSON.stringify(Object.fromEntries(entries), null, 2)}\n`);
  });
});
