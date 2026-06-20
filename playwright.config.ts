import { defineConfig, devices } from "@playwright/test";

// baseURL は環境変数で切替。未設定=ローカル preview、設定時（本番 cospl.org）は外部稼働サイトへ当てる。
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:4173";
// 外部 URL 指定時はローカル server を起動しない（稼働中サイトに当てる）。
const isExternalTarget = Boolean(process.env.E2E_BASE_URL);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "Mobile Safari", use: { ...devices["iPhone 14"] } },
  ],
  // @cloudflare/vite-plugin の preview は worker.ts を miniflare で動かすため、ローカルでも
  // CSP・run_worker_first・discovery が効く（本番に近い）。Core シナリオはクライアント完結。
  webServer: isExternalTarget
    ? undefined
    : {
        command: "pnpm build && pnpm exec vite preview --port 4173",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
