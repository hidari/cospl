import { expect, test } from "./fixtures";

test("hash 付きでロードするとタグ状態が復元される", async ({ licensePage }) => {
  // BY と NC のみ ON の hash でロードする。
  await licensePage.goto("#tags=BY-NC");

  await expect(licensePage.chip("BY")).toHaveAttribute("aria-pressed", "true");
  await expect(licensePage.chip("NC")).toHaveAttribute("aria-pressed", "true");
  // hash に無いタグは OFF で復元される。
  await expect(licensePage.chip("NAI")).toHaveAttribute("aria-pressed", "false");
  await expect(licensePage.chip("TD")).toHaveAttribute("aria-pressed", "false");
  await expect(licensePage.chip("MR")).toHaveAttribute("aria-pressed", "false");
  // 識別子も復元値に一致。
  await expect(licensePage.ident).toContainText("BY-NC");
});

test("撮影者名を入力→blur で URL に載り、クリアで欄も URL も PII が消える", async ({
  licensePage,
  page,
}) => {
  await licensePage.goto();
  await licensePage.openFillSection();

  // 入力→blur（change）で URL hash に photographer が載る（入力中は載らない設計）。
  await licensePage.photographer.fill("テスト太郎");
  await licensePage.photographer.blur();
  await expect(page).toHaveURL(/photographer=/);

  // クリアで欄が空になり、URL hash から PII が消え、フラッシュが出る。
  await licensePage.clearButton.click();
  await expect(licensePage.photographer).toHaveValue("");
  await expect(page).not.toHaveURL(/photographer=/);
  await expect(licensePage.flashStatus).toHaveText("クリアしました");
});
