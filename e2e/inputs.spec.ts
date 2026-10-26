import type { Page } from "@playwright/test";
import { MAX_EXTENSIONS } from "../src/core";
import { expect, test } from "./fixtures";

test("入力欄は既定で閉じていて、見出しを押すと開く", async ({ licensePage }) => {
  await licensePage.goto();
  await expect(licensePage.photographer).toBeHidden();

  await licensePage.inputsSummary.click();

  await expect(licensePage.photographer).toBeVisible();
});

test("ひな形「加工」で拡張が足され、出力と識別子に出て、削除で両方消える", async ({
  licensePage,
}) => {
  await licensePage.goto();
  await licensePage.openInputs();
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
  await licensePage.openInputs();

  await licensePage.extensionAdd.click();
  await expect(licensePage.extensionHeading(1)).toBeFocused();

  await licensePage.extensionHeading(1).fill("その他");
  await licensePage.extensionBody(1).fill("一つ目\n二つ目");

  await expect(licensePage.output).toContainText("### その他\n- 一つ目\n- 二つ目");
});

test("入力中の欄は他の欄の入力で作り直されずフォーカスを保つ", async ({ licensePage }) => {
  await licensePage.goto();
  await licensePage.openInputs();
  await licensePage.extensionAdd.click();

  await licensePage.extensionHeading(1).pressSequentially("その他");

  await expect(licensePage.extensionHeading(1)).toBeFocused();
  await expect(licensePage.extensionHeading(1)).toHaveValue("その他");
});

test("削除ボタンの名前は入力した見出しに追従する", async ({ licensePage }) => {
  await licensePage.goto();
  await licensePage.openInputs();
  await licensePage.extensionAdd.click();
  await licensePage.extensionHeading(1).fill("その他");

  await expect(licensePage.deleteButton("その他")).toBeVisible();
});

test("上限の件数に達すると追加ボタンが無効になる", async ({ licensePage }) => {
  await licensePage.goto();
  await licensePage.openInputs();
  for (let i = 0; i < MAX_EXTENSIONS; i++) {
    await licensePage.extensionAdd.click();
  }

  await expect(licensePage.extensionAdd).toBeDisabled();
  await expect(licensePage.preset("editing")).toBeDisabled();
});

test("連絡先を 2 行入力すると、出力の連絡先に 2 件の箇条書きが出る", async ({ licensePage }) => {
  await licensePage.goto();
  await licensePage.openInputs();

  await licensePage.contacts.fill("@example_a\n@example_b");

  await expect(licensePage.output).toContainText("## 連絡先\n- @example_a\n- @example_b");
});

test("データバックを ON にすると詳細欄が現れ、入力が出力に出る。OFF で隠れて出力から消える", async ({
  licensePage,
}) => {
  await licensePage.goto();
  await licensePage.openInputs();
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
  await licensePage.openInputs();
  await licensePage.selectAiView();

  await expect(licensePage.photographer).toBeVisible();
  await licensePage.preset("editing").click();
  await expect(licensePage.ident).toContainText("+");
});

test("どの入力をしても URL はタグとクレジット以外を含まない", async ({ licensePage, page }) => {
  await licensePage.goto();
  await licensePage.openInputs();
  await licensePage.toggleTag("SB");

  await licensePage.photographer.fill("テスト太郎");
  await licensePage.contacts.fill("@example_a\n@example_b");
  await licensePage.preset("editing").click();
  await licensePage.extensionAdd.click();
  await licensePage.sendBack.fill("返送メモ");
  await licensePage.deleteButton("加工").click();

  const hash = new URL(page.url()).hash;
  expect(hash).toMatch(/^#tags=[A-Z-]+(&credit=\w+)?$/);
});

test("クリアで連絡先の欄と拡張の追加欄も消え、各欄が状態から戻る", async ({ licensePage }) => {
  await licensePage.goto();
  await licensePage.openInputs();
  await licensePage.photographer.fill("テスト太郎");
  await licensePage.contacts.fill("@example_a\n@example_b");
  await licensePage.preset("editing").click();

  await licensePage.clearButton.click();

  await expect(licensePage.photographer).toHaveValue("");
  await expect(licensePage.contacts).toHaveValue("");
  await expect(licensePage.extensionHeading(1)).toHaveCount(0);
  await expect(licensePage.output).not.toContainText("### 加工");
  await expect(licensePage.ident).not.toContainText("+");
});

test("データの内容物を書くと冒頭の章に本README文書が先頭で出て、識別子に「 +」は付かない", async ({
  licensePage,
}) => {
  await licensePage.goto();
  await licensePage.openInputs();
  await licensePage.contents.fill("現像済みデータ\nRAWはご相談ください");

  await expect(licensePage.output).toContainText(
    "## データの内容物\n- 本README文書\n- 現像済みデータ\n- RAWはご相談ください",
  );
  await expect(licensePage.ident).not.toContainText("+");
});

// CSS Modules が keyframes 名と animation の参照を別名にしてしまうと、ソースの検査が緑でも動かない。
// 実際に解決された名前で、開いた中身にアニメーションが付き、reduced-motion では付かないことを見る。
const revealAnimationName = (page: Page) =>
  page
    .locator("#inputs > :not(summary)")
    .first()
    .evaluate((el) => getComputedStyle(el).animationName);

test("任意入力を開くと中身にアニメーションが付き、reduced-motion では付かない", async ({
  licensePage,
  page,
}) => {
  await licensePage.goto();
  await licensePage.openInputs();
  expect(await revealAnimationName(page)).not.toBe("none");

  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await revealAnimationName(page)).toBe("none");
});
