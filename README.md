# CosPL — Cosplay Public License

コスプレ撮影における、撮影者とモデルのための利用許諾テンプレートです。

コスプレ撮影向けに設計していますが、撮影者と被写体の肖像権が関わるポートレート撮影全般にも使えます。

公式サイト: https://cospl.org

写真の著作権は撮影者に、肖像権はモデルに帰属します。
コスプレ写真はこの二つの権利が常に同居しているため、片方が一方的に許諾する Creative Commons 型のライセンスとは構造が合いません。
CosPL は「撮影者とモデル双方の取り決め」をテンプレート化し、納品データに同梱できる形にしたものです。

## 何が違うのか

- 一方向の許諾ではなく、撮影者・モデル双方の約束を含む相互合意の型
- コスプレ特有の論点（クレジット、商用、AI学習、公開後の取り下げ）をタグで明示
- 衣装が表現するキャラクターの著作権は原作の権利者に帰属し、本許諾の対象外

## タグ

利用条件はタグで表します。書式は `CosPL <バージョン> / <タグ>` です。

```
CosPL 1.0 / BY-NC-NAI-TD
```

各タグの定義は [v1.0/TAGS.md](v1.0/TAGS.md) を参照してください。

## 使い方

1. 付けたい条件のタグを選ぶ
2. [v1.0/template_納品README.md](v1.0/template_納品README.md) の `[撮影者名]` `[モデル名]` `[連絡先]` を埋める
3. 現像済みデータと一緒に納品フォルダへ同梱する

ライセンス本文の参照用テキストは [v1.0/CosPL-1.0.md](v1.0/CosPL-1.0.md) です。

## AI・機械可読

- サイトはタグを選ぶと識別子と納品READMEをその場で生成し、「人間向け」「AI向け宣言」の両方をMarkdownでコピーできます。
- 動的エンドポイント `GET /license.md`（Cloudflare Worker）で、生のMarkdownを返します。
  - `https://cospl.org/license.md?tags=BY-NC-NAI-TD` → 納品README
  - `https://cospl.org/license.md?tags=BY-NC-NAI-TD&view=ai` → AI向け宣言
  - `tags` 省略時は `BY-NC-NAI-TD` を既定とします。
  - CORS 許可済み（`Access-Control-Allow-Origin: *`）なので、ツールやエージェントから直接取得できます。
- `llms.txt` に LLM 向けの概要を置いています。`NAI` タグの作品はAI学習・生成素材としての利用を禁止する旨を明記しています。

### エンドポイントの契約

- 未知のタグ（例 `?tags=ZZZ`）や不正な `view`（`human` / `ai` 以外）は `400 Bad Request` を返し、本文にエラー種別を含めます。
- `view` を省略、または `view=human` の場合は納品README、`view=ai` の場合はAI向け宣言を返します。

## 構成と配信

- Cloudflare Workers（Vite + TypeScript + CSS Modules）。単一の Worker が静的サイトと `/license.md` の両方を配信します。
- 生成ロジックの単一ソース: `src/core.ts`（Worker と サイトが共有）。失敗しうる入力は `Result` / `Option`（`src/types/`）で型に表します。
- Worker エントリ: `src/worker.ts`。`/license.md` を生成し、それ以外は静的アセットへ委譲します。
- サイト: `index.html` + `src/client/`（バニラ TypeScript の関数型 reducer）。

ローカル開発は `npm run dev`、本番ビルドは `npm run build`、デプロイは `npm run deploy`（`wrangler`）です。テストは `npm test`（Vitest + `@cloudflare/vitest-pool-workers`）。

## バージョン

- v1.0（初版）

## このテキスト自体のライセンス

CosPL の各文書は CC0（パブリックドメイン相当）で公開しています。誰でも自由に採用・改変・再配布できます。詳細は [NOTICE.md](NOTICE.md)。

## 免責

CosPL は法的助言ではありません。重要な取り決めは専門家への確認を推奨します。また、Creative Commons をはじめとするいかなる団体とも無関係です。
