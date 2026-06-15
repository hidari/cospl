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
2. [v1.0/template_README.md](v1.0/template_README.md) の `[撮影者名]` `[モデル名]` `[連絡先]` を埋める
3. 現像済みデータと一緒に納品フォルダへ同梱する

ライセンス本文の参照用テキストは [v1.0/CosPL-1.0.md](v1.0/CosPL-1.0.md) です。

## AI・機械可読

- サイトはタグを選ぶと識別子とREADMEをその場で生成します。READMEは Markdown とプレーンテキストの両方で、AI向け宣言は Markdown でコピーできます（Markdownを知らない相手にはプレーンテキストが便利です）。
- 動的エンドポイント `GET /license.md` で文書を返します。
  - `https://cospl.org/license.md?tags=BY-NC-NAI-TD` → README（Markdown）
  - `https://cospl.org/license.md?tags=BY-NC-NAI-TD&format=text` → README（プレーンテキスト, `text/plain`）
  - `https://cospl.org/license.md?tags=BY-NC-NAI-TD&view=ai` → AI向け宣言
  - `tags` 省略時は `BY-NC-NAI-TD` を既定とします。
  - CORS 許可済み（`Access-Control-Allow-Origin: *`）なので、ツールやエージェントから直接取得できます。
- `llms.txt` に LLM 向けの概要を置いています。`NAI` タグの作品はAI学習・生成素材としての利用を禁止する旨を明記しています。

## ライセンス

- ライセンス文書（本文・タグ仕様・テンプレート、生成される納品用文書）は CC0（パブリックドメイン相当）。誰でも自由に採用・改変・再配布できます。詳細は [LICENSE-DOCUMENTS.md](LICENSE-DOCUMENTS.md)。
- Web サイト/ツールの実装コードは MIT License。詳細は [LICENSE](LICENSE)。

ライセンスの使い分けの背景は [NOTICE.md](NOTICE.md) を参照してください。

## 免責

CosPL は法的助言ではありません。重要な取り決めは専門家への確認を推奨します。また、Creative Commons をはじめとするいかなる団体とも無関係です。
