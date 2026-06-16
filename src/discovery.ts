// AI エージェント・クローラ向けの発見性リソースを生成・判定する純粋関数群。
// 副作用は持たず入出力は文字列/boolean のみ。ルーティングと I/O は src/worker.ts が担う。

// robots.txt（RFC 9309）。エージェントの取得を歓迎して全許可し、sitemap を参照する。
export function robotsTxt(origin: string): string {
  return [
    "# CosPL — AI agents and crawlers are welcome",
    "User-agent: *",
    "Allow: /",
    "",
    `Sitemap: ${origin}/sitemap.xml`,
    "",
  ].join("\n");
}

// sitemap.xml（sitemaps.org protocol 0.9）。正規 URL を列挙する。
export function sitemapXml(origin: string): string {
  const paths = ["/", "/llms.txt", "/license.md"];
  const urls = paths.map((path) => `  <url><loc>${origin}${path}</loc></url>`).join("\n");
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

// ホームページ応答に載せる Link ヘッダ（RFC 8288）。相対 URI は request URL に解決される。
export const LINK_HEADER =
  '</>; rel="alternate"; type="text/markdown", </sitemap.xml>; rel="sitemap", </llms.txt>; rel="service-desc"';
