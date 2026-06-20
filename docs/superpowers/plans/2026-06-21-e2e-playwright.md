# E2E (Playwright) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Playwright による E2E を導入し、main.ts の DOM 配線を PR 時（ローカル vite preview）と リリース後（本番 cospl.org）の二段で検証する。

**Architecture:** 1 本の Core UI スイートを baseURL 切替で両 tier に使い回す。セレクタと操作は Page Object に集約（library-contract の精神適用）。discovery/API 検証は deploy.yml の bash health check に据え置き、Playwright はブラウザ UI 専念。

**Tech Stack:** @playwright/test、4 プロジェクト（chromium / firefox / webkit / Mobile Safari）、@cloudflare/vite-plugin の `vite preview`（Worker を miniflare で起動）。

## Global Constraints

- 開発タスク実行は pkf 経由（`pkf run <task>`）。pnpm 直叩きは依存追加（`pnpm add`）とブラウザ導入（`playwright install`）に限る。
- TypeScript: any 禁止、try-catch 禁止、自前 Result/Option を使用。新規 `as` 原則禁止。
- ファイル末尾は必ず 1 つの空行。
- コメントは日本語。フロント等の外部可視文字列は英語、内部ログは日本語。
- E2E は既存挙動の characterization。各シナリオは「テストを書く → 走らせて緑を確認（緑にならなければセレクタ誤り or 実バグ）」のサイクル。assertion は exact 値で書き no-op テストを避ける。
- 既存の app tsconfig は `types: ["@cloudflare/vitest-pool-workers"]`。Worker に node グローバルを漏らさないため e2e/ と playwright.config.ts は app の typecheck から除外し、専用 tsconfig.e2e.json で型検査する。
- CI の actions は SHA ピン留め（既存 workflow と同一 SHA を流用）。
- 本番 cospl.org は read-only。post-release の本番当てに副作用なし。
- テスト作成: 本環境に playwright-e2e-generator skill が無いため、spec は playwright-test skill のベストプラクティス（web-first assertion・role/id セレクタ・固定 wait 排除・Page Object）に従って直接記述する。本計画のコードはそれを体現する。generator が利用可能なら実機記録で補助してよい。

## File Structure

- Create `playwright.config.ts`（root）: 4 プロジェクト・baseURL・webServer・retries・trace。
- Create `tsconfig.e2e.json`（root）: e2e と playwright.config.ts の型検査（node + @playwright/test 型）。
- Create `e2e/pages/license-page.ts`: Page Object（セレクタ + 操作の単一集約）。
- Create `e2e/fixtures.ts`: `licensePage` カスタム fixture と `expect` の再 export。
- Create `e2e/smoke.spec.ts` / `e2e/tags.spec.ts` / `e2e/view.spec.ts` / `e2e/url-hash.spec.ts` / `e2e/copy.spec.ts`: Core シナリオ。
- Create `.github/workflows/e2e-prod.yml`: deploy 成功後の本番 E2E（workflow_run）。
- Modify `tsconfig.json`: e2e と playwright.config.ts を exclude。
- Modify `biome.json`: includes に `e2e/**`。
- Modify `package.json`: devDependency と e2e スクリプト。
- Modify `Taskfile.pkl`: `e2e` タスク追加。
- Modify `.gitignore`: Playwright 生成物（test-results / playwright-report / .playwright）。
- Modify `.github/workflows/merge-gate.yml`: e2e ジョブ追加、gate を full+e2e 依存に。

---

### Task 1: 依存と設定（インストール可能・型境界・タスク）

**Files:**
- Modify: `package.json`
- Create: `playwright.config.ts`
- Create: `tsconfig.e2e.json`
- Modify: `tsconfig.json`
- Modify: `biome.json`
- Modify: `.gitignore`
- Modify: `Taskfile.pkl`

**Interfaces:**
- Produces: `playwright.config.ts` が baseURL を `process.env.E2E_BASE_URL ?? "http://localhost:4173"` で公開。E2E_BASE_URL 未設定時は webServer が `vite build && vite preview --port 4173` を起動。後続タスクの spec はこの baseURL に対して `page.goto("/")` する。

- [ ] **Step 1: devDependency を追加**

`@playwright/test`（テストランナー）と `@types/node`（config の process 型）を追加する。`playwright-core` は画像生成専用なので流用しない。

