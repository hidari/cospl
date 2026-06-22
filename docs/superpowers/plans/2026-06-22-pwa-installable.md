# インストール可能 PWA 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** cospl をインストール可能（ホーム画面追加・standalone 起動）にし、初回ロード後はオフラインでも全機能が動作する PWA にする。

**Architecture:** Web App Manifest + 手書き最小 Service Worker。キャッシュ戦略の判定は純粋関数（sw-strategy）に切り出して unit テストで仕様固定し、SW 本体（sw.ts）は薄い配線、登録は Library Contract アダプタ（sw-register）に閉じる。precache リストは Vite プラグインの generateBundle でハッシュ付きアセット名を権威取得し、esbuild で sw.ts をバンドルして /sw.js を emit する（vite build の一部なので deploy / E2E / dry-run の全経路で一貫）。アイコンは既存の build-images パイプラインを流用して仮アイコンを生成し、本デザインは同一パス差し替えで反映する。

**Tech Stack:** TypeScript / Vite 8 / @cloudflare/vite-plugin / esbuild（既存 devDep）/ Vitest（workerd pool）/ Playwright / Cloudflare Workers static assets。

## Global Constraints

- 新規ランタイム/ビルド依存の追加禁止。使ってよいのは既存の Vite・esbuild・playwright-core・@playwright/test のみ（`pnpm add` 禁止）。
- TypeScript: `any` 禁止、`try-catch` 禁止（Promise の then/catch で合成）、エラーは自前 `Result`（`src/types/result.ts`）/ 欠落は `Option`（`src/types/option.ts`）。`as` は `as const` と `as unknown`（型ガード前提）のみ許可。
- `Result<T,E>` は `{ success: true; data: T } | { success: false; error: E }`。構築は `success(data)` / `fail(error)`。成功値は `.data`。
- コマンドは必ず `pkf run <task>` 経由（`pnpm` 直叩き禁止。例外は依存追加とブラウザ導入のみ）。利用可能: `pkf run lint` / `pkf run typecheck` / `pkf run test` / `pkf run build` / `pkf run e2e` / `pkf run images`。
- コメントは日本語。ログはシステム内部=日本語、外部表示=英語。SW は基本ログを持たない。
- ファイル末尾は必ず 1 つの空行で終える。
- Lint/typecheck/test は常に警告 0・エラー 0 を維持する。

---

### Task 1: sw-strategy（キャッシュ戦略の純粋判定）

リクエスト記述子から適用するキャッシュ戦略を返す純粋関数。Request/DOM/WebWorker 型に依存させず、workerd の vitest で直接テストできるようにする。

**Files:**
- Create: `src/client/sw-strategy.ts`
- Test: `test/sw-strategy.test.ts`

**Interfaces:**
- Produces:
  - `type Strategy = "network-first" | "cache-first" | "swr" | "passthrough"`
  - `type RequestDescriptor = { readonly method: string; readonly sameOrigin: boolean; readonly isNavigate: boolean; readonly pathname: string }`
  - `function chooseStrategy(req: RequestDescriptor): Strategy`

- [ ] **Step 1: 失敗するテストを書く**

`test/sw-strategy.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { chooseStrategy, type RequestDescriptor } from "../src/client/sw-strategy";

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
    expect(chooseStrategy({ ...base, pathname: "/fonts/SpaceMono-400-latin.woff2" })).toBe("cache-first");
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
    expect(chooseStrategy({ ...base, method: "POST", isNavigate: true, pathname: "/" })).toBe("passthrough");
  });

  test("クロスオリジンは passthrough（同一オリジンのみ扱う）", () => {
    expect(chooseStrategy({ ...base, sameOrigin: false, pathname: "/assets/index-abc123.js" })).toBe("passthrough");
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `pkf run test`
Expected: FAIL（`sw-strategy` が存在しない / `chooseStrategy is not a function`）

- [ ] **Step 3: 最小実装を書く**

`src/client/sw-strategy.ts`:

```ts
// キャッシュ戦略の判定（純粋関数）。Request/DOM/WebWorker 型に依存せず、素の記述子だけで
// 戦略を決める。これにより workerd の vitest でそのままテストでき、SW 本体（副作用）と分離する。

export type Strategy = "network-first" | "cache-first" | "swr" | "passthrough";

// fetch ハンドラが Request から抽出する最小の記述子。
export type RequestDescriptor = {
  readonly method: string;
  readonly sameOrigin: boolean;
  readonly isNavigate: boolean;
  readonly pathname: string;
};

