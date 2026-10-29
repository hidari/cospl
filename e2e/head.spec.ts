import { createHash } from "node:crypto";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.ts";

// ビルドが index.html に差し込んだ値（vite.config.ts）を、配信された応答だけから確かめる。
// ローカルの preview と本番（E2E_BASE_URL）の両方で走る。期待値を checkout から読まないのは、
// E2E (production) が main の先頭を checkout し、配信中のタグの中身と一致するとは限らないため。

// selector に当たる要素がちょうど 1 つあり、その属性の値を返す。
const only = async (page: Page, selector: string, attr: string): Promise<string> => {
  const el = page.locator(selector);
  await expect(el).toHaveCount(1);
  return (await el.getAttribute(attr)) ?? "";
};

const ogImageOf = async (page: Page): Promise<URL> =>
  new URL(await only(page, 'meta[property="og:image"]', "content"));

test("置き換え残しのトークンを配信しない", async ({ request }) => {
  const res = await request.get("/", { headers: { accept: "text/html" } });
  expect(res.status()).toBe(200);
  const body = await res.text();
  expect(body).toContain('<meta property="og:image"');
  expect(body).not.toMatch(/\{\{|\}\}|COSPL_|%[A-Z_]+%/);
});

test("og:image と twitter:image は同じ URL で、?v= は配信される画像の SHA-256 の先頭 8 文字", async ({
  page,
}) => {
  await page.goto("/");
  const ogImage = await ogImageOf(page);
  expect(await only(page, 'meta[name="twitter:image"]', "content")).toBe(ogImage.href);
  // クローラは og:image を絶対 URL のまま取りに行くので、サイトの正規の URL と同じオリジンを指す。
  const site = new URL(await only(page, 'meta[property="og:url"]', "content"));
  expect(ogImage.origin).toBe(site.origin);

  const version = ogImage.searchParams.get("v") ?? "";
  expect(version).toMatch(/^[0-9a-f]{8}$/);
  // 本番以外では og:image のオリジンが配信元と違うので、パスだけを配信元へ当てる。
  const res = await page.request.get(`${ogImage.pathname}${ogImage.search}`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("image/jpeg");
  const served = createHash("sha256")
    .update(await res.body())
    .digest("hex");
  expect(version).toBe(served.slice(0, 8));
});

test("og:image:width / height は配信される画像をデコードした寸法", async ({ page }) => {
  await page.goto("/");
  const ogImage = await ogImageOf(page);
  const declared = {
    width: Number(await only(page, 'meta[property="og:image:width"]', "content")),
    height: Number(await only(page, 'meta[property="og:image:height"]', "content")),
  };
  const decoded = await page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    return { width: img.naturalWidth, height: img.naturalHeight };
  }, `${ogImage.pathname}${ogImage.search}`);
  expect(decoded.width).toBeGreaterThan(0);
  expect(declared).toEqual(decoded);
});

// ロゴの SVG は width="100%" を持つので、naturalWidth ではなくルート要素の viewBox から寸法を読む。
test("ロゴの img の width / height は配信される SVG の viewBox を四捨五入した値", async ({
  page,
}) => {
  await page.goto("/");
  const logo = 'img[src="/icons/logo-light.svg"]';
  const declared = {
    width: await only(page, logo, "width"),
    height: await only(page, logo, "height"),
  };
  const res = await page.request.get("/icons/logo-light.svg");
  expect(res.status()).toBe(200);
  const viewBox = (await res.text()).match(/<svg\b[^>]*\sviewBox="([^"]+)"/)?.[1] ?? "";
  const [, , width, height] = viewBox
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  expect(declared).toEqual({
    width: String(Math.round(width ?? Number.NaN)),
    height: String(Math.round(height ?? Number.NaN)),
  });
});
