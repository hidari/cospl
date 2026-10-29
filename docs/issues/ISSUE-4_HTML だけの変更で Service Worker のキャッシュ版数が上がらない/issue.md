---
status: open
---

# fix(sw): HTML だけの変更で Service Worker のキャッシュ版数が上がらない

## 背景

`vite.config.ts` の `serviceWorkerPlugin` は `__CACHE_VERSION__` をハッシュ付き JS/CSS の名前だけから作る。 `/` と `STABLE_PRECACHE` (アイコン・ロゴ・フォントなど) の中身は版数に入らない。

実測 (2026-10-29): `index.html` だけを変えたビルドでは、 版数が変更前と同じ値になった。 ナビゲーションは network-first なのでオンラインの訪問者は新しい HTML を受け取るが、 オフラインの訪問者は JS/CSS が変わるまで古い `/` と古い安定名アセットを使い続ける。

ISSUE-3 の作業中に見つけた既存の挙動で、 ISSUE-3 が悪化させるものではない。

## タスク

- [ ] 版数に precache 対象の中身 (`/` と安定名アセット) を含めるかを決める
- [ ] 決めた方式を、 HTML だけの変更で版数が変わるテストで pin する

## 関連

- ISSUE-3