// 安定名のシェル資産（アイコン/favicon/manifest）。まれに変わるため swr で配る。
function isShellAsset(pathname: string): boolean {
  return (
    pathname.startsWith("/icons/") ||
    pathname === "/favicon.svg" ||
    pathname === "/favicon.ico" ||
    pathname === "/apple-touch-icon.png" ||
    pathname === "/manifest.webmanifest"
  );
}

export function chooseStrategy(req: RequestDescriptor): Strategy {
  // 読み取り以外・別オリジンは一切触らない（早期リターンで安全側に倒す）。
  if (req.method !== "GET") {
    return "passthrough";
  }
  if (!req.sameOrigin) {
    return "passthrough";
  }
  // ナビゲーション（HTML 文書）は最新を優先し、オフライン時のみキャッシュ shell へ。
  if (req.isNavigate) {
    return "network-first";
  }
  // 内容ハッシュ付き or フォントは不変扱いで cache-first。
  if (req.pathname.startsWith("/assets/") || req.pathname.startsWith("/fonts/")) {
    return "cache-first";
  }
  if (isShellAsset(req.pathname)) {
    return "swr";
  }
  // 既定はキャッシュしない（OGP 大画像・Worker 動的ルート・未知パスを安全側で素通し）。
  return "passthrough";
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `pkf run test`
Expected: PASS（sw-strategy の全ケース緑）

- [ ] **Step 5: lint と typecheck**

Run: `pkf run lint && pkf run typecheck`
Expected: 警告 0・エラー 0

- [ ] **Step 6: コミット**

```bash
git add src/client/sw-strategy.ts test/sw-strategy.test.ts
git commit -m "feat: SW キャッシュ戦略の純粋判定 chooseStrategy を追加"
```

---

### Task 2: sw-register（Service Worker 登録アダプタ）

navigator.serviceWorker を包む Library Contract アダプタ。feature 検出・no-throw・Result 返却。最小 structural 型で container を注入可能にし、fake でテストする。

**Files:**
- Create: `src/client/sw-register.ts`
- Test: `test/sw-register.test.ts`

**Interfaces:**
- Consumes: `success` / `fail` / `Result`（`src/types/result.ts`）
- Produces:
  - `type Registrar = { register: (url: string) => Promise<unknown> }`
  - `function registerServiceWorker(url: string, container: Registrar | undefined): Promise<Result<void, string>>`

- [ ] **Step 1: 失敗するテストを書く**

`test/sw-register.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { registerServiceWorker } from "../src/client/sw-register";

describe("registerServiceWorker（SW 登録アダプタ）", () => {
  test("container が無ければ未対応として fail を返す（例外を投げない）", async () => {
    const result = await registerServiceWorker("/sw.js", undefined);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("service worker unsupported");
    }
  });

  test("register が解決すれば success を返し、渡した URL で登録する", async () => {
    const calls: string[] = [];
    const container = {
      register: (url: string) => {
        calls.push(url);
        return Promise.resolve(undefined);
      },
    };
    const result = await registerServiceWorker("/sw.js", container);
    expect(result.success).toBe(true);
    expect(calls).toEqual(["/sw.js"]);
  });

  test("register が reject したら fail を返す（例外を漏らさない）", async () => {
    const container = { register: () => Promise.reject(new Error("boom")) };
    const result = await registerServiceWorker("/sw.js", container);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("service worker registration failed");
    }
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `pkf run test`
Expected: FAIL（`sw-register` が存在しない）

- [ ] **Step 3: 最小実装を書く**

`src/client/sw-register.ts`:

```ts
// Service Worker 登録の Library Contract アダプタ。navigator.serviceWorker の最小公開面
// （register のみ）に閉じ、feature 検出・no-throw・Result 化を担う。try-catch を使わず
// Promise の then/catch で合成する。テスト時は fake container を注入する。

import { fail, type Result, success } from "../types/result";

// 必要な操作だけの最小契約。navigator.serviceWorker は構造的にこれへ代入できる。
export type Registrar = { register: (url: string) => Promise<unknown> };

export function registerServiceWorker(
  url: string,
  container: Registrar | undefined,
): Promise<Result<void, string>> {
  if (!container) {
    return Promise.resolve(fail("service worker unsupported"));
  }
  return container
    .register(url)
    .then((): Result<void, string> => success(undefined))
    .catch((): Result<void, string> => fail("service worker registration failed"));
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `pkf run test`
Expected: PASS

- [ ] **Step 5: lint と typecheck**

Run: `pkf run lint && pkf run typecheck`
Expected: 警告 0・エラー 0

- [ ] **Step 6: コミット**

```bash
git add src/client/sw-register.ts test/sw-register.test.ts
git commit -m "feat: SW 登録アダプタ registerServiceWorker を追加"
```

---

### Task 3: PWA アイコン（仮）の生成

既存の build-images パイプラインを拡張し、favicon マークから 192/512 の any アイコンと、全面ベタ塗りの maskable アイコンを生成する。本デザインは後でこの PNG を同一パスに差し替える。

**Files:**
- Create: `public/icons/maskable.svg`
- Modify: `scripts/build-images.mjs`(favicon ブロック内に PWA アイコン生成を追加)
- Modify: `Taskfile.pkl`(images タスクの outputs に 3 PNG を追加)

**Interfaces:**
- Produces（後続が参照する成果物パス）: `/icons/icon-192.png` / `/icons/icon-512.png` / `/icons/icon-512-maskable.png`

- [ ] **Step 1: maskable ソース SVG を作る**

`public/icons/maskable.svg`（角丸を外した全面ベタ塗り。マークは安全領域＝中心 80% に収めるため 0.8 倍に縮小して中央寄せ）:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="CosPL">
  <!-- maskable: OS が外周を削るため全面ベタ塗り。マークは安全領域内へ縮小配置する。 -->
  <rect width="100" height="100" fill="#1c1430"/>
  <g transform="translate(10 10) scale(0.8)" fill="none" stroke="#ffffff" stroke-width="9">
    <circle cx="38" cy="50" r="22"/>
    <circle cx="62" cy="50" r="22"/>
  </g>
</svg>
```

- [ ] **Step 2: build-images.mjs に PWA アイコン生成を追加**

`scripts/build-images.mjs` の favicon ブロック（`apple-touch-icon.png` を生成している `console.log("favicon: ...")` の直後）に以下を挿入する:

```js
    // --- PWA アイコン（manifest 用。any は丸角透過、maskable は全面ベタ塗り）---
    await renderSvg(browser, faces, favSvg, 192, 192, join(pub, "icons", "icon-192.png"), {
      transparent: true,
    });
    await renderSvg(browser, faces, favSvg, 512, 512, join(pub, "icons", "icon-512.png"), {
      transparent: true,
    });
    await renderSvg(
      browser,
      faces,
      join(pub, "icons", "maskable.svg"),
      512,
      512,
      join(pub, "icons", "icon-512-maskable.png"),
      { transparent: false },
    );
    console.log("pwa icons: icon-192 / icon-512 / icon-512-maskable");
```

- [ ] **Step 3: Taskfile.pkl の images outputs を更新**

`Taskfile.pkl` の `images` タスクの `outputs { ... }` ブロックへ 3 行追加する（inputs は既存の `"public/icons/*.svg"` が maskable.svg を自動的に含むため変更不要）:

```pkl
    "public/icons/icon-192.png"
    "public/icons/icon-512.png"
    "public/icons/icon-512-maskable.png"
```

- [ ] **Step 4: アイコンを生成する**

Run: `pkf run images`
Expected: ログに `pwa icons: icon-192 / icon-512 / icon-512-maskable` が出る

- [ ] **Step 5: 生成物を検証する**

Run: `file public/icons/icon-192.png public/icons/icon-512.png public/icons/icon-512-maskable.png`
Expected: いずれも `PNG image data` と表示され、512 の 2 枚は `512 x 512`、192 は `192 x 192`

- [ ] **Step 6: 意図したファイルのみコミットする**

既存の favicon.ico / apple-touch-icon.png / OGP は同一入力から決定論的に再生成されるため通常は無変更。`git status` で確認し、もし環境差で変更が出ていれば `git checkout -- <該当ファイル>` で戻してから、PWA 関連だけをコミットする。

```bash
git add public/icons/maskable.svg public/icons/icon-192.png public/icons/icon-512.png public/icons/icon-512-maskable.png scripts/build-images.mjs Taskfile.pkl
git status   # 既存 favicon/OGP に意図しない変更が無いことを確認
git commit -m "feat: PWA アイコン（仮）を build-images で生成（192/512/maskable）"
```

---

### Task 4: Web App Manifest と HTML リンク

manifest.webmanifest を追加し index.html から link する。?raw インポートで本文を埋め込み、型ガードで必須フィールドを検証する（workerd には fs が無いため）。

**Files:**
- Create: `public/manifest.webmanifest`
- Modify: `index.html`(head に manifest link 追加)
- Test: `test/manifest.test.ts`

**Interfaces:**
- Consumes: `/icons/icon-192.png` / `/icons/icon-512.png` / `/icons/icon-512-maskable.png`(Task 3)

- [ ] **Step 1: 失敗するテストを書く**

`test/manifest.test.ts`:

```ts
import { describe, expect, test } from "vitest";
// workerd では node:fs が使えないため Vite の ?raw で本文を文字列として埋め込む。
import manifestRaw from "../public/manifest.webmanifest?raw";

describe("Web App Manifest", () => {
  // parse できることが第一の検証。再シリアライズ（空白なし）して exact 部分一致で値を固定する。
  // これにより as アサーション無しで構造と値を仕様として固定できる。
  const parsed: unknown = JSON.parse(manifestRaw);
  const json = JSON.stringify(parsed);

  test("有効な JSON オブジェクトである", () => {
    expect(typeof parsed).toBe("object");
    expect(parsed).not.toBeNull();
  });

  test("インストール可能 PWA の必須値を宣言する（standalone / start_url / scope / theme_color）", () => {
    expect(json).toContain('"display":"standalone"');
    expect(json).toContain('"start_url":"/"');
    expect(json).toContain('"scope":"/"');
    expect(json).toContain('"theme_color":"#7b54ff"');
  });

  test("192/512 の any と 512 の maskable アイコンを正確に宣言する", () => {
    expect(json).toContain(
      '"src":"/icons/icon-192.png","sizes":"192x192","type":"image/png","purpose":"any"',
    );
    expect(json).toContain(
      '"src":"/icons/icon-512.png","sizes":"512x512","type":"image/png","purpose":"any"',
    );
    expect(json).toContain(
      '"src":"/icons/icon-512-maskable.png","sizes":"512x512","type":"image/png","purpose":"maskable"',
    );
  });
});
```

注: `JSON.stringify(JSON.parse(raw))` は空白なしの compact 形になるため、上記の `"key":"value"` 連結（コロン後にスペースなし、manifest のキー順 src→sizes→type→purpose）で一致する。`as` を一切使わない。

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `pkf run test`
Expected: FAIL（`public/manifest.webmanifest` が無く import 解決に失敗）

- [ ] **Step 3: manifest を作る**

`public/manifest.webmanifest`:

```json
{
  "name": "CosPL — Cosplay Public License",
  "short_name": "CosPL",
  "description": "コスプレ撮影における、撮影者とモデルのための利用許諾テンプレート。",
  "lang": "ja",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "theme_color": "#7b54ff",
  "background_color": "#1c1430",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- [ ] **Step 4: index.html に manifest link を追加**

`index.html` の `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`（12 行目付近）の直後に追加する:

```html
<link rel="manifest" href="/manifest.webmanifest">
```

- [ ] **Step 5: テストを実行して成功を確認**

Run: `pkf run test`
Expected: PASS（manifest の全ケース緑）

- [ ] **Step 6: lint と typecheck**

Run: `pkf run lint && pkf run typecheck`
Expected: 警告 0・エラー 0

- [ ] **Step 7: コミット**

```bash
git add public/manifest.webmanifest index.html test/manifest.test.ts
git commit -m "feat: Web App Manifest を追加し index.html から link"
```

---

### Task 5: Service Worker 本体とビルド統合

sw.ts（install/activate/fetch の薄い配線）を実装し、Vite プラグインで precache を注入して /sw.js を emit する。WebWorker 型は tsconfig.sw.json で隔離する。

**Files:**
- Create: `src/client/sw.ts`
- Create: `tsconfig.sw.json`
- Modify: `tsconfig.json`(exclude に sw.ts を追加)
- Modify: `package.json`(typecheck スクリプトに sw 型チェックを連結)
- Modify: `vite.config.ts`(SW 生成プラグインを追加)

**Interfaces:**
- Consumes: `chooseStrategy` / `type Strategy`（Task 1）。ビルド時注入の `__PRECACHE__: readonly string[]` と `__CACHE_VERSION__: string`。
- Produces: ビルド成果物 `dist/client/sw.js`（precache 済み・固定名）。

- [ ] **Step 1: sw.ts を書く**

`src/client/sw.ts`:

```ts
/// <reference lib="webworker" />
// Service Worker 本体（副作用の薄い配線）。戦略判定は sw-strategy（純粋）に委譲する。
// __PRECACHE__ / __CACHE_VERSION__ はビルド時に Vite プラグインが define で注入する。

import { chooseStrategy, type Strategy } from "./sw-strategy";

declare const self: ServiceWorkerGlobalScope;
declare const __PRECACHE__: readonly string[];
declare const __CACHE_VERSION__: string;

const CACHE = `cospl-${__CACHE_VERSION__}`;

self.addEventListener("install", (event) => {
  // shell 一式を precache し、待機せず即座に新 SW を有効化する。
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll([...__PRECACHE__])));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // 旧バージョンのキャッシュを破棄し、開いている全クライアントの制御を奪う。
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const strategy = chooseStrategy({
    method: event.request.method,
    sameOrigin: url.origin === self.location.origin,
    isNavigate: event.request.mode === "navigate",
    pathname: url.pathname,
  });
  // passthrough は respondWith せずブラウザ既定に任せる。
  if (strategy === "passthrough") {
    return;
  }
  event.respondWith(handle(strategy, event.request));
});

function handle(strategy: Exclude<Strategy, "passthrough">, request: Request): Promise<Response> {
  switch (strategy) {
    case "cache-first":
      return cacheFirst(request);
    case "network-first":
      return networkFirst(request);
    case "swr":
      return staleWhileRevalidate(request);
  }
}

// 不変アセット: キャッシュ優先。未取得時のみネットワークから取得しキャッシュへ格納する。
async function cacheFirst(request: Request): Promise<Response> {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

// ナビゲーション: ネットワーク優先。失敗時はキャッシュ、無ければ shell（"/"）へフォールバック。
async function networkFirst(request: Request): Promise<Response> {
  const fromNetwork = await fetch(request).then(
    (response) => response,
    () => undefined,
  );
  if (fromNetwork?.ok) {
    const cache = await caches.open(CACHE);
    await cache.put(request, fromNetwork.clone());
    return fromNetwork;
  }
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }
  if (fromNetwork) {
    return fromNetwork;
  }
  const shell = await caches.match("/");
  if (shell) {
    return shell;
  }
  return Response.error();
}

// シェル資産: キャッシュ即返し + 背景で再検証（失敗は握りつぶす）。
async function staleWhileRevalidate(request: Request): Promise<Response> {
  const cached = await caches.match(request);
  const network = fetch(request).then(async (response) => {
    if (response.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  });
  if (cached) {
    network.catch(() => undefined);
    return cached;
  }
  return network;
}
```

- [ ] **Step 2: sw.ts 用 tsconfig を作り、main から除外する**

`tsconfig.sw.json`（WebWorker lib で sw.ts だけ型チェック。E2E の tsconfig.e2e.json と同じ隔離パターン）:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "lib": ["ES2022", "WebWorker"],
    "types": [],
    "noEmit": true
  },
  "include": ["src/client/sw.ts"],
  "exclude": []
}
```

`tsconfig.json` の `exclude` に sw.ts を追加する（DOM lib の main プログラムから外す）:

```json
  "exclude": ["e2e", "playwright.config.ts", "src/client/sw.ts"]
```

- [ ] **Step 3: typecheck スクリプトに sw 型チェックを連結**

`package.json` の `typecheck` を更新する（CI の merge-gate が `pnpm run typecheck` を呼ぶため、ここに連結すれば SW も CI で型検査される）:

```json
    "typecheck": "tsc --noEmit && tsc -p tsconfig.sw.json",
```

- [ ] **Step 4: typecheck で sw.ts が通ることを確認**

Run: `pkf run typecheck`
Expected: エラー 0（sw.ts が WebWorker lib で解決され、main は DOM lib のまま）

- [ ] **Step 5: Vite プラグインで /sw.js を emit する**

`vite.config.ts` を全置換する:

```ts
import { cloudflare } from "@cloudflare/vite-plugin";
import { build as esbuild } from "esbuild";
import { defineConfig, type Plugin } from "vite";

// precache する安定名アセット（ハッシュ無し）。ハッシュ付き JS/CSS は generateBundle から取得する。
const STABLE_PRECACHE: readonly string[] = [
  "/manifest.webmanifest",
  "/favicon.svg",
  "/favicon.ico",
  "/apple-touch-icon.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-512-maskable.png",
  "/icons/by.svg",
  "/icons/nc.svg",
  "/icons/nai.svg",
  "/icons/td.svg",
  "/icons/mr.svg",
  "/icons/mark.svg",
  "/fonts/SpaceGrotesk-latin.woff2",
  "/fonts/SpaceMono-400-latin.woff2",
  "/fonts/SpaceMono-700-latin.woff2",
];

// クライアントビルドの generateBundle で sw.ts を esbuild バンドルし precache を注入して /sw.js を emit。
// vite build の一部なので deploy（vite build && wrangler deploy）でも E2E（vite build && preview）でも一貫。
function serviceWorkerPlugin(): Plugin {
  return {
    name: "cospl-service-worker",
    apply: "build",
    async generateBundle(_options, bundle) {
      // クライアントビルド（index.html / CSS を含む）でのみ生成。CF プラグインの worker ビルドでは生成しない。
      const isClient =
        "index.html" in bundle || Object.keys(bundle).some((name) => name.endsWith(".css"));
      if (!isClient) {
        return;
      }
      const hashed = Object.keys(bundle)
        .filter((name) => name.endsWith(".js") || name.endsWith(".css"))
        .map((name) => `/${name}`);
      // キャッシュ版数はエントリ JS のハッシュ名から導出（内容が変われば名前が変わる）。
      let version = "dev";
      for (const chunk of Object.values(bundle)) {
        if (chunk.type === "chunk" && chunk.isEntry) {
          version = chunk.fileName.replace(/[^a-z0-9]/gi, "");
          break;
        }
      }
      const precache = ["/", ...hashed, ...STABLE_PRECACHE];
      const result = await esbuild({
        entryPoints: ["src/client/sw.ts"],
        bundle: true,
        format: "iife",
        target: "es2020",
        minify: true,
        write: false,
        define: {
          __PRECACHE__: JSON.stringify(precache),
          __CACHE_VERSION__: JSON.stringify(version),
        },
      });
      const out = result.outputFiles?.[0];
      if (!out) {
        throw new Error("service worker のビルド出力が空");
      }
      this.emitFile({ type: "asset", fileName: "sw.js", source: out.text });
    },
  };
}

// @cloudflare/vite-plugin が wrangler.toml を読み、worker.ts と
// クライアント（index.html / src/client）の両方をビルドする。
export default defineConfig({
  plugins: [cloudflare(), serviceWorkerPlugin()],
  // dev サーバのポートを固定し、Taskfile.pkl の dev.readyPort と一致させる。
  server: { port: 5210 },
});
```

- [ ] **Step 6: ビルドして /sw.js が precache 付きで出ることを確認**

Run: `pkf run build`
Expected: ビルド成功

Run: `grep -oE "cospl-[A-Za-z0-9]+" dist/client/sw.js | head -1 && grep -c '"/assets/' dist/client/sw.js`
Expected: `cospl-<hash>` が表示され、2 つ目の出力が `1`（precache に `/assets/` 参照を含む。0 ならビルド統合が壊れている）

- [ ] **Step 7: lint**

Run: `pkf run lint`
Expected: 警告 0・エラー 0

- [ ] **Step 8: コミット**

```bash
git add src/client/sw.ts tsconfig.sw.json tsconfig.json package.json vite.config.ts
git commit -m "feat: 手書き最小 Service Worker と Vite による /sw.js 生成を追加"
```

---

### Task 6: SW 登録の配線とアセットヘッダ

main.ts から本番ビルド時のみ SW を登録し、_headers で /sw.js を no-cache、manifest の Content-Type を担保する。

**Files:**
- Modify: `src/client/main.ts`(登録呼び出しを追加)
- Modify: `public/_headers`(sw.js / manifest のヘッダ追加)

**Interfaces:**
- Consumes: `registerServiceWorker`（Task 2）

- [ ] **Step 1: main.ts に登録を追加**

`src/client/main.ts` の import 群に追加する（既存 import の並びに合わせる）:

```ts
import { registerServiceWorker } from "./sw-register";
```

`main()` 関数の最後（`syncUrl(state);` の直後の行）に追加する:

```ts
  // 本番ビルドでのみ SW を登録する（dev は /sw.js を emit しないため）。import.meta.env は DEV のみ
  // 宣言されているため !DEV を本番判定に使う。登録は load 後に行い初回描画と帯域を奪わない。
  // 失敗しても致命でないため Result は捨てる（配線は E2E で検証する）。
  if (!import.meta.env.DEV && "serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      void registerServiceWorker("/sw.js", navigator.serviceWorker);
    });
  }