Run:
```bash
pnpm add -D @playwright/test @types/node
```
注: ユーザーがツール導入を自分で行う運用の場合はこのコマンドを実行依頼する。

- [ ] **Step 2: playwright.config.ts を作成**

```ts
import { defineConfig, devices } from "@playwright/test";

// baseURL は環境変数で切替。未設定=ローカル preview、設定時（本番 cospl.org）は外部稼働サイトへ当てる。
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:4173";
// 外部 URL 指定時はローカル server を起動しない（稼働中サイトに当てる）。
const isExternalTarget = Boolean(process.env.E2E_BASE_URL);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "Mobile Safari", use: { ...devices["iPhone 14"] } },
  ],
  // @cloudflare/vite-plugin の preview は worker.ts を miniflare で動かすため、ローカルでも
  // CSP・run_worker_first・discovery が効く（本番に近い）。Core シナリオはクライアント完結。
  webServer: isExternalTarget
    ? undefined
    : {
        command: "pnpm build && pnpm exec vite preview --port 4173",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
```

- [ ] **Step 3: tsconfig.e2e.json を作成（E2E 専用の型境界）**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "types": ["node", "@playwright/test"],
    "noEmit": true
  },
  "include": ["e2e", "playwright.config.ts"]
}
```

- [ ] **Step 4: app の tsconfig.json から e2e / playwright.config.ts を除外**

`include` は据え置き（`*.config.ts` は vite.config.ts を拾う）。Worker に node 型を漏らさないため exclude を追加する。

`tsconfig.json` に末尾の `"include"` の後へ `"exclude"` を追加:
```json
  "include": ["src", "test", "*.config.ts", "worker-configuration.d.ts"],
  "exclude": ["e2e", "playwright.config.ts"]
```

- [ ] **Step 5: biome.json の includes に e2e を追加**

`"files".includes` 配列に `"e2e/**"` を `"scripts/**"` の次へ追加する（e2e コードもリント対象にして品質を揃える）。

- [ ] **Step 6: .gitignore に Playwright 生成物を追加**

```
test-results/
playwright-report/
.playwright/
```

- [ ] **Step 7: package.json に e2e スクリプトを追加**

`scripts` に追加:
```json
    "e2e": "playwright test",
    "typecheck:e2e": "tsc -p tsconfig.e2e.json"
```

- [ ] **Step 8: Taskfile.pkl に e2e タスクを追加**

`test` タスク定義の後へ:
```pkl
local e2e = new Task {
  name = "e2e"
  description = "Playwright E2E（ローカル preview）"
  cmd = "pnpm e2e"
  cache = false
}
```
末尾 `tasks { ... }` に `e2e` を追加:
```pkl
tasks { dev; build; typecheck; lint; test; check; images; e2e }
```

- [ ] **Step 9: 既存検査が緑のままか確認**

Run:
```bash
pkf run check && pnpm typecheck:e2e
```
Expected: lint / typecheck（app）/ 138〜142 tests 緑、`typecheck:e2e` はエラーなし（e2e 空でも config が通る）。`pkf run check` が緑 = app tsc が playwright.config.ts/e2e を巻き込んでいない。

- [ ] **Step 10: Playwright ブラウザを導入し config を認識するか確認**

Run:
```bash
pnpm exec playwright install --with-deps
pnpm exec playwright test --list
```
Expected: 4 プロジェクトが列挙される（テスト 0 件でもエラーなし）。注: ブラウザ導入をユーザーが行う運用なら依頼する。

- [ ] **Step 11: Commit**

```bash
git add package.json pnpm-lock.yaml playwright.config.ts tsconfig.e2e.json tsconfig.json biome.json .gitignore Taskfile.pkl
git commit -m "build: Playwright E2E の基盤（依存・config・型境界・タスク）を追加"
```

---

### Task 2: Page Object と fixture（+ スモーク）

**Files:**
- Create: `e2e/pages/license-page.ts`
- Create: `e2e/fixtures.ts`
- Create: `e2e/smoke.spec.ts`

**Interfaces:**
- Produces:
  - `class LicensePage` with: `constructor(page: Page)`; getters `output`, `endpoint`, `ident`, `flashStatus`, `copyButton`, `linkButton`, `clearButton`, `photographer`, `contact`, `humanTab`, `aiTab`（すべて `Locator`）; `goto(hash?: string): Promise<void>`; `chip(tag: Tag): Locator`; `toggleTag(tag: Tag): Promise<void>`; `selectAiView(): Promise<void>`。
  - `type Tag = "BY" | "NC" | "NAI" | "TD" | "MR"`。
  - `e2e/fixtures.ts` exports `test`（`licensePage` fixture 付き）と `expect`。後続の全 spec はこの `test` / `expect` を import する。

- [ ] **Step 1: Page Object を作成**

`e2e/pages/license-page.ts`:
```ts
import type { Locator, Page } from "@playwright/test";

