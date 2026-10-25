# CosPL 2.0（拡張・データバック・NAI 明確化）Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Goal: CosPL を 2.0 に上げ、README を本体と拡張の 2 層にし、ND・SB・NAI の線引き・クレジット依頼の方法・連絡先の複数化を入れ、URL から個人情報を外す。

Architecture: まず `src/core.ts` を `src/license/` 配下の責務別モジュールへ分割し、`src/core.ts` は再エクスポートの窓口として残す（`scripts/regen-golden.mjs` と既存 import を壊さない）。その後、hash・タグ・選択肢・文書生成・UI の順に機能を足す。

Tech Stack: TypeScript 7 / Vite 8 / Cloudflare Workers / vitest 5（@cloudflare/vitest-plugin）/ Playwright / Biome / just

Spec: `docs/superpowers/specs/2026-10-26-readme-extensions-design.md`

## Global Constraints

- コマンドは just 経由（`just check` / `just test` / `just e2e` / `just regen-golden`）。pnpm script は存在しない
- any・try-catch・新規の `as` は禁止。Result / Option（`src/types/`）を使う
- 文面を変えたタスクは `just regen-golden` で golden を更新し、差分を読んで意図した変更だけかを確かめてからコミットする
- URL hash に出してよいのはタグと選択肢（`credit`）だけ
- 版の文字列は `src/license/version.ts` の 1 か所だけに置く
- タグの定義順は `BY, NC, ND, NAI, TD, SB, MR`。`DEFAULT_TAGS` は `BY-NC-NAI-TD` のまま（ND と SB は任意タグ）
- E2E の新規作成は `~/.claude/references/testing.md` の Playwright Test Agents 手順に従う。既存 E2E の書き換えはページオブジェクト `e2e/pages/license-page.ts` を使う
- コメントとログは日本語

## Review Focus

- 古い共有 URL（`#tags=BY-NC&photographer=...&contact=...`）を開く: 値は欄に入らず、読み込み直後に URL から消える（Task 2）
- 拡張の見出しだけ・本文だけ・空行だけの入力: 見出しが空の拡張は出力されず、` +` も付かない。空行は捨てる（Task 5）
- 本文に `#` や `- ` で始まる行や山括弧を書く: Markdown 構造を壊さない（行頭の記号は残すが見出しにはならない、山括弧は除去）（Task 5）
- BY を OFF にしてから ON に戻す: `credit` の選択は保持され、OFF の間は URL と文書から消える（Task 4）
- `/license.md?credit=xyz` や `credit` だけ指定（BY なし）: 前者は 400 `invalid_credit`、後者は無視して 200（Task 4）

## File Structure

- `src/license/version.ts`: `VERSION`、`TERMS_URL`
- `src/license/tags.ts`: タグ定義・パース・識別子
- `src/license/options.ts`: 選択肢（クレジット依頼の方法）
- `src/license/query.ts`: `parseView` / `parseFormat`
- `src/license/sanitize.ts`: フリーテキストと日付のクリーニング
- `src/license/hash.ts`: URL hash の復元と直列化
- `src/license/document.ts`: README と AI 宣言の生成
- `src/license/presets.ts`: 拡張のひな形
- `src/license/share.ts`: サイト共有の文面
- `src/core.ts`: 上記の再エクスポートのみ
- テストは `test/license/<module>.test.ts` に対応させて分ける。golden 回帰は `test/license/document.test.ts`

## Task 1: core.ts を責務別モジュールへ分割（振る舞い不変）

