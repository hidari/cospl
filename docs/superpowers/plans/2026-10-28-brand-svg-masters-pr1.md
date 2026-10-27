# ブランド画像の SVG マスター化 PR 1（アイコンと仕組み）Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Goal: アイコン 3 枚（favicon・PWA・apple-touch・maskable の元）を `brand/` の SVG マスターから作る仕組みに切り替え、配信してはいけない中身を持つマスターと、ラスタ画像の作り直し忘れをテストで捕まえる。

Architecture: マスターの一覧と検査は純粋関数のモジュール `src/brand/masters.ts` が持ち、テストと `scripts/build-images.mjs`（`loadTs` で読む）の両方が使う。`just images` はマスターを検査してから描画・変換し、写しとハッシュの記録（`brand/generated.json`）を書く。ロゴと OGP は PR 2 まで今の仕組み（`mark.ts` の差し込み）のまま。

Tech Stack: TypeScript（vitest は workerd 上、マスターは `?raw` で読む）、Node の `.mjs` スクリプト、playwright-core + システム Chrome、cwebp、magick。

Spec: `docs/superpowers/specs/2026-10-28-brand-svg-masters-design.md`

## Global Constraints

- try-catch・`any`・新規の `as` は使わない。失敗は `src/types/result.ts` の `Result` で返す
- 依存を増やさない（XML パーサや SVG 最適化のライブラリを入れない）
- コメントとログは日本語。マスターのファイル名と比率は `src/brand/masters.ts` が唯一の定義で、README などの散文には値を再掲せずファイル名で参照する
- `brand/` は配信しない（`public/` の外）
- ハッシュは SHA-256 の小文字 16 進。テスト（workerd）とスクリプト（Node）で同じ関数 `sha256Hex` を使う（どちらも `globalThis.crypto.subtle` を持つ）

## Review Focus

- Affinity の実際の書き出し（XML 宣言・外部 DTD の DOCTYPE・`xmlns:serif`・`width="100%"`）は検査を通る。Task 1 に、既存の `public/ogp/ogp-landscape.svg` の先頭 4 行と同じ形のフィクスチャを通すテストを置く
- 大文字や名前空間付きの危険な要素（`<SCRIPT>`、`<svg:script>`、`<FOREIGNOBJECT>`）も拒否する。Task 1 に置く
- `href` は許可リスト方式（`#id` と `data:image/(png|jpeg|webp)` だけ）。`java&#115;cript:` のような符号化や空白入りも、許可リストに当たらないので拒否される。`<set>` / `<animate>` で `href` を書き換える形も拒否する。Task 1 に置く
- `style` 属性や `<style>` の中の `url(...)` と `@import` は `#id` 以外を拒否する。Task 1 に置く
- マスターを更新したのに `just images` を忘れた状態は、`brand/generated.json` との比較で赤くなる。Task 2 の変異注入で確かめる

## ファイル構成

- Create `src/brand/masters.ts`: マスターの一覧 `BRAND_MASTERS`、検査 `inspectMaster`、`sha256Hex`
- Create `test/brand/masters.test.ts`: `inspectMaster` の仕様（合成した入力）
- Create `test/brand/masters-files.test.ts`: 実際のマスター・写し・`generated.json` の一致
- Create `brand/icon.svg` `brand/icon-full.svg` `brand/icon-maskable.svg` `brand/generated.json` `brand/README.md`
- Modify `scripts/build-images.mjs`: アイコンをマスター起点に。写しとハッシュの記録
- Modify `src/brand/mark.ts` `test/brand/mark.test.ts` `test/brand/generated.test.ts`: アイコン専用の部分を外す
- Delete `public/icons/maskable.svg`

### Task 1: マスターの検査モジュール

Files:
- Create: `src/brand/masters.ts`
- Test: `test/brand/masters.test.ts`

Interfaces:
- Produces:
  - `type ViewBox = { x: number; y: number; width: number; height: number }`
  - `inspectMaster(svg: string): Result<{ viewBox: ViewBox }, string>`（エラーは何に違反したかの日本語 1 行）
  - `sha256Hex(text: string): Promise<string>`（UTF-8 にエンコードしてから SHA-256）
  - `type BrandMaster = { file: string; ratio: number; copyTo?: string }`、`BRAND_MASTERS: readonly BrandMaster[]`（Task 2 で中身を入れる。この Task では空配列でよい）

