# AI Readable 機能（エージェント発見性）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI エージェント・クローラがサイトを機械的に発見・取得できるよう、robots.txt / sitemap.xml / Link ヘッダ / Markdown コンテントネゴシエーションの4機能を Cloudflare Worker に追加する。

**Architecture:** 純粋な生成・判定ロジックを新モジュール `src/discovery.ts` に切り出し、`src/worker.ts` がルーティングと ASSETS 連携で配線する。robots.txt / sitemap.xml は origin をリクエストから取得して Worker 生成し、ドメインのハードコードを避ける。Markdown 応答は既存 `/llms.txt` を単一ソースとして再利用する。

**Tech Stack:** TypeScript / Cloudflare Workers / Vite / vitest + @cloudflare/vitest-pool-workers / Biome。規約: any・try-catch 禁止、純粋関数優先、テストは仕様。

設計の根拠は `docs/superpowers/specs/2026-06-16-agent-discovery-design.md` を参照。

---

## File Structure

- Create: `src/discovery.ts` — 発見性リソースの純粋関数（`robotsTxt` / `sitemapXml` / `prefersMarkdown` / `LINK_HEADER`）。副作用なし。
- Create: `test/discovery.test.ts` — 上記純粋関数のユニットテスト（仕様）。
- Modify: `src/worker.ts` — 新ルート（`/robots.txt` / `/sitemap.xml` / `/` の Markdown ネゴシエーション・Link ヘッダ）を配線。
- Modify: `test/worker.test.ts` — ASSETS スタブをパス別応答に強化し、新ルートの統合テストを追加。

---

## Task 1: 発見性リソースの純粋関数（src/discovery.ts）

**Files:**
- Create: `src/discovery.ts`
- Test: `test/discovery.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`test/discovery.test.ts` を新規作成:

```ts
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
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pkf run test`
Expected: FAIL（`src/discovery` が存在しない / import 解決エラー）

- [ ] **Step 3: 最小実装を書く**

`src/discovery.ts` を新規作成:

```ts
// AI エージェント・クローラ向けの発見性リソースを生成・判定する純粋関数群。
// 副作用は持たず入出力は文字列/boolean のみ。ルーティングと I/O は src/worker.ts が担う。

