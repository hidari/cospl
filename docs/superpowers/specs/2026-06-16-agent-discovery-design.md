# AI Readable 機能（エージェント発見性）設計

作成日: 2026-06-16
対象: cospl（Cloudflare Workers + 静的アセット構成）

## 目的

AI エージェント・クローラがサイトの構造とコンテンツを機械的に発見・取得できるようにする。
具体的には次の4機能を追加する。

1. `/robots.txt` — クロールルールの明示（RFC 9309）
2. `/sitemap.xml` — 正規 URL の列挙（sitemaps.org protocol）、robots.txt から参照
3. ホームページ応答への `Link` ヘッダ付与（RFC 8288）
4. Markdown コンテントネゴシエーション（`Accept: text/markdown` で Markdown を返す）

### スコープ外

- DNS for AI Discovery（DNS-AID）: draft RFC かつ Cloudflare DNS ゾーンへの SVCB/HTTPS レコード追加＋DNSSEC 署名というインフラ作業で、本リポジトリのコード成果物が存在しないため別タスクとする。
- `x-markdown-tokens` レスポンスヘッダ: トークン計数が必要で本機能の範囲外。

## 前提（現状アーキテクチャ）

- `src/worker.ts` が Worker エントリ。現状 `/license.md` のみ生成処理し、それ以外は `env.ASSETS.fetch(request)` で静的アセットへ委譲。
- 静的ファイルは `public/` 配下に置けば ASSETS 経由で配信される（`/llms.txt` がその例）。
- テストは vitest + `@cloudflare/vitest-pool-workers`。`test/worker.test.ts` は `ASSETS` をスタブして Worker ロジックを決定的に検証する。
- 規約: `any`/try-catch 禁止、自前の Result/Option 型、関数型・純粋関数優先、テストは仕様。

## 採用アプローチ

robots.txt / sitemap.xml は静的ファイルではなく Worker 生成とする。

理由（全体最適）:
- 生成内容をテストで保証できる（「仕様としてのテスト」）。静的ファイルは `ASSETS` をスタブする Worker テストの検証網に入らない。
- origin（ドメイン）をリクエスト（`new URL(request.url).origin`）から取得でき、`https://cospl.org` のハードコード（二重管理）を避けられる。
- 既存の `/license.md` 生成と一貫したエッジロジック層になる。

Link ヘッダと Markdown ネゴシエーションはいずれも Worker ロジックが必須のため、4機能すべてを Worker 層に集約する。

## アーキテクチャ

純粋な生成・判定ロジックを新モジュール `src/discovery.ts` に切り出し、`src/worker.ts` がルーティングと ASSETS 連携で配線する。
副作用（ASSETS 取得・Response 構築）は worker.ts に閉じ、discovery.ts は入出力が文字列/boolean の純粋関数のみとする。

### src/discovery.ts（純粋関数）

- `robotsTxt(origin: string): string`
  - 内容: コメント行 ＋ `User-agent: *` / `Allow: /` ／ 空行 ／ `Sitemap: {origin}/sitemap.xml`
  - クロール禁止パスは設けない（ライセンスサイトとしてエージェントの取得を歓迎する方針）。
- `sitemapXml(origin: string): string`
  - `<?xml ...?>` ＋ `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`
  - `<url><loc>` を3件: `{origin}/`、`{origin}/llms.txt`、`{origin}/license.md`
  - `<lastmod>` は持たない（静的ビルド時刻に依存させずシンプルに保つ。必要になれば後続で追加）。
- `prefersMarkdown(accept: string | null): boolean`
  - `accept` に `text/markdown` が明示され、かつ q 値が 0 でないときのみ true。
  - ブラウザの `text/html,application/xhtml+xml,*/*` や `null`、`application/json` は false（既定は HTML を維持）。
- `LINK_HEADER: string`（相対 URI を用いた定数。request URL に対して解決される）
  - `</>; rel="alternate"; type="text/markdown", </sitemap.xml>; rel="sitemap", </llms.txt>; rel="service-desc"`

