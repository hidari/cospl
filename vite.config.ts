import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import { build as esbuild } from "esbuild";
import { defineConfig, type Plugin } from "vite";
import { LOGO } from "./src/brand/masters.ts";
import { buildIndexHtml, OGP_IMAGE } from "./src/brand/outputs.ts";

// precache する安定名アセット（ハッシュ無し）。ハッシュ付き JS/CSS は generateBundle から取得する。
const STABLE_PRECACHE: readonly string[] = [
  "/manifest.webmanifest",
  "/favicon.svg",
  "/favicon.ico",
  "/apple-touch-icon.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-512-maskable.png",
  "/icons/logo-light.svg",
  "/icons/logo-dark.svg",
  "/icons/by.svg",
  "/icons/nc.svg",
  "/icons/nai.svg",
  "/icons/td.svg",
  "/icons/mr.svg",
  "/fonts/SpaceGrotesk-latin.woff2",
  "/fonts/SpaceMono-400-latin.woff2",
  "/fonts/SpaceMono-700-latin.woff2",
];

// クライアントビルドの generateBundle で sw.ts を esbuild バンドルし precache を注入して /sw.js を emit。
// vite build の一部なので、deploy.yml と E2E（vite build && preview）のどちらも同じ sw.js を使う。
function serviceWorkerPlugin(): Plugin {
  return {
    name: "cospl-service-worker",
    apply: "build",
    async generateBundle(_options, bundle) {
      // クライアントビルドは CSS アセットを bundle に含む（CF worker ビルドは含まない）ので、
      // これを client/worker ビルドのロバストな判別子にする。
      if (!Object.keys(bundle).some((name) => name.endsWith(".css"))) {
        return;
      }
      const hashed = Object.keys(bundle)
        .filter((name) => name.endsWith(".js") || name.endsWith(".css"))
        .map((name) => `/${name}`);
      // キャッシュ版数は precache 対象のハッシュ付きアセット名全体から決定的に導出する。全件を
      // ソートして連結するため、エントリ数や Object.values の列挙順に依存せず、内容が変われば必ず変わる。
      const version =
        hashed
          .map((name) => name.replace(/[^a-z0-9]/gi, ""))
          .sort()
          .join("") || "dev";
      const precache = ["/", ...hashed, ...STABLE_PRECACHE];
      const result = await esbuild({
        entryPoints: ["src/client/sw.ts"],
        bundle: true,
        format: "iife",
        target: "es2020",
        minify: true,
        write: false,
        define: {
          __PRECACHE__: JSON.stringify(precache),
          __CACHE_VERSION__: JSON.stringify(version),
        },
      });
      const out = result.outputFiles?.[0];
      if (!out) {
        throw new Error("service worker のビルド出力が空");
      }
      this.emitFile({ type: "asset", fileName: "sw.js", source: out.text });
    },
  };
}

// index.html のトークンに、配信するファイル（public/ の OG 画像とロゴ）から作った値を差し込む。
// transformIndexHtml は dev の配信とクライアントのビルドで走り、Worker のビルドと preview では走らない。
// dev では ctx.path・ctx.filename・this.environment が当てにならない（@cloudflare/vite-plugin 経由）ので読まない。
// ファイルは毎回読む（dev で画像を描き直したら次の配信から反映する）。
function brandIndexHtmlPlugin(): Plugin {
  let publicDir = "";
  // dev では throw の理由が本文にもターミナルにも出ないので、先にターミナルへ出してから止める。
  const reject = (error: string): never => {
    console.error(`index.html: ${error}`);
    throw new Error(`index.html: ${error}`);
  };
  // 読めないときも reject を通す（readFile の reject をそのまま投げると理由が消える）。
  const read = (file: string): Promise<Uint8Array<ArrayBuffer>> => {
    const path = join(publicDir, file);
    return readFile(path).catch((err: unknown) => reject(`${path} を読めない: ${String(err)}`));
  };
  return {
    name: "cospl-brand-index-html",
    configResolved(config) {
      publicDir = config.publicDir;
    },
    transformIndexHtml: {
      order: "pre",
      async handler(html) {
        const result = await buildIndexHtml(html, {
          ogpJpg: await read(OGP_IMAGE),
          logoSvg: new TextDecoder().decode(await read(LOGO.light)),
        });
        return result.success ? result.data : reject(result.error);
      },
    },
  };
}

// @cloudflare/vite-plugin が wrangler.toml を読み、worker.ts と
// クライアント（index.html / src/client）の両方をビルドする。
export default defineConfig({
  plugins: [cloudflare(), brandIndexHtmlPlugin(), serviceWorkerPlugin()],
  // 既定の 5173 はローカルで並走させる別プロジェクトと衝突するため固定する。
  server: { port: 5210 },
  // JS は 1 ファイルで先読みする相手が無く、modulepreload は主要ブラウザが対応済みなので polyfill を入れない。
  build: { modulePreload: { polyfill: false } },
});
