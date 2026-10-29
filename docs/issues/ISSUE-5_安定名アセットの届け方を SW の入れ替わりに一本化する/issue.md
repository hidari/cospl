---
status: in_progress
---

# refactor(sw): 安定名アセットの届け方を SW の入れ替わりに一本化する

## 背景

ISSUE-4 で、 安定名の公開ファイル (アイコン・ロゴ・favicon・manifest・woff2 フォント) はすべて precache され、 その中身が SW の版数に入るようになった。 1 つでも差し替えれば `sw.js` が変わり、 SW の入れ替わりで precache 全体が取り直される。

それでもアイコン・favicon・manifest は stale-while-revalidate で配っていて、 同じファイルを届ける道が 2 本ある (フォントは cache-first で、 SW の入れ替わりの 1 本だけ)。 ISSUE-4 の最終レビューで指摘され、 Hidari さんが一本化を選んだ。

## 求めること

ISSUE-4 と同じ。 前に来た人には、 最初の 1 回だけ古いものが見えてもよいが、 2 回目の表示からは必ず新しいものが見えること。 届け方は SW の入れ替わりだけにする。

## 決定

- `chooseStrategy` は、 `isStablePrecache` が真のパスを cache-first にする。 precache の対象とキャッシュ戦略を同じ述語で決め、 ずれようがなくする。 stale-while-revalidate (戦略 `swr`) と、 そのための `waitUntil` の受け渡しは消す
- 以下は Claude の判断:
  - install の `cache.addAll` は、 各リクエストを `cache: "no-cache"` で作る。 届け方が SW の入れ替わりだけになるので、 install が HTTP キャッシュの古い中身を掴まないことを、 配信側のヘッダー (今は `max-age=0, must-revalidate`) に頼らず SW 側で保証する
  - precache の対象でない `/fonts/` のファイル (`OFL.txt`) と、 ドットファイルは passthrough になる。 今まで `/fonts/` の接頭辞だけで cache-first にしていたが、 版数に入らないファイルを cache-first にすると更新が届かない
  - `isShellAsset` は `isStablePrecache` の中だけで使う

## タスク

- [ ] `chooseStrategy` を `isStablePrecache` で cache-first にし、 戦略 `swr` を消す (テストを先に直す)
- [ ] `sw.ts` から stale-while-revalidate と `waitUntil` の受け渡しを消し、 install の `addAll` を `cache: "no-cache"` にする
- [ ] 「precache の対象なら cache-first、 それ以外の非ナビゲーションの同一オリジンは `/assets/` 以外 passthrough」をテストで pin する
- [ ] 変異注入で pin が赤くなることを確かめる

## 関連

- ISSUE-4 (版数に安定名アセットの中身を含めた。 この Issue はその上で届け方を一本化する)
