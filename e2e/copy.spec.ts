import { expect, test } from "./fixtures";

test("コピーを押すと aria-live のフラッシュに『コピーしました』が出る", async ({ licensePage }) => {
  await licensePage.goto();
  await licensePage.copyButton.click();
  // フラッシュは 1400ms で復帰するが、assertion は即時ポーリングで一致を捉える。
  await expect(licensePage.flashStatus).toHaveText("コピーしました");
});
