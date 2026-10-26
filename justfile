# CosPL の開発コマンド。ローカルも CI もここを入口にする。
# デプロイは GitHub Actions の deploy.yml 専用のため recipe を置かない。

# recipe 引数を "$@" で受け、空白を含む引数を分割せずにツールへ渡す。
set positional-arguments

[private]
default:
    @just --list

# Vite 開発サーバ
dev:
    pnpm exec vite dev

# 型チェック + 本番ビルド
build:
    pnpm exec tsc --noEmit
    pnpm exec vite build

# ビルド済み成果物のプレビュー
preview *args:
    pnpm exec vite preview "$@"

# wrangler.toml から worker-configuration.d.ts を再生成
cf-typegen:
    pnpm exec wrangler types

# app / Service Worker / E2E の型チェック
typecheck:
    pnpm exec tsc --noEmit
    pnpm exec tsc -p tsconfig.sw.json
    pnpm exec tsc -p tsconfig.e2e.json

# Vitest（workerd 上）
test *args:
    pnpm exec vitest run "$@"

# Vitest の watch モード
test-watch:
    pnpm exec vitest

# Biome チェック
lint:
    pnpm exec biome check .

# Biome フォーマット適用
format:
    pnpm exec biome format --write .

# マージ前の一括検証
check: lint typecheck test

# SVG マスターから favicon / OGP を生成
images:
    node scripts/build-images.mjs

# 文面変更後に golden フィクスチャを更新
regen-golden:
    node scripts/regen-golden.mjs

# リリースタグの検証（CI の deploy / release-license が使う）。タグの形式と、タグのコミットが
# main に含まれることを確かめる。タグは任意のコミットに打てるので、後者が main 限定の保証になる
release-check tag kind:
    node scripts/check-release-tag.mjs "$1" "$2"
    git merge-base --is-ancestor "$1^{commit}" origin/main

# Playwright E2E（E2E_BASE_URL 未設定ならローカル preview に当てる）
e2e *args:
    pnpm exec playwright test "$@"
