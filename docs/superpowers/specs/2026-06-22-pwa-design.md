# インストール可能 PWA 導入 設計

作成日: 2026-06-22

## 目的

cospl をインストール可能な PWA にし、ホーム画面に追加して standalone 起動でき、初回ロード後はオフラインでも全機能が動作する状態にする。core.ts のタグ→Markdown 生成は純粋・クライアント完結のため、アプリシェルをキャッシュできればオフラインで全機能が成立する素地が既にある。本設計は (1) Web App Manifest によるインストール可能性、(2) 手書き最小 Service Worker によるオフライン動作、(3) 仮アイコンによる先行実装と本デザインの後追い差し替え、を最小依存で実現する。

## 確定した設計判断

ユーザーとの brainstorming で以下を合意した。

### スコープ: manifest + 最小 SW（オフライン app-shell 込み）

「インストール可能」を本気でやる。Chromium の良質なインストール導線（beforeinstallprompt）は manifest + アイコン(192/512) + fetch ハンドラを持つ Service Worker が揃って成立するため、manifest 単体ではなく最小 SW をセットで入れる。SW を入れるとオフライン起動がほぼ無料で付く。

スコープ外: サイト内アイコンの分かりづらさ修正（取り下げ可能=TD がダウンロードに見える件。ユーザーが別変更で対応）、push 通知 / background sync、追加の永続ストレージ（状態は URL hash 完結のため不要）。

### SW 実装方式: 手書き最小 SW（Workbox 不採用）

vite-plugin-pwa(Workbox) は記述量が最小な一方、依存が大きく推移依存も多いため「依存最小」「サプライチェーンの影響範囲をアダプタに限定」の MUST と衝突し、生成 SW はライブラリ所有でロジックを自前テストしづらい。1 ページのアプリシェルには過剰。よって手書き最小 SW を採用し、「どの戦略を使うか」の判定を純粋関数に寄せて unit/契約テストで仕様を固定する。precache のハッシュ付きアセット名はビルドグラフから権威取得する（後述）。

### precache 生成方式: Vite プラグイン（generateBundle で /sw.js を emit）

ハッシュ付きアセット名（/assets/index-<hash>.js 等）は毎ビルドで変わるため SW にハードコードできない。これを Vite プラグインの generateBundle フックで bundle から権威取得し、precache リスト + キャッシュ版数を注入して /sw.js（固定名・無ハッシュ）を emit する。

この方式が正しい理由は経路の一貫性にある。deploy.yml は `pnpm run deploy`（= `vite build && wrangler deploy`）を呼び、E2E は `pnpm build`（= `tsc --noEmit && vite build`）を呼ぶ。「`pnpm build` に後処理スクリプトを足す」方式だと deploy 経路（`vite build` 直叩き）で SW 生成がスキップされ本番だけ SW が欠落する。SW 生成を `vite build` 自体の一部（Vite プラグイン）にすれば deploy / E2E / merge-gate の dry-run の全経路で一貫して /sw.js が入る。@cloudflare/vite-plugin が複数環境ビルドで generateBundle を複数回発火させる場合は、クライアントビルド（index.html / JS アセットを含む bundle）に限定して emit するようガードする。

### 更新 UX: サイレント自動更新

`skipWaiting` + `clients.claim` で新 SW を即時有効化する。状態は URL hash 完結でナビゲーションは network-first のため、通常リロードで常に最新が出る。「新バージョンあり→再読み込み」プロンプトは UI/i18n を増やす割に得が薄く KISS 的に不採用。単一 HTML の全リロード型のため skipWaiting の「旧ページ×新アセット」事故は実害がない。

### アイコン: 既存パイプライン流用・仮→本の差し替え

新規依存を足さず、既存のブランド画像生成（scripts/build-images.mjs、playwright-core + システム Chrome で SVG→PNG）を拡張して PWA アイコンを生成する。favicon.svg（濃色角丸地 + 白 Union マーク）から icon-192.png / icon-512.png を、新規 maskable 専用 SVG（角丸を外した全面ベタ塗り + 安全領域内のマーク）から icon-512-maskable.png を生成する。生成 PNG は public/icons/ にコミットする成果物（apple-touch-icon.png と同じ流儀）。本デザインは同一パスへの差し替えで反映され、manifest / コードは不変。

## アーキテクチャ

### キャッシュモデル

全リソースが same-origin（フォント・アイコンも自前ホスト）。cross-origin / 非 GET は素通しする。

