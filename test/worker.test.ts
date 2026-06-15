import { describe, expect, test } from "vitest";
import worker from "../src/worker";

// ASSETS をスタブした Env。/license.md 以外の委譲を決定的に検証する。
const assetBody = "ASSET OK";
const env = {
  ASSETS: {
    fetch: async () => new Response(assetBody, { status: 200 }),
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
    expect(res.headers.get("allow")).toBe("GET, OPTIONS");
  });
});

describe("OPTIONS /license.md", () => {
  test("プリフライトに CORS ヘッダを返す", async () => {
    const res = await call("/license.md", { method: "OPTIONS" });
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toBe("GET, OPTIONS");
    expect(res.headers.get("access-control-max-age")).toBe("86400");
  });
});

describe("その他のパス", () => {
  test("/license.md 以外は ASSETS へ委譲する", async () => {
    const res = await call("/");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(assetBody);
  });
});