### src/worker.ts（配線）

ルーティング（GET 前提。非対応メソッド・他パスは従来どおり ASSETS へ委譲）:

- `GET /robots.txt` → `robotsTxt(origin)` を `Content-Type: text/plain; charset=utf-8` で 200
- `GET /sitemap.xml` → `sitemapXml(origin)` を `Content-Type: application/xml; charset=utf-8` で 200
- `GET /`:
  - `prefersMarkdown(request.headers.get("accept"))` が true → ASSETS から `/llms.txt` を取得。`res.ok` なら本文を `Content-Type: text/markdown; charset=utf-8` で再ラップして返す。`res.ok` でなければ ASSETS の応答をそのまま返す（嘘の Content-Type を付けない）。
  - それ以外 → ASSETS から `/` を取得し、`new Headers(res.headers)` に `Link: LINK_HEADER` を付与して再構築（既存ヘッダ非破壊・HTML はブラウザ向けに既定維持）。
- 上記以外のパス・非 GET メソッド → `env.ASSETS.fetch(request)`（現状維持）

共通ヘッダ:
- 新エンドポイント（robots.txt / sitemap.xml / markdown 応答）に `access-control-allow-origin: *` を付与（既存エンドポイントと一貫、エージェントのクロスオリジン取得のため）。
- `cache-control: public, max-age=300`（既存 `/license.md` と一貫）。

### データフロー

リクエスト → Worker がパス判定 → (生成 or ASSETS 取得＋ヘッダ加工) → レスポンス。
origin は `new URL(request.url).origin`。

## エラーハンドリング

- 純粋関数（`robotsTxt`/`sitemapXml`/`prefersMarkdown`）は全域関数で失敗しないため Result 型は用いない。
- 唯一の外部 I/O は ASSETS 取得。`/llms.txt` が `res.ok` でない場合は ASSETS 応答をそのまま返し、Content-Type を上書きしない。
- try-catch は使わない（既存同様、ASSETS の例外は Worker runtime に委ねる）。

## テスト戦略（TDD）

先にテストを書き、それを満たす実装を書く。

### test/discovery.test.ts（新規・ユニット＝仕様）

- `robotsTxt`: `User-agent: *` / `Allow: /` / `Sitemap: {origin}/sitemap.xml` を含む。origin が反映される。
- `sitemapXml`: `<urlset` を含む整形 XML で、`{origin}/`・`{origin}/llms.txt`・`{origin}/license.md` の `<loc>` を含む。
- `prefersMarkdown`: 次の境界を網羅
  - `"text/markdown"` → true
  - `"text/markdown;q=0.9"` → true
  - `"text/markdown;q=0"` → false
  - `"text/html,application/xhtml+xml,*/*"` → false
  - `null` → false
  - `"application/json"` → false

### test/worker.test.ts（拡張・統合）

ASSETS スタブをパス別応答に強化（`/llms.txt` は既知の Markdown 内容、`/` は HTML を返す）。

- `GET /robots.txt` → 200・`text/plain; charset=utf-8`・本文に `Sitemap:` 行と origin。
- `GET /sitemap.xml` → 200・`application/xml; charset=utf-8`・本文に `<urlset` と各 `<loc>`。
- `GET /` ＋ `Accept: text/markdown` → 200・`text/markdown; charset=utf-8`・本文が llms.txt スタブ内容。
- `GET /`（通常 Accept）→ HTML ＋ `Link` ヘッダに3つの rel（`alternate`/`sitemap`/`service-desc`）が含まれる。
- 新エンドポイントに `access-control-allow-origin: *` が付く。

## 実装順序

1. `test/discovery.test.ts` を書く → `src/discovery.ts` を実装。
2. `test/worker.test.ts` を拡張（ASSETS スタブ強化＋新ケース）→ `src/worker.ts` を配線。
3. `pkf run lint` / `pkf run check` / テストで警告0・全緑を確認。
4. pre-merge-quality-gate（simplify / code-reviewer / boy-scout / e2e 影響）を通して PR。
