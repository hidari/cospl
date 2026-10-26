---
name: release
description: cospl をタグ駆動でリリースする。サイトは site-v タグで Cloudflare Workers (cospl.org) へデプロイし、条文は cospl-v タグで GitHub Release を作る。「デプロイして」「本番反映して」「cospl.org に出して」「リリースして」と指示された時に使う。ローカルから wrangler deploy せずタグを push し、結論と health check まで確認する。
---

# cospl Release

リリースはタグの push だけで行う。ローカルからの `wrangler deploy` は禁止。

- サイト: `site-vYYYY.MM.DD`（同日の 2 回目以降は `.1`, `.2` …）の CalVer。push で `deploy.yml` が cospl.org へデプロイし、成功後に `e2e-prod.yml` が本番へ E2E を当てる
- 条文: `cospl-v<VERSION>`（`src/license/version.ts` の `VERSION`）。push で `release-license.yml` が GitHub Release を作る

タグの書式の canonical は `src/release/tag.ts`。両ワークフローは `just release-check` でタグの形式と「タグのコミットが main に含まれること」を検査してから動く。

## 前提

- `production` environment の Secrets に `CLOUDFLARE_API_TOKEN` と `CLOUDFLARE_ACCOUNT_ID` があり、デプロイ許可が `site-v*` タグだけになっている
  - 確認: `gh secret list --repo hidari/cospl --env production` と `gh api repos/hidari/cospl/environments/production/deployment-branch-policies`
- タグの作成・更新・削除は repository ruleset で管理者に限られている（`gh api repos/hidari/cospl/rulesets`）

## 手順

### 1. Pre-flight

```bash
git switch main && git pull
```

main の健全性は「main のツリーが Merge Gate 緑の PR head のツリーと一致する」ことで確かめる（main への push では CI が走らない）。clean・main 上・`origin/main` との一致は次の recipe が自分で確かめる。

### 2. 条文を改定したとき（VERSION を上げたとき）だけ: 条文のリリース

```bash
just release-license
```

サイトの `TERMS_URL` は `cospl-v<VERSION>` のタグを指すので、サイトより先に実行する。同じ版のタグが既にあれば止まる。

### 3. サイトのリリース

```bash
just release-site
```

日本時間の今日の日付でタグ名を決め、同日に既にあれば連番を付ける。条文のタグが無ければ `release-check` が止める。

どちらの recipe も、タグを打つ → `release-check` → push の順で、検査に落ちたらローカルのタグを消して止まる。

### 4. 結論を専用クエリで確認（exit code に頼らない）

```bash
run_id=$(gh run list --repo hidari/cospl --workflow Deploy -L 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$run_id" --repo hidari/cospl --exit-status || true
gh run view "$run_id" --repo hidari/cospl --json status,conclusion,headBranch --jq '{status,conclusion,headBranch}'
```

条文のタグを打ったときは `--workflow "Release (license)"` も同様に確認し、`gh release view cospl-v<VERSION>` で Release を確かめる。

### 5. 本番の health check と本番 E2E

```bash
curl -fsS -o /dev/null -w "human: %{http_code}\n" "https://cospl.org/license.md"
curl -fsS -o /dev/null -w "ai:    %{http_code}\n" "https://cospl.org/license.md?tags=BY-NC&view=ai"
```

どちらも 200 であること。続けて `E2E (production)` の run の結論も確認する。

### 6. 報告

デプロイ run の URL、conclusion、health check と本番 E2E の結果を簡潔に報告する。

## 落とし穴

- ローカルで `wrangler deploy` を実行しない
- タグを付け直して再デプロイしない。失敗したら原因を直して main へ入れ、新しいタグ（同日なら連番）を打つ
- 待機コマンド（`gh run watch`）の exit を結論と取り違えない
- タグは手で打たず recipe に任せる。順序と検査の取り違えを recipe が防ぐ
