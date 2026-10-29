import { describe, expect, test } from "vitest";
import {
  chooseStrategy,
  isStablePrecache,
  type RequestDescriptor,
} from "../src/client/sw-strategy.ts";

// 既定値（GET・同一オリジン・非ナビゲーション）。各テストは差分だけ上書きする。
const base: RequestDescriptor = {
  method: "GET",
  sameOrigin: true,
  isNavigate: false,
  pathname: "/assets/index-abc123.js",
};

describe("chooseStrategy（キャッシュ戦略の判定）", () => {
  test("ナビゲーションは network-first（最新 HTML 優先・オフライン時はキャッシュ shell）", () => {
    expect(chooseStrategy({ ...base, isNavigate: true, pathname: "/" })).toBe("network-first");
  });

  test("ハッシュ付きアセット /assets/* は cache-first（内容不変）", () => {
    expect(chooseStrategy({ ...base, pathname: "/assets/index-abc123.js" })).toBe("cache-first");
    expect(chooseStrategy({ ...base, pathname: "/assets/index-def456.css" })).toBe("cache-first");
  });

  test("フォント /fonts/* は cache-first", () => {
    expect(chooseStrategy({ ...base, pathname: "/fonts/SpaceMono-400-latin.woff2" })).toBe(
      "cache-first",
    );
  });

  test("アイコン/favicon/manifest は swr（高速表示しつつ背景更新）", () => {
    expect(chooseStrategy({ ...base, pathname: "/icons/by.svg" })).toBe("swr");
    expect(chooseStrategy({ ...base, pathname: "/icons/icon-512.png" })).toBe("swr");
    expect(chooseStrategy({ ...base, pathname: "/favicon.svg" })).toBe("swr");
    expect(chooseStrategy({ ...base, pathname: "/favicon.ico" })).toBe("swr");
    expect(chooseStrategy({ ...base, pathname: "/apple-touch-icon.png" })).toBe("swr");
    expect(chooseStrategy({ ...base, pathname: "/manifest.webmanifest" })).toBe("swr");
  });

  test("OGP 大画像 /ogp/* はキャッシュしない（passthrough）", () => {
    expect(chooseStrategy({ ...base, pathname: "/ogp/ogp-landscape.jpg" })).toBe("passthrough");
  });

  test("Worker 動的ルート（/license.md・/llms.txt 等）は passthrough", () => {
    expect(chooseStrategy({ ...base, pathname: "/license.md" })).toBe("passthrough");
    expect(chooseStrategy({ ...base, pathname: "/llms.txt" })).toBe("passthrough");
  });

  test("非 GET は passthrough（読み取り以外は触らない）", () => {
    expect(chooseStrategy({ ...base, method: "POST", isNavigate: true, pathname: "/" })).toBe(
      "passthrough",
    );
  });

  test("クロスオリジンは passthrough（同一オリジンのみ扱う）", () => {
    expect(
      chooseStrategy({ ...base, sameOrigin: false, pathname: "/assets/index-abc123.js" }),
    ).toBe("passthrough");
  });

  test("SW ファイル自体はキャッシュしない（passthrough）", () => {
    expect(chooseStrategy({ ...base, pathname: "/sw.js" })).toBe("passthrough");
  });
});

describe("isStablePrecache（SW が事前キャッシュする安定名の公開ファイル）", () => {
  test.each([
    "/icons/nd.svg",
    "/icons/sb.svg",
    "/icons/logo-light.svg",
    "/favicon.ico",
    "/favicon.svg",
    "/apple-touch-icon.png",
    "/manifest.webmanifest",
    "/fonts/SpaceMono-400-latin.woff2",
  ])("%s は事前キャッシュする", (pathname) => {
    expect(isStablePrecache(pathname)).toBe(true);
  });

  test.each([
    "/fonts/OFL.txt",
    "/ogp/ogp-landscape.jpg",
    "/_headers",
    "/llms.txt",
    "/assets/index-abc.js",
    "/",
  ])("%s は事前キャッシュしない", (pathname) => {
    expect(isStablePrecache(pathname)).toBe(false);
  });
});
