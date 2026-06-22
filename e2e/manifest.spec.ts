import { expect, test } from "./fixtures";

test("manifest が link され application/manifest+json で取得できる", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/manifest.webmanifest",
  );
  const res = await page.request.get("/manifest.webmanifest");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/manifest+json");
  const body = await res.text();
  expect(body).toContain('"display"');
  expect(body).toContain('"standalone"');
  expect(body).toContain('"512x512"');
  expect(body).toContain('"maskable"');
});

test("PWA アイコンが PNG で配信される", async ({ page }) => {
  for (const path of [
    "/icons/icon-192.png",
    "/icons/icon-512.png",
    "/icons/icon-512-maskable.png",
  ]) {
    const res = await page.request.get(path);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/png");
  }
});
