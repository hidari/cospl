# マーク・ロゴ刷新とダークモード Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** マーク C（レンズの C と被写体の点）を 1 か所で定義し、ファビコン・PWA・apple-touch・OGP・サイトのロゴに使い、サイトを OS 設定に従うダークモードに対応させる。

**Architecture:** `src/brand/mark.ts` が形・比率・色の唯一の定義と SVG を返す純粋関数を持つ。`just images` がそれを esbuild で bundle して SVG を書き出し、既存の手順で PNG・ICO・OGP を描く。コミット済みの生成物と `index.html` のマークは一致テストで固定する。ダークモードは `styles.module.css` のトークンを `@media (prefers-color-scheme: dark)` で差し替える。

**Tech Stack:** TypeScript、Vitest（workerd、`?raw` import）、esbuild、playwright-core（画像描画）、Playwright Test（E2E）、CSS Modules

**Spec:** `docs/superpowers/specs/2026-10-26-brand-mark-design.md`

## Global Constraints

- マーク: 弧は中心 (50, 50)・半径 30・線幅 11・丸い線端、(72, 30) から反時計回りの大きい弧で (72, 70) まで。点は中心 (52, 50)・半径 11。外形の枠は `10.5 14.5 71 71`
- アイコンのマークの高さ = 一辺の 75%（全サイズ共通）。maskable は外形が中心の安全円（直径 = 一辺の 80%）に収まる
- ロゴ: マークの高さ = 文字の大きさの 1.05 倍、隙間 = 28%、文字は Space Grotesk 700・字間 -0.02em・1 色「CosPL」、マークは 1em の箱の縦中央
- 色: アイコン・ライト 地 `#7b54ff` / C `#ffffff` / 点 `#ffb37a`。アイコン・ダーク 地 `#1c1430` / C `#a98bff` / 点 `#ff9e5c`。ロゴ・ライト C `#7b54ff` / 点 `#ff7a2f` / 文字 `#1c1430`。ロゴ・ダーク C `#a98bff` / 点 `#ff9e5c` / 文字 `#ffffff`
- 切り替えられない画像（PNG・ICO・OGP・apple-touch・PWA）はライトの配色
- ダークモードは CSS だけ（JS なし）。濃い地の部品（`.id`、ツールチップ 2 種）はダークでも濃い地のまま
- try-catch・`any`・新規の `as` は禁止。純粋関数は自前の型だけを返す（このモジュールは失敗しないので Result は不要）
- コメントは日本語。コマンドの入口は `just`

## Review Focus

- favicon.svg をダークのブラウザで開く: タブのアイコンがダークの配色になる → Task 2 のテストで `@media (prefers-color-scheme: dark)` と両方の配色を含むことを確かめる
- Safari / iOS: SVG ファビコンを使わず ICO と apple-touch を見る。apple-touch の角が黒くならない → Task 2 で apple-touch 用 SVG の地が全面（角丸なし）であることを確かめる
- ダークで識別子バー・ツールチップが読める（白く反転しない）→ Task 4 のコントラストテストに `--on-panel` / `--panel` の組を両モードで入れる
- ダークでヘッダーのロゴが消えない（紫紺の文字が紫紺の地に乗らない）→ Task 5 の E2E でダーク時のロゴの文字色が地と違うことを確かめる
- `just images` を再実行しても生成物が変わらない（冪等）→ Task 2 の一致テストが、コミット済みファイルと生成結果の完全一致を見る

---

### Task 1: マークの定義と SVG 生成（`src/brand/mark.ts`）

**Files:**
- Create: `src/brand/mark.ts`
- Test: `test/brand/mark.test.ts`

**Interfaces:**
- Produces:
  - `type MarkColors = { c: string; dot: string }`
  - `const ICON_MARK_RATIO = 0.75`、`const MASKABLE_SAFE_RADIUS = 40`（100 四方の座標で）
  - `const LOGO = { markEm: 1.05, gapEm: 0.28, letterSpacingEm: -0.02 }`
  - `const PALETTE = { iconLight, iconDark, logoLight, logoDark }`（値は Global Constraints の色。icon は `{ bg, c, dot }`、logo は `{ c, dot, text }`）
  - `markShapes(colors: MarkColors): string` — マーク座標系の `<path …/><circle …/>`（`class` 付きで favicon の CSS から色を差し替えられること）
  - `markExtentRadius(): number` — 外形の枠の中心から外形の最遠点までの距離（マーク座標）
  - `iconSvg(opts: { bg: string; colors: MarkColors; cornerRadius: number; ratio: number }): string` — viewBox `0 0 100 100`、地の角丸 `cornerRadius`（0 で全面）、マークの高さ = `ratio * 100`、枠の中心を (50, 50) に置く
  - `faviconSvg(): string` — ライトの iconSvg（角丸 24）に `<style>@media (prefers-color-scheme: dark){…}</style>` でダークの配色を足したもの
  - `maskableSvg(): string` — 角丸 0、`markExtentRadius() * scale <= MASKABLE_SAFE_RADIUS` を満たす最大の ratio
  - `appleTouchSvg(): string` — 角丸 0、ratio 0.75、ライト
  - `logoGroup(x: number, baselineY: number, fontSize: number, colors: { c: string; dot: string; text: string }): string` — OGP に差し込む `<g>`。マーク + `<text>CosPL</text>`

