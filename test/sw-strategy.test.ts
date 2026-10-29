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

const PRECACHED = [
  "/icons/nd.svg",
  "/icons/sb.svg",
  "/icons/logo-light.svg",
  "/icons/icon-512.png",
  "/favicon.ico",
  "/favicon.svg",
  "/apple-touch-icon.png",
  "/manifest.webmanifest",
  "/fonts/SpaceMono-400-latin.woff2",
];
const NOT_PRECACHED = [
  "/fonts/OFL.txt",
  "/ogp/ogp-landscape.jpg",
  "/_headers",
  "/llms.txt",
  "/assets/index-abc.js",
  "/",
  "/icons/.DS_Store",
  "/fonts/.hidden.woff2",
];

describe("chooseStrategy（キャッシュ戦略の判定）", () => {
  test("ナビゲーションは network-first（最新 HTML 優先・オフライン時はキャッシュ shell）", () => {
    expect(chooseStrategy({ ...base, isNavigate: true, pathname: "/" })).toBe("network-first");
  });

  test("ハッシュ付きアセット /assets/* は cache-first（内容不変）", () => {
    expect(chooseStrategy({ ...base, pathname: "/assets/index-abc123.js" })).toBe("cache-first");
    expect(chooseStrategy({ ...base, pathname: "/assets/index-def456.css" })).toBe("cache-first");
  });

  // 安定名の事前キャッシュ対象は中身が SW の版数に入り、差し替えは SW の入れ替わりで届く。
  test.each(PRECACHED)("事前キャッシュ対象の %s は cache-first", (pathname) => {
    expect(chooseStrategy({ ...base, pathname })).toBe("cache-first");
  });

  // 版数に入らないファイルを cache-first にすると、差し替えが届かなくなる。
  test.each(["/fonts/OFL.txt", "/icons/.DS_Store", "/fonts/.hidden.woff2"])(
    "事前キャッシュ対象でない %s は passthrough",
    (pathname) => {
      expect(chooseStrategy({ ...base, pathname })).toBe("passthrough");
    },
  );

  // 事前キャッシュの対象とキャッシュ戦略は同じ述語で決まり、ずれない。
  test.each([...PRECACHED, ...NOT_PRECACHED].filter((p) => !p.startsWith("/assets/") && p !== "/"))(
    "%s は事前キャッシュ対象なら cache-first、そうでなければ passthrough",
    (pathname) => {
      expect(chooseStrategy({ ...base, pathname })).toBe(
        isStablePrecache(pathname) ? "cache-first" : "passthrough",
      );
    },
  );

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
  test.each(PRECACHED)("%s は事前キャッシュする", (pathname) => {
    expect(isStablePrecache(pathname)).toBe(true);
  });

  test.each(NOT_PRECACHED)("%s は事前キャッシュしない", (pathname) => {
    expect(isStablePrecache(pathname)).toBe(false);
  });
});
