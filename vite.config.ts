import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

// @cloudflare/vite-plugin が wrangler.toml を読み、worker.ts と
// クライアント（index.html / src/client）の両方をビルドする。
export default defineConfig({
  plugins: [cloudflare()],
});