// index.html の data-tag と一致するタグ集合。
export type Tag = "BY" | "NC" | "NAI" | "TD" | "MR";

// CosPL 生成画面の Page Object。セレクタと操作をここに集約し、spec を生セレクタから分離する。
export class LicensePage {
  readonly page: Page;
  readonly output: Locator;
  readonly endpoint: Locator;
  readonly ident: Locator;
  readonly flashStatus: Locator;
  readonly copyButton: Locator;
  readonly linkButton: Locator;
  readonly clearButton: Locator;
  readonly photographer: Locator;
  readonly contact: Locator;
  readonly humanTab: Locator;
  readonly aiTab: Locator;

  constructor(page: Page) {
    this.page = page;
    this.output = page.locator("#out");
    this.endpoint = page.locator("#ep");
    this.ident = page.locator("#ident");
    this.flashStatus = page.locator("#flash-status");
    this.copyButton = page.locator("#copy");
    this.linkButton = page.locator("#link");
    this.clearButton = page.locator("#clear-fields");
    this.photographer = page.locator("#f-photographer");
    this.contact = page.locator("#f-contact");
    // タブは aria-label でアクセシブル名が安定するため role ベースで取得する。
    this.humanTab = page.getByRole("tab", { name: "README用" });
    this.aiTab = page.getByRole("tab", { name: "AI向け宣言" });
  }

  // hash は "#tags=BY-NC" の形（先頭 # 含む）。未指定は素のトップ。
  async goto(hash = ""): Promise<void> {
    await this.page.goto(`/${hash}`);
  }

  // タグ chip は data-tag 属性で一意に引く（アクセシブル名は複数 span 連結で不安定なため）。
  chip(tag: Tag): Locator {
    return this.page.locator(`.chip[data-tag="${tag}"]`);
  }

  async toggleTag(tag: Tag): Promise<void> {
    await this.chip(tag).click();
  }

  async selectAiView(): Promise<void> {
    await this.aiTab.click();
  }
}
```

- [ ] **Step 2: fixture を作成**

`e2e/fixtures.ts`:
```ts
import { test as base } from "@playwright/test";
import { LicensePage } from "./pages/license-page";

// licensePage fixture を提供する拡張 test。全 spec はここから test / expect を import する。
export const test = base.extend<{ licensePage: LicensePage }>({
  licensePage: async ({ page }, use) => {
    await use(new LicensePage(page));
  },
});

export { expect } from "@playwright/test";
```

- [ ] **Step 3: スモーク spec を作成**

`e2e/smoke.spec.ts`:
```ts
import { expect, test } from "./fixtures";

test("トップが読め、既定の出力と識別子が描画される", async ({ licensePage }) => {
  await licensePage.goto();
  // 既定タグ BY-NC-NAI-TD（MR off）の識別子が出る。
  await expect(licensePage.ident).toContainText("BY-NC-NAI-TD");
  // README 本文が生成され空でない。
  await expect(licensePage.output).toContainText("撮影データの取り扱いについて");
});
```

- [ ] **Step 4: スモークを走らせ緑を確認**

Run:
```bash
pnpm exec playwright test smoke --project=chromium
```
Expected: 1 passed。落ちる場合は webServer 起動（build→preview）かセレクタを点検（実バグでなければセレクタ修正）。

- [ ] **Step 5: e2e の型検査が緑か確認**

Run:
```bash
pnpm typecheck:e2e && pnpm lint
```
Expected: エラーなし（any/未使用なし）。

- [ ] **Step 6: Commit**

```bash
git add e2e/pages/license-page.ts e2e/fixtures.ts e2e/smoke.spec.ts
git commit -m "test: E2E の Page Object・fixture・スモークを追加"
```

---

### Task 3: シナリオ1 タグトグル

**Files:**
- Create: `e2e/tags.spec.ts`

**Interfaces:**
- Consumes: `LicensePage`（`chip`, `toggleTag`, `ident`, `output`, `endpoint`）、`fixtures` の `test`/`expect`。

- [ ] **Step 1: spec を作成**

`e2e/tags.spec.ts`:
```ts
import { expect, test } from "./fixtures";

