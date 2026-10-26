// SVG マスターからブランド画像（ファビコン / OGP）を生成する。
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

// 目印の間をロゴで置き換えた SVG を返す。目印が 1 組でなければ失敗する。
function withLogo(mark, svg, logo) {
  const span = mark.logoMarkSpan(svg);
  if (!span.success) {
    throw new Error(span.error);
  }
  return svg.slice(0, span.data.from) + logo + svg.slice(span.data.to);
}

// 自己ホスト欧文フォントを data URI 化（setContent はベース URL を持たないため）
async function fontFace(family, weight, file) {
  const b64 = await readFile(join(pub, "fonts", file)).then((b) => b.toString("base64"));
  return `@font-face{font-family:'${family}';font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${b64}) format('woff2');}`;
}

// 自己ホスト欧文フォント（latin 3種）の @font-face を一度だけ組み立てる。
async function latinFaces() {
  return [
    await fontFace("Space Grotesk", 700, "SpaceGrotesk-latin.woff2"),
    await fontFace("Space Mono", 400, "SpaceMono-400-latin.woff2"),
    await fontFace("Space Mono", 700, "SpaceMono-700-latin.woff2"),
  ].join("");
}

// SVG を実寸ビューポートで描画して PNG 1枚に焼く
async function renderSvg(
  browser,
  faces,
  svgPath,
  width,
  height,
  outPng,
  { transparent } = { transparent: false },
) {
  const svg = await readFile(svgPath, "utf8");
  // 和文 Zen Kaku Gothic New はビルド時に CDN から取得し出力へ焼き込む
  const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@500;700;900&display=block">
<style>${faces}*{margin:0;padding:0}html,body{width:${width}px;height:${height}px}svg{display:block}</style>
</head><body>${svg}</body></html>`;

  const page = await browser.newPage({
    // favicon.svg はダーク用の @media を持つため、既定値に頼らずライトで描く。
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
  const browser = await chromium.launch({ channel: "chrome" });
  const tmp = await mkdtemp(join(tmpdir(), "cospl-img-"));
  try {
    const faces = await latinFaces();
    const mark = await loadTs({ entryPoint: join(root, "src", "brand", "mark.ts") }, "mark");

    // --- マスター SVG をマークの定義から書き出す ---
    const favSvg = join(pub, "favicon.svg");
    const maskableSvg = join(pub, "icons", "maskable.svg");
    const appleSvg = join(tmp, "apple-touch.svg");
    await writeFile(favSvg, `${mark.faviconSvg()}\n`);
    await writeFile(maskableSvg, `${mark.maskableSvg()}\n`);
    await writeFile(appleSvg, mark.appleTouchSvg());

    // --- ファビコン（透明角丸）---
    const icoSizes = [16, 32, 48];
    const icoPngs = [];
    for (const s of icoSizes) {
      const p = join(tmp, `favicon-${s}.png`);
      await renderSvg(browser, faces, favSvg, s, s, p, { transparent: true });
      icoPngs.push(p);
    }
    await run("magick", [...icoPngs, join(pub, "favicon.ico")]);
    // apple-touch は OS が角を丸めるため全面ベタ塗り。
    await renderSvg(browser, faces, appleSvg, 180, 180, join(pub, "apple-touch-icon.png"));
    console.log("favicon: favicon.ico (16/32/48) + apple-touch-icon.png (180)");

    // --- PWA アイコン（manifest 用。any は丸角透過、maskable は全面ベタ塗り）---
    await renderSvg(browser, faces, favSvg, 192, 192, join(pub, "icons", "icon-192.png"), {
      transparent: true,
    });
    await renderSvg(browser, faces, favSvg, 512, 512, join(pub, "icons", "icon-512.png"), {
      transparent: true,
    });
    await renderSvg(
      browser,
      faces,
      maskableSvg,
      512,
      512,
      join(pub, "icons", "icon-512-maskable.png"),
    );
    console.log("pwa icons: icon-192 / icon-512 / icon-512-maskable");

    // --- OGP（白地・PNG マスター → WebP + JPEG）---
    const ogps = [
      { name: "ogp-landscape", w: 1200, h: 630 },
      { name: "ogp-square", w: 1200, h: 1200 },
    ];
    for (const { name, w, h } of ogps) {
      const svg = join(pub, "ogp", `${name}.svg`);
      const { x, baseline, fontSize } = mark.OGP_LOGO[name];
      const logo = mark.logoGroup(x, baseline, fontSize, mark.PALETTE.logoLight);
      await writeFile(svg, withLogo(mark, await readFile(svg, "utf8"), logo));
      const png = join(pub, "ogp", `${name}.png`);
      await renderSvg(browser, faces, svg, w, h, png);
      await toWebp(png, join(pub, "ogp", `${name}.webp`), 90);
      await toJpeg(png, join(pub, "ogp", `${name}.jpg`), 92);
      console.log(`ogp: ${name} ${w}x${h} -> png + webp + jpg`);
    }
  } finally {
    await browser.close();
    await rm(tmp, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
