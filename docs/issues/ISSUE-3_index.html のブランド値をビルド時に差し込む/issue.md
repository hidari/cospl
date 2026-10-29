---
status: in_progress
---

# refactor(brand): index.html のブランド値をビルド時に差し込む

## 背景

`just images` は画像を作るだけでなく、 `index.html` の 3 か所 (og:image / twitter:image の `?v=`、 og:image の寸法、 ヘッダーロゴの img の寸法) を正規表現で書き換えていた。 `index.html` が手で書くソースと生成物を兼ね、 不動点テストで生成し忘れを見張る構造だった。

判断の軸はコード量ではなく構造の堅牢さ (間違った値・欠けた値が、 配信するどの経路でも必ず赤くなること) に置いた。

### 実測した前提 (2026-10-29、 Vite 8.3.5 / @cloudflare/vite-plugin 1.65.0)

- `transformIndexHtml` は `vite dev` (Worker → `ASSETS.fetch` 経由) と `vite build` のクライアント環境で走る。 Worker 環境のビルドと `vite preview` では走らない
- dev ではフック内の `this.environment` が undefined、 `ctx.path` / `ctx.filename` が壊れた値になる
- dev でフックが throw すると、 HTTP 200 と汎用の文言が返り、 理由は本文にもターミナルにも出ない。 build は exit 1 で止まる
- Vite の `%VAR%` 置換は未定義の名前を警告なしにそのまま残す
- `vite.config.ts` から `src/` を拡張子なしで import すると configLoader の警告が出る。 `.ts` 拡張子と `allowImportingTsExtensions` で 0 件になる
- 既存の `syncIndexHtml` は og:image と twitter:image を 1 つの選択肢で合計 2 件と数えるため、 og:image が 2 つで twitter:image が無い HTML を通していた (寸法も同様)

### 比較した案

- A: og/twitter の meta を head タグとして注入し、 ロゴの寸法だけプレースホルダにする。 不採用。 head が index.html と TS に分かれ、 出力が Vite のタグ直列化に依存する
- B: 3 か所ともプレースホルダにし、 純粋関数 1 つで埋める。 採用。 A の「タグごとのスロット」「URL を定数から導く」と、 C が見つけた件数の穴の修正を接ぎ木した
- C: 今の方式を固める。 不採用。 マージ前に止められるのは長所だが、 jpg を描き直してもマスターが同じなら `?v=` が変わらず、 その経路では何も赤くならない

### 決定

- `?v=` はマスター SVG ではなく、 配信する `public/ogp/ogp-landscape.jpg` のバイト列のハッシュから作る。 X のカードキャッシュが見ているのは配信されるバイト列で、 本番の値を本番の応答だけで検算できる。 この変更で、 最初のデプロイの `?v=` が 1 回だけ変わる
- 本番の検査は checkout からではなく応答から期待値を導く。 E2E (production) は main の HEAD を checkout するので、 タグとずれるため

## タスク

- [ ] `index.html` をトークンだけにし、 純粋関数 `renderIndexHtml` とスロット表を `src/brand/outputs.ts` に置く
- [ ] `vite.config.ts` に薄いプラグインを置き、 失敗の理由を出してから止める
- [ ] `just images` が `index.html` に触らないようにする
- [ ] config から import する連鎖に `.ts` 拡張子を付け、 lint で付け忘れを止める
- [ ] vitest・E2E (`e2e/head.spec.ts`)・deploy の health check で 3 つの値を検査する
- [ ] 変異注入で各検査が赤くなることを確かめる
- [ ] 文書とメモリを新しい仕組みに合わせる

## 関連

- ISSUE-4 (SW のキャッシュ版数が HTML だけの変更で上がらない件。 この Issue では直さない)