```

- [ ] **Step 2: _headers に SW / manifest のヘッダを追加**

`public/_headers` の末尾に追加する:

```
# Service Worker は常に再検証し更新を即時反映する（古い SW が旧版を配り続けるのを防ぐ）。
/sw.js
  Cache-Control: no-cache

# manifest の Content-Type を明示する。
/manifest.webmanifest
  Content-Type: application/manifest+json
```

- [ ] **Step 3: typecheck / lint / build**

Run: `pkf run typecheck && pkf run lint && pkf run build`
Expected: いずれも警告 0・エラー 0、ビルド成功

- [ ] **Step 4: コミット**

```bash
git add src/client/main.ts public/_headers
git commit -m "feat: 本番のみ SW を登録し /sw.js を no-cache・manifest の Content-Type を明示"
```

---

### Task 7: CSP に worker-src / manifest-src を追加

buildCsp に PWA 向けディレクティブを明示追加し（多層防御）、unit テストで固定する。

**Files:**
- Modify: `src/worker.ts`(buildCsp の directives)
- Test: `test/worker.test.ts`(buildCsp の assertion 追加)

**Interfaces:**
- Consumes: `buildCsp(isDev: boolean, isSecure: boolean): string`（既存）

- [ ] **Step 1: 失敗するテストを書く**

`test/worker.test.ts` の `describe("buildCsp（環境別 CSP 生成）", ...)` 内に追加する:

```ts
  test("PWA: worker-src と manifest-src を 'self' に固定する（SW 登録と manifest 取得を許可しつつ多層防御）", () => {
    const csp = buildCsp(false, true);
    expect(csp).toContain("worker-src 'self'");
    expect(csp).toContain("manifest-src 'self'");
  });
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `pkf run test`
Expected: FAIL（worker-src / manifest-src が CSP に無い）

