// AI エージェント・クローラ向けの発見性リソースを生成・判定する純粋関数群。
// 副作用は持たず入出力は文字列/boolean のみ。ルーティングと I/O は src/worker.ts が担う。

// 明示ブロックを置く主要 AI クローラ。CC0 サイトなので全て Allow: / にする。
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "Claude-Web",
  "ClaudeBot",
  "anthropic-ai",
  "Google-Extended",
  "Applebot-Extended",
  "Amazonbot",
  "Bytespider",
  "CCBot",
  "PerplexityBot",
];

// robots.txt（RFC 9309）。全許可に加え、Content Signals（draft-romm-aipref-contentsignals）で
// 利用方針を宣言し、主要 AI クローラを明示する。サイト本文は CC0 なので許容的に宣言する。
export function robotsTxt(origin: string): string {
  const botBlocks = AI_CRAWLERS.map((bot) => `User-agent: ${bot}\nAllow: /`).join("\n\n");
  return [
    "# CosPL — AI agents and crawlers are welcome",
    "# Site content is CC0 (public domain); all uses are permitted.",
    "User-agent: *",
    "Allow: /",
    "Content-Signal: ai-train=yes, search=yes, ai-input=yes",
    "",
    botBlocks,
    "",
    `Sitemap: ${origin}/sitemap.xml`,
    "",
  ].join("\n");
}

// XML 特殊文字（& < >）をエスケープする。loc に流す origin を防御的に処理する。
function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// sitemap.xml（sitemaps.org protocol 0.9）。正規 URL を列挙する。
export function sitemapXml(origin: string): string {
  const paths = ["/", "/llms.txt", "/license.md"];
  const safeOrigin = escapeXml(origin);
  const urls = paths.map((path) => `  <url><loc>${safeOrigin}${path}</loc></url>`).join("\n");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    "</urlset>",
    "",
  ].join("\n");
}

// Accept ヘッダが text/markdown を明示し、かつ q 値が 0 でないときだけ true。
// ブラウザの "text/html,*/*" や null は false（既定は HTML を維持する）。
export function prefersMarkdown(accept: string | null): boolean {
  if (accept === null) {
    return false;
  }
  return accept
    .split(",")
    .map((part) => part.trim())
    .some((mediaRange) => {
      const segments = mediaRange.split(";").map((s) => s.trim());
      const type = segments[0];
      if (type !== "text/markdown") {
        return false;
      }
      const q = segments.find((s) => s.startsWith("q="));
      return q === undefined || Number(q.slice(2)) > 0;
    });
}

// /.well-known/api-catalog（RFC 9727 / RFC 9264 linkset+json）。
// /license.md を発見可能な API として広告し、機械可読仕様（OpenAPI）と人間向けドキュメントを指す。
export function apiCatalogJson(origin: string): string {
  const catalog = {
    linkset: [
      {
        anchor: `${origin}/license.md`,
        "service-desc": [{ href: `${origin}/openapi.json`, type: "application/json" }],
        "service-doc": [{ href: `${origin}/llms.txt`, type: "text/markdown" }],
      },
    ],
  };
  return JSON.stringify(catalog, null, 2);
}

// /openapi.json（OpenAPI 3.1）。GET /license.md の機械可読仕様。
// パラメータ仕様は src/core.ts の parseTags / parseView / parseFormat と一致させる。
export function openApiJson(origin: string): string {
  const spec = {
    openapi: "3.1.0",
    info: {
      title: "CosPL License Document API",
      version: "1.0.0",
      description: "Read-only API that generates CosPL license documents from tags.",
    },
    servers: [{ url: origin }],
    paths: {
      "/license.md": {
        get: {
          summary: "Generate a CosPL license document",
          parameters: [
            {
              name: "tags",
              in: "query",
              required: false,
              description: "Hyphen-joined tag identifier. Use 'none' for an empty tag set.",
              schema: { type: "string", default: "BY-NC-NAI-TD" },
            },
            {
              name: "view",
              in: "query",
              required: false,
              description: "human (README for people) or ai (machine-readable declaration).",
              schema: { type: "string", enum: ["human", "ai"], default: "human" },
            },
            {
              name: "format",
              in: "query",
              required: false,
              description: "markdown or text. Ignored when view=ai.",
              schema: { type: "string", enum: ["markdown", "text"], default: "markdown" },
            },
          ],
          responses: {
            "200": {
              description: "Generated document.",
              content: {
                "text/markdown": { schema: { type: "string" } },
                "text/plain": { schema: { type: "string" } },
              },
            },
            "400": {
              description: "Unknown tag, or invalid view/format.",
              content: { "text/markdown": { schema: { type: "string" } } },
            },
          },
        },
      },
    },
  };
  return JSON.stringify(spec, null, 2);
}

// ホームページ応答に載せる Link ヘッダ（RFC 8288）。相対 URI は request URL に解決される。
export const LINK_HEADER =
  '</>; rel="alternate"; type="text/markdown", </sitemap.xml>; rel="sitemap", </llms.txt>; rel="service-desc", </.well-known/api-catalog>; rel="api-catalog"';
