// brand/ の SVG マスター（src/brand/masters.ts の BRAND_MASTERS）からブランド画像を生成する。
// 何を作るかは BRAND_MASTERS の copyTo と rasters が決め、このスクリプトはそれを順に処理する。
// playwright-core + システム Chrome で SVG を実寸描画し PNG 化、
// cwebp / ImageMagick(magick) で WebP・JPEG・ICO へ変換する。
// 配信する写しとロゴのダーク版、brand/generated.json も書く。index.html の値はビルドが差し込む（vite.config.ts）。
//
// 前提コマンド: Google Chrome（channel: 'chrome'）, cwebp, magick
// 実行: just images

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { chromium } from "playwright-core";
import { loadTs } from "./lib/load-ts.mjs";

const run = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(root, "public");
const brand = join(root, "brand");

// 全マスターを読んで検査（縦横比を含む）し、通ったものは viewBox を持たせる。
// 通らなかったものは { file, error } で返す。
async function readMasters(masters) {
  const read = await Promise.all(
    masters.BRAND_MASTERS.map(async (m) => ({
      master: m,
      svg: await readFile(join(brand, m.file), "utf8"),
    })),
  );
  const checked = read.map(({ master, svg }) => ({
    master,
    svg,
    result: masters.checkMaster(master, svg),
  }));
  return {
    loaded: checked.flatMap(({ master, svg, result }) =>
      result.success ? [{ ...master, svg, viewBox: result.data.viewBox }] : [],
    ),
    failures: checked.flatMap(({ master, result }) =>
      result.success ? [] : [{ file: master.file, error: result.error }],
    ),
  };
}

// SVG の本文を実寸ビューポートで描画して PNG 1枚に焼く。マスターは文字を持たない
// （inspectMaster が text を拒否する）ので、フォントは読み込まない。
async function renderSvg(browser, svg, width, height, outPng, { transparent }) {
  const html = `<!doctype html><html><head><meta charset="utf-8">
<style>*{margin:0;padding:0}html,body{width:${width}px;height:${height}px}svg{display:block;width:${width}px;height:${height}px}</style>
</head><body>${svg}</body></html>`;

  const page = await browser.newPage({
    // SVG が prefers-color-scheme を持っても、既定値に頼らずライトで描く。
    colorScheme: "light",
    viewport: { width, height },
    deviceScaleFactor: 1,
  });
  try {
    await page.setContent(html, { waitUntil: "networkidle" });
    await page.screenshot({
      path: outPng,
      clip: { x: 0, y: 0, width, height },
      omitBackground: transparent,
    });
  } finally {
    await page.close();
  }
}

// BRAND_MASTERS の rasters の 1 つを描画して書く。
async function writeRaster(browser, tmp, svg, raster) {
  const out = join(pub, raster.to);
  switch (raster.kind) {
    case "ico": {
      const pngs = [];
      for (const s of raster.sizes) {
        const p = join(tmp, `ico-${s}.png`);
        await renderSvg(browser, svg, s, s, p, { transparent: true });
        pngs.push(p);
      }
      await run("magick", [...pngs, out]);
      return `${raster.to} (${raster.sizes.join("/")})`;
    }
    case "png":
      await renderSvg(browser, svg, raster.size, raster.size, out, raster);
      return `${raster.to} (${raster.size})`;
    case "ogp": {
      const png = `${out}.png`;
      await renderSvg(browser, svg, raster.width, raster.height, png, { transparent: false });
      await run("cwebp", ["-quiet", "-q", "90", png, "-o", `${out}.webp`]);
      await run("magick", [
        png,
        "-background",
        "white",
        "-flatten",
        "-quality",
        "92",
        `${out}.jpg`,
      ]);
      return `${raster.to}.png/.webp/.jpg (${raster.width}x${raster.height})`;
    }
    default:
      throw new Error(`未対応の raster: ${raster.kind}`);
  }
}

// 結果が失敗なら投げる（main の catch が終了コードを立てる）。
function unwrap(result) {
  if (!result.success) {
    throw new Error(result.error);
  }
  return result.data;
}

async function main() {
  const entry = (name) => ({ entryPoint: join(root, "src", "brand", `${name}.ts`) });
  const masters = await loadTs(entry("masters"), "masters");
  const outputs = await loadTs(entry("outputs"), "outputs");
  // 描画や書き込みより先に全マスターを検査し、1 枚でも通らなければ何も書かずに止める。
  // process.exit() は stderr がパイプのとき書き出しを待たずに終わり、メッセージが消えることがあるので
  // 終了コードだけ立てて自然に終わらせる。
  const { loaded, failures } = await readMasters(masters);
  if (failures.length > 0) {
    for (const { file, error } of failures) {
      console.error(`brand/${file}: ${error}`);
    }
    process.exitCode = 1;
    return;
  }
  const master = (file) => {
    const found = loaded.find((m) => m.file === file);
    if (found === undefined) {
      throw new Error(`BRAND_MASTERS に無いマスター: ${file}`);
    }
    return found;
  };
  // 書き込みの前に、ダーク版を作れることを確かめる。
  const logoDark = unwrap(outputs.darkLogo(master(masters.LOGO.file).svg));

  const browser = await chromium.launch({ channel: "chrome" });
  const tmp = await mkdtemp(join(tmpdir(), "cospl-img-"));
  try {
    for (const m of loaded) {
      for (const raster of m.rasters ?? []) {
        console.log(`${m.file} -> ${await writeRaster(browser, tmp, m.svg, raster)}`);
      }
    }

    // 写し・ダーク版・generated.json は、全部の描画が済んでから書く。generated.json は
    // 「最後まで描き終えた」印なので最後に書く。途中で失敗したら古いハッシュのままになり、
    // テストが just images のやり直しを求める。写しはマスターと同じバイト列にする（テストが完全一致で見張る）。
    for (const m of loaded) {
      if (m.copyTo !== undefined) {
        await writeFile(join(pub, m.copyTo), m.svg);
      }
    }
    await writeFile(join(pub, masters.LOGO.dark), logoDark);
    console.log(`${masters.LOGO.file} -> ${masters.LOGO.light} + ${masters.LOGO.dark}`);
    await writeFile(join(brand, "generated.json"), await masters.generatedJson(loaded));
  } finally {
    await browser.close();
    await rm(tmp, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
