import { describe, expect, test } from "vitest";
// workerd では node:fs が使えないため Vite の ?raw で本文を文字列として埋め込む。
import indexRaw from "../index.html?raw";
import manifestRaw from "../public/manifest.webmanifest?raw";
import cssRaw from "../src/client/styles.module.css?raw";
import { cacheVersion } from "../src/client/sw-precache.ts";
import { chooseStrategy, isStablePrecache } from "../src/client/sw-strategy.ts";

const matches = (text: string, re: RegExp): string[] =>
  Array.from(text.matchAll(re), (m) => m[1] ?? "");

// 事前キャッシュに入り、SW の入れ替わりだけで届く（cache-first で配る）とは言えない参照。
const notDeliveredBySw = (urls: readonly string[]): string[] =>
  urls.filter(
    (pathname) =>
      !isStablePrecache(pathname) ||
      chooseStrategy({ method: "GET", sameOrigin: true, isNavigate: false, pathname }) !==
        "cache-first",
  );

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

const hasIconSrcs = (v: unknown): v is { icons: { src: string }[] } =>
  isRecord(v) &&
  Array.isArray(v.icons) &&
  v.icons.every((i: unknown) => isRecord(i) && typeof i.src === "string");

describe("配信物が参照する安定名ファイルは、すべて事前キャッシュされ cache-first で配られる", () => {
  test('CSS の url("/…") は、フォント 3 つとアイコン 7 つで、すべて SW が届ける', () => {
    const urls = [...new Set(matches(cssRaw, /url\("(\/[^"]+)"\)/g))].sort();
    expect(urls).toEqual(
      [
        "/fonts/SpaceGrotesk-latin.woff2",
        "/fonts/SpaceMono-400-latin.woff2",
        "/fonts/SpaceMono-700-latin.woff2",
        ...["by", "mr", "nai", "nc", "nd", "sb", "td"].map((n) => `/icons/${n}.svg`),
      ].sort(),
    );
    expect(notDeliveredBySw(urls)).toEqual([]);
  });

  test("index.html のアイコン・favicon・manifest 参照は、すべて SW が届ける", () => {
    const refs = matches(indexRaw, /\b(?:href|src|srcset)="(\/[^"]*)"/g).filter((u) =>
      ["/icons/", "/favicon", "/apple-touch-icon", "/manifest"].some((p) => u.startsWith(p)),
    );
    expect(refs.length).toBeGreaterThan(0);
    expect(notDeliveredBySw(refs)).toEqual([]);
  });

  test("manifest.webmanifest の icons[].src は、すべて SW が届ける", () => {
    const parsed: unknown = JSON.parse(manifestRaw);
    if (!hasIconSrcs(parsed)) {
      throw new Error("manifest.webmanifest の icons[].src を読めない");
    }
    const srcs = parsed.icons.map((i) => i.src);
    expect(srcs.length).toBeGreaterThan(0);
    expect(notDeliveredBySw(srcs)).toEqual([]);
  });
});

describe("cacheVersion（SW キャッシュの版数）", () => {
  const input = {
    hashedAssets: ["/assets/index-aaa.js", "/assets/index-bbb.css"],
    stable: [
      { path: "/icons/nd.svg", sha256: "11" },
      { path: "/fonts/SpaceMono-400-latin.woff2", sha256: "22" },
    ],
  };

  test("16 桁の小文字 16 進", async () => {
    expect(await cacheVersion(input)).toMatch(/^[0-9a-f]{16}$/);
  });

  test("入力の並び順に依存しない（ハッシュ付きと安定名を別々に入れ替える）", async () => {
    const base = await cacheVersion(input);
    const hashedReversed = { ...input, hashedAssets: [...input.hashedAssets].reverse() };
    const stableReversed = { ...input, stable: [...input.stable].reverse() };
    expect(await cacheVersion(hashedReversed)).toBe(base);
    expect(await cacheVersion(stableReversed)).toBe(base);
  });

  test("安定名ファイルの内容ハッシュが変わると版数が変わる", async () => {
    const changed = {
      ...input,
      stable: [{ path: "/icons/nd.svg", sha256: "99" }, ...input.stable.slice(1)],
    };
    expect(await cacheVersion(changed)).not.toBe(await cacheVersion(input));
  });

  test("ハッシュ付きアセットが変わると版数が変わる", async () => {
    const changed = { ...input, hashedAssets: ["/assets/index-zzz.js", "/assets/index-bbb.css"] };
    expect(await cacheVersion(changed)).not.toBe(await cacheVersion(input));
  });

  test("安定名ファイルが増えると版数が変わる（パスも入力に入る）", async () => {
    const added = {
      ...input,
      stable: [...input.stable, { path: "/favicon.svg", sha256: "33" }],
    };
    expect(await cacheVersion(added)).not.toBe(await cacheVersion(input));
  });

  test("パスと内容ハッシュの境界を取り違えても衝突しない", async () => {
    const a = { hashedAssets: [], stable: [{ path: "/a", sha256: "bc" }] };
    const b = { hashedAssets: [], stable: [{ path: "/ab", sha256: "c" }] };
    expect(await cacheVersion(a)).not.toBe(await cacheVersion(b));
  });
});
