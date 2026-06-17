import { describe, expect, test } from "vitest";
import worker, { DISCOVERY_ROUTES } from "../src/worker";
// workerd ランタイムでは node:fs が使えないため、Vite の ?raw で内容を埋め込んで検査する。
import wranglerToml from "../wrangler.toml?raw";

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

const call = (path: string, init?: RequestInit): Response | Promise<Response> =>
  worker.fetch(new Request(`https://cospl.org${path}`, init), env);

describe("GET /license.md", () => {
  test("tags 省略時は既定 BY-NC-NAI-TD の人間向けを 200 で返す", async () => {
    const res = await call("/license.md");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
    const body = await res.text();
    expect(body).toContain("# 撮影データの取り扱いについて");
    expect(body).toContain("CosPL 1.0 / BY-NC-NAI-TD");
  });

  test("tags を指定すると反映される", async () => {
    const res = await call("/license.md?tags=BY-NC");
    const body = await res.text();
    expect(body).toContain("CosPL 1.0 / BY-NC");
  });

  test("tags=none は空タグの識別子になる", async () => {
    const res = await call("/license.md?tags=none");
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("適用: CosPL 1.0 ／");
  });

  test("view=ai は AI 向け宣言を返す", async () => {
    const res = await call("/license.md?tags=BY&view=ai");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    const body = await res.text();
    expect(body).toContain("# CosPL License Declaration");
  });

  test("未知タグは 400 を返す", async () => {
    const res = await call("/license.md?tags=ZZZ");
    expect(res.status).toBe(400);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const body = await res.text();
    expect(body).toContain("error: unknown_tag");
  });

  test("不正な view は 400 を返す", async () => {
    const res = await call("/license.md?view=xml");
    expect(res.status).toBe(400);
    const body = await res.text();
    expect(body).toContain("error: invalid_view");
  });

  test("format=text はプレーンテキスト（text/plain・見出し記号なし）を返す", async () => {
    const res = await call("/license.md?format=text");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    const body = await res.text();
    // 見出し記号 # が外れている
    expect(body).not.toMatch(/^#/m);
    expect(body).toContain("撮影データの取り扱いについて");
  });

  test("不正な format は 400 を返す", async () => {
    const res = await call("/license.md?format=pdf");
    expect(res.status).toBe(400);
    const body = await res.text();
    expect(body).toContain("error: invalid_format");
  });

  test("view=ai は format=text を無視して text/markdown を返す", async () => {
    const res = await call("/license.md?view=ai&format=text");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    const body = await res.text();
    expect(body).toContain("# CosPL License Declaration");
  });
});

describe("非対応メソッド", () => {
  test("POST は 405 を返す", async () => {
    const res = await call("/license.md", { method: "POST" });
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
  });
});

describe("OPTIONS /license.md", () => {
  test("プリフライトに CORS ヘッダを返す", async () => {
    const res = await call("/license.md", { method: "OPTIONS" });
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toBe("GET, HEAD, OPTIONS");
    expect(res.headers.get("access-control-max-age")).toBe("86400");
  });
});

describe("その他のパス", () => {
  test("既知ルート以外は ASSETS へそのまま委譲する", async () => {
    const res = await call("/favicon.ico");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(assetBody);
  });
});

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
    expect(link).toContain('rel="api-catalog"');
  });
});

describe("GET /.well-known/api-catalog", () => {
  test("application/linkset+json で API カタログを返す", async () => {
    const res = await call("/.well-known/api-catalog");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/linkset+json");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const body = JSON.parse(await res.text());
    expect(body.linkset[0].anchor).toBe("https://cospl.org/license.md");
    expect(body.linkset[0]["service-desc"][0].href).toBe("https://cospl.org/openapi.json");
  });
});

describe("GET /openapi.json", () => {
  test("application/json で OpenAPI 3.1 を返す", async () => {
    const res = await call("/openapi.json");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json");
    const body = JSON.parse(await res.text());
    expect(body.openapi).toBe("3.1.0");
    expect(body.paths["/license.md"].get).toBeDefined();
  });
});

describe("DISCOVERY_ROUTES と wrangler.toml の整合", () => {
  // 発見性ルートを表へ追加して run_worker_first 登録を忘れる回帰を防ぐ。
  // 統合テストは worker.fetch を直接呼ぶため Cloudflare のアセットルーティング層を通らず、
  // この登録漏れを検出できない（CLAUDE.md MUST）。ここで表と設定の一致を静的に保証する。
  test("全 discovery ルートが run_worker_first に登録されている", () => {
    // 配列本体を取り出し、各要素を完全一致比較する（substring 照合だと "/api" が
    // "/api-catalog" に誤マッチしうるため、クォートを剥がした厳密一致にする）。
    const arrayBody = wranglerToml.match(/run_worker_first\s*=\s*\[(.*?)\]/s)?.[1] ?? "";
    const registered = arrayBody
      .split(",")
      .map((entry) => entry.trim().replace(/^"|"$/g, ""))
      .filter((entry) => entry.length > 0);
    for (const path of Object.keys(DISCOVERY_ROUTES)) {
      expect(registered).toContain(path);
    }
  });
});

describe("セキュリティヘッダ", () => {
  test("生成レスポンス（/license.md）に基本セキュリティヘッダを付与する", async () => {
    const res = await call("/license.md");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(res.headers.get("strict-transport-security")).toContain("max-age=");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
  });
  test("発見性レスポンス（/robots.txt）にも付与する", async () => {
    const res = await call("/robots.txt");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("strict-transport-security")).toContain("max-age=");
  });
  test("400 エラーレスポンスにも付与する", async () => {
    const res = await call("/license.md?tags=ZZZ");
    expect(res.status).toBe(400);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });
  test("HTML ホームには厳格な CSP を付与する（インライン無しなので 'self' で足りる）", async () => {
    const res = await call("/");
    const csp = res.headers.get("content-security-policy");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });
});

describe("HEAD リクエスト", () => {
  test("HEAD /license.md は 405 ではなく 200 をヘッダのみで返す", async () => {
    const res = await call("/license.md", { method: "HEAD" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(await res.text()).toBe("");
  });
  test("HEAD / は GET 同等のヘッダ（Link 含む）を返し本文は空", async () => {
    const res = await call("/", { method: "HEAD" });
    expect(res.status).toBe(200);
    expect(res.headers.get("link")).toContain('rel="api-catalog"');
    expect(await res.text()).toBe("");
  });
  test("HEAD /openapi.json も 200 を返す", async () => {
    const res = await call("/openapi.json", { method: "HEAD" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json");
  });
  test("POST /license.md は引き続き 405", async () => {
    const res = await call("/license.md", { method: "POST" });
    expect(res.status).toBe(405);
  });
});