Files:
- Create: `src/license/{version,tags,query,sanitize,hash,document,share}.ts`、`test/license/{tags,query,sanitize,hash,document,share}.test.ts`
- Modify: `src/core.ts`（再エクスポートのみ）、`src/client/main.ts:60-63`
- Delete: `test/core.test.ts`（中身は各 test/license/*.test.ts へ移す）

Interfaces:
- Produces: `VERSION: "1.0"`（Task 3 で 2.0 へ）、`TERMS_URL: string`（Task 3 で導入する値。この Task では `"https://cospl.org/"` のまま）、既存の全 export（`ORDER`, `Tag`, `State`, `DEFAULT_TAGS`, `emptyState`, `tagsFrom`, `ident`, `parseTag`, `parseTags`, `parseView`, `parseFormat`, `Fields`, `DEFAULT_FIELDS`, `EMPTY_FIELDS`, `cleanFields`, `sanitizeFields`, `parseHash`, `serializeHash`, `humanMD`, `humanText`, `aiMD`, `SITE_URL`, `siteShareMessage`, `siteSharePayload`, `SharePayload`）を同名で `src/core.ts` から再エクスポート
- Produces: `cleanText(raw: string, maxCodePoints: number): string` を `sanitize.ts` から export（Task 5 で再利用）
- Produces: `identParts(state: State): { version: string; tags: string[] }` を `tags.ts` に追加し、`ident` と `main.ts` の `identHTML` の両方がこれを使う

- [ ] Step 1: 分割前に通過テストの fullName 集合を記録する。`just test --reporter=json --outputFile=.cache/ids-before.json`
- [ ] Step 2: モジュールへ移し、`test/core.test.ts` の describe をそれぞれのテストファイルへそのまま移す（テスト名は変えない）。`main.ts` の `identHTML` を `identParts` 経由にする
- [ ] Step 3: `just check` が緑、golden テストが緑
- [ ] Step 4: `just test --reporter=json --outputFile=.cache/ids-after.json` の fullName 集合が Step 1 と一致する（ファイルパスは比較から外す）
- [ ] Step 5: Commit `refactor: core を責務別モジュールへ分割`

## Task 2: URL hash から個人情報を外す

Files:
- Modify: `src/license/hash.ts`、`src/client/main.ts`、`index.html:100-114`（説明文のみ）、`test/license/hash.test.ts`、`e2e/url-hash.spec.ts`、`e2e/pages/license-page.ts`（必要なら）

Interfaces:
- Produces: `parseHash(hash: string): { tags: State }`、`serializeHash(state: State): string`（Task 4 で options 引数を足す）
- `main.ts` の `AppState.draft` は hash と無関係に初期化する（`{ ...EMPTY_FIELDS, date: todayISO() }`）。`syncUrl` は `serializeHash(state.tags)`。`setField` / `change` / `link` コピー時の URL 同期のうち、フィールド起因のものは削除する

- [ ] Step 1: 失敗するテストを書く（`test/license/hash.test.ts`）
  - `parseHash("#tags=BY-NC&photographer=A&contact=B&date=2026-01-01")` は `{ tags: <BY,NC のみ true> }` を返し、戻り値に fields を持たない
  - `serializeHash(<BY,NC>)` は `"#tags=BY-NC"`、全 false は `"#tags=none"`
  - 裸タグ `parseHash("#BY-NC")` は従来どおり BY,NC
  - 旧「URLSearchParams 形式からタグとフィールドを復元する」「serialize → parse はラウンドトリップする（日本語含む）」「parseHash は値もサニタイズする」は削除し、上記に置き換える
- [ ] Step 2: `just test test/license/hash.test.ts` が FAIL
- [ ] Step 3: 実装
- [ ] Step 4: E2E を書き換える（`e2e/url-hash.spec.ts`）
  - 旧テスト「撮影者名を入力→blur で URL に載り…」を「撮影者名を入力→blur しても URL に載らない」に置き換える: 入力・blur 後に `expect(page).not.toHaveURL(/photographer=/)`、クリアで欄が空・フラッシュ「クリアしました」
  - 追加「個人情報入りの古い URL を開くと欄に入らず URL からも消える」: `goto("#tags=BY-NC&photographer=テスト太郎&contact=x")` → photographer 欄が空、`not.toHaveURL(/photographer=|contact=/)`、BY と NC のチップが pressed
- [ ] Step 5: 説明文を「入力内容は URL に残らず、ページを閉じると消えます。」の旨に、リンクコピーのヘルプを「タグと選択肢だけを含む共有 URL」の旨に直す
- [ ] Step 6: `just check` と `just e2e --project chromium` が緑
- [ ] Step 7: Commit `fix: URL hash に個人情報を残さない`

## Task 3: CosPL 2.0、ND と SB のタグ、NAI の線引き

Files:
- Modify: `src/license/version.ts`、`src/license/tags.ts`、`src/license/document.ts`、`src/discovery.ts`、`public/llms.txt`、`index.html`（チップ・識別子初期表示・本文リンク）、`src/client/styles.module.css`（チップアイコンの対応があれば）、`test/__fixtures__/golden.json`、`test/license/*.test.ts`、`test/worker.test.ts`、`test/discovery.test.ts`
- Create: `v2.0/CosPL-2.0.md`、`v2.0/TAGS.md`、`v2.0/template_README.md`、`public/icons/sb.svg`、`public/icons/nd.svg`

Interfaces:
- Produces: `VERSION = "2.0"`、`TERMS_URL = "https://github.com/hidari/cospl/blob/main/v2.0/CosPL-2.0.md"`、`ORDER = ["BY", "NC", "ND", "NAI", "TD", "SB", "MR"] as const`、`emptyState()` に `ND: false` と `SB: false`

- [ ] Step 1: 失敗するテストを書く
  - `ident(<全タグ true>)` は `"CosPL 2.0 / BY-NC-ND-NAI-TD-SB-MR"`、`parseTags("MR-SB-ND-BY")` の `tagsFrom` は `["BY", "ND", "SB", "MR"]`
  - `humanMD(<ND OFF>)` の権利関係の章は `"- 写真データは自由に加工していただいて構いません"` を含む。`humanMD(<ND>)` は代わりに `"- 写真の加工はご遠慮ください（トリミング・リサイズは構いません）"` を含み、前者を含まない
  - `aiMD(<ND>)` は `"- derivatives: prohibited (cropping and resizing allowed)   # ND"`、OFF は `"- derivatives: allowed   # ND"`
  - `humanMD(<既定タグ>)` は `"## データの内容物"` と `"## 写真の加工・編集について"` を含まない
  - `humanMD(<SB のみ>)` は `"## データバックについて"` と `"- SNSやポートフォリオなどに掲載するため、写真の返送をお願いします"` を含む。SB OFF では含まない
  - `humanMD(<NAI>)` の禁止行は `"- 生成AIの学習用データとしての利用、およびこの写真を元にした別の画像・動画の生成（AIによるノイズ除去・レタッチ・背景の拡張など、この写真を仕上げるための加工は除きます）"`
  - `aiMD(<SB>)` は `"- photo_send_back_requested: yes   # SB"`、OFF は `"- photo_send_back_requested: no   # SB"`
  - `aiMD(<NAI>)` の Notice は `"This work is tagged NAI. Do NOT use it as AI training data, and do NOT generate new images or videos from it. Editing this photograph itself with AI-assisted tools, including partial generative fill, is permitted."`。`generative input` の文字列を含まない
  - `aiMD` の `terms_url:` 行は `TERMS_URL`
  - worker: `/license.md?tags=SB` と `?tags=ND` が 200
- [ ] Step 2: `just test` が FAIL
- [ ] Step 3: 実装。SB の章は TD の章の直後に置く。現行の「データの内容物」「写真の加工・編集について」の 2 章を削除し、加工の可否の 1 行は「権利関係について」の章の末尾に置く
- [ ] Step 4: `v2.0/` の 3 文書を `v1.0/` から起こし、SB・NAI の線引き・2 層構造と優先順位・識別子の ` +`・タグは集合で順序は表示の正規形であること・版の運用（spec の「版」節の 3 項目）を反映する。ND の定義（トリミングとリサイズは許可）と、拡張は本体を緩められないことも書く。`v1.0/` は変更しない
- [ ] Step 5: `public/llms.txt` を 2.0 へ: リンクを v2.0 に、タグ一覧に `ND: no derivatives except cropping and resizing（加工禁止、トリミング・リサイズは可）` と `SB: send back requested（データバック）`、NAI の説明を新しい線引きに、識別子の例を `CosPL 2.0 / …`、順序は意味を持たない旨を 1 行、テンプレートへのリンクを実在するファイル名 `template_README.md` に
- [ ] Step 6: `index.html` に ND チップ（`class="chip opt"`、`aria-pressed="false"`、名前「加工禁止」、説明「トリミング・リサイズはOK」）を NC と NAI の間に、SB チップ（`class="chip opt"`、`aria-pressed="false"`、名前「データバック」、説明「掲載用に撮影者へ写真を返送」）を TD と MR の間に、`public/icons/nd.svg` と `public/icons/sb.svg` を既存の線画アイコンと同じ作法（viewBox 0 0 100 100、stroke 線画）で暫定作成
- [ ] Step 7: `just regen-golden` を実行し、golden に `"BY-NC-NAI-TD-SB"`・`"SB-MR"`・`"BY-NC-ND"` のケースを足してから再生成。差分が版表記・ND・SB・NAI の文面と 2 章の削除だけであることを確かめる
- [ ] Step 8: `just check` と `just e2e --project chromium` が緑
- [ ] Step 9: Commit `feat: CosPL 2.0 として ND と SB のタグと NAI の線引きを追加`

## Task 4: クレジット依頼の方法（BY の選択肢）

Files:
- Create: `src/license/options.ts`、`test/license/options.test.ts`
- Modify: `src/types/errors.ts`（`invalidCreditError`）、`src/license/hash.ts`、`src/license/document.ts`、`src/worker.ts`、`src/discovery.ts`、`src/client/main.ts`、`index.html`、`test/license/hash.test.ts`、`test/worker.test.ts`、`test/discovery.test.ts`、golden

Interfaces:
- Produces: `type CreditMethod = "sns" | "any"`、`type Options = Readonly<{ credit: CreditMethod }>`、`DEFAULT_OPTIONS: Options = { credit: "sns" }`、`parseCredit(raw: string | null): Result<CreditMethod, ParseError>`（null は `"sns"`、大文字小文字と前後空白を許容）
- Produces: `parseHash(hash): { tags: State; options: Options }`、`serializeHash(state: State, options: Options): string`。`credit` は BY が ON かつ既定（`sns`）以外のときだけ `&credit=any` を付ける。hash の不正値は既定へフォールバック
- Produces: `humanMD(state, options, ...)` / `humanText(...)` / `aiMD(state, options, ...)`。引数の順は Task 5 で確定させる最終形 `(state: State, options: Options, doc: Doc)` に合わせ、この Task では `doc` を既定値付きで受ける
- `/license.md` は `credit` クエリを受け、不正値は 400 `invalid_credit`。BY が OFF のときの `credit` は無視
- `AppState` に `options: Options`、Action に `{ type: "setCredit"; credit: CreditMethod }`（URL 即時同期のホワイトリストに入れる）

- [ ] Step 1: 失敗するテストを書く
  - `parseCredit(null)` は `sns`、`parseCredit(" ANY ")` は `any`、`parseCredit("x")` は `invalid_credit` で失敗
  - `serializeHash(<BY>, { credit: "any" })` は `"#tags=BY&credit=any"`、`serializeHash(<BY>, DEFAULT_OPTIONS)` は `"#tags=BY"`、`serializeHash(<NC>, { credit: "any" })` は `"#tags=NC"`
  - `parseHash("#tags=BY&credit=zzz").options` は `DEFAULT_OPTIONS`
  - `humanMD(<BY>, DEFAULT_OPTIONS)` は `"- SNSへ投稿される際は、SNSの機能による本文内でのメンションやタグでのクレジットをお願いします"` を含み、`"タグではなく本文内でのメンション"` を含まない
  - `humanMD(<BY>, { credit: "any" })` は `"- クレジットの方法は問いません"` を含む
  - どちらも `"  - クレジット表記のテンプレートをお持ちの場合はそちらでも構いません"` を含む
  - `aiMD(<BY>, { credit: "any" })` は `"- attribution_method: any   # BY"`、`sns` は `"- attribution_method: sns_mention_or_tag   # BY"`、BY OFF は行なし
  - worker: `?tags=BY&credit=any` は 200 で上記文面、`?credit=xyz` は 400 で本文に `invalid_credit`、`?tags=NC&credit=any` は 200
- [ ] Step 2: FAIL を確認
- [ ] Step 3: 実装。UI は BY チップの直下に 2 択のラジオ（`fieldset` + `legend`「クレジットのお願いの仕方」、BY OFF で `hidden`）
- [ ] Step 4: `just regen-golden`、差分を確認
- [ ] Step 5: E2E（Playwright Test Agents で生成）: 「方法は問わない」を選ぶと出力に「クレジットの方法は問いません」が出て URL に `credit=any` が付く。BY を OFF にすると選択肢が隠れ URL から `credit` が消え、ON に戻すと「方法は問わない」が保持されている
- [ ] Step 6: `just check` と `just e2e --project chromium` が緑
- [ ] Step 7: Commit `feat: クレジット依頼の方法を選べるようにする`

## Task 5: 文書モデル（連絡先の複数化・SB の自由記述・拡張）

Files:
- Create: `src/license/presets.ts`、`test/license/presets.test.ts`
- Modify: `src/license/sanitize.ts`、`src/license/document.ts`、`src/license/tags.ts`（`ident` の第 2 引数）、`src/worker.ts`（`Doc` は既定値）、`test/license/document.test.ts`、`test/license/sanitize.test.ts`、golden

Interfaces:
- Produces:
  - `type Extension = Readonly<{ heading: string; body: string }>`
  - `type Draft = Readonly<{ date: string; photographer: string; contacts: readonly string[]; sendBack: string; extensions: readonly Extension[] }>`（UI の生入力）
  - `type Doc = Readonly<{ date: string; photographer: string; contacts: readonly string[]; sendBackItems: readonly string[]; extensions: readonly Readonly<{ heading: string; items: readonly string[] }>[] }>`（サニタイズ済み・プレースホルダ適用済み）
  - `EMPTY_DRAFT: Draft`、`DEFAULT_DOC: Doc`（`date: "[YYYY-MM-DD]"`、`photographer: "[撮影者名]"`、`contacts: ["[連絡先をここに記入]"]`、`sendBackItems: []`、`extensions: []`）
  - `toDoc(draft: Draft): Doc`
  - `ident(state: State, hasExtensions = false): string`（true で末尾に `" +"`）
  - `humanMD(state: State, options: Options = DEFAULT_OPTIONS, doc: Doc = DEFAULT_DOC): string`、`humanText` 同形、`aiMD(state: State, options: Options = DEFAULT_OPTIONS, hasExtensions = false): string`
  - `EXTENSION_PRESETS: readonly Readonly<{ id: "contents" | "editing" | "photographer-use"; heading: string; body: string }>[]`
- 上限（実装側の判断として固定）: 見出し 40 コードポイント、項目 1 行 200 コードポイント、拡張 1 つあたり 20 行、拡張 10 個、連絡先 5 件（各 100 コードポイント）、SB の自由記述 10 行
- `Fields` / `DEFAULT_FIELDS` / `EMPTY_FIELDS` / `cleanFields` / `sanitizeFields` は `Draft` / `toDoc` に置き換えて削除する

- [ ] Step 1: 失敗するテストを書く
  - `toDoc(EMPTY_DRAFT)` は `DEFAULT_DOC`
  - `toDoc({ ...EMPTY_DRAFT, contacts: ["X: @a", "  ", "B"] }).contacts` は `["X: @a", "B"]`
  - `toDoc({ ...EMPTY_DRAFT, extensions: [{ heading: "", body: "a" }, { heading: "加工", body: "a\n\n<b>b</b>\n" }] }).extensions` は `[{ heading: "加工", items: ["a", "bb"] }]`
  - 拡張 11 個・本文 21 行・連絡先 6 件は、それぞれ先頭 10 / 20 / 5 に切られる
  - `ident(<BY>, true)` は `"CosPL 2.0 / BY +"`、`ident(<none>, true)` は `"CosPL 2.0 +"`
  - 拡張ありの `humanMD` は、連絡先の章の直前に `"以下は本文書への追加事項です。本文書の条件と矛盾する場合は本文書の条件が優先します。"`、続けて `"## 加工"`・`"- a"`・`"- bb"` を含み、`適用:` 行の識別子が ` +` で終わる
  - 項目が `"# 見出し風"` のとき出力は `"- # 見出し風"`（行頭が `- ` なので見出しにならない）
  - SB ON かつ `sendBackItems: ["お気に入り1枚でOK"]` で、固定文の次行に `"- お気に入り1枚でOK"`
  - 連絡先 2 件は `"## 連絡先"` の下に 2 行、空のときは `"- [連絡先をここに記入]"`
  - `aiMD(<BY>, DEFAULT_OPTIONS, true)` は `"- additional_terms: present (see the human-readable README; the conditions above take precedence)"`、false では行なし
  - `EXTENSION_PRESETS` は id が `contents` / `editing` / `photographer-use` の 3 件で、どの body にも実在の名前・URL・受け取りコードを含まない（`http`、`@` を含まない）
- [ ] Step 2: FAIL を確認
- [ ] Step 3: 実装。ひな形の文面:
  - contents（見出し「データの内容物」）: `現像済みJPEG（長辺 [◯]px で書き出し）` / `本README文書` / `RAWデータが必要な場合はご相談ください`
  - editing（見出し「加工」）: `原則として、お渡しした現像済みJPEGをご使用ください`（加工の可否は本体の ND が持つので、ここには書かない）
  - photographer-use（見出し「撮影者側の利用」）: `編集や加工の技術向上のための題材として使用する場合があります`
- [ ] Step 4: `just regen-golden`、差分が連絡先の行だけであることを確認
- [ ] Step 5: `just check` が緑
- [ ] Step 6: Commit `feat: 連絡先の複数化と拡張の文書モデルを追加`

## Task 6: STEP 2 の入力 UI

Files:
- Modify: `index.html`、`src/client/main.ts`、`src/client/styles.module.css`、`e2e/pages/license-page.ts`、既存 E2E のうち入力欄の場所に依存するもの
- Create: 新規 E2E（Playwright Test Agents で生成）

Interfaces:
- Consumes: `Draft`、`EMPTY_DRAFT`、`toDoc`、`EXTENSION_PRESETS`、`ident(state, hasExtensions)`、`humanMD`、`aiMD`
- `AppState.draft: Draft`。Action を追加: `addContact` / `setContact(index, value)` / `removeContact(index)` / `setSendBack(value)` / `addExtension(preset?: id)` / `setExtension(index, field, value)` / `removeExtension(index)`。いずれも URL 同期のホワイトリストに入れない
- 識別子の ` +` は `toDoc(draft).extensions.length > 0` で決める

- [ ] Step 1: `<details class="fill">` を廃止し、STEP 2 のタブの上に入力欄を置く。並びは 撮影者名・最終更新日・連絡先（「＋ 連絡先を追加」）・データバックの詳細（SB ON のときだけ表示、`textarea`）・拡張（ひな形ボタン 3 つ・「＋ 項目を追加」・各拡張に見出し `input`、本文 `textarea`、削除ボタン）・「入力をクリア」
- [ ] Step 2: 動的に足す要素はすべて `label` と結び、削除ボタンには「<見出し> を削除」の `aria-label` を付ける。追加直後は新しい見出し欄へフォーカスを移す
- [ ] Step 3: 「入力をクリア」は draft を `EMPTY_DRAFT`（日付は当日）に戻し、追加した欄も消す
- [ ] Step 4: E2E（Playwright Test Agents で生成）
  - ひな形「加工」を押すと見出し「加工」の拡張が足され、出力に `## 加工` と、識別子に ` +` が出る。削除すると両方消える
  - 「＋ 項目を追加」で見出し「その他」、本文 2 行を入れると出力に 2 行の箇条書き
  - 「＋ 連絡先を追加」で 2 件入れると連絡先の章に 2 行
  - SB を ON にするとデータバックの詳細欄が現れ、入力が出力に出る。OFF で欄が隠れ出力から消える
  - どの入力をしても URL は `#tags=…`（と `credit`）以外を含まない
- [ ] Step 5: `just check` と `just e2e` が緑（手元に無いブラウザは CI の Merge Gate で確認）
- [ ] Step 6: Commit `feat: 入力欄を STEP 2 に移し連絡先と拡張の UI を追加`
