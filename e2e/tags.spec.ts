import { expect, test } from "./fixtures";

test("タグをトグルすると aria-pressed・識別子・出力・endpoint・URL hash が一斉更新される", async ({
  licensePage,
  page,
}) => {
  await licensePage.goto();

  // 既定 NC は押下状態。トグルで解除される。
  await expect(licensePage.chip("NC")).toHaveAttribute("aria-pressed", "true");
  await licensePage.toggleTag("NC");
  await expect(licensePage.chip("NC")).toHaveAttribute("aria-pressed", "false");

  // 識別子から NC が外れ BY-NAI-TD になる。
  await expect(licensePage.ident).toContainText("BY-NAI-TD");
  // README 本文の識別子も追従する。
  await expect(licensePage.output).toContainText("CosPL 1.0 / BY-NAI-TD");
  // Markdown エンドポイントの tags クエリも追従する。
  await expect(licensePage.endpoint).toHaveText("https://cospl.org/license.md?tags=BY-NAI-TD");
  // URL hash に反映される（tags=BY-NAI-TD を含む）。
  await expect(page).toHaveURL(/tags=BY-NAI-TD/);
});