// robots.txt（RFC 9309）。エージェントの取得を歓迎して全許可し、sitemap を参照する。
export function robotsTxt(origin: string): string {
  return [
    "# CosPL — AI エージェント・クローラを歓迎します",
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
```

- [ ] **Step 4: テストが通ることを確認**

Run: `pkf run test`
Expected: PASS（discovery の全ケース緑。worker の既存テストも緑のまま）

- [ ] **Step 5: コミット**

```bash
git add src/discovery.ts test/discovery.test.ts
git commit -m "feat: エージェント発見性リソースの純粋関数を追加

robots.txt / sitemap.xml / Accept ネゴシエーション判定 / Link ヘッダを
副作用のない純粋関数として src/discovery.ts に実装。"
```

---

## Task 2: Worker への配線（src/worker.ts）

**Files:**
- Modify: `src/worker.ts`
- Test: `test/worker.test.ts`

- [ ] **Step 1: 失敗するテストを書く（ASSETS スタブ強化＋新ケース）**

`test/worker.test.ts` の冒頭スタブ定義を、固定応答からパス別応答に差し替える。
現状の以下のブロック:

```ts
// ASSETS をスタブした Env。/license.md 以外の委譲を決定的に検証する。
const assetBody = "ASSET OK";
const env = {
  ASSETS: {
    fetch: async () => new Response(assetBody, { status: 200 }),
  },
} as unknown as Env;
```

を次に置き換える:

```ts
// ASSETS をスタブした Env。パス別に応答を返し、Worker の配線を決定的に検証する。
const assetBody = "ASSET OK";
const llmsBody = "# CosPL\n\nstub llms markdown";
const htmlBody = "<!doctype html><title>CosPL</title>";
const env = {
  ASSETS: {
    fetch: async (req: Request) => {
      const { pathname } = new URL(req.url);
      if (pathname === "/llms.txt") {
        return new Response(llmsBody, {
          status: 200,
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
      }
      if (pathname === "/") {
        return new Response(htmlBody, {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      return new Response(assetBody, { status: 200 });
    },
  },
} as unknown as Env;
```

次に、既存の `describe("その他のパス", ...)` ブロックを、純粋委譲を別パスで検証する形に置き換える:

```ts
describe("その他のパス", () => {
  test("既知ルート以外は ASSETS へそのまま委譲する", async () => {
    const res = await call("/favicon.ico");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(assetBody);
  });
});
```

さらにファイル末尾（最後の `});` の後）に新ルートの統合テストを追加:

```ts
describe("GET /robots.txt", () => {
  test("text/plain で sitemap を参照する robots を返す", async () => {
    const res = await call("/robots.txt");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const body = await res.text();
    expect(body).toContain("User-agent: *");
    expect(body).toContain("Sitemap: https://cospl.org/sitemap.xml");
  });
});

describe("GET /sitemap.xml", () => {
  test("application/xml で正規 URL を列挙する", async () => {
    const res = await call("/sitemap.xml");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/xml; charset=utf-8");
    const body = await res.text();
    expect(body).toContain("<urlset");
    expect(body).toContain("<loc>https://cospl.org/</loc>");
    expect(body).toContain("<loc>https://cospl.org/llms.txt</loc>");
  });
});

describe("GET / の Accept ネゴシエーション", () => {
  test("Accept: text/markdown は llms.txt を Markdown で返す", async () => {
    const res = await call("/", { headers: { accept: "text/markdown" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(await res.text()).toBe(llmsBody);
  });

  test("通常の Accept は HTML に Link ヘッダを付けて返す", async () => {
    const res = await call("/", { headers: { accept: "text/html,*/*" } });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(htmlBody);
    const link = res.headers.get("link");
    expect(link).toContain('rel="alternate"');
    expect(link).toContain('rel="sitemap"');
    expect(link).toContain('rel="service-desc"');
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pkf run test`
Expected: FAIL（`/robots.txt`・`/sitemap.xml`・Markdown ネゴシエーション・Link ヘッダがまだ未配線）

- [ ] **Step 3: worker.ts に配線を実装**

`src/worker.ts` の import に discovery を追加（既存 import 群の下に）:

```ts
import { LINK_HEADER, prefersMarkdown, robotsTxt, sitemapXml } from "./discovery";
```

`LICENSE_PATH` 定数の下にパス定数を追加:

```ts
const ROBOTS_PATH = "/robots.txt";
const SITEMAP_PATH = "/sitemap.xml";
const HOME_PATH = "/";
const LLMS_PATH = "/llms.txt";
```

`methodNotAllowedResponse()` の下（`export default` の直前）に応答ヘルパーを追加:

```ts
// robots.txt（200・text/plain）。origin はリクエストから取得する。
function robotsResponse(origin: string): Response {
  return new Response(robotsTxt(origin), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      [CORS_ORIGIN]: "*",
      "cache-control": "public, max-age=300",
    },
  });
}

// sitemap.xml（200・application/xml）
function sitemapResponse(origin: string): Response {
  return new Response(sitemapXml(origin), {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      [CORS_ORIGIN]: "*",
      "cache-control": "public, max-age=300",
    },
  });
}

// Accept: text/markdown のとき /llms.txt を Markdown として返す。
// ASSETS が ok でなければその応答をそのまま返し、嘘の Content-Type を付けない。
async function markdownHomeResponse(request: Request, env: Env): Promise<Response> {
  const llmsUrl = new URL(LLMS_PATH, request.url);
  const res = await env.ASSETS.fetch(new Request(llmsUrl, request));
  if (!res.ok) {
    return res;
  }
  return new Response(res.body, {
    status: res.status,
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      [CORS_ORIGIN]: "*",
      "cache-control": "public, max-age=300",
    },
  });
}

// ホームページの HTML 応答に Link ヘッダを付与する（既存ヘッダ非破壊）。
async function htmlHomeResponse(request: Request, env: Env): Promise<Response> {
  const res = await env.ASSETS.fetch(request);
  const headers = new Headers(res.headers);
  headers.set("link", LINK_HEADER);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}
```

`export default` の `fetch` を次の形に置き換える:

```ts
export default {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === LICENSE_PATH) {
      if (request.method === "OPTIONS") {
        return preflightResponse();
      }
      if (request.method !== "GET") {
        return methodNotAllowedResponse();
      }
      return matchResult(parseLicenseRequest(url), {
        success: licenseResponse,
        error: errorResponse,
      });
    }

    if (request.method === "GET") {
      if (url.pathname === ROBOTS_PATH) {
        return robotsResponse(url.origin);
      }
      if (url.pathname === SITEMAP_PATH) {
        return sitemapResponse(url.origin);
      }
      if (url.pathname === HOME_PATH) {
        return prefersMarkdown(request.headers.get("accept"))
          ? markdownHomeResponse(request, env)
          : htmlHomeResponse(request, env);
      }
    }

    // 上記以外・非 GET は静的アセットへ委譲
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
```

- [ ] **Step 4: テストが通ることを確認**

Run: `pkf run test`
Expected: PASS（discovery / worker の全ケース緑。既存 `/license.md` 系も緑のまま）

- [ ] **Step 5: コミット**

```bash
git add src/worker.ts test/worker.test.ts
git commit -m "feat: robots.txt / sitemap.xml / Markdown ネゴシエーション / Link ヘッダを配線

Worker が /robots.txt と /sitemap.xml を origin から生成し、ホームページは
Accept: text/markdown で llms.txt を Markdown 配信、通常応答に Link ヘッダを付与する。"
```

---

## Task 3: 最終検証と PR

**Files:** なし（検証のみ）

- [ ] **Step 1: Lint と型チェックで警告0を確認**

Run: `pkf run lint`
Expected: `No fixes applied.` / エラー・警告0

Run: `pkf run check`
Expected: 型チェック含め全緑・警告0

- [ ] **Step 2: 全テスト緑を確認**

Run: `pkf run test`
Expected: discovery / worker / core / types すべて PASS

- [ ] **Step 3: pre-merge-quality-gate を通して PR 作成**

pre-merge-quality-gate スキル（simplify / feature-dev:code-reviewer / boy-scout-sweep / e2e-scenario-impact-check）を実行し、指摘を fix。
その後 push し、`gh pr create --assignee @me --base main --fill` で PR を作成する。

---

## Self-Review

- 仕様カバレッジ: robots.txt（Task1/2）、sitemap.xml（Task1/2）、Link ヘッダ（Task1 LINK_HEADER / Task2 htmlHomeResponse）、Markdown ネゴシエーション（Task1 prefersMarkdown / Task2 markdownHomeResponse）— spec の4機能すべてにタスクが対応。DNS-AID と x-markdown-tokens はスコープ外で意図的に未実装。
- 型整合: `robotsTxt(origin)` / `sitemapXml(origin)` / `prefersMarkdown(accept)` / `LINK_HEADER` の名前と引数が Task1 定義と Task2 利用で一致。`markdownHomeResponse` / `htmlHomeResponse` / `robotsResponse` / `sitemapResponse` のシグネチャも fetch 内の呼び出しと一致。
- プレースホルダなし: 全ステップに実コードと実コマンド・期待出力を記載。