- [ ] **Step 1: 失敗するテストを書く**

`test/brand/mark.test.ts` に次の仕様を書く（期待値は Global Constraints の数値）:
- `iconSvg({..., ratio: 0.75})` のマークの拡大率 × 71 が 75（transform の `scale` を正規表現で取り出して検算）
- `maskableSvg()` の拡大率 × `markExtentRadius()` が 40 以下で、拡大率を 1% 上げると 40 を超える（最大であること）
- `appleTouchSvg()` の地の `rect` に `rx` が無い（または 0）
- `faviconSvg()` が `prefers-color-scheme: dark` と、ライト / ダークの 6 色すべてを含む
- `logoGroup(0, 100, 64, PALETTE.logoLight)` のマークの高さが 64 × 1.05、文字の x 位置がマークの右端 + 64 × 0.28、`letter-spacing` が -0.02em 相当、文字が `CosPL`
- `markShapes` の弧と点の座標が Global Constraints と一致

- [ ] **Step 2: 実行して失敗を確かめる**

Run: `just test test/brand/mark.test.ts` → Expected: モジュールが無くて FAIL

- [ ] **Step 3: `src/brand/mark.ts` を実装する**

外部依存なし。数値は文字列化時に小数 3 桁以内へ丸め、生成結果が実行環境で揺れないようにする。

- [ ] **Step 4: 実行して通ることを確かめ、変異注入する**

Run: `just test test/brand/mark.test.ts` → PASS。`ICON_MARK_RATIO`・`LOGO.gapEm`・maskable の縮小計算をそれぞれ 1 か所ずつ壊して、対応するテストが赤くなることを確かめてから戻す。

- [ ] **Step 5: `just check` を通してコミット**

`feat(brand): マークの形・比率・色を 1 か所で定義し SVG を生成する`

### Task 2: `just images` を生成元に切り替え、一致テストで固定する

**Files:**
- Modify: `scripts/build-images.mjs`
- Modify: `public/ogp/ogp-landscape.svg`、`public/ogp/ogp-square.svg`（旧ワードマークの `<g>` を目印に置き換える）
- Generate: `public/favicon.svg`、`public/icons/maskable.svg`、PNG / ICO / OGP 一式
- Delete: `public/icons/mark.svg`
- Test: `test/brand/generated.test.ts`

**Interfaces:**
- Consumes: Task 1 の `faviconSvg`・`maskableSvg`・`appleTouchSvg`・`logoGroup`・`PALETTE`
- Produces: OGP の目印 `<!-- brand:logo -->` と `<!-- /brand:logo -->`（その間は生成物）

- [ ] **Step 1: 失敗するテストを書く**

`test/brand/generated.test.ts`（`?raw` で読む）:
- `public/favicon.svg` が `faviconSvg()` と完全一致
- `public/icons/maskable.svg` が `maskableSvg()` と完全一致
- 2 枚の OGP が目印をちょうど 1 組持ち、その間が `logoGroup(…)` の出力と一致（位置と大きさは各 OGP の旧ワードマークの位置・64px / 84px を目安に、この Task で決めた値をテストにも書く）

- [ ] **Step 2: 実行して失敗を確かめる**

Run: `just test test/brand/generated.test.ts` → FAIL（旧ファイルのまま）

- [ ] **Step 3: `build-images.mjs` を変える**

`regen-golden.mjs` と同じ手順で `src/brand/mark.ts` を bundle し、描画の前に `favicon.svg`・`maskable.svg` を書き出す。apple-touch は `appleTouchSvg()` を一時ファイルに書いて 180px で描く（`transparent: false`）。OGP は目印の間を `logoGroup` の出力で置き換えてから描く。OGP の旧ワードマークの `<g>`（「C」「os」・角丸の枠・「PL」）は手で目印に置き換える。

- [ ] **Step 4: 生成してテストを通す**

Run: `just images` → 続けて `just test test/brand/generated.test.ts` → PASS。もう一度 `just images` を実行し、`git status` で生成物に差分が出ない（冪等）ことを確かめる。生成した PNG（icon-512・apple-touch・OGP 2 枚）を Read で目視し、比率と配色が設計どおりか確かめる。

- [ ] **Step 5: `index.html` の `og:image` と `twitter:image` の `?v=2.0` を `?v=2.0-brand` に変える**（X のカードのキャッシュを切り替える）

- [ ] **Step 6: `just check` を通してコミット**

`feat(brand): アイコンと OGP を新しいマークで生成し直す`

### Task 3: 色のトークンを役割ごとに分け、直書きをなくす

**Files:**
- Modify: `src/client/styles.module.css`
- Test: `test/brand/tokens.test.ts`

**Interfaces:**
- Produces: 新しいトークン `--panel`（濃い地）、`--on-panel`（濃い地の上の文字）、`--card`（白い面）、`--on-accent`（紫の上の文字）、`--overlay`（半透明の面）、`--shadow`（影の色）。既存の `--ink`（文字）・`--paper`（ページの地）・`--muted`・`--accent-ink`・`--warm-on-dark` は意味を変えずに使う

