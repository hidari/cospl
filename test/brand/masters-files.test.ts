import { describe, expect, test } from "vitest";
// workerd では node:fs が使えないため Vite の ?raw で本文を文字列として埋め込む。
import generatedRaw from "../../brand/generated.json?raw";
import indexRaw from "../../index.html?raw";
import {
  BRAND_MASTERS,
  checkMaster,
  generatedJson,
  inspectMaster,
  sha256Hex,
} from "../../src/brand/masters";
import {
  darkLogo,
  LOGO_DARK,
  OGP_VERSION_FROM,
  ogpVersion,
  syncIndexHtml,
} from "../../src/brand/outputs";

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

  test.each(BRAND_MASTERS.filter((m) => m.copyTo !== undefined))(
    "$file の写し public/$copyTo はマスターと完全一致する",
    (m) => {
      expect(published[`/public/${m.copyTo}`]).toBe(master(m.file));
    },
  );

  test(`public/${LOGO_DARK.to} は ${LOGO_DARK.from} の色を対応表で置き換えたものと完全一致する`, () => {
    const dark = darkLogo(master(LOGO_DARK.from));
    expect(dark.success).toBe(true);
    // ダーク版も同一オリジンで配信するので、マスターと同じ検査を通ることまで確かめる。
    expect(dark.success && inspectMaster(dark.data).success).toBe(true);
    expect(published[`/public/${LOGO_DARK.to}`]).toBe(dark.success ? dark.data : undefined);
  });
});

// マスターを変えたのに `just images` を実行し忘れた状態を捕まえる。
describe("brand/generated.json", () => {
  test("BRAND_MASTERS の順に各マスターの SHA-256 を持つ", async () => {
    const current = BRAND_MASTERS.map((m) => ({ file: m.file, svg: master(m.file) }));
    expect(generatedRaw).toBe(await generatedJson(current));
  });
});

describe("index.html", () => {
  test("OGP の ?v= とロゴの width / height は just images が書いた値のまま", async () => {
    const logo = checkMaster({ file: LOGO_DARK.from }, master(LOGO_DARK.from));
    expect(logo.success).toBe(true);
    if (!logo.success) return;
    const expected = {
      ogpVersion: ogpVersion(await sha256Hex(master(OGP_VERSION_FROM))),
      logo: logo.data.viewBox,
    };
    expect(syncIndexHtml(indexRaw, expected)).toEqual({ success: true, data: indexRaw });
  });
});
