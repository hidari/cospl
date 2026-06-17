# テンプレートのフィールド事前入力（撮影者名・日付・連絡先）

作成日: 2026-06-17

## 背景と目的

README テンプレート（`humanMD`）には `[撮影者名]` `[YYYY-MM-DD]` `[連絡先をここに記入]` などのプレースホルダが直書きされている。撮影者がツール上でこれらを埋められると、ダウンロード後に自分のエディタで置換する手間が省け、事前入力済みのリンクをモデルへ共有することもできる。

UI を重くせずにこの体験を足すことがゴール。画面の潔さ（タグをポチポチして即コピー）を保ちながら、必要な人だけが任意で値を埋められるようにする。

## 確定要件

- ターゲット: その場で埋める一般 UX（プログラム/API 用途やサーバ反映ではない）
- 対象フィールド: 最終更新日・撮影者名・連絡先の 3 つ。モデル名は対象外（`[モデル名]` のプレースホルダのまま残す。相手側のセンシティブな PII であり、モデル本人が埋める想定）
- URL 同期: 埋めた値を URL に反映し、復元・共有を可能にする
- UI: STEP1 と STEP2 の間に折りたたみ（`<details>`）で任意表示する。普段は閉じておき画面の潔さを保つ

## 設計判断

### クライアント限定・サーバ無改修

サーバ `/license.md` と `core.ts` の `humanMD` のデフォルト出力は一切変更しない。`humanMD(state)` を `humanMD(state, fields = DEFAULT_FIELDS)` に拡張し、`DEFAULT_FIELDS` を現行のプレースホルダ文字列（`[撮影者名]` 等）とする。

- サーバは引数なしで呼ぶため出力はバイト完全一致のまま。golden（`test/__fixtures__/golden.json`）も `wrangler.toml` の `run_worker_first` も無改修
- クライアントだけが `fields` を渡してプレビュー・コピー・ダウンロードに反映する

理由: フィールド反映を信頼ドメインで配信される正規文書（`/license.md`）に持ち込むと、信頼ドメイン上のコンテンツ偽装・CDN キャッシュ・サーバログへの PII 残留という 3 つのリスクを抱える。クライアント限定にすればこれらをまるごと回避できる。

### URL 同期は hash に載せる（query ではなく）

hash フラグメント（`#...`）は HTTP でサーバへ送信されない。撮影者名や連絡先を hash に載せれば、CDN・サーバのアクセスログに PII が一切残らない。残る PII の経路はブラウザ履歴と本人が能動的に送る共有リンクのみ（＝本人がコントロールできる範囲）。既存のタグも hash 運用なので一貫する。

現状の hash は `#BY-NC-NAI-TD`（裸のタグ列）。これを `URLSearchParams` 形式へ拡張する:

```
#tags=BY-NC-NAI-TD&date=2026-06-17&photographer=...&contact=...
```

後方互換: `=` を含まない hash は従来どおり裸のタグ列とみなす。既存の共有リンクを壊さない。

### フリーテキストは Result ではなく全域サニタイズ

タグは閉じた語彙なので `parseTags` は「未知トークン → fail」と Result で厳格に扱う。一方フリーテキストには「未知」が存在せず、意味のある失敗がない。よって Result ではなく全域のサニタイズ関数（最悪でもプレースホルダに畳む）が正しい。日付のみ形式検証してフォールバックする。

サニタイズ規則（各フィールド）。外部入力は徹底的に疑い、「形式は妥当でも悪意・破損がある」ケースまで潰す:

- trim する
- 改行・C0/C1 制御文字を除去する（単一行スロットに偽の条項や見出しを注入させない）
- 双方向テキスト制御文字（U+202A–U+202E, U+2066–U+2069）を除去する（Trojan Source 型の視覚的文言偽装を防ぐ）
- `<` `>` を除去する（ダウンロードした Markdown が後段で HTML 描画された場合の休眠 XSS への保険）
- 長さ clamp はコードポイント単位で行う: 撮影者名 50・連絡先 100（UTF-16 単位で切るとサロゲートペアを途中で割り壊れた文字を生むため）
- 日付は `^\d{4}-\d{2}-\d{2}$` の形式一致に加え、実在する暦日であることを検証する（`2026-13-40` のような不正値を弾く）。満たさなければプレースホルダにフォールバック
- サニタイズ後に空ならプレースホルダ（`[撮影者名]` 等）を使う

これらは contract テストで一つずつ仕様として固定する。サニタイズは多層防御の一層であり、出力描画は別途 `textContent`（`pre`）を厳守して二重に守る。

## コンポーネント分割

純粋ロジックは DOM 非依存の `core.ts` に集約してユニットテストし、`main.ts` は DOM 配線のみに保つ。

### `core.ts` への追加

- `Fields` 型 `{ date: string; photographer: string; contact: string }` と `DEFAULT_FIELDS`（＝現行プレースホルダ文字列）
- `sanitizeFields(params: URLSearchParams): Fields`: 上記サニタイズ規則を適用する全域関数
- `parseHash(hash: string): { tags: State; fields: Fields }`: 裸タグ後方互換を含む hash デコード
- `serializeHash(state: State, fields: Fields): string`: 状態 → hash 文字列。デフォルト値のフィールドは hash に含めない（URL を無駄に汚さない）
- `humanMD(state, fields = DEFAULT_FIELDS)` / `humanText(state, fields = DEFAULT_FIELDS)`: 3 箇所の撮影者名・日付・連絡先を fields で置換。`[モデル名]` はそのまま
- `aiMD` は変更しない（該当プレースホルダを持たない）

### `main.ts` の変更

- `AppState` に `fields: Fields` を追加
- アクション `{ type: "setField"; field: keyof Fields; value: string }` を追加し、reducer を拡張
- `<details>` 内の各 input の `input` イベントで `setField` を dispatch
- `render` で hash を `serializeHash` で同期（既存の `history.replaceState` 経路を置き換え）
- 初期化時に `parseHash(location.hash)` でタグとフィールドを復元
- 日付 input の初期値: hash に date があればそれを復元し、無ければ当日を入れる。`new Date()` は DOM 境界（main 側）で取得し、文字列にして core へ渡す（core は純粋なまま保つ）

### `index.html` の変更

STEP1 セクションの後、STEP2 の前に `<details>` ブロックを追加する。STEP 番号は振らず「任意：名前や日付を入れる」とする。中に撮影者名・日付・連絡先の 3 入力欄を置き、適切な `label` / `for` で a11y を担保する。

## テスト（仕様としてのテスト）

`test/core.test.ts` に追加:

1. `humanMD()` を引数なしで呼ぶと従来出力と完全一致する（golden 不変の保証）
2. `humanMD(state, fields)` で 3 箇所の撮影者名・日付・連絡先が置換される
3. `humanText` でも同様に置換される
4. `sanitizeFields` の各エッジ: 改行除去・C0/C1 制御文字除去・双方向制御文字除去・`<>` 除去・コードポイント単位の長さ clamp（絵文字を割らない）・不正日付（形式不正と `2026-13-40` 等の非実在日）フォールバック・空 → プレースホルダ
5. `parseHash` / `serializeHash` のラウンドトリップ、および裸タグ（`#BY-NC-NAI-TD`）後方互換
6. `aiMD` は fields 非対応のまま不変であることの確認

文面そのものは変わらないため `regen:golden` は不要。

## スコープ外（YAGNI）

- モデル名の埋め込み
- サーバ `/license.md` のフィールド対応
- 当日以外の日付プリセット
- 入力履歴の永続化（localStorage 等）
