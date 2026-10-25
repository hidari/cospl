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

test("撮影者名を入力→blur しても URL に載らず、クリアで欄が空になる", async ({
  licensePage,
  page,
}) => {
  await licensePage.goto();

  // 入力→blur（change）しても URL hash に個人情報は載らない。
  await licensePage.photographer.fill("テスト太郎");
  await licensePage.photographer.blur();
  await expect(page).not.toHaveURL(/photographer=/);

  // クリアで欄が空になり、フラッシュが出る。
  await licensePage.clearButton.click();
  await expect(licensePage.photographer).toHaveValue("");
  await expect(page).not.toHaveURL(/photographer=/);
  await expect(licensePage.flashStatus).toHaveText("クリアしました");
});

test("クリア後の日付欄は出力の最終更新日と一致する", async ({ licensePage }) => {
  await licensePage.goto();

  await licensePage.clearButton.click();
  const date = await licensePage.date.inputValue();
  expect(date).not.toBe("");
  await expect(licensePage.output).toContainText(`最終更新: ${date}`);
});

test("個人情報入りの古い URL を開くと欄に入らず URL からも消える", async ({
  licensePage,
  page,
}) => {
  await licensePage.goto("#tags=BY-NC&photographer=テスト太郎&contact=x");

  await expect(licensePage.photographer).toHaveValue("");
  await expect(page).not.toHaveURL(/photographer=|contact=/);
  await expect(licensePage.chip("BY")).toHaveAttribute("aria-pressed", "true");
  await expect(licensePage.chip("NC")).toHaveAttribute("aria-pressed", "true");
});