- [ ] **Step 3: buildCsp に 2 ディレクティブを追加**

`src/worker.ts` の `buildCsp` 内 `directives` 配列の `"connect-src 'self'",` の直後に追加する:

```ts
    "worker-src 'self'",
    "manifest-src 'self'",
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `pkf run test`
Expected: PASS（CSP の既存テストも含め緑）

- [ ] **Step 5: typecheck / lint**

Run: `pkf run typecheck && pkf run lint`
Expected: 警告 0・エラー 0

- [ ] **Step 6: コミット**

```bash
git add src/worker.ts test/worker.test.ts
git commit -m "feat: CSP に worker-src/manifest-src 'self' を追加（PWA 多層防御）"
```

---

### Task 8: E2E（manifest / オフライン）

manifest とアイコン配信を全ブラウザで、SW 登録後のオフライン描画を Chromium で検証する。

**Files:**
- Create: `e2e/manifest.spec.ts`
- Create: `e2e/offline.spec.ts`

**Interfaces:**
- Consumes: `test` / `expect`（`e2e/fixtures.ts`）、`licensePage`（Page Object）

- [ ] **Step 1: manifest / アイコン配信の spec を書く**

`e2e/manifest.spec.ts`:

```ts
import { expect, test } from "./fixtures";

test("manifest が link され application/manifest+json で取得できる", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
  const res = await page.request.get("/manifest.webmanifest");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/manifest+json");
  const body = await res.text();
  expect(body).toContain('"display"');
  expect(body).toContain('"standalone"');
  expect(body).toContain('"512x512"');
  expect(body).toContain('"maskable"');
});

