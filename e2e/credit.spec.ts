import { expect, test } from "./fixtures.ts";

test("「方法は問わない」を選ぶと出力と URL に反映される", async ({ licensePage, page }) => {
  await licensePage.goto();

  await licensePage.creditAny.check();

  await expect(licensePage.output).toContainText("クレジットの方法は問いません");
  await expect(page).toHaveURL(/credit=any/);
  await expect(licensePage.endpoint).toContainText("credit=any");
});

test("BY を OFF にすると選択肢が隠れ URL から credit が消え、ON に戻すと選択が保持される", async ({
  licensePage,
  page,
}) => {
  await licensePage.goto("#tags=BY-NC&credit=any");
  await expect(licensePage.creditAny).toBeChecked();

  await licensePage.toggleTag("BY");
  await expect(licensePage.creditGroup).toBeHidden();
  await expect(page).not.toHaveURL(/credit=/);

  await licensePage.toggleTag("BY");
  await expect(licensePage.creditGroup).toBeVisible();
  await expect(licensePage.creditAny).toBeChecked();
  await expect(page).toHaveURL(/credit=any/);
});

test("キーボードの矢印でも選択を切り替えられる", async ({ licensePage }) => {
  await licensePage.goto();

  await licensePage.page.getByRole("radio", { name: "SNSの機能でメンション・タグ" }).focus();
  await licensePage.page.keyboard.press("ArrowDown");

  await expect(licensePage.creditAny).toBeChecked();
  await expect(licensePage.output).toContainText("クレジットの方法は問いません");
});
