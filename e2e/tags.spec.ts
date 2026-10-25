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
  await expect(licensePage.output).toContainText("CosPL 2.0 / BY-NAI-TD");
  // Markdown エンドポイントの tags クエリも追従する。
  await expect(licensePage.endpoint).toHaveText("https://cospl.org/license.md?tags=BY-NAI-TD");
  // URL hash に反映される（tags=BY-NAI-TD を含む）。
  await expect(page).toHaveURL(/tags=BY-NAI-TD/);
});

test("ND と SB を ON にすると定義順で識別子に並び、README に反映される", async ({
  licensePage,
  page,
}) => {
  await licensePage.goto();

  await licensePage.toggleTag("SB");
  await licensePage.toggleTag("ND");

  await expect(licensePage.ident).toContainText("BY-NC-ND-NAI-TD-SB");
  await expect(licensePage.output).toContainText("CosPL 2.0 / BY-NC-ND-NAI-TD-SB");
  await expect(licensePage.output).toContainText("写真の加工（トリミング・リサイズを除く）");
  await expect(licensePage.output).toContainText("## データバックについて");
  await expect(page).toHaveURL(/tags=BY-NC-ND-NAI-TD-SB/);
});
