// brand/ の SVG マスター（src/brand/masters.ts の BRAND_MASTERS）からブランド画像を生成する。
// playwright-core + システム Chrome で SVG を実寸描画し PNG 化、
// cwebp / ImageMagick(magick) で WebP・JPEG・ICO へ変換する。
// 配信する写しとロゴのダーク版、index.html の値、brand/generated.json も書く。
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

// OGP の PNG の幅。高さはマスターの ratio から決める（OGP の推奨サイズの幅）。
const OGP_WIDTH = 1200;

// 全マスターを読み、検査（縦横比を含む）に通らなかったものを { file, error } で返す。
async function readMasters(masters) {
  const loaded = await Promise.all(
    masters.BRAND_MASTERS.map(async (m) => ({
      ...m,
      svg: await readFile(join(brand, m.file), "utf8"),
    })),
  );
  const failures = loaded.flatMap((m) => {
    const checked = masters.checkMaster(m, m.svg);
    return checked.success ? [] : [{ file: m.file, error: checked.error }];
  });
  return { loaded, failures };
}

// SVG の本文を実寸ビューポートで描画して PNG 1枚に焼く。マスターは文字を持たない
// （inspectMaster が text を拒否する）ので、フォントは読み込まない。
async function renderSvg(
  browser,
  svg,
  width,
  height,
  outPng,
  { transparent } = { transparent: false },
) {
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

async function toWebp(png, webp, quality) {
  await run("cwebp", ["-quiet", "-q", String(quality), png, "-o", webp]);
}

async function toJpeg(png, jpg, quality) {
  await run("magick", [png, "-background", "white", "-flatten", "-quality", String(quality), jpg]);
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
  // 書き込みの前に、ダーク版と index.html の値を作れることを確かめる。
  const logo = master(outputs.LOGO_DARK.from);
  const logoDark = unwrap(outputs.darkLogo(logo.svg));
  const indexPath = join(root, "index.html");
  const index = unwrap(
    outputs.syncIndexHtml(await readFile(indexPath, "utf8"), {
      ogpVersion: outputs.ogpVersion(await masters.sha256Hex(master(outputs.OGP_VERSION_FROM).svg)),
      logo: unwrap(masters.checkMaster(logo, logo.svg)).viewBox,
    }),
  );

  const browser = await chromium.launch({ channel: "chrome" });
  const tmp = await mkdtemp(join(tmpdir(), "cospl-img-"));
  try {
    const iconSvg = master("icon.svg").svg;

    // --- ファビコン（透明角丸）---
    const icoSizes = [16, 32, 48];
    const icoPngs = [];
    for (const s of icoSizes) {
      const p = join(tmp, `favicon-${s}.png`);
      await renderSvg(browser, iconSvg, s, s, p, { transparent: true });
      icoPngs.push(p);
    }
    await run("magick", [...icoPngs, join(pub, "favicon.ico")]);
    // apple-touch は OS が角を丸めるため全面ベタ塗り。
    await renderSvg(
      browser,
      master("icon-full.svg").svg,
      180,
      180,
      join(pub, "apple-touch-icon.png"),
    );
    console.log("favicon: favicon.ico (16/32/48) + apple-touch-icon.png (180)");

    // --- PWA アイコン（manifest 用。any は丸角透過、maskable は全面ベタ塗り）---
    await renderSvg(browser, iconSvg, 192, 192, join(pub, "icons", "icon-192.png"), {
      transparent: true,
    });
    await renderSvg(browser, iconSvg, 512, 512, join(pub, "icons", "icon-512.png"), {
      transparent: true,
    });
    await renderSvg(
      browser,
      master("icon-maskable.svg").svg,
      512,
      512,
      join(pub, "icons", "icon-512-maskable.png"),
    );
    console.log("pwa icons: icon-192 / icon-512 / icon-512-maskable");

    // --- OGP（PNG → WebP + JPEG）---
    for (const name of ["ogp-landscape", "ogp-square"]) {
      const { svg, ratio } = master(`${name}.svg`);
      const height = Math.round(OGP_WIDTH / ratio);
      const png = join(pub, "ogp", `${name}.png`);
      await renderSvg(browser, svg, OGP_WIDTH, height, png);
      await toWebp(png, join(pub, "ogp", `${name}.webp`), 90);
      await toJpeg(png, join(pub, "ogp", `${name}.jpg`), 92);
      console.log(`ogp: ${name} ${OGP_WIDTH}x${height} -> png + webp + jpg`);
    }

    // 写し・ダーク版・index.html・generated.json は、全部の描画が済んでから書く。generated.json は
    // 「最後まで描き終えた」印なので最後に書く。途中で失敗したら古いハッシュのままになり、
    // テストが just images のやり直しを求める。写しはマスターと同じバイト列にする（テストが完全一致で見張る）。
    for (const m of loaded) {
      if (m.copyTo !== undefined) {
        await writeFile(join(pub, m.copyTo), m.svg);
      }
    }
    await writeFile(join(pub, outputs.LOGO_DARK.to), logoDark);
    await writeFile(indexPath, index);
    console.log("logo: icons/logo-light.svg + icons/logo-dark.svg, index.html");
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
