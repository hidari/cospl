import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

test("ヘッダーのロゴが名前「CosPL」の画像として見える", async ({ licensePage, page }) => {
  await licensePage.goto();
  await expect(page.getByRole("img", { name: "CosPL" })).toBeVisible();
});

test.describe("ダークモード", () => {
  test.use({ colorScheme: "dark" });

  test("地の色がライトと違い、ロゴの文字色は地の色と区別できる", async ({
    browser,
    licensePage,
    page,
  }) => {
    const bodyBg = (p: typeof page) =>
      p.evaluate(() => getComputedStyle(document.body).backgroundColor);

    await licensePage.goto();
    const darkBg = await bodyBg(page);
    const logoColor = await page
      .getByRole("img", { name: "CosPL" })
      .evaluate((el) => getComputedStyle(el).color);

    const light = await browser.newContext({ colorScheme: "light" });
    const lightPage = await light.newPage();
    await lightPage.goto("/");
    const lightBg = await bodyBg(lightPage);
    await light.close();

    expect(darkBg).not.toBe(lightBg);
    expect(logoColor).not.toBe(darkBg);
  });
});

// SVG の表示属性に書いた var() がエンジンで解決されないと、C が消えるか黒く塗られる。
// 描画された computed の stroke / fill を直接読んで確かめる。
const markPaint = (page: Page) =>
  page.evaluate(() => {
    const c = document.querySelector(".logo .mk-c");
    const dot = document.querySelector(".logo .mk-dot");
    return {
      stroke: c ? getComputedStyle(c).stroke : "",
      fill: dot ? getComputedStyle(dot).fill : "",
    };
  });

const RGB = /^rgb\(\d+, \d+, \d+\)$/;

test.describe("マークの描画", () => {
  test("ライトとダークの両方で C と点が色で塗られ、ダークは色が違う", async ({
    browser,
    licensePage,
    page,
  }) => {
    await licensePage.goto();
    const light = await markPaint(page);

    const darkContext = await browser.newContext({ colorScheme: "dark" });
    const darkPage = await darkContext.newPage();
    await darkPage.goto("/");
    const dark = await markPaint(darkPage);
    await darkContext.close();

    for (const paint of [light, dark]) {
      expect(paint.stroke).toMatch(RGB);
      expect(paint.fill).toMatch(RGB);
    }
    expect(dark.stroke).not.toBe(light.stroke);
    expect(dark.fill).not.toBe(light.fill);
  });
});
