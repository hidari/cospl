import { describe, expect, test } from "vitest";
// workerd では node:fs が使えないため Vite の ?raw で本文を文字列として埋め込む。
import generatedRaw from "../../brand/generated.json?raw";
import indexRaw from "../../index.html?raw";
import {
  BRAND_MASTERS,
  checkMaster,
  generatedJson,
  inspectMaster,
  LOGO,
} from "../../src/brand/masters";
import { darkLogo, renderIndexHtml } from "../../src/brand/outputs";

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
const master = (file: string): string => masters[`../../brand/${file}`] ?? "";

describe("brand/ のマスター", () => {
  test("brand/ の SVG と BRAND_MASTERS は過不足なく対応し、6 枚ある", () => {
    const files = BRAND_MASTERS.map((m) => `../../brand/${m.file}`);
    expect(files).toHaveLength(6);
    expect(Object.keys(masters).sort()).toEqual(files.sort());
  });

  test.each(BRAND_MASTERS)("$file は検査を通り、ratio があれば viewBox の縦横比が一致する", (m) => {
    expect(checkMaster(m, master(m.file)).success).toBe(true);
  });

  // 登録しただけで何も作らないマスターは、書き出しても配信に反映されない。
  test.each(BRAND_MASTERS)("$file から配信物を少なくとも 1 つ作る", (m) => {
    const made = (m.copyTo === undefined ? 0 : 1) + (m.rasters ?? []).length;
    expect(made).toBeGreaterThan(0);
  });

  test.each(BRAND_MASTERS.filter((m) => m.copyTo !== undefined))(
    "$file の写し public/$copyTo はマスターと完全一致する",
    (m) => {
      expect(published[`/public/${m.copyTo}`]).toBe(master(m.file));
    },
  );

  test(`public/${LOGO.dark} は ${LOGO.file} の色を対応表で置き換えたものと完全一致する`, () => {
    const dark = darkLogo(master(LOGO.file));
    expect(dark.success).toBe(true);
    if (!dark.success) return;
    // ダーク版も同一オリジンで配信するので、マスターと同じ検査を通ることまで確かめる。
    expect(inspectMaster(dark.data).success).toBe(true);
    expect(published[`/public/${LOGO.dark}`]).toBe(dark.data);
  });
});

// マスターを変えたのに `just images` を実行し忘れた状態を捕まえる。
describe("brand/generated.json", () => {
  test("BRAND_MASTERS の順に各マスターの SHA-256 を持つ", async () => {
    const current = BRAND_MASTERS.map((m) => ({ file: m.file, svg: master(m.file) }));
    expect(generatedRaw).toBe(await generatedJson(current));
  });
});

// 値はビルドが差し込む（vite.config.ts）。ここでは差し込める形のテンプレートであることを確かめる。
describe("index.html", () => {
  test("生成する値の場所にトークンを置き、描画できる", () => {
    const rendered = renderIndexHtml(indexRaw, {
      ogpVersion: "0123abcd",
      logo: { width: 1, height: 1 },
    });
    expect(rendered.success).toBe(true);
  });

  // 値をソースに残すと、ビルドが差し込む値と食い違ったまま読まれる。
  test("?v= の値もロゴの数値の寸法も持たない", () => {
    expect(indexRaw).not.toMatch(/\?v=[0-9a-f]/);
    expect(indexRaw).not.toMatch(/logo-light\.svg"[^>]*\b(?:width|height)="\d/);
  });
});