test("PWA アイコンが PNG で配信される", async ({ page }) => {
  for (const path of ["/icons/icon-192.png", "/icons/icon-512.png", "/icons/icon-512-maskable.png"]) {
    const res = await page.request.get(path);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/png");
  }
});
```

- [ ] **Step 2: オフライン spec を書く（Chromium 限定）**

`e2e/offline.spec.ts`:

```ts
import { expect, test } from "./fixtures";

// SW のオフライン検証は Chromium のみ安定（WebKit/Firefox は Playwright の SW/offline 対応が限定的）。
test.skip(
  ({ browserName }) => browserName !== "chromium",
  "SW オフライン検証は Chromium のみ安定",
);

test("SW 登録後はオフラインでもライセンスが生成・描画される", async ({ licensePage, page, context }) => {
  await licensePage.goto();
  // SW が有効化し現在のクライアントを制御するまで待つ（clients.claim 後に controller が入る）。
  // ready は ServiceWorkerRegistration を解決するが非シリアライズ値のため evaluate からは返さない。
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  // オフラインにしてリロード: network-first が失敗しキャッシュ shell から復帰する。
  await context.setOffline(true);
  await page.reload();
  await expect(licensePage.output).toContainText("撮影データの取り扱いについて");
  await context.setOffline(false);
});
```

- [ ] **Step 3: E2E を実行して成功を確認**

Run: `pkf run e2e`
Expected: 全プロジェクトで manifest/アイコン spec が PASS、offline spec は chromium で PASS・他 3 プロジェクトで skipped

- [ ] **Step 4: lint**

Run: `pkf run lint`
Expected: 警告 0・エラー 0（biome が e2e/** を含めて検査する。spec の型は Playwright API と Page Object で担保される）

- [ ] **Step 5: コミット**

```bash
git add e2e/manifest.spec.ts e2e/offline.spec.ts
git commit -m "test: PWA の manifest 配信とオフライン描画の E2E を追加"
```

---

### Task 9: デプロイ health check に PWA スモークを追加

deploy.yml の本番 health check に manifest / sw.js / CSP の検証を足す（Worker ルーティング・実バンドルは統合テストで検出できないため本番で確認する）。

**Files:**
- Modify: `.github/workflows/deploy.yml`(Health check ステップ)

- [ ] **Step 1: 200 チェックに manifest と sw.js を追加**

`deploy.yml` の Health check 内、`check_200 "https://cospl.org/llms.txt" || { ... }` の直後に追加する:

```bash
          check_200 "https://cospl.org/manifest.webmanifest" || { echo "::error::health check failed: /manifest.webmanifest did not return 200"; exit 1; }
          check_200 "https://cospl.org/sw.js" || { echo "::error::health check failed: /sw.js did not return 200"; exit 1; }
