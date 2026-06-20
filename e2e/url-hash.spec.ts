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
