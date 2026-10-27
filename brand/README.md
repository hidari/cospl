# brand

アイコン（favicon・PWA・apple-touch）の元になる SVG マスターを置くディレクトリです。デザイナーが書き出したものを正とし、PNG や favicon はここから `just images` で作ります。

## 書き出し方

- Affinity Designer から、文字をアウトライン化した SVG として書き出す
- ファイル名と比率は `src/brand/masters.ts` の `BRAND_MASTERS` が正。登録と違う名前や比率のファイルは、テスト（`just check`）で見つかる
- 書き出したら `just images` を実行し、マスターと生成物（`generated.json` を含む）を一緒にコミットする
- maskable 用のマスターは、マークを中心から半径 40% の円に収める。この条件はテストでは守れないので、書き出す側で確かめる
- script 要素・イベント属性・外部を指す href や url() は含めない。含めると `just images` の検査で止まる

## 原本

Affinity の原本はリポジトリの外で管理しています。