```

- [ ] **Step 2: manifest の Content-Type 検証を追加**

`check_csp` の関数定義の直前に追加する:

```bash
          # manifest が application/manifest+json で配信されることを確認する。
          check_manifest() {
            for i in $(seq 1 5); do
              ctype=$(curl -fsSL -o /dev/null -w "%{content_type}" "https://cospl.org/manifest.webmanifest" || true)
              echo "  /manifest.webmanifest attempt ${i}: ${ctype}"
              echo "${ctype}" | grep -qi "application/manifest+json" && return 0
              sleep 10
            done
            return 1
          }
          check_manifest || { echo "::error::health check failed: /manifest.webmanifest が application/manifest+json を返さない"; exit 1; }
```

- [ ] **Step 3: CSP の検証に worker-src / manifest-src を追加**

`deploy.yml` の `check_csp` 内の判定行を以下へ置換する:

```bash
              echo "${csp}" | grep -qi "upgrade-insecure-requests" && echo "${csp}" | grep -qi "default-src 'self'" && echo "${csp}" | grep -qi "worker-src 'self'" && echo "${csp}" | grep -qi "manifest-src 'self'" && return 0
```

そしてエラーメッセージを更新する:

```bash
          check_csp || { echo "::error::health check failed: / の CSP に upgrade-insecure-requests / default-src / worker-src / manifest-src が無い"; exit 1; }
