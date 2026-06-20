import { expect, test } from "./fixtures";

test("AI タブに切替えると aria-selected が移り、出力が AI 宣言・endpoint に view=ai が付く", async ({
  licensePage,
}) => {
  await licensePage.goto();

  // 既定は README タブが選択。
  await expect(licensePage.humanTab).toHaveAttribute("aria-selected", "true");
  await expect(licensePage.aiTab).toHaveAttribute("aria-selected", "false");

  await licensePage.selectAiView();

  // 選択が AI へ移る。
  await expect(licensePage.aiTab).toHaveAttribute("aria-selected", "true");
  await expect(licensePage.humanTab).toHaveAttribute("aria-selected", "false");
  // 出力が AI 宣言の見出しに変わる。
  await expect(licensePage.output).toContainText("# CosPL License Declaration");
  // エンドポイントに view=ai が付く。
  await expect(licensePage.endpoint).toHaveText(
    "https://cospl.org/license.md?tags=BY-NC-NAI-TD&view=ai",
  );
});
