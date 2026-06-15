---
name: deploy
description: cospl を Cloudflare Workers (cospl.org) に GitHub Actions 経由でデプロイする。「デプロイして」「本番反映して」「cospl.org に出して」「リリースして」と指示された時に使う。ローカルから wrangler deploy せず deploy.yml workflow を起動し、結論と health check まで確認する。
---

# cospl Deploy

cospl を cospl.org（Cloudflare Workers）へデプロイする。

このプロジェクトでは「ローカルからのリリースは禁止、デプロイは必ず GitHub Actions を通す」。
したがって本スキルは `wrangler deploy` をローカル実行せず、`deploy.yml` workflow を `gh workflow run` で起動し、結果を専用クエリで確認するだけにとどめる。

## いつ使うか

- 「デプロイして」「本番反映」「cospl.org に出して」「リリースして」と指示された時。
- main の変更を本番へ反映したい時。

## 前提（未充足なら先に案内する）

- リポジトリ Secrets に `CLOUDFLARE_API_TOKEN`（Workers Scripts:Edit + Workers Routes/DNS 権限）と `CLOUDFLARE_ACCOUNT_ID` が登録済み。未登録だと deploy ジョブが失敗する。
  - 確認: `gh secret list --repo hidari/cospl`
- cospl.org が対象 Cloudflare アカウントのゾーンに存在する（`wrangler.toml` の `custom_domain` route が紐付ける）。

## 手順

### 1. Pre-flight（ローカル状態の確認）

```bash
git fetch origin
git status -sb                 # main 上・clean tree であること
git rev-parse HEAD             # ローカル HEAD
git rev-parse origin/main      # origin/main と一致すること
```

- `main` 上でない / dirty / `origin/main` と不一致なら、デプロイ前に解消する。

### 2. main の CI 健全性を確認

```bash
gh run list --repo hidari/cospl --branch main --workflow "Merge Gate" -L 1 \
  --json conclusion,headSha --jq '.[0]'
```

- 直近の Merge Gate が `success` であることを確認。緑でなければデプロイしない。
- 任意でローカル高速検証: `pnpm install --frozen-lockfile && pnpm run lint && pnpm run typecheck && pnpm test`。

### 3. デプロイ workflow を起動

```bash
gh workflow run deploy.yml --repo hidari/cospl --ref main
```

### 4. 結論を専用クエリで確認（exit code に頼らない）

run id を取得してから結論だけを直接問い合わせる。`<cmd>; echo $?` のように `$?` を上書きしない。

```bash
# 起動直後の run id を取得
run_id=$(gh run list --repo hidari/cospl --workflow Deploy -L 1 --json databaseId --jq '.[0].databaseId')

# 完了まで待機（待機コマンドの exit ではなく下の JSON で結論を判定する）
gh run watch "$run_id" --repo hidari/cospl --exit-status || true

# 結論を直接確認
gh run view "$run_id" --repo hidari/cospl --json status,conclusion --jq '{status,conclusion}'
```

- `conclusion == "success"` を確認する。`failure` なら `gh run view "$run_id" --log-failed` で原因を調べる。

### 5. 本番の health check

```bash
curl -fsS -o /dev/null -w "human: %{http_code}\n" "https://cospl.org/license.md"
curl -fsS -o /dev/null -w "ai:    %{http_code}\n" "https://cospl.org/license.md?tags=BY-NC&view=ai"
```

- どちらも 200 であること。初回デプロイ直後はカスタムドメイン伝播に時間がかかることがあるため、数十秒おいて再確認する（workflow 側でもリトライ済み）。

### 6. 報告

- デプロイ run の URL（`gh run view "$run_id" --json url --jq .url`）、conclusion、health check 結果を簡潔に報告する。

## 落とし穴

- ローカルで `wrangler deploy` や `pnpm run deploy` を実行しない（必ず workflow 経由）。
- 待機コマンド（`gh run watch`）の exit を結論と取り違えない。結論は `gh run view --json conclusion` で確認する。
- Secrets / ゾーン未設定のままデプロイしない（deploy ジョブが失敗する）。
