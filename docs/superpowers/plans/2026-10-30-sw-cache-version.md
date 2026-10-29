# SW キャッシュ版数に安定名アセットの中身を含める Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 安定名のファイル（フォント・アイコン・ロゴ・favicon・manifest）を差し替えてデプロイしたら、前に来た人の 2 回目の表示から必ず新しいものが見えるようにする。

**Architecture:** precache の対象を `public/` のファイルから述語で選び、その中身のハッシュを SW の版数に混ぜる。中身が変われば `sw.js` が変わり、ブラウザがナビゲーションのたびに確かめる SW の更新で precache 全体が取り直される。stale-while-revalidate の裏の更新は `event.waitUntil` に入れる。

**Tech Stack:** TypeScript、Vite 8 の plugin（`vite.config.ts` の `serviceWorkerPlugin`）、vitest（workerd）、Playwright。

**Spec:** `docs/issues/ISSUE-4_HTML だけの変更で Service Worker のキャッシュ版数が上がらない/issue.md`

## Global Constraints

- try-catch・`any`・新しい `as` を使わない。純粋関数と Result / Option で書く（プロジェクトの CLAUDE.md）
- 相対 import には `.ts` などの拡張子を付ける（biome.json の `useImportExtensions`）
- `/`（HTML）は版数に入れない。network-first で足りている
- フォントは cache-first のまま
- 版数は入力全体の SHA-256 から作る 16 桁の小文字 16 進

## Review Focus

- `public/` に precache 対象でないファイル（`/ogp/*`、`_headers`、`llms.txt`、`fonts/OFL.txt`）を足しても版数が変わらないこと。変わると無関係な変更のたびに precache を全部取り直す（Task 1 のテスト）
- CSS・index.html・manifest が参照する安定名のファイルが、すべて precache に入ること。`nd.svg` と `sb.svg` の漏れと同じ形の drift を止める（Task 1 のテスト）
- ファイルの列挙順が変わっても版数が同じこと。OS やファイルシステムで readdir の順は違う（Task 1 のテスト）
- 安定名のファイルを 1 バイト変えただけのビルドで `sw.js` の版数が変わること（Task 2 の検証）
- 裏の更新が失敗しても、返した応答や SW 自体を壊さないこと（Task 3。既存の握りつぶしを保つ）

---

### Task 1: precache の述語と版数の純粋関数

**Files:**
- Modify: `src/client/sw-strategy.ts`（`isShellAsset` の隣に述語を足す）
- Create: `src/client/sw-precache.ts`
- Test: `test/sw-strategy.test.ts`、`test/sw-precache.test.ts`

**Interfaces:**
- Produces: `export function isStablePrecache(pathname: string): boolean`（`sw-strategy.ts`）。`isShellAsset(pathname)` が真か、`/fonts/` の下で `.woff2` で終わるときに真
- Produces: `export const cacheVersion = (input: { hashedAssets: readonly string[]; stable: readonly { path: string; sha256: string }[] }): Promise<string>`（`sw-precache.ts`）。両方を並べ替えてから決定的な文字列にし、`sha256Hex`（`src/brand/masters.ts`）の先頭 16 文字を返す

- [ ] **Step 1: 述語のテストを書く**（`test/sw-strategy.test.ts`、既存の describe の書き方に揃える）
  - `/icons/nd.svg`・`/icons/sb.svg`・`/icons/logo-light.svg`・`/favicon.ico`・`/favicon.svg`・`/apple-touch-icon.png`・`/manifest.webmanifest`・`/fonts/SpaceMono-400-latin.woff2` が真
  - `/fonts/OFL.txt`・`/ogp/ogp-landscape.jpg`・`/_headers`・`/llms.txt`・`/assets/index-abc.js`・`/` が偽
- [ ] **Step 2: drift のテストを書く**（`test/sw-precache.test.ts`）
  - `src/client/styles.module.css` を `?raw` で読み、`url("/…")` の絶対パスをすべて取り出して、どれも `isStablePrecache` が真であること。抽出が 0 件でないことも確かめる（今は少なくともフォント 3 つとアイコン）
  - `index.html` を `?raw` で読み、`href="/…"` / `src="/…"` / `srcset="/…"` のうち `/icons/`・`/favicon`・`/apple-touch-icon`・`/manifest` で始まるものがすべて真
  - `public/manifest.webmanifest` の `icons[].src` がすべて真
