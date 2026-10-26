---
status: closed
---

# feat: リリースをタグ駆動にし条文は版、サイトは CalVer で管理する

## 背景

これまでデプロイは手動の workflow_dispatch だけで、リポジトリにはタグも Release も無かった。条文（CosPL 2.0 のような CC 準拠の 2 段の版）とサイト（日々の修正）は更新の単位が違うので、版の流れを分けてタグで記録したい。

また規約ページの URL が `blob/main/...` を指しており、main が変わると同じ版の条文の文面が変わりうる。条文は版ごとに不変であるべきなので、リリースタグの時点を指す。

方式:

- 条文: `cospl-v<VERSION>`。push で GitHub Release を作る
- サイト: `site-vYYYY.MM.DD`（同日の 2 回目以降は `.1` から連番）。push で本番へデプロイする
- タグは任意のコミットに打てるので、ワークフローはタグのコミットが main に含まれることを検査する。production environment のデプロイ許可は `site-v*` タグだけにし、タグの作成は ruleset で管理者に限る

## タスク

- [x] タグの判定を `src/release/tag.ts` に置き、`just release-check` からタグの形式と main への包含、サイトでは条文のタグが先にあることを検査する
- [x] deploy.yml を `site-v*` タグの push で起動し、手動起動を廃止する
- [x] release-license.yml を追加し、`cospl-v*` タグの push で Release を作る
- [x] `TERMS_URL` と index.html / llms.txt のリンクを条文のタグの時点に向ける
- [x] deploy skill の手順をタグ駆動にする
- [x] マージ後: production environment のデプロイ許可を `site-v*` タグにし、タグの ruleset を作り、`cospl-v2.0` と最初のサイトのタグを打つ
- [x] リリースを `just release-license` / `just release-site` に閉じ込め、この 2 つを許可ルールに載せて Claude が完遂できるようにする（PR 57）
- [x] immutable releases を有効にし、条文の Release を不変にする
- [x] `cospl-v2.0` の Release と `site-v2026.10.26` のデプロイ、本番 E2E が緑になることを確認する

## 関連

- ISSUE-1（CI の実行環境の固定。両ワークフローもその固定に従う）
- 最初の `cospl-v2.0` は root で動くコンテナの git が dubious ownership で落ちたため、全ジョブを uid 1001 で動かす修正（PR 56）の後に打ち直した