test("タグをトグルすると aria-pressed・識別子・出力・endpoint・URL hash が一斉更新される", async ({
  licensePage,
  page,
}) => {
  await licensePage.goto();

  // 既定 NC は押下状態。トグルで解除される。
  await expect(licensePage.chip("NC")).toHaveAttribute("aria-pressed", "true");
  await licensePage.toggleTag("NC");
  await expect(licensePage.chip("NC")).toHaveAttribute("aria-pressed", "false");

  // 識別子から NC が外れ BY-NAI-TD になる。
  await expect(licensePage.ident).toContainText("BY-NAI-TD");
  // README 本文の識別子も追従する。
  await expect(licensePage.output).toContainText("CosPL 1.0 / BY-NAI-TD");
  // Markdown エンドポイントの tags クエリも追従する。
  await expect(licensePage.endpoint).toHaveText(
    "https://cospl.org/license.md?tags=BY-NAI-TD",
  );
  // URL hash に反映される（tags=BY-NAI-TD を含む）。
  await expect(page).toHaveURL(/tags=BY-NAI-TD/);
});
```

- [ ] **Step 2: 走らせて緑を確認**

Run:
```bash
pnpm exec playwright test tags --project=chromium
```
Expected: 1 passed（既存挙動を characterize）。

- [ ] **Step 3: Commit**

```bash
git add e2e/tags.spec.ts
git commit -m "test: E2E シナリオ タグトグルの状態同期を追加"
```

---

### Task 4: シナリオ2 タブ切替（human↔ai）

**Files:**
- Create: `e2e/view.spec.ts`

**Interfaces:**
- Consumes: `LicensePage`（`selectAiView`, `humanTab`, `aiTab`, `output`, `endpoint`）。

- [ ] **Step 1: spec を作成**

`e2e/view.spec.ts`:
```ts
import { expect, test } from "./fixtures";

test("AI タブに切替えると aria-selected が移り、出力が AI 宣言・endpoint に view=ai が付く", async ({
  licensePage,
}) => {
  await licensePage.goto();

  // 既定は README タブが選択。
  await expect(licensePage.humanTab).toHaveAttribute("aria-selected", "true");
  await expect(licensePage.aiTab).toHaveAttribute("aria-selected", "false");

  await licensePage.selectAiView();

  // 選択が AI へ移る。
  await expect(licensePage.aiTab).toHaveAttribute("aria-selected", "true");
  await expect(licensePage.humanTab).toHaveAttribute("aria-selected", "false");
  // 出力が AI 宣言の見出しに変わる。
  await expect(licensePage.output).toContainText("# CosPL License Declaration");
  // エンドポイントに view=ai が付く。
  await expect(licensePage.endpoint).toHaveText(
    "https://cospl.org/license.md?tags=BY-NC-NAI-TD&view=ai",
  );
});
```

- [ ] **Step 2: 走らせて緑を確認**

Run:
```bash
pnpm exec playwright test view --project=chromium
```
Expected: 1 passed。

- [ ] **Step 3: Commit**

```bash
git add e2e/view.spec.ts
git commit -m "test: E2E シナリオ タブ切替（human↔ai）を追加"
```

---

### Task 5: シナリオ3 URL hash 復元

**Files:**
- Create: `e2e/url-hash.spec.ts`

**Interfaces:**
- Consumes: `LicensePage`（`goto("#tags=...")`, `chip`, `ident`）。

- [ ] **Step 1: spec を作成**

`e2e/url-hash.spec.ts`:
```ts
import { expect, test } from "./fixtures";