- [ ] Step 1: 失敗するテストを書く（`describe("inspectMaster")`）
  - 通る: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100"/></svg>` → `success`、`viewBox` が `{0,0,100,100}`
  - 通る: Affinity 形のフィクスチャ（`<?xml version="1.0" encoding="UTF-8" standalone="no"?>`、`<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">`、`<svg width="100%" height="100%" viewBox="0 0 1200 630" ... xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:serif="http://www.serif.com/" ...>`）
  - 通る: `<use href="#a"/>`、`<use xlink:href="#a"/>`、`<image href="data:image/png;base64,AAAA"/>`、`fill="url(#g)"`
  - 拒否（`test.each`、各入力で `success === false`）: `<script>`、`<SCRIPT>`、`<svg:script>`、`<foreignObject>`、`<FOREIGNOBJECT>`、`onload="x"`、`ONCLICK='x'`、`<a href="https://example.com">`、`href="//example.com/x.svg"`、`href="java&#115;cript:alert(1)"`、`href=" #a"`、`<image href="data:image/svg+xml;base64,AAAA"/>`、`<set attributeName="href" to="#a"/>`、`<animate attributeName="xlink:href"/>`、`style="fill:url(https://e/x)"`、`<style>@import "x.css";</style>`、`<style>.a{fill:url(http://e/#g)}</style>`、`<text>CosPL</text>`、`<!DOCTYPE svg [<!ENTITY e "x">]>`、ルートが `<html>`、viewBox が無い、viewBox の数が 4 つでない
- [ ] Step 2: `just test test/brand/masters.test.ts` を実行し、モジュールが無くて FAIL することを確かめる
- [ ] Step 3: `src/brand/masters.ts` に実装する。正規表現で、大文字小文字を区別せず、名前空間の接頭辞（`[\w-]+:`）付きのタグ名も同じ扱いにする。`href` / `xlink:href` の値と `url(...)` の中身は許可リストに一致したものだけを通す。ルート要素は XML 宣言・DOCTYPE・コメントを除いた最初の要素で判定する
- [ ] Step 4: `just test test/brand/masters.test.ts` が PASS する
- [ ] Step 5: 変異注入。`<script>` の検査、`on*` の検査、`href` の許可リスト、内部サブセットの検査を 1 つずつ外し、それぞれ対応するテストが赤くなることを確かめてから戻す
- [ ] Step 6: `just lint` と `just test` が緑。コミット `feat(brand): SVG マスターの検査を足す`

### Task 2: アイコン 3 枚のマスターと just images の切り替え

Files:
- Create: `brand/icon.svg` `brand/icon-full.svg` `brand/icon-maskable.svg` `brand/generated.json`
- Modify: `src/brand/masters.ts`（`BRAND_MASTERS`）、`scripts/build-images.mjs`
- Delete: `public/icons/maskable.svg`
- Test: `test/brand/masters-files.test.ts`

Interfaces:
- Consumes: Task 1 の `inspectMaster` / `sha256Hex` / `BRAND_MASTERS`
- Produces: `BRAND_MASTERS` の値

```ts
[
  { file: "icon.svg", ratio: 1, copyTo: "favicon.svg" },
  { file: "icon-full.svg", ratio: 1 },
  { file: "icon-maskable.svg", ratio: 1 },
]
```

  `copyTo` は `public/` からの相対パス。`brand/generated.json` は `{ "<file>": "<sha256Hex>" }` を `BRAND_MASTERS` の順で持つ JSON（末尾改行あり）

- [ ] Step 1: 最初のマスターを今の `mark.ts` の出力から作る（書き捨てのスクリプトを `.cache/` に置いて `loadTs` で読む。コミットしない）。`icon.svg` は `iconSvg(角丸 24・比率 0.75・ライト配色)` で、ダーク用の `<style>` を持たない。`icon-full.svg` は `appleTouchSvg()`、`icon-maskable.svg` は `maskableSvg()` と同じ出力。どれも末尾改行を 1 つ付ける
- [ ] Step 2: 失敗するテストを `test/brand/masters-files.test.ts` に書く。`brand/*.svg` と `public/favicon.svg` と `brand/generated.json` を `?raw` で読む
  - `BRAND_MASTERS` の各ファイルが読み込めて、`inspectMaster` が `success`、viewBox の `width / height` が `ratio` と一致する
  - `copyTo` を持つものは、写しがマスターと文字列で完全一致する（`public/favicon.svg` === `brand/icon.svg`）
  - `generated.json` のキーの集合が `BRAND_MASTERS` の `file` の集合と一致し、各値が `sha256Hex(マスター)` と一致する
  - 検査対象が空でない（`BRAND_MASTERS.length` が 3）
  - 同じステップで `test/brand/generated.test.ts` から favicon.svg と maskable.svg を `mark.ts` と比べる `describe` と、その 2 つの `?raw` の import を消す（favicon.svg は写しに変わり、maskable.svg は消すため）
