# brand

アイコン（favicon・PWA・apple-touch）、ヘッダーのロゴ、OG 画像の元になる SVG マスターを置くディレクトリです。デザイナーが書き出したものを正とし、PNG・写し・ロゴのダーク版はここから `just images` で作ります。`index.html` の OG 画像の `?v=` と寸法、ロゴの寸法はビルドが配信物から差し込むので、手で書き換えません。

## 書き出し方

- Affinity のスライスで、アートボードごとに SVG として書き出す。書き出しオプションは「テキストをカーブとしてエクスポート」と「viewBoxを設定する」をオンにし、72 DPI で書き出す
- ファイル名と比率は `src/brand/masters.ts` の `BRAND_MASTERS` が正。登録と違う名前や比率のファイルは、テスト（`just check`）と `just images` で見つかる
- 書き出したら `just images` を実行し、マスターと生成物（`generated.json` を含む）を一緒にコミットする
- ロゴはライト版だけを書き出す。ダーク版は `src/brand/outputs.ts` の `LOGO_DARK_COLORS` で色を置き換えて作るので、ライト版にはこの対応表にある色だけを使う。ほかの色があると `just images` が止まる
- maskable 用のマスターは、マークを中心から半径 40% の円に収める。この条件はテストでは守れないので、書き出す側で確かめる
- script 要素・イベント属性・外部を指す href や url() は含めない。含めると `just images` の検査で止まる

## 原本

Affinity の原本はリポジトリの外で管理しています。