test("hash 付きでロードするとタグ状態が復元される", async ({ licensePage }) => {
  // BY と NC のみ ON の hash でロードする。
  await licensePage.goto("#tags=BY-NC");

  await expect(licensePage.chip("BY")).toHaveAttribute("aria-pressed", "true");
  await expect(licensePage.chip("NC")).toHaveAttribute("aria-pressed", "true");
  // hash に無いタグは OFF で復元される。
  await expect(licensePage.chip("NAI")).toHaveAttribute("aria-pressed", "false");
  await expect(licensePage.chip("TD")).toHaveAttribute("aria-pressed", "false");
  await expect(licensePage.chip("MR")).toHaveAttribute("aria-pressed", "false");
  // 識別子も復元値に一致。
  await expect(licensePage.ident).toContainText("BY-NC");
});
```

- [ ] **Step 2: 走らせて緑を確認**

Run:
```bash
pnpm exec playwright test url-hash --project=chromium
```
Expected: 1 passed。

- [ ] **Step 3: Commit**

```bash
git add e2e/url-hash.spec.ts
git commit -m "test: E2E シナリオ URL hash からのタグ復元を追加"
```

---

### Task 6: シナリオ5 クリアで PII 除去（url-hash.spec.ts へ追記）

**Files:**
- Modify: `e2e/url-hash.spec.ts`

**Interfaces:**
- Consumes: `LicensePage`（`photographer`, `clearButton`, `flashStatus`）。

- [ ] **Step 1: クリアの test を追記**

`e2e/url-hash.spec.ts` の末尾に追加:
```ts
test("撮影者名を入力→blur で URL に載り、クリアで欄も URL も PII が消える", async ({
  licensePage,
  page,
}) => {
  await licensePage.goto();

  // 入力→blur（change）で URL hash に photographer が載る（入力中は載らない設計）。
  await licensePage.photographer.fill("テスト太郎");
  await licensePage.photographer.blur();
  await expect(page).toHaveURL(/photographer=/);

  // クリアで欄が空になり、URL hash から PII が消え、フラッシュが出る。
  await licensePage.clearButton.click();
  await expect(licensePage.photographer).toHaveValue("");
  await expect(page).not.toHaveURL(/photographer=/);
  await expect(licensePage.flashStatus).toHaveText("クリアしました");
});
```

- [ ] **Step 2: 走らせて緑を確認**

Run:
```bash
pnpm exec playwright test url-hash --project=chromium
```
Expected: 2 passed。

- [ ] **Step 3: Commit**

```bash
git add e2e/url-hash.spec.ts
git commit -m "test: E2E シナリオ クリアで欄と URL から PII 除去を追加"
```

---

### Task 7: シナリオ4 コピーのフラッシュ

**Files:**
- Create: `e2e/copy.spec.ts`

**Interfaces:**
- Consumes: `LicensePage`（`copyButton`, `flashStatus`）。

- [ ] **Step 1: spec を作成**

クリップボード実体ではなく配線シグナル（フラッシュ）を検証する。クリック（信頼ジェスチャ）で clipboard API か execCommand フォールバックのどちらかが成功しフラッシュが出る。permission は付与しない（ブラウザ差を回避）。

`e2e/copy.spec.ts`:
```ts
import { expect, test } from "./fixtures";

test("コピーを押すと aria-live のフラッシュに『コピーしました』が出る", async ({
  licensePage,
}) => {
  await licensePage.goto();
  await licensePage.copyButton.click();
  // フラッシュは 1400ms で復帰するが、assertion は即時ポーリングで一致を捉える。
  await expect(licensePage.flashStatus).toHaveText("コピーしました");
});
```

- [ ] **Step 2: 3 ブラウザで走らせて緑を確認**

Run:
```bash
pnpm exec playwright test copy --project=chromium --project=firefox --project=webkit
```
Expected: 3 passed。いずれかで落ちたらフォールバック経路（execCommand）の発火を確認（実バグでなければ assertion タイミングを点検）。

- [ ] **Step 3: 全プロジェクト・全 spec を通しで緑確認**

Run:
```bash
pnpm e2e
```
Expected: 6 tests × 4 projects = 全 passed。

- [ ] **Step 4: Commit**

```bash
git add e2e/copy.spec.ts
git commit -m "test: E2E シナリオ コピーのフラッシュ通知を追加"
```

---

### Task 8: PR 時 CI（merge-gate.yml に e2e ジョブ）

**Files:**
- Modify: `.github/workflows/merge-gate.yml`

**Interfaces:**
- Consumes: `pnpm e2e`（Task 1）。
- Produces: 集約ジョブ `Merge Gate Result` が `full` と `e2e` の両方の result を fail-closed 判定する。required check 名は不変。

- [ ] **Step 1: e2e ジョブを追加**

`merge-gate.yml` の `jobs.full` の後、`jobs.gate` の前に追加:
```yaml
  e2e:
    name: E2E (Playwright)
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10 # v6.0.3
      - uses: pnpm/action-setup@0ebf47130e4866e96fce0953f49152a61190b271 # v6.0.9
      - uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v4
        with:
          node-version: 22
          cache: pnpm
          cache-dependency-path: |
            pnpm-lock.yaml
            pnpm-workspace.yaml
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps
      - run: pnpm e2e