```

- [ ] **Step 4: ワークフロー YAML の妥当性を確認**

Run: `pnpm exec wrangler deploy --dry-run`
（deploy.yml 自体は本番デプロイ時に実行されるため、ここではビルド設定が壊れていないことを dry-run で確認する。health check の実走は次回 deploy 時に初稼働する。）
Expected: dry-run 成功

- [ ] **Step 5: コミット**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: deploy health check に manifest/sw/CSP の PWA スモークを追加"
```

---

## 仕様カバレッジ（self-review）

- スコープ（manifest + 最小 SW + オフライン）: Task 4（manifest）/ Task 5（SW）/ Task 8（オフライン E2E）。
- 手書き SW・Workbox 不採用: Task 5（依存追加なし、esbuild は既存）。
- precache を Vite プラグインで権威取得: Task 5 Step 5。
- 更新 UX = サイレント自動更新: Task 5（skipWaiting + clients.claim）。
- アイコン仮→本の同一パス差し替え: Task 3（生成）+ manifest は固定パス参照（Task 4）。
- キャッシュ戦略の純粋関数化とテスト: Task 1。
- 登録の Library Contract アダプタ: Task 2、配線は Task 6 + E2E（Task 8）。
- CSP worker-src/manifest-src: Task 7、本番検証 Task 9。
- _headers（sw.js no-cache / manifest Content-Type）: Task 6。
- Worker / run_worker_first 変更なし: 本計画で wrangler.toml を触らない（sw.js・manifest は純アセット）。
- CI（merge-gate e2e / deploy health / e2e-prod）: Task 8（merge-gate の既存 e2e ジョブが拾う）/ Task 9（deploy）。e2e-prod は既存スイートを本番 baseURL で再実行するため追加変更不要。

## 実行順と依存

Task 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 の順。Task 5 の precache は Task 3（アイコン）/ Task 4（manifest）の実体に依存するため後段に置く。Task 8 のオフライン E2E は Task 5/6（SW が live）に依存する。
