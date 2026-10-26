import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

test("ヘッダーのロゴが名前「CosPL」の画像として見える", async ({ licensePage, page }) => {
  await licensePage.goto();
  await expect(page.getByRole("img", { name: "CosPL" })).toBeVisible();
});

// 描画された computed の値を直接読む。SVG の表示属性に書いた var() がエンジンで解決されないと、
// C が消えるか黒く塗られる。
const readPaint = (page: Page) =>
  page.evaluate(() => {
    const computed = (selector: string) => {
      const el = document.querySelector(selector);
      return el ? getComputedStyle(el) : undefined;
    };
    return {
      bodyBg: getComputedStyle(document.body).backgroundColor,
      logoColor: computed(".logo")?.color ?? "",
      stroke: computed(".logo .mk-c")?.stroke ?? "",
      fill: computed(".logo .mk-dot")?.fill ?? "",
    };
  });

const RGB = /^rgb\(\d+, \d+, \d+\)$/;

test("ライトとダークの両方でロゴの C と点が色で塗られ、ダークは地もマークも違う", async ({
  licensePage,
  page,
}) => {
  await licensePage.goto();
  await expect(page.getByRole("img", { name: "CosPL" })).toBeVisible();

  await page.emulateMedia({ colorScheme: "light" });
  const light = await readPaint(page);
  await page.emulateMedia({ colorScheme: "dark" });
  const dark = await readPaint(page);

  for (const paint of [light, dark]) {
    expect(paint.stroke).toMatch(RGB);
    expect(paint.fill).toMatch(RGB);
  }
  expect(dark.bodyBg).not.toBe(light.bodyBg);
  expect(dark.logoColor).not.toBe(dark.bodyBg);
  expect(dark.stroke).not.toBe(light.stroke);
  expect(dark.fill).not.toBe(light.fill);
});