```

- [ ] **Step 2: gate ジョブを full+e2e 依存へ更新**

`jobs.gate` を以下へ置き換える:
```yaml
  gate:
    name: Merge Gate Result
    needs: [full, e2e]
    if: always()
    runs-on: ubuntu-latest
    timeout-minutes: 2
    steps:
      - name: 集約結果の判定（fail-closed）
        env:
          FULL: ${{ needs.full.result }}
          E2E: ${{ needs.e2e.result }}
        run: |
          # full / e2e はいずれも skip 不可。skipped 許容は将来ジョブ追加時の
          # required pending デッドロック回避のためで、両者の success を要求する。
          echo "full job result: ${FULL}"
          echo "e2e job result: ${E2E}"
          for result in "${FULL}" "${E2E}"; do
            case "${result}" in
              success|skipped) ;;
              *) echo "::error::ジョブ結果 '${result}' は許容されない"; exit 1 ;;
            esac
          done
          echo "merge gate passed"
```

- [ ] **Step 3: YAML 妥当性を確認**

Run:
```bash
pnpm exec wrangler --version >/dev/null; python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/merge-gate.yml')); print('yaml ok')"
```
Expected: `yaml ok`（構文エラーなし）。

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/merge-gate.yml
git commit -m "ci: Merge Gate に E2E ジョブを追加しマージをブロッキング検証する"
```

---

### Task 9: リリース後 CI（本番 E2E、workflow_run）

**Files:**
- Create: `.github/workflows/e2e-prod.yml`

**Interfaces:**
- Consumes: Deploy workflow（`name: Deploy`）の成功イベント、`pnpm e2e` + `E2E_BASE_URL`。
- Produces: 本番 cospl.org に同スイートを当てる事後・非ブロッキング検証。

- [ ] **Step 1: post-release workflow を作成**

`.github/workflows/e2e-prod.yml`:
```yaml
name: E2E (production)

# Deploy 成功後に本番 cospl.org へ Playwright を当てる事後スモーク。read-only なので副作用なし。
# 非ブロッキング（デプロイ済みのため）だが、失敗はワークフロー失敗として可視化される。
on:
  workflow_run:
    workflows: ["Deploy"]
    types: [completed]

concurrency:
  group: e2e-prod
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  e2e-prod:
    name: E2E against cospl.org
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10 # v6.0.3
      - uses: pnpm/action-setup@0ebf47130e4866e96fce0953f49152a61190b271 # v6.0.9
      - uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v4
        with:
          node-version: 22
          cache: pnpm
          cache-dependency-path: |
            pnpm-lock.yaml
            pnpm-workspace.yaml
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps
      - run: pnpm e2e
        env:
          E2E_BASE_URL: https://cospl.org
```

- [ ] **Step 2: YAML 妥当性を確認**

Run:
```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/e2e-prod.yml')); print('yaml ok')"
```
Expected: `yaml ok`。

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/e2e-prod.yml
git commit -m "ci: Deploy 成功後に本番 cospl.org へ E2E を当てる post-release ワークフローを追加"
```

---

## 統合の最終確認（PR 前）

- [ ] `pkf run check`（lint + typecheck + test）緑。
- [ ] `pnpm typecheck:e2e` 緑。
- [ ] `pnpm e2e` で 6 tests × 4 projects 全 passed（ローカル preview）。
- [ ] pre-merge-quality-gate（simplify / code-reviewer / boy-scout / e2e-impact）を通す。
- [ ] PR 作成 → Merge Gate（full + e2e）緑を確認 → squash マージ。
- [ ] 注: post-release ワークフローは次回 deploy 時に初稼働。E2E_BASE_URL=https://cospl.org の実挙動はその run で初検証される。

## スコープ外（follow-up）

ネイティブ共有シート / execCommand フォールバック単体 / 実ファイルダウンロード内容 / 矢印・Home・End のタブ移動 / input vs blur のタイミング差 / 共有 disclosure の開閉。CI のブラウザバイナリキャッシュ（actions/cache）も初版では入れず、必要なら後で SHA ピンで追加する。