| リソース | 可変性 | 戦略 |
|---|---|---|
| `/`（index.html・Worker 処理済） | 可変（毎 deploy） | network-first → 失敗時キャッシュ shell |
| `/assets/*.js` `/assets/*.css` | ハッシュ付き・不変 | cache-first |
| `/fonts/*.woff2` | 安定 | cache-first |
| `/icons/*` `/favicon.*` `/apple-touch-icon.png` `/manifest.webmanifest` | 安定・まれに変更 | stale-while-revalidate |
| `/ogp/*`（大画像・オフライン不要） | — | 素通し（キャッシュしない） |
| Worker 動的（`/license.md` `/llms.txt` `/robots.txt` 等） | — | 素通し（UI は fetch しない） |
| `/sw.js` | — | SW では触らない（ブラウザが更新管理） |

オフライン起動の保証: install 時に shell 一式（`/` + 現行ハッシュ付き JS/CSS + フォント + アイコン + manifest）を precache する。初回訪問直後にオフラインにしても起動できる。`/assets/*` の cache-first は precache 漏れの安全網。単一バージョンキャッシュ `cospl-<version>` を使い、activate で旧バージョンを破棄する。

### Service Worker の純粋/副作用分離

プロジェクトの「純粋ロジックは core、配線は端」方針を踏襲する。

- `src/client/sw-strategy.ts`（純粋）: Request の記述子（method / same-origin か / URL パス / mode・destination）から戦略（precache / cache-first / network-first / swr / passthrough）を返す純関数。unit + 契約テストで仕様を固定する。キャッシュ・fetch を直接呼ばない。
- `src/client/sw.ts`（副作用）: install / activate / fetch を sw-strategy の判定に配線する薄い層。キャッシュ操作の副作用だけを持つ。precache リストとキャッシュ版数はビルド時注入の定数を参照する。
- `src/client/sw-register.ts`（Library Contract アダプタ）: navigator.serviceWorker を包む。feature 検出・no-throw・Result 返却。try-catch を使わず Promise の then/catch で合成する（main.ts の copyText 等と同様の様式）。

### 登録（PROD 限定）

main.ts から本番ビルド時だけ registerServiceWorker('/sw.js') を呼ぶ（import.meta.env は DEV のみ宣言のため `!import.meta.env.DEV` で判定する）。dev は SW 無し（sw.js は build でのみ emit されるため dev では 404 になり HMR を汚さない）。vite preview / E2E は本番ビルドのため SW が稼働する。SW は secure context が必要だが、ブラウザは localhost を secure context 扱いするため http://localhost:4173 の preview でも登録できる。PR #32 の CSP scheme ゲートにより HTTP 文書には upgrade-insecure-requests が付かないため、localhost で TLS 昇格に巻き込まれない。

### Manifest / index.html / CSP / _headers

- `public/manifest.webmanifest`: name="CosPL — Cosplay Public License" / short_name="CosPL" / description / lang="ja" / start_url="/" / scope="/" / display="standalone" / theme_color="#7b54ff" / background_color="#1c1430" / icons=[192 any, 512 any, 512 maskable]。
- index.html `<head>` に `<link rel="manifest" href="/manifest.webmanifest">` を追加する。theme-color メタ・apple-touch-icon は既存を流用する。
- CSP（worker.ts buildCsp）に `worker-src 'self'` と `manifest-src 'self'` を明示追加する。現状は default-src 'self' へのフォールバックで動くが、既存の明示ディレクティブ群（connect-src 等）と様式を揃え多層防御を明確化する。本番 CSP が変わるため deploy の check_csp で検証する。
- `public/_headers`: `/sw.js` に `Cache-Control: no-cache`（SW 更新の即時性を担保）。`/manifest.webmanifest` の Content-Type が `application/manifest+json` であることを担保する（CF が拡張子から推定しない場合は明示）。

### Worker / OGP / run_worker_first への影響

SW を実行するのは人間ブラウザだけで、クローラの OGP/発見性経路は SW を通らないため無傷。`/sw.js` と `/manifest.webmanifest` は Worker 加工不要の純アセットのため run_worker_first の変更は不要（実体があるが Worker 処理ルートではない）。Worker の `/` 処理（CSP/Link 付与）も不変で、SW はその処理済み `/` レスポンス（CSP ヘッダ込み）をキャッシュするため、オフライン配信時も CSP が効く。

### ビルド統合

