import { expect, test } from "./fixtures";

// SW のオフライン検証は Chromium のみ安定（WebKit/Firefox は Playwright の SW/offline 対応が限定的）。
test.skip(({ browserName }) => browserName !== "chromium", "SW オフライン検証は Chromium のみ安定");

test("SW 登録後はオフラインでもライセンスが生成・描画される", async ({
  licensePage,
  page,
  context,
}) => {
  await licensePage.goto();
  // SW が有効化し現在のクライアントを制御するまで待つ（clients.claim 後に controller が入る）。
  // ready は ServiceWorkerRegistration を解決するが非シリアライズ値のため evaluate からは返さない。
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  // オフラインにしてリロード: network-first が失敗しキャッシュ shell から復帰する。
  await context.setOffline(true);
  await page.reload();
  await expect(licensePage.output).toContainText("撮影データの取り扱いについて");
  await context.setOffline(false);
});
