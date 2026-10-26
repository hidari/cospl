import { expect, test } from "./fixtures";

test("フッターの関連リンクが決められた順で並ぶ", async ({ licensePage }) => {
  await licensePage.goto();
  await expect(licensePage.footerLinks).toHaveText([
    "本文 v2.0",
    "タグ仕様",
    "llms.txt",
    "リポジトリ",
    "Discussion",
    "X @Hidari0415",
  ]);
});

test("X のリンクは x.com の本人のページを指し、ロゴは読み上げに含まれない", async ({
  licensePage,
}) => {
  await licensePage.goto();
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
