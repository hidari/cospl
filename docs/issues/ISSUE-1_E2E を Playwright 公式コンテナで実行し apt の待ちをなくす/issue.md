---
status: open
---

# ci: E2E を Playwright 公式コンテナで実行し apt の待ちをなくす

## 背景

Merge Gate の E2E ジョブは `pnpm exec playwright install --with-deps` でブラウザの依存を apt から入れている。この apt が遅く、テストが 1 件も走らないまま時間を使い切る事例が続いた。

- PR 50: install ステップだけで 13 分 49 秒
- PR 53: `Fetched 119 MB in 18min 28s (107 kB/s)` でジョブの 20 分タイムアウトに達し cancelled。Merge Gate Result が fail になりマージ不可

テストではなく環境の準備がゲートを落としているので、依存を同梱した Playwright 公式コンテナ (`mcr.microsoft.com/playwright`) でジョブを動かし、apt を経路から外す。

コンテナのタグは Dependabot の更新対象にならないため、`pnpm-lock.yaml` の Playwright と版がずれる。ずれるとブラウザのビルドが見つからず E2E が落ちるので、版の一致をテストで固定する。

## タスク

- [ ] merge-gate.yml の e2e ジョブを公式コンテナで動かし、install ステップを外す
- [ ] e2e-prod.yml も同様にする
- [ ] ワークフローのイメージの版と pnpm-lock.yaml の Playwright の版が一致することを検査するテストを足す
- [ ] PR の Merge Gate で E2E が実際にテストを実行して緑になることを確認する

## 関連

- PR 53 (この遅延でマージできなくなった PR)