- [ ] **Step 1: 失敗するテストを書く**

`test/brand/tokens.test.ts`（`styles.module.css?raw`）:
- `:global(:root)` のトークン定義ブロックと、後で足すダークのブロックの外に、`#` で始まる色と `rgb(` / `rgba(` が 1 つも無い
- `.id`・ツールチップ 2 種の `background` が `var(--panel)`、`color` が `var(--on-panel)`

- [ ] **Step 2: 実行して失敗を確かめる**（18 か所の直書きで FAIL）

- [ ] **Step 3: 18 か所をトークンに置き換える**

`#fff` は使われ方で `--card` / `--on-panel` / `--on-accent` に振り分け、`rgba(28,20,48,…)` は `--shadow` を使う形（`rgb(var(--shadow) / 0.22)` など）にする。ライトの見た目は変えない（値は今と同じ）。

- [ ] **Step 4: テストと E2E（chromium）を通す**

Run: `just check` と `just e2e --project chromium` → PASS（見た目が変わっていないことの回帰確認）

- [ ] **Step 5: コミット** `refactor(style): 色のトークンを役割ごとに分け直書きをなくす`

### Task 4: ダークモードのトークンとコントラストのテスト

**Files:**
- Modify: `src/client/styles.module.css`、`index.html`（theme-color）
- Test: `test/brand/contrast.test.ts`

**Interfaces:**
- Consumes: Task 3 のトークン名

- [ ] **Step 1: 失敗するテストを書く**

`test/brand/contrast.test.ts`: CSS からライトとダークのトークン値を取り出し、WCAG の相対輝度でコントラスト比を計算する。両モードで次を満たす:
- 4.5:1 以上: (`--ink`, `--paper`)、(`--muted`, `--paper`)、(`--on-panel`, `--panel`)、(`--accent-ink`, `--paper`)、(`--on-accent`, `--accent`)
- 3:1 以上: (`--warm-ink`, `--paper`)
- マークの色（ロゴとアイコン）は対象外であることをテストのコメントに書く
- `index.html` に `media="(prefers-color-scheme: light)"` の theme-color `#7b54ff` と、`dark` の `#1c1430` がある

- [ ] **Step 2: 失敗を確かめる**（ダークのブロックが無くて FAIL）

- [ ] **Step 3: `@media (prefers-color-scheme: dark)` で `:root` のトークンを差し替え、theme-color を 2 本にする**

ダークの値は作る人が決める。ページの地は `#1c1430`、`--panel` はそれより一段明るい紫紺、ロゴ用に `--logo-c` `--logo-dot` も両モードで定義する（Task 5 が使う）。`color-scheme: light dark` を `:root` に付ける。

- [ ] **Step 4: テストを通し、変異注入する**（ダークの `--paper` を明るくして赤、`--on-panel` を `--panel` に近づけて赤）

- [ ] **Step 5: コミット** `feat(style): OS 設定に従うダークモードに対応する`

### Task 5: ヘッダーのロゴを新しいマークにする

**Files:**
- Modify: `index.html:41`（`.wordmark`）、`src/client/styles.module.css`（`.wordmark` 系を削除し `.logo` を追加）
- Test: `test/brand/generated.test.ts`（追記）、`e2e/brand.spec.ts`（新規）

**Interfaces:**
- Consumes: Task 1 の `markShapes`・`LOGO`、Task 4 の `--logo-c` / `--logo-dot`

- [ ] **Step 1: 失敗するテストを書く**
- `generated.test.ts`: `index.html` のロゴの SVG が `markShapes` と同じ弧と点の座標を持つ
- `e2e/brand.spec.ts`: ヘッダーのロゴが `getByRole("img", { name: "CosPL" })` で見つかる。`colorScheme: "dark"` で開くと、ページの地の色がライトと違い、ロゴの文字色と地の色が違う

- [ ] **Step 2: 失敗を確かめる**（`just test` と `just e2e e2e/brand.spec.ts --project chromium`）

- [ ] **Step 3: 実装する**

`<p class="wordmark">` を、`role="img" aria-label="CosPL"` のロゴ（インライン SVG のマーク + 文字「CosPL」）に置き換える。マークの色は `var(--logo-c)` / `var(--logo-dot)`、文字は `var(--ink)`。大きさと隙間は `LOGO` の値を `em` で書く（`1.05em`・`0.28em`・`-0.02em`）。旧 `.wordmark` / `.pl` / `.pl-t` のスタイルは削除する。

- [ ] **Step 4: テストを通し、ライト / ダークのスクリーンショットを撮って目視する**

- [ ] **Step 5: コミット** `feat(brand): ヘッダーのロゴを新しいマークにする`

### Task 6: 仕上げ

- [ ] `just check`・`just e2e --project chromium`・`just images` の冪等性を確かめる
- [ ] 品質ゲート（simplify・code-reviewer）を通して PR を作り、Merge Gate 緑でマージ
- [ ] `just release-site` でリリースし、本番で favicon・OGP・ダークモードを確かめる