- [ ] **Step 3: 版数のテストを書く**（`test/sw-precache.test.ts`）
  - 返り値が `/^[0-9a-f]{16}$/` に一致する
  - 同じ入力を並べ替えて渡しても同じ値
  - `stable` の 1 件の `sha256` を変えると値が変わる
  - `hashedAssets` の 1 件を変えると値が変わる
  - `stable` に 1 件足すと値が変わる（パスも入力に入っていること）
- [ ] **Step 4: 失敗を確かめる** — Run: `just test test/sw-strategy.test.ts test/sw-precache.test.ts` / Expected: `isStablePrecache` と `cacheVersion` が無いので FAIL
- [ ] **Step 5: 述語と版数を実装する**（上の Interfaces のとおり）
- [ ] **Step 6: 通ることを確かめる** — Run: 同じ / Expected: PASS
- [ ] **Step 7: コミット**

### Task 2: plugin を述語と版数につなぐ

**Files:**
- Modify: `vite.config.ts`（`STABLE_PRECACHE` を消し、`serviceWorkerPlugin` を差し替える）

**Interfaces:**
- Consumes: `isStablePrecache`、`cacheVersion`（Task 1）、`sha256HexBytes`（`src/brand/masters.ts`）

- [ ] **Step 1: `serviceWorkerPlugin` を書き換える**
  - `configResolved` で `config.publicDir` を持つ（`brandIndexHtmlPlugin` と同じ形）
  - `generateBundle` で `readdir(publicDir, { recursive: true })` を読み、`/` 区切りの絶対パスにして `isStablePrecache` で絞り、並べ替える。各ファイルのバイト列を `sha256HexBytes` にかける
  - `precache = ["/", ...hashed, ...stable のパス]`、`__CACHE_VERSION__` は `cacheVersion({ hashedAssets: hashed, stable })`
  - 読めなかったときは理由を付けて止める（`brandIndexHtmlPlugin` の `reject` と同じ方針）
- [ ] **Step 2: ビルドして中身を確かめる** — Run: `just build` / Expected: `(!)` が 0 行。`dist/client/sw.js` の precache に `/icons/nd.svg` と `/icons/sb.svg` があり、`/ogp/`・`/fonts/OFL.txt`・`/llms.txt` が無い
- [ ] **Step 3: 版数が中身に追従することを確かめる**（`.cache/` に作った書き捨てのコピーで行う。リポジトリの `public/` は変えない）
  - 基準のビルドの版数を控える。`public/icons/nd.svg` の末尾に改行を 1 つ足してビルドし、版数が変わること
  - 元に戻して `public/ogp/ogp-landscape.png` を変えたビルドでは、版数が基準と同じこと
- [ ] **Step 4: `just check` と全ブラウザの E2E を通す**（offline.spec を含む）
- [ ] **Step 5: コミット**

### Task 3: 裏の更新を `event.waitUntil` に入れる

**Files:**
- Modify: `src/client/sw.ts`

- [ ] **Step 1: `handle` に `event` の `waitUntil` を渡し、`staleWhileRevalidate` がキャッシュを返すときに、裏の取得とキャッシュへの書き込みを `waitUntil` に渡す。** 失敗は今と同じく握りつぶす（`waitUntil` に渡す Promise は reject しない形にする）。キャッシュが無いときは今どおりネットワークの応答を返す
- [ ] **Step 2: 確かめる** — Run: `just typecheck` と offline.spec を含む E2E / Expected: PASS。SW 本体の配線は unit テストしない方針（[メモリ: client wiring untested by design]）なので、型と E2E で見る
- [ ] **Step 3: コミット**

### Task 4: 変異注入とまとめ

- [ ] **Step 1: 1 つずつ入れて赤くなることを確かめる**（復元は Edit で行い、`git checkout` を使わない）
  - 述語から `/fonts/` の分岐を外す → Task 1 の述語のテストと CSS の drift のテストが赤
  - `cacheVersion` が `stable` を無視する → 版数のテストが赤
  - `cacheVersion` が並べ替えない → 並べ替えのテストが赤
  - plugin が `stable` を渡さない（取り付けを外す） → Task 2 Step 3 の版数の追従が崩れる（ビルドの比較で確かめる）
- [ ] **Step 2: ISSUE-4 のタスクを消化してクローズ（PR に同梱）、メモリ `cospl-pwa-sw-gotchas.md` の「cache 版数は…ハッシュ付き JS/CSS 全体を…」を新しい作りに直す**
