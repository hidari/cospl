import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.ts";

const logo = (page: Page) => page.getByRole("img", { name: "CosPL" });

// 表示中の画像（picture が選んだ方）と、それが読み込めて描かれたかを読む。
// 切り替えの途中は currentSrc が空になるので、そのときは空のまま返して poll に待たせる。
const shown = (page: Page) =>
  logo(page).evaluate((img: HTMLImageElement) => ({
    src: img.currentSrc === "" ? "" : new URL(img.currentSrc).pathname,
    loaded: img.complete && img.naturalWidth > 0,
  }));

test("ヘッダーのロゴが名前「CosPL」の画像として見え、高さが決まっている", async ({
  licensePage,
  page,
}) => {
  await licensePage.goto();
  await expect(logo(page)).toBeVisible();
  const box = await logo(page).boundingBox();
  expect(box?.height).toBeGreaterThan(20);
  // 幅は画像の縦横比で決まる（width / height 属性の比と同じ）。
  const ratio = await logo(page).evaluate(
    (img: HTMLImageElement) =>
      Number(img.getAttribute("width")) / Number(img.getAttribute("height")),
  );
  expect((box?.width ?? 0) / (box?.height ?? 1)).toBeCloseTo(ratio, 1);
});

test("ライトではライト版、ダークではダーク版のロゴが読み込まれて表示される", async ({
  licensePage,
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await licensePage.goto();
  await expect.poll(() => shown(page)).toEqual({ src: "/icons/logo-light.svg", loaded: true });

  await page.emulateMedia({ colorScheme: "dark" });
  await expect.poll(() => shown(page)).toEqual({ src: "/icons/logo-dark.svg", loaded: true });
});
