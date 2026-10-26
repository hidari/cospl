import { expect, test } from "./fixtures";

test("フッターの関連リンクが決められた順で並ぶ", async ({ licensePage }) => {
  await licensePage.goto();
  await expect(licensePage.footerLinks).toHaveText([
    "本文 v2.0",
    "タグ仕様",
    "llms.txt",
    "リポジトリ",
    "Discussion",
    "謝辞",
  ]);
});

test("謝辞は自己ホストしているフォントのライセンス文を指し、その文書が配信されている", async ({
  licensePage,
  page,
}) => {
  await licensePage.goto();
  const thanks = licensePage.footerLinks.last();
  await expect(thanks).toHaveAttribute("href", "/fonts/OFL.txt");
  const res = await page.request.get("/fonts/OFL.txt");
  expect(res.status()).toBe(200);
  expect(await res.text()).toContain("SIL Open Font License");
});

test("著作権表記の名前から閉じ括弧までが x.com の本人のページを指し、ロゴは読み上げに含まれない", async ({
  licensePage,
}) => {
  await licensePage.goto();
  await expect(licensePage.footerCopyright).toHaveText("© 2026 Hidari (@Hidari0415)");
  await expect(licensePage.footerX).toHaveText("Hidari (@Hidari0415)");
  await expect(licensePage.footerX).toHaveAttribute("href", "https://x.com/Hidari0415");
  await expect(licensePage.footerX).toHaveAttribute("rel", "noopener");
  await expect(licensePage.footerX.locator("svg")).toHaveAttribute("aria-hidden", "true");
});

test("著作権表記が関連リンクの下に見える", async ({ licensePage }) => {
  await licensePage.goto();
  await expect(licensePage.footerCopyright).toBeVisible();
  const nav = await licensePage.footerLinks.last().boundingBox();
  const text = await licensePage.footerCopyright.boundingBox();
  expect(nav, "最後のリンクの位置が取れる").not.toBeNull();
  expect(text, "著作権表記の位置が取れる").not.toBeNull();
  expect(text?.y).toBeGreaterThan((nav?.y ?? Infinity) + (nav?.height ?? Infinity));
});
