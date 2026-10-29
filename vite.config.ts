import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import { build as esbuild } from "esbuild";
import { defineConfig, type Plugin } from "vite";
import { LOGO, sha256HexBytes } from "./src/brand/masters.ts";
import { buildIndexHtml, OGP_IMAGE } from "./src/brand/outputs.ts";
import { cacheVersion } from "./src/client/sw-precache.ts";
import { isStablePrecache } from "./src/client/sw-strategy.ts";

// dev では throw の理由が本文にもターミナルにも出ないので、先にターミナルへ出してから止める。
const rejector =
  (scope: string) =>
  (error: string): never => {
    console.error(`${scope}: ${error}`);
    throw new Error(`${scope}: ${error}`);
  };

// クライアントビルドの generateBundle で sw.ts を esbuild バンドルし precache を注入して /sw.js を emit。
// vite build の一部なので、deploy.yml と E2E（vite build && preview）のどちらも同じ sw.js を使う。
// 安定名アセットは public/ から isStablePrecache で選び、内容ハッシュを版数に畳み込む（差し替えが SW 更新になる）。
function serviceWorkerPlugin(): Plugin {
  let publicDir = "";
  const reject = rejector("service worker");
  // 読めないときも reject を通す（reject を挟まないと理由が消える）。
  const readStable = (path: string): Promise<{ path: string; sha256: string }> =>
    readFile(join(publicDir, path))
      .then(async (bytes) => ({ path, sha256: await sha256HexBytes(bytes) }))
      .catch((err: unknown) => reject(`${path} を読めない: ${String(err)}`));
  const stablePaths = async (): Promise<string[]> => {
    const entries = await readdir(publicDir, { recursive: true, withFileTypes: true }).catch(
      (err: unknown) => reject(`${publicDir} を列挙できない: ${String(err)}`),
    );
    return entries
      .filter((entry) => entry.isFile())
      .map(
        (entry) =>
          `/${relative(publicDir, join(entry.parentPath, entry.name)).split(sep).join("/")}`,
      )
      .filter(isStablePrecache)
      .sort();
  };
  return {
    name: "cospl-service-worker",
    apply: "build",
    configResolved(config) {
      publicDir = config.publicDir;
    },
    async generateBundle(_options, bundle) {
      // クライアントビルドは CSS アセットを bundle に含む（CF worker ビルドは含まない）ので、
      // これを client/worker ビルドのロバストな判別子にする。
      if (!Object.keys(bundle).some((name) => name.endsWith(".css"))) {
        return;
      }
      const hashed = Object.keys(bundle)
        .filter((name) => name.endsWith(".js") || name.endsWith(".css"))
        .map((name) => `/${name}`);
      const stable = await Promise.all((await stablePaths()).map(readStable));
      const precache = ["/", ...hashed, ...stable.map((file) => file.path)];
      const version = await cacheVersion({ hashedAssets: hashed, stable });
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
        return reject("ビルド出力が空");
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
  const reject = rejector("index.html");
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
