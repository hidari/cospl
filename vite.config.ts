import { cloudflare } from "@cloudflare/vite-plugin";
import { build as esbuild } from "esbuild";
import { defineConfig, type Plugin } from "vite";

// precache する安定名アセット（ハッシュ無し）。ハッシュ付き JS/CSS は generateBundle から取得する。
const STABLE_PRECACHE: readonly string[] = [
  "/manifest.webmanifest",
  "/favicon.svg",
  "/favicon.ico",
  "/apple-touch-icon.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-512-maskable.png",
  "/icons/by.svg",
  "/icons/nc.svg",
  "/icons/nai.svg",
  "/icons/td.svg",
  "/icons/mr.svg",
  "/icons/mark.svg",
  "/fonts/SpaceGrotesk-latin.woff2",
  "/fonts/SpaceMono-400-latin.woff2",
  "/fonts/SpaceMono-700-latin.woff2",
];

// クライアントビルドの generateBundle で sw.ts を esbuild バンドルし precache を注入して /sw.js を emit。
// vite build の一部なので deploy（vite build && wrangler deploy）でも E2E（vite build && preview）でも一貫。
function serviceWorkerPlugin(): Plugin {
  return {
    name: "cospl-service-worker",
    apply: "build",
    async generateBundle(_options, bundle) {
      // クライアントビルド（index.html / CSS を含む）でのみ生成。CF プラグインの worker ビルドでは生成しない。
      const isClient =
        "index.html" in bundle || Object.keys(bundle).some((name) => name.endsWith(".css"));
      if (!isClient) {
        return;
      }
      const hashed = Object.keys(bundle)
        .filter((name) => name.endsWith(".js") || name.endsWith(".css"))
        .map((name) => `/${name}`);
      // キャッシュ版数はエントリ JS のハッシュ名から導出（内容が変われば名前が変わる）。
      let version = "dev";
      for (const chunk of Object.values(bundle)) {
        if (chunk.type === "chunk" && chunk.isEntry) {
          version = chunk.fileName.replace(/[^a-z0-9]/gi, "");
          break;
        }
      }
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

// @cloudflare/vite-plugin が wrangler.toml を読み、worker.ts と
// クライアント（index.html / src/client）の両方をビルドする。
export default defineConfig({
  plugins: [cloudflare(), serviceWorkerPlugin()],
  // dev サーバのポートを固定し、Taskfile.pkl の dev.readyPort と一致させる。
  server: { port: 5210 },
});
