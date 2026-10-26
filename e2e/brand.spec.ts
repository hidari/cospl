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
