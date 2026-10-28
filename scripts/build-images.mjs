// SVG マスターからブランド画像（ファビコン / OGP）を生成する。
// アイコンは brand/ のマスター（src/brand/masters.ts の BRAND_MASTERS）から描き、
// 配信する写しと brand/generated.json も書く。
// playwright-core + システム Chrome で SVG を実寸描画し PNG 化、
// cwebp / ImageMagick(magick) で WebP・JPEG・ICO へ変換する。
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

// 全マスターを読み、検査に通らなかったものを { file, error } で返す。
async function readMasters(masters) {
  const loaded = await Promise.all(
    masters.BRAND_MASTERS.map(async (m) => ({
      ...m,
      svg: await readFile(join(brand, m.file), "utf8"),
    })),
  );
  const failures = loaded.flatMap((m) => {
    const inspected = masters.inspectMaster(m.svg);
    return inspected.success ? [] : [{ file: m.file, error: inspected.error }];
  });
  return { loaded, failures };
}

// 目印の間をロゴで置き換えた SVG を返す。目印が 1 組でなければ失敗する。
function withLogo(mark, svg, logo) {
  const span = mark.logoMarkSpan(svg);
  if (!span.success) {
    throw new Error(span.error);
  }
  return svg.slice(0, span.data.from) + logo + svg.slice(span.data.to);
}

// アイコンのマスターは文字を持たない（inspectMaster が text を拒否する）ので、フォントを読み込まずに描く。
const NO_FONTS = "";

// フォントの拡張子（data URI の MIME の subtype）と @font-face の format() の対応
const FONT_FORMATS = { woff2: "woff2", ttf: "truetype" };

// フォントを data URI 化する（setContent はベース URL を持たないため）
async function fontFace(family, weight, path, format) {
  const fontFormat = FONT_FORMATS[format];
  if (fontFormat === undefined) {
    throw new Error(`未対応のフォント形式: ${format}`);
  }
  const b64 = await readFile(path).then((b) => b.toString("base64"));
  return `@font-face{font-family:'${family}';font-weight:${weight};font-display:block;src:url(data:font/${format};base64,${b64}) format('${fontFormat}');}`;
}

// 描画に使う @font-face を一度だけ組み立てる。欧文はサイトと同じ public/fonts、
// 和文は OGP の描画専用に scripts/fonts に置いたもの（サイトでは配信しない。ライセンスは同じ場所の OFL）。
async function fontFaces() {
  const site = (file) => join(pub, "fonts", file);
  const ogp = (file) => join(root, "scripts", "fonts", file);
  return [
    await fontFace("Space Grotesk", 700, site("SpaceGrotesk-latin.woff2"), "woff2"),
    await fontFace("Space Mono", 400, site("SpaceMono-400-latin.woff2"), "woff2"),
    await fontFace("Space Mono", 700, site("SpaceMono-700-latin.woff2"), "woff2"),
    await fontFace("Zen Kaku Gothic New", 500, ogp("ZenKakuGothicNew-Medium.ttf"), "ttf"),
    await fontFace("Zen Kaku Gothic New", 700, ogp("ZenKakuGothicNew-Bold.ttf"), "ttf"),
  ].join("");
}

// SVG の本文を実寸ビューポートで描画して PNG 1枚に焼く
async function renderSvg(
  browser,
  faces,
  svg,
  width,
  height,
  outPng,
  { transparent } = { transparent: false },
) {
  const html = `<!doctype html><html><head><meta charset="utf-8">
<style>${faces}*{margin:0;padding:0}html,body{width:${width}px;height:${height}px}svg{display:block}</style>
</head><body>${svg}</body></html>`;

  const page = await browser.newPage({
    // SVG が prefers-color-scheme を持っても、既定値に頼らずライトで描く。
    colorScheme: "light",
    viewport: { width, height },
    deviceScaleFactor: 1,
  });
  try {
    await page.setContent(html, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
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

async function main() {
  const masters = await loadTs({ entryPoint: join(root, "src", "brand", "masters.ts") }, "masters");
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
    return found.svg;
  };

  const browser = await chromium.launch({ channel: "chrome" });
  const tmp = await mkdtemp(join(tmpdir(), "cospl-img-"));
  try {
    const mark = await loadTs({ entryPoint: join(root, "src", "brand", "mark.ts") }, "mark");

    const iconSvg = master("icon.svg");

    // --- ファビコン（透明角丸）---
    const icoSizes = [16, 32, 48];
    const icoPngs = [];
    for (const s of icoSizes) {
      const p = join(tmp, `favicon-${s}.png`);
      await renderSvg(browser, NO_FONTS, iconSvg, s, s, p, { transparent: true });
      icoPngs.push(p);
    }
    await run("magick", [...icoPngs, join(pub, "favicon.ico")]);
    // apple-touch は OS が角を丸めるため全面ベタ塗り。
    await renderSvg(
      browser,
      NO_FONTS,
      master("icon-full.svg"),
      180,
      180,
      join(pub, "apple-touch-icon.png"),
    );
    console.log("favicon: favicon.ico (16/32/48) + apple-touch-icon.png (180)");

    // --- PWA アイコン（manifest 用。any は丸角透過、maskable は全面ベタ塗り）---
    await renderSvg(browser, NO_FONTS, iconSvg, 192, 192, join(pub, "icons", "icon-192.png"), {
      transparent: true,
    });
    await renderSvg(browser, NO_FONTS, iconSvg, 512, 512, join(pub, "icons", "icon-512.png"), {
      transparent: true,
    });
    await renderSvg(
      browser,
      NO_FONTS,
      master("icon-maskable.svg"),
      512,
      512,
      join(pub, "icons", "icon-512-maskable.png"),
    );
    console.log("pwa icons: icon-192 / icon-512 / icon-512-maskable");

    // --- OGP（白地・PNG マスター → WebP + JPEG）---
    const faces = await fontFaces();
    const ogps = [
      { name: "ogp-landscape", w: 1200, h: 630 },
      { name: "ogp-square", w: 1200, h: 1200 },
    ];
    for (const { name, w, h } of ogps) {
      const svg = join(pub, "ogp", `${name}.svg`);
      const { x, baseline, fontSize } = mark.OGP_LOGO[name];
      const logo = mark.logoGroup(x, baseline, fontSize, mark.PALETTE.logoLight);
      const spliced = withLogo(mark, await readFile(svg, "utf8"), logo);
      await writeFile(svg, spliced);
      const png = join(pub, "ogp", `${name}.png`);
      await renderSvg(browser, faces, spliced, w, h, png);
      await toWebp(png, join(pub, "ogp", `${name}.webp`), 90);
      await toJpeg(png, join(pub, "ogp", `${name}.jpg`), 92);
      console.log(`ogp: ${name} ${w}x${h} -> png + webp + jpg`);
    }

    // generated.json は「最後まで描き終えた」印なので、全部の描画が済んでから書く。途中で失敗したら
    // 古いハッシュのままになり、テストが just images のやり直しを求める。
    // 写しはマスターと同じバイト列にする（テストが文字列の完全一致で見張る）。
    for (const m of loaded) {
      if (m.copyTo !== undefined) {
        await writeFile(join(pub, m.copyTo), m.svg);
      }
    }
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
