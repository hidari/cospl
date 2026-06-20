# E2E テスト（Playwright）導入 設計

作成日: 2026-06-21

## 目的

cospl のクライアント（src/client/main.ts、約 432 行の DOM 配線）は「純粋ロジックは core.ts に集約し、DOM 配線は unit テストせず Playwright で確認する」方針であり、現状この配線を検証する自動テストが存在しない。本設計は Playwright による E2E テストを導入し、(1) DOM 配線の回帰をマージ前に検出し、(2) 本番 cospl.org の実挙動をリリース後に検証する二段の安全網を構築する。

## 確定した設計判断

ユーザーとの brainstorming で以下を合意した。

### 実行戦略: PR 時ローカル + リリース後本番の二段

捕まえる層が異なるため相補的にする。

- PR 時（ローカル vite preview）: DOM 配線回帰を shift-left でマージ前に検出し、マージをブロックする。
- リリース後（本番 cospl.org）: Cloudflare ルーティング（run_worker_first 等）や CSP・実バンドルなど本番限定の問題を検証する。事後・非ブロッキング。

「本番スモークのみ」だと壊れた配線が一度本番に出てから事後検出になる弱点があり、二段で解消する。

### シナリオ範囲: Core ハッピーパス

main.ts の配線で「壊れたら気づきにくく価値が高い」reducer→render→URL 経路を中心に据える。自動化困難な領域（ネイティブ共有シート等）は v1 スコープ外。

### discovery 検証（4b）と Playwright の責務分離

- API/ヘッダ検証（discovery チェーン）は bash（curl）が適材で、かつ deploy.yml の health check 内にあるため「失敗すればデプロイをブロック」する強いゲート。これは据え置く。
- Playwright はブラウザ UI 検証に専念する。UI スイートは 1 本を baseURL 切替で PR 時（ローカル）/ リリース後（本番）の両 tier に使い回す（DRY）。

### library-contract の適用: Page Object / fixtures で精神適用

Playwright は出荷されないテストツールであり、runtime library-contract（サプライチェーン隔離）の対象外。代わりにパターンの精神（ツールの直接結合を 1 箇所に閉じる）を Page Object / fixtures で実現し、セレクタと操作を集約して spec を生セレクタから分離する。

### ローカル server: vite preview

Core シナリオは全てクライアント完結で Worker を呼ばないため vite preview（静的クライアント配信）で足りる。CSP ヘッダは Worker が付与するため vite preview では検証できないが、CSP は post-release の本番 run と worker.test.ts の buildCsp ユニットテストでカバーされる。本番再現度より構成のシンプルさを優先する。

## アーキテクチャ

### 依存とファイル構成

- devDependency に `@playwright/test`（テストランナー）を追加する。既存の `playwright-core` は scripts/build-images.mjs の画像生成専用で別物、流用しない。
- `playwright.config.ts`（リポジトリ root）に 4 プロジェクト（chromium / firefox / webkit / Mobile Safari = devices['iPhone 14']）と baseURL・webServer・retries・trace を定義する。
- `e2e/` 配下に Page Object（e2e/pages/license-page.ts）、カスタム fixture（e2e/fixtures.ts）、Core シナリオ spec（e2e/*.spec.ts）を置く。

### Playwright 設定の要点

- baseURL は環境変数 E2E_BASE_URL で切り替える。未指定時はローカル preview の URL を既定にする。
- webServer はローカル時のみ自動起動する（vite build → vite preview）。baseURL が外部（本番）のときは webServer を起動せず、稼働中のサイトに当てる。
- retries は CI で 2、ローカルで 0。trace は on-first-retry。固定 wait は使わず web-first assertion（expect(locator).toHaveText 等）で auto-wait に任せる。

### セレクタ戦略

既存の ARIA と id を活用し role ベース + 安定 id を中心にする。chips は button + aria-pressed + data-tag、tabs は role=tab + aria-selected、出力系は既存 id（#out / #ep / #ident）、操作系は既存 id（#copy / #link / #clear-fields / 入力欄 f-photographer 等）。日本語ラベル文字列への結合は最小化する。

## Core シナリオ（5 本）

1. タグトグル: chip クリックで aria-pressed が反転し、#ident・#out（識別子）・#ep（tags= クエリ）・URL hash が一斉に更新されること。
2. タブ切替（human↔ai）: AI タブの起動で aria-selected が移動し、#out が AI 宣言へ変わり、#ep に &view=ai が付くこと。
3. URL hash 復元: タグを含む hash 付きでロードすると chips がそのタグを復元し、出力が一致すること（リロード永続）。
4. コピーのフラッシュ: #copy クリックでボタンが「コピーしました」表示になり aria-live #flash-status にも流れること。クリップボード実体ではなく配線シグナル（フラッシュ UI）を検証し、ブラウザ別の clipboard permission flake を回避する。
5. クリアで PII 除去: photographer / contact を入力し blur で URL に載った後、クリアで入力欄が空になり URL hash から PII が消えること。

## CI 配線

### PR 時（ブロッキング）

merge-gate.yml に e2e ジョブを追加し、集約ジョブ「Merge Gate Result」が full と e2e の両方に依存するようにする。既存の fail-closed アグリゲータ（needs の result を success/skipped のみ許容）をそのまま活用するため required check 名は安定し、E2E 失敗時はマージがブロックされる。ブラウザは playwright install --with-deps で導入し、pnpm キャッシュと合わせてキャッシュする。

### リリース後（事後・非ブロッキング）

deploy.yml の成功を workflow_run で受ける新規 workflow が、同じ Playwright スイートを E2E_BASE_URL=https://cospl.org で実行する。本番 cospl.org は read-only なので直接当てても副作用はない。失敗時は通知する。

### 既存 health check

deploy.yml の bash health check は据え置く（discovery チェーンと /llms.txt の markdown+CORS をブロッキング検証）。Playwright とは責務が異なるため統合しない。

### タスクランナー

Taskfile.pkl に pkf run e2e（playwright test）を追加する。本リポジトリの開発コマンドは pkf 経由に統一する（pnpm 直叩き禁止）。テスト作成時は playwright-e2e-generator を使用する（CLAUDE.md MUST）。

## v1 スコープ外（follow-up）

以下は v1 に含めず、必要になった時点で別タスクとする。

- ネイティブ共有シート（OS ダイアログのため自動化不能）
- execCommand コピーフォールバック
- 実ファイルダウンロードの内容検証
- 矢印 / Home / End によるタブのキーボード移動
- 入力欄の input→プレビュー vs blur→URL のタイミング差
- 共有 disclosure の開閉（Escape / 外側クリック）

## 検証方針

- 固定 wait を排し web-first assertion で auto-wait に任せ、flake を抑える。
- Core シナリオはクライアント完結・同期的 DOM 操作中心で決定論的に保つ。
- クリップポードは OS 実体ではなくフラッシュ UI（配線シグナル）を検証してブラウザ別 permission flake を避ける。
- Page Object に操作とセレクタを集約し、UI 変更の影響を 1 箇所に閉じる。
