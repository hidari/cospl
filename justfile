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
# main に含まれることを確かめる。タグは任意のコミットに打てるので、後者が main 限定の保証になる。
# サイトは現行の版の条文のタグを指すリンクを持つので、その条文のタグが先にあることも確かめる
release-check tag kind:
    #!/usr/bin/env bash
    set -euo pipefail
    license_tag=$(node scripts/release-tag.mjs check "$1" "$2")
    git merge-base --is-ancestor "$1^{commit}" origin/main
    git rev-parse -q --verify "refs/tags/${license_tag}^{commit}" >/dev/null \
      || { echo "条文のタグ ${license_tag} が無い。先に打つこと" >&2; exit 1; }
    echo "ok: $1"

# 条文のリリース。現行の VERSION の条文のタグを main の先頭に打ち、検証してから push する
release-license:
    #!/usr/bin/env bash
    set -euo pipefail
    just _release-preflight
    tag=$(node scripts/release-tag.mjs license-tag)
    if git rev-parse -q --verify "refs/tags/${tag}" >/dev/null; then
      echo "${tag} は既にある。条文を改定したなら VERSION を上げること" >&2
      exit 1
    fi
    git tag "${tag}"
    just release-check "${tag}" license || { git tag -d "${tag}"; exit 1; }
    git push origin "refs/tags/${tag}"

# サイトのリリース。日本時間の今日の日付で次のサイトのタグを main の先頭に打ち、検証してから push する
release-site:
    #!/usr/bin/env bash
    set -euo pipefail
    just _release-preflight
    tag=$(git tag --list 'site-v*' | node scripts/release-tag.mjs next-site "$(TZ=Asia/Tokyo date +%F)")
    git tag "${tag}"
    just release-check "${tag}" site || { git tag -d "${tag}"; exit 1; }
    git push origin "refs/tags/${tag}"

# リリース前の共通確認。タグを origin と一致させ、clean な main が origin/main と同じコミットにあることを確かめる
[private]
_release-preflight:
    #!/usr/bin/env bash
    set -euo pipefail
    git fetch origin --prune --prune-tags --tags --force
    [ "$(git branch --show-current)" = main ] || { echo "main 上で実行すること" >&2; exit 1; }
    git diff --quiet && git diff --cached --quiet || { echo "作業ツリーが clean でない" >&2; exit 1; }
    [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || { echo "HEAD が origin/main と一致しない" >&2; exit 1; }

# Playwright E2E（E2E_BASE_URL 未設定ならローカル preview に当てる）
e2e *args:
    pnpm exec playwright test "$@"