- `vite.config.ts` に SW 生成プラグインを追加する。generateBundle で bundle のキー（ハッシュ付きアセット名）から precache リストを構築し、キャッシュ版数（アセット名集合のハッシュ等）を算出して sw.ts を esbuild でバンドルしつつ定数注入し /sw.js を emit する。esbuild は既存 devDependency のため新規依存はゼロ。
- `scripts/build-images.mjs` に PWA アイコン生成を追加し、`Taskfile.pkl` の images タスクの inputs（maskable SVG ソース追加）/ outputs（icon-192/512/512-maskable.png）に登録する。
- 新規 runtime/build 依存はゼロ（Vite / esbuild / playwright-core はいずれも既存）。

## テスト

- unit(vitest): sw-strategy の戦略選択を exact 値 + negative で固定する。例: navigate→network-first / `/assets/x.js`→cache-first / `/fonts/x.woff2`→cache-first / `/ogp/x.jpg`→passthrough / `/license.md`→passthrough / cross-origin→passthrough / POST→passthrough。テスト群を読めばキャッシュ仕様が分かる状態にする。
- 契約(vitest): sw-register が feature 検出（serviceWorker 非対応で no-throw・適切な Result）と登録成功/失敗の Result 化を満たすことを fake navigator で検証する。
- 統合(vitest): manifest.webmanifest をパースして必須フィールド（name / start_url / display / theme_color / icons に 192 と 512 が存在）を検証し、参照アイコンファイルが実在することと、index.html が manifest を link していることを確認する。
- E2E(Playwright, 4 プロジェクト): ①インストール土台 = `<link rel=manifest>` の存在 / manifest が 200 + application/manifest+json / SW が登録され controller が有効になる / アイコンが 200。②オフライン app-shell = ページロード後 SW active を待ち `context.setOffline(true)` でリロードしても描画が継続し、タグ→Markdown 生成がオフラインで動くこと。既存の vite preview（本番ビルド）経由でそのまま乗る。

## CI 配線

- merge-gate.yml の e2e ジョブが上記 E2E を実行し回帰をマージ前にブロックする（既存の fail-closed アグリゲータをそのまま活用）。
- deploy.yml の health check に検証行を追加する: `/manifest.webmanifest` が 200 + application/manifest+json、`/sw.js` が 200 + JS content-type + Cache-Control no-cache、`/` の CSP に worker-src/manifest-src が載ること（既存 check_csp の拡張）。
- e2e-prod.yml は deploy 成功の workflow_run で同スイートを本番 cospl.org（HTTPS）に当てる。本番も SW が稼働し context.setOffline が使えるため、オフライン spec を含む全スイートがそのまま通る（本番は read-only のため副作用なし）。

## 仮→本アイコン差し替え手順（後追い）

1. ユーザーがロゴ/エンブレムをデザインする。
2. favicon.svg（および maskable 専用 SVG）ソースを差し替えるか、最終 PNG を public/icons/ の同一パスへ直接置く。
3. SVG ソースを変えた場合は `pkf run images` で再生成する。
4. manifest / SW / コードは一切変更不要（契約 = パスとサイズが安定しているため）。

## v1 スコープ外（follow-up）

- サイト内アイコンの分かりづらさ修正（TD = 取り下げ可能 がダウンロードに見える件。ユーザーが別変更で対応）。
- push 通知 / background sync / 共有ターゲット（share_target）。
- インストール促進 UI（カスタム install ボタン、beforeinstallprompt の握り込み）。
- スクリーンショット付き manifest（リッチインストール UI）。
- manifest に `id` フィールド（例 `"id": "/"`）を追加して URL 変更に強い安定したアプリ識別子を持たせる（W3C 推奨。現状は start_url=/ にフォールバックするため非必須）。
- キャッシュ版数 `__CACHE_VERSION__` をエントリ JS ハッシュ単独ではなく precache 集合全体のハッシュから導出し、同名 cache-first アセット（例: 同ファイル名のフォント差し替え）のみを変える deploy でも版数が上がるようにする（現状は実質エントリハッシュが同時に変わるため理論上のギャップ）。

## 検証方針

- キャッシュ戦略は純粋関数に寄せ、テスト群が仕様書となる exact + negative の assertion で固定する。
- SW 登録は Library Contract アダプタに閉じ、配線は E2E（Playwright）で確認する（client-wiring-untested-by-design 方針）。
- 本番限定の Cloudflare ルーティング / CSP / 実バンドル挙動は deploy health check と e2e-prod でカバーする（統合テストでは ASSETS スタブのため検出できない）。
- 固定 wait を排し web-first assertion と SW ライフサイクルイベントの待機で flake を抑える。
