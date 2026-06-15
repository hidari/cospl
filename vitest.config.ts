import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// テストを workerd 実ランタイム上で走らせる。wrangler.toml から main/compatibility_date/
// assets バインディングを読み込む。core/types のユニットも同じプールで動く。
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.toml" },
    }),
  ],
  test: {
    include: ["test/**/*.test.ts"],
  },
});
