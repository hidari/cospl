import { expect, test } from "./fixtures";

test("外部サイトへのリンクはすべて別タブで開き、サイト内のリンクは同じタブで開く", async ({
  licensePage,
  page,
}) => {
  await licensePage.goto();
  const links = await page.locator("a[href]").evaluateAll((anchors) =>
    anchors.map((a) => ({
      href: a.getAttribute("href") ?? "",
      external: a instanceof HTMLAnchorElement && a.origin !== location.origin,
      target: a.getAttribute("target"),
      rel: a.getAttribute("rel"),
    })),
  );
  const external = links.filter((l) => l.external);
  const internal = links.filter((l) => !l.external);
  expect(external.length, "外部リンクが 1 件以上ある").toBeGreaterThan(0);
  expect(internal.length, "サイト内のリンクが 1 件以上ある").toBeGreaterThan(0);
  for (const l of external) {
    expect(l, l.href).toMatchObject({ target: "_blank", rel: "noopener" });
  }
  for (const l of internal) {
    expect(l.target, l.href).toBeNull();
  }
});
