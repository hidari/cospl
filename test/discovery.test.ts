import { describe, expect, test } from "vitest";
import { LINK_HEADER, prefersMarkdown, robotsTxt, sitemapXml } from "../src/discovery";

const ORIGIN = "https://cospl.org";

describe("robotsTxt", () => {
  test("全許可と sitemap 参照を含む", () => {
    const txt = robotsTxt(ORIGIN);
    expect(txt).toContain("User-agent: *");
    expect(txt).toContain("Allow: /");
    expect(txt).toContain("Sitemap: https://cospl.org/sitemap.xml");
  });
});

describe("sitemapXml", () => {
  test("urlset と正規 URL の loc を含む整形 XML", () => {
    const xml = sitemapXml(ORIGIN);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain("<loc>https://cospl.org/</loc>");
    expect(xml).toContain("<loc>https://cospl.org/llms.txt</loc>");
    expect(xml).toContain("<loc>https://cospl.org/license.md</loc>");
    expect(xml).toContain("</urlset>");
  });
});

describe("prefersMarkdown", () => {
  test("text/markdown を明示すると true", () => {
    expect(prefersMarkdown("text/markdown")).toBe(true);
  });
  test("q>0 付きでも true", () => {
    expect(prefersMarkdown("text/markdown;q=0.9")).toBe(true);
  });
  test("q=0 は false", () => {
    expect(prefersMarkdown("text/markdown;q=0")).toBe(false);
  });
  test("ブラウザの Accept は false", () => {
    expect(prefersMarkdown("text/html,application/xhtml+xml,*/*")).toBe(false);
  });
  test("null は false", () => {
    expect(prefersMarkdown(null)).toBe(false);
  });
  test("application/json は false", () => {
    expect(prefersMarkdown("application/json")).toBe(false);
  });
});

describe("LINK_HEADER", () => {
  test("alternate / sitemap / service-desc の3つを含む", () => {
    expect(LINK_HEADER).toContain('rel="alternate"');
    expect(LINK_HEADER).toContain('type="text/markdown"');
    expect(LINK_HEADER).toContain('rel="sitemap"');
    expect(LINK_HEADER).toContain('rel="service-desc"');
  });
});
