import { expect, test } from "./fixtures";

test("トップが読め、既定の出力と識別子が描画される", async ({ licensePage }) => {
  await licensePage.goto();
  // 既定タグ BY-NC-NAI-TD（MR off）の識別子が出る。
  await expect(licensePage.ident).toContainText("BY-NC-NAI-TD");
  // README 本文が生成され空でない。
  await expect(licensePage.output).toContainText("撮影データの取り扱いについて");
});
