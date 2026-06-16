import { describe, expect, test } from "vitest";
import {
  apiCatalogJson,
  LINK_HEADER,
  openApiJson,
  prefersMarkdown,
  robotsTxt,
  sitemapXml,
} from "../src/discovery";

const ORIGIN = "https://cospl.org";

describe("robotsTxt", () => {
  test("全許可と sitemap 参照を含む", () => {
    const txt = robotsTxt(ORIGIN);
    expect(txt).toContain("User-agent: *");
    expect(txt).toContain("Allow: /");
    expect(txt).toContain("Sitemap: https://cospl.org/sitemap.xml");
  });
  test("Content-Signal で CC0 に沿った許容方針を宣言する", () => {
    expect(robotsTxt(ORIGIN)).toContain("Content-Signal: ai-train=yes, search=yes, ai-input=yes");
  });
  test("主要 AI クローラの明示ブロックを含む", () => {
    const txt = robotsTxt(ORIGIN);
    expect(txt).toContain("User-agent: GPTBot");
    expect(txt).toContain("User-agent: Claude-Web");
    expect(txt).toContain("User-agent: Google-Extended");
  });
  test("名指しした各クローラのグループにも Content-Signal を複製する", () => {
    // RFC 9309 はクローラが最も具体的なグループ1つだけを使うため、wildcard だけでなく
    // 各 bot グループにも Content-Signal が無いと名指しクローラに方針が届かない。
    const txt = robotsTxt(ORIGIN);
    expect(txt).toContain(
      "User-agent: GPTBot\nAllow: /\nContent-Signal: ai-train=yes, search=yes, ai-input=yes",
    );
  });
});

describe("apiCatalogJson", () => {
  test("RFC 9264 linkset 形式で /license.md を広告する", () => {
    const parsed = JSON.parse(apiCatalogJson(ORIGIN));
    expect(parsed.linkset).toHaveLength(1);
    const entry = parsed.linkset[0];
    expect(entry.anchor).toBe("https://cospl.org/license.md");
    expect(entry["service-desc"][0].href).toBe("https://cospl.org/openapi.json");
    expect(entry["service-doc"][0].href).toBe("https://cospl.org/llms.txt");
  });
});

describe("openApiJson", () => {
  test("GET /license.md の OpenAPI 3.1 を返す", () => {
    const parsed = JSON.parse(openApiJson(ORIGIN));
    expect(parsed.openapi).toBe("3.1.0");
    expect(parsed.servers[0].url).toBe("https://cospl.org");
    const op = parsed.paths["/license.md"].get;
    const names = op.parameters.map((p: { name: string }) => p.name);
    expect(names).toEqual(["tags", "view", "format"]);
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
  test("origin の XML 特殊文字をエスケープする", () => {
    const xml = sitemapXml("https://example.com/a&b<c>");
    expect(xml).toContain("<loc>https://example.com/a&amp;b&lt;c&gt;/</loc>");
    expect(xml).not.toContain("a&b<c>");
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
  test("複数値 Accept に text/markdown が混在すれば true（curl/httpie パターン）", () => {
    expect(prefersMarkdown("text/html,*/*;q=0.1,text/markdown;q=0.5")).toBe(true);
  });
  test("先頭以外に text/markdown があっても true", () => {
    expect(prefersMarkdown("application/json, text/markdown;q=0.9")).toBe(true);
  });
});

describe("LINK_HEADER", () => {
  test("alternate / sitemap / service-desc / api-catalog を含む", () => {
    expect(LINK_HEADER).toContain('rel="alternate"');
    expect(LINK_HEADER).toContain('type="text/markdown"');
    expect(LINK_HEADER).toContain('rel="sitemap"');
    expect(LINK_HEADER).toContain('rel="service-desc"');
    expect(LINK_HEADER).toContain('rel="api-catalog"');
  });
});