- [ ] Step 3: `just test test/brand/masters-files.test.ts` が FAIL する（`BRAND_MASTERS` が空、`generated.json` が無い、favicon.svg がダーク用の `<style>` を持つ）
- [ ] Step 4: `BRAND_MASTERS` に上の値を入れ、`scripts/build-images.mjs` を変える
  - `masters.ts` を `loadTs` で読み、各マスターを読み込んで `inspectMaster` に通す。失敗なら描画せずに `process.exit(1)`（エラー文とファイル名を出す）
  - favicon.ico（16/32/48）と icon-192 / icon-512 は `brand/icon.svg` から透過で、apple-touch-icon（180）は `brand/icon-full.svg` から、icon-512-maskable は `brand/icon-maskable.svg` から描く
  - `copyTo` の写しを書き、`generated.json` を書く。ハッシュは読み込んだ文字列に `sha256Hex` を使う
  - `mark.faviconSvg` / `maskableSvg` / `appleTouchSvg` の呼び出しと、`public/icons/maskable.svg` を書く処理を外す。OGP の部分とフォントは触らない
- [ ] Step 5: `public/icons/maskable.svg` を削除し、`just images` を実行する。出力に favicon・pwa icons・ogp の 3 行が出て、終了コード 0
- [ ] Step 6: `just test` が全件 PASS。`git status` で変わったファイルを確かめる（favicon.svg、generated.json、PNG/ICO。OGP の PNG/WebP/JPEG が変わっていたら差分の理由を調べる）
- [ ] Step 7: 変異注入（1 つずつ、戻すのは退避したコピーから）
  - `brand/icon.svg` の色を 1 か所変えて `just images` を叩かない → ハッシュの検査が赤
  - `public/favicon.svg` だけを変える → 写しの検査が赤
  - `brand/icon-full.svg` に `<script/>` を足す → masters-files のテストが赤、`just images` が非 0 で止まり画像を書かない
- [ ] Step 8: `just lint` と `just check` が緑。コミット `feat(brand): アイコンを brand/ の SVG マスターから作る`

### Task 3: mark.ts からアイコンの部分を外し、書き出しの説明を置く

Files:
- Modify: `src/brand/mark.ts`、`test/brand/mark.test.ts`、`test/brand/generated.test.ts`
- Create: `brand/README.md`

Interfaces:
- Consumes: なし（Task 2 で build-images はこれらの関数を呼ばなくなっている）
- Produces: `mark.ts` に残す公開名は `BOX`、`markShapes`、`LOGO`、`OGP_LOGO`、`LOGO_MARKS`、`logoMarkSpan`、`logoGroup`、`PALETTE`（`logoLight` / `logoDark` だけ）

- [ ] Step 1: `mark.test.ts` から `describe("アイコン")`・`describe("マークの外形")`・`describe("maskable アイコン")`・`describe("apple-touch-icon")`・`describe("favicon.svg")` を消し、`describe("配色")` の期待値から `iconLight` / `iconDark` を消す
- [ ] Step 2: `mark.ts` から `iconSvg`、`faviconSvg`、`maskableSvg`、`appleTouchSvg`、`lightIcon`、`markExtentRadius`、`floor3`、`ICON_MARK_RATIO`、`MASKABLE_SAFE_RADIUS`、`MarkColors` 以外で使われなくなった型、`PALETTE.iconLight` / `iconDark` を消す。ファイル冒頭のコメントは、今の責務（ヘッダーのマークと OGP に差し込むロゴの定義）だけを書く形に直す
- [ ] Step 3: `brand/README.md` を書く。内容は、Affinity から文字をアウトライン化して SVG で書き出すこと、ファイル名と比率は `src/brand/masters.ts` の `BRAND_MASTERS` が正であること、書き出したら `just images` を叩いてコミットすること、maskable はマークを中心から半径 40% の円に収めること（テストでは守れない）、スクリプトや外部参照を含めないこと（検査で止まる）
- [ ] Step 4: `just check` が緑。`git grep -n "faviconSvg\|maskableSvg\|appleTouchSvg\|markExtentRadius\|ICON_MARK_RATIO\|MASKABLE_SAFE_RADIUS\|iconLight\|iconDark"` が `docs/superpowers` 以外で 0 件（対照として `git grep -n logoGroup` が 1 件以上）
- [ ] Step 5: コミット `refactor(brand): mark.ts からアイコンの生成を外す`

### Task 4: 全体の検証

- [ ] Step 1: `just build` のあと、固定コンテナで E2E を 4 ブラウザ全件
- [ ] Step 2: ローカルのプレビューで、タブの favicon（ライト・ダークの両方の OS 設定で紫地のライト版）と `/apple-touch-icon.png`・`/icons/icon-512-maskable.png` を目視
- [ ] Step 3: `public/icons/maskable.svg` への参照が無いことを `git grep -n "maskable.svg"`（docs/superpowers 以外）で確かめる
