import { MAX_EXTENSIONS } from "../src/core";
import { expect, test } from "./fixtures";

test("ひな形「加工」で拡張が足され、出力と識別子に出て、削除で両方消える", async ({
  licensePage,
}) => {
  await licensePage.goto();
  await expect(licensePage.ident).not.toContainText("+");

  await licensePage.preset("editing").click();

  await expect(licensePage.extensionHeading(1)).toHaveValue("加工");
  await expect(licensePage.output).toContainText("### 加工");
  await expect(licensePage.ident).toContainText("+");

  await licensePage.deleteButton("加工").click();

  await expect(licensePage.extensionHeading(1)).toHaveCount(0);
  await expect(licensePage.output).not.toContainText("### 加工");
  await expect(licensePage.ident).not.toContainText("+");
});

test("「＋ 項目を追加」で白紙の拡張が足され、見出し欄にフォーカスが移る", async ({
  licensePage,
}) => {
  await licensePage.goto();

  await licensePage.extensionAdd.click();
  await expect(licensePage.extensionHeading(1)).toBeFocused();

  await licensePage.extensionHeading(1).fill("その他");
  await licensePage.extensionBody(1).fill("一つ目\n二つ目");

  await expect(licensePage.output).toContainText("### その他\n- 一つ目\n- 二つ目");
});

test("入力中の欄は他の欄の入力で作り直されずフォーカスを保つ", async ({ licensePage }) => {
  await licensePage.goto();
  await licensePage.extensionAdd.click();

  await licensePage.extensionHeading(1).pressSequentially("その他");

  await expect(licensePage.extensionHeading(1)).toBeFocused();
  await expect(licensePage.extensionHeading(1)).toHaveValue("その他");
});

test("削除ボタンの名前は入力した見出しに追従する", async ({ licensePage }) => {
  await licensePage.goto();
  await licensePage.extensionAdd.click();
  await licensePage.extensionHeading(1).fill("その他");

  await expect(licensePage.deleteButton("その他")).toBeVisible();
});

test("上限の件数に達すると追加ボタンが無効になる", async ({ licensePage }) => {
  await licensePage.goto();
  for (let i = 0; i < MAX_EXTENSIONS; i++) {
    await licensePage.extensionAdd.click();
  }

  await expect(licensePage.extensionAdd).toBeDisabled();
  await expect(licensePage.preset("editing")).toBeDisabled();
});

test("「＋ 連絡先を追加」で 2 件入れると連絡先の章に 2 行出る", async ({ licensePage }) => {
  await licensePage.goto();

  await licensePage.contactInput(1).fill("@example_a");
  await licensePage.contactAdd.click();
  await expect(licensePage.contactInput(2)).toBeFocused();
  await licensePage.contactInput(2).fill("@example_b");

  await expect(licensePage.output).toContainText("## 連絡先\n- @example_a\n- @example_b");
});

test("連絡先を削除すると出力から消える。残り 1 行のときは削除できない", async ({ licensePage }) => {
  await licensePage.goto();
  await licensePage.contactInput(1).fill("@example_a");
  await licensePage.contactAdd.click();
  await licensePage.contactInput(2).fill("@example_b");

  await licensePage.deleteButton("連絡先 1").click();

  await expect(licensePage.output).not.toContainText("@example_a");
  await expect(licensePage.output).toContainText("- @example_b");
  await expect(licensePage.contactInput(1)).toHaveValue("@example_b");
  await expect(licensePage.deleteButton("連絡先 1")).toHaveCount(0);
});

test("データバックを ON にすると詳細欄が現れ、入力が出力に出る。OFF で隠れて出力から消える", async ({
  licensePage,
}) => {
  await licensePage.goto();
  await expect(licensePage.sendBack).toBeHidden();

  await licensePage.toggleTag("SB");
  await expect(licensePage.sendBack).toBeVisible();
  await licensePage.sendBack.fill("RAW は不要です\nSNS 用に 3 枚");
  await expect(licensePage.output).toContainText("- RAW は不要です\n- SNS 用に 3 枚");

  await licensePage.toggleTag("SB");
  await expect(licensePage.sendBack).toBeHidden();
  await expect(licensePage.output).not.toContainText("RAW は不要です");

  // OFF にしても入力値は保持され、ON に戻すと出力へ戻る。
  await licensePage.toggleTag("SB");
  await expect(licensePage.sendBack).toHaveValue("RAW は不要です\nSNS 用に 3 枚");
  await expect(licensePage.output).toContainText("- RAW は不要です");
});

test("AI 宣言のタブでも入力欄は見え、識別子の印が出る", async ({ licensePage }) => {
  await licensePage.goto();
  await licensePage.selectAiView();

  await expect(licensePage.photographer).toBeVisible();
  await licensePage.preset("contents").click();
  await expect(licensePage.ident).toContainText("+");
});

test("どの入力をしても URL はタグとクレジット以外を含まない", async ({ licensePage, page }) => {
  await licensePage.goto();
  await licensePage.toggleTag("SB");

  await licensePage.photographer.fill("テスト太郎");
  await licensePage.date.fill("2026-01-02");
  await licensePage.contactInput(1).fill("@example_a");
  await licensePage.contactAdd.click();
  await licensePage.preset("editing").click();
  await licensePage.extensionAdd.click();
  await licensePage.sendBack.fill("返送メモ");
  await licensePage.deleteButton("加工").click();

  const hash = new URL(page.url()).hash;
  expect(hash).toMatch(/^#tags=[A-Z-]+(&credit=\w+)?$/);
});

test("クリアで連絡先と拡張の追加欄も消え、各欄が状態から戻る", async ({ licensePage }) => {
  await licensePage.goto();
  await licensePage.photographer.fill("テスト太郎");
  await licensePage.contactInput(1).fill("@example_a");
  await licensePage.contactAdd.click();
  await licensePage.preset("editing").click();

  await licensePage.clearButton.click();

  await expect(licensePage.photographer).toHaveValue("");
  await expect(licensePage.contactInput(1)).toHaveValue("");
  await expect(licensePage.contactInput(2)).toHaveCount(0);
  await expect(licensePage.extensionHeading(1)).toHaveCount(0);
  await expect(licensePage.output).not.toContainText("### 加工");
  await expect(licensePage.ident).not.toContainText("+");
});
