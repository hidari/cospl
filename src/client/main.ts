// サイトのクライアント。core の純粋関数を共有し、関数型 reducer で UI を駆動する。
// 副作用（DOM 取得・clipboard・履歴更新）は境界に押し出し、欠落値は Option、失敗は Result で扱う。

import {
  addExtension,
  aiMD,
  type CreditMethod,
  canAddExtension,
  creditParam,
  type Doc,
  type Draft,
  EMPTY_DRAFT,
  EXTENSION_MARK,
  EXTENSION_PRESETS,
  type Extension,
  type ExtensionPresetId,
  hasExtensions,
  humanMD,
  identParts,
  MAX_HEADING,
  MAX_PHOTOGRAPHER,
  type Options,
  parseCredit,
  parseHash,
  parseTag,
  removeExtension,
  SITE_URL,
  type State,
  serializeHash,
  setExtension,
  setTextField,
  siteShareMessage,
  siteSharePayload,
  type Tag,
  type TextField,
  tagsFrom,
  toDoc,
  type View,
} from "../core";
import { fromNullable, ifSome, type Option } from "../types/option";
import { fail, type Result, success } from "../types/result";
import styles from "./styles.module.css";
import { registerServiceWorker } from "./sw-register";

// アプリ状態（タグ集合 + 文面オプション + 出力ビュー + 入力欄の生入力）。不変に扱う。
type AppState = { tags: State; options: Options; view: View; draft: Draft };

type Action =
  | { type: "toggleTag"; tag: Tag }
  | { type: "setCredit"; credit: CreditMethod }
  | { type: "setView"; view: View }
  | { type: "setField"; field: TextField; value: string }
  | { type: "addExtension"; preset?: ExtensionPresetId }
  | { type: "setExtension"; index: number; field: keyof Extension; value: string }
  | { type: "removeExtension"; index: number }
  | { type: "clearDraft" };

// 純粋な状態遷移
function update(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "toggleTag":
      return { ...state, tags: { ...state.tags, [action.tag]: !state.tags[action.tag] } };
    case "setCredit":
      return { ...state, options: { ...state.options, credit: action.credit } };
    case "setView":
      return { ...state, view: action.view };
    case "setField":
      return { ...state, draft: setTextField(state.draft, action.field, action.value) };
    case "addExtension":
      return { ...state, draft: addExtension(state.draft, action.preset) };
    case "setExtension":
      return {
        ...state,
        draft: setExtension(state.draft, action.index, action.field, action.value),
      };
    case "removeExtension":
      return { ...state, draft: removeExtension(state.draft, action.index) };
    case "clearDraft":
      return { ...state, draft: EMPTY_DRAFT };
  }
}

// 行の数が変わる action。入力中の欄を作り直さないよう、拡張の行 DOM はこのときだけ組み直す。
function changesRows(action: Action): boolean {
  switch (action.type) {
    case "addExtension":
    case "removeExtension":
    case "clearDraft":
      return true;
    default:
      return false;
  }
}

// 行を組み直したあとにフォーカスを移す先の要素 id。追加は新しい入力欄、削除は追加ボタンへ移す。
function focusTargetAfter(action: Action, draft: Draft): string | null {
  switch (action.type) {
    case "addExtension":
      return extensionHeadingId(draft.extensions.length - 1);
    case "removeExtension":
      return "ext-add";
    default:
      return null;
  }
}

function extensionHeadingId(index: number): string {
  return `ext-heading-${index}`;
}

// 削除ボタンのアクセシブル名。見出しが空の間は番号で呼ぶ。
function extensionDeleteLabel(heading: string, index: number): string {
  return `${heading.trim() || `追加事項 ${index + 1}`} を削除`;
}

// 状態から導出する純粋な値 ---------------------------------------------------

function markdownFor(state: AppState, doc: Doc): string {
  return state.view === "ai"
    ? aiMD(state.tags, state.options, hasExtensions(doc))
    : humanMD(state.tags, state.options, doc);
}

function currentMarkdown(state: AppState): string {
  return markdownFor(state, toDoc(state.draft));
}

// ダウンロードファイル名。中身は Markdown だが、まず開けることを優先して .txt で配る。
function downloadName(state: AppState): string {
  return state.view === "ai" ? "cospl-ai.txt" : "README.txt";
}

function identHTML(state: AppState, doc: Doc): string {
  const { version, tags } = identParts(state.tags);
  const mark = hasExtensions(doc) ? EXTENSION_MARK : "";
  return `CosPL ${version}${tags.length ? ` / <b>${tags.join("-")}</b>` : ""}${mark}`;
}

function endpoint(state: AppState): string {
  const tags = tagsFrom(state.tags);
  const param = creditParam(state.tags.BY, state.options);
  const credit = param === null ? "" : `&credit=${param}`;
  const query = `tags=${tags.length ? tags.join("-") : "none"}${credit}${state.view === "ai" ? "&view=ai" : ""}`;
  return `${SITE_URL}license.md?${query}`;
}

// DOM ヘルパー（欠落を Option で扱う） ---------------------------------------

function byId(id: string): Option<HTMLElement> {
  return fromNullable(document.getElementById(id));
}

function setText(id: string, text: string): void {
  ifSome(byId(id), (el) => {
    el.textContent = text;
  });
}

// execCommand フォールバックでコピーする（旧ブラウザ・非セキュアコンテキスト向け）
function copyViaExecCommand(text: string): Result<void, string> {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand("copy");
  ta.remove();
  return ok ? success(undefined) : fail("copy failed");
}

// クリップボード書込みを Result で包む。try-catch を使わず Promise の then/catch で合成する。
async function copyText(text: string): Promise<Result<void, string>> {
  if (navigator.clipboard?.writeText) {
    const viaApi = await navigator.clipboard
      .writeText(text)
      .then((): Result<void, string> => success(undefined))
      .catch((): Result<void, string> => fail("clipboard api failed"));
    if (viaApi.success) {
      return viaApi;
    }
  }
  return copyViaExecCommand(text);
}

// 共有シートのキャンセルは DOMException("AbortError")。環境により DOMException が Error を
// 継承しないため instanceof に頼らず name で判定する。
function isAbortError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "name" in err && err.name === "AbortError";
}

// Web Share API を呼び、コピーへのフォールバックが必要なとき（実失敗時）だけ true を返す。
// try-catch を使わず Promise の then/catch で合成する。ユーザーキャンセル（AbortError）は
// 失敗扱いせず余計なフォールバックを抑止する。navigator.share の存在は呼び出し側が確認する前提。
function shareSiteFailed(): Promise<boolean> {
  return navigator
    .share(siteSharePayload())
    .then(() => false)
    .catch((err: unknown) => !isAbortError(err));
}

// テキストをファイルとして保存する。Blob を一時 anchor 経由でダウンロードさせる。
function downloadFile(filename: string, text: string): void {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // click() はダウンロード起動を要求するだけ。即時 revoke すると Firefox/Safari で
  // 転送前に URL が失効しファイルが空になりうるため、十分遅延させてから解放する。
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// フラッシュ復帰タイマーと元の文言をボタンごとに保持する。1400ms 以内の再クリック時に
// 進行中フラッシュを引き継ぎ、誤った文言の復元や幅ロックの早期解除を防ぐ。
const flashState = new WeakMap<
  HTMLElement,
  { original: string; timer: ReturnType<typeof setTimeout> }
>();

function flash(btn: HTMLElement, label: string): void {
  const pending = flashState.get(btn);
  // 進行中フラッシュがあれば元の文言と幅ロックを引き継ぐ。無ければ現在値を確定し、文言差し替えで
  // ボタンが縮んで幅依存コンテナ（共有ポップアップ等）がレイアウトシフトするのを防ぐため、
  // 現在幅を min-width で固定する（box-sizing:border-box なので offsetWidth=border-box 幅を使える）。
  const original = pending ? pending.original : (btn.textContent ?? "");
  if (pending) clearTimeout(pending.timer);
  else btn.style.minWidth = `${btn.offsetWidth}px`;
  btn.textContent = label;
  btn.classList.add("done");
  // 視覚的なボタン文言の変化はスクリーンリーダーに伝わらないため、aria-live 領域へも結果を流す。
  setText("flash-status", label);
  const timer = setTimeout(() => {
    btn.textContent = original;
    btn.classList.remove("done");
    btn.style.minWidth = "";
    flashState.delete(btn);
    setText("flash-status", "");
  }, 1400);
  flashState.set(btn, { original, timer });
}

// 描画（状態から DOM へ反映する副作用） --------------------------------------

function render(state: AppState): void {
  const doc = toDoc(state.draft);
  // identHTML の埋め込み値は ORDER 由来のタグ定数のみで、ユーザー入力を含まないため innerHTML で安全。
  ifSome(byId("ident"), (el) => {
    el.innerHTML = identHTML(state, doc);
  });
  setText("out", markdownFor(state, doc));
  setText("ep", endpoint(state));

  // chips の aria-pressed を状態と同期
  for (const chip of document.querySelectorAll<HTMLButtonElement>(".chip")) {
    ifSome(fromNullable(chip.dataset.tag), (raw) => {
      ifSome(parseTag(raw), (tag) => {
        chip.setAttribute("aria-pressed", state.tags[tag] ? "true" : "false");
      });
    });
  }

  // データバックの追記事項欄は SB が ON のときだけ見せる（OFF でも入力値は保持し、出力には出さない）。
  ifSome(byId("send-back-field"), (el) => {
    el.hidden = !state.tags.SB;
  });

  // クレジットの選択肢は BY が ON のときだけ見せ、選択中の値をラジオへ同期する。
  ifSome(byId("credit-options"), (el) => {
    el.hidden = !state.tags.BY;
  });
  for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="credit"]')) {
    radio.checked = radio.value === state.options.credit;
  }

  // tabs の aria-selected と roving tabindex を同期する。
  // 選択タブのみ tabindex=0（Tab で1つだけ到達、タブ間は矢印キーで移動）。
  const human = state.view === "human";
  ifSome(byId("tab-h"), (el) => {
    el.setAttribute("aria-selected", String(human));
    el.setAttribute("tabindex", human ? "0" : "-1");
  });
  ifSome(byId("tab-a"), (el) => {
    el.setAttribute("aria-selected", String(!human));
    el.setAttribute("tabindex", human ? "-1" : "0");
  });
  ifSome(byId("panel-out"), (el) => el.setAttribute("aria-labelledby", tabId(state.view)));
}

// タグ状態とオプションを URL hash へ同期する（プレビュー更新とは分離）。入力欄（個人情報）は載せない。
function syncUrl(state: AppState): void {
  history.replaceState(null, "", serializeHash(state.tags, state.options));
}

// 初期化 --------------------------------------------------------------------

// 単一欄の DOM id と draft のキーの対応（初期化・クリアで共有する単一ソース）。
const TEXT_FIELDS: ReadonlyArray<readonly [string, TextField]> = [
  ["f-photographer", "photographer"],
  ["f-contacts", "contacts"],
  ["f-send-back", "sendBack"],
];

function isTextControl(el: HTMLElement): el is HTMLInputElement | HTMLTextAreaElement {
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
}

// 単一欄の値を draft から書き戻す（状態を単一ソースにする）。
// programmatic な値の代入は input イベントを発火しないため、プレビューとは二重にならない。
function syncTextFields(draft: Draft): void {
  for (const [id, field] of TEXT_FIELDS) {
    ifSome(byId(id), (el) => {
      if (isTextControl(el)) {
        el.value = draft[field];
      }
    });
  }
}

// 単一欄を draft で初期化し、入力でプレビューを更新する。URL には反映しない。
function bindTextFields(getState: () => AppState, dispatch: (action: Action) => void): void {
  for (const [id, field] of TEXT_FIELDS) {
    ifSome(byId(id), (el) => {
      if (isTextControl(el)) {
        if (field === "photographer") {
          el.maxLength = MAX_PHOTOGRAPHER;
        }
        el.value = getState().draft[field];
        el.addEventListener("input", () => dispatch({ type: "setField", field, value: el.value }));
      }
    });
  }
}

// 拡張の行 DOM ---------------------------------------------------------
// 行は draft から組み直す純粋な「状態 → DOM」。値は value / textContent だけで入れ、innerHTML は使わない。

function withChildren<T extends HTMLElement>(parent: T, ...children: Node[]): T {
  for (const child of children) {
    parent.appendChild(child);
  }
  return parent;
}

function labelFor(forId: string, text: string): HTMLLabelElement {
  const label = document.createElement("label");
  label.htmlFor = forId;
  label.textContent = text;
  return label;
}

function deleteButton(accessibleName: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ghost";
  button.textContent = "削除";
  button.setAttribute("aria-label", accessibleName);
  button.addEventListener("click", onClick);
  return button;
}

function extensionRow(
  ext: Extension,
  index: number,
  dispatch: (action: Action) => void,
): HTMLElement {
  const n = index + 1;
  const headingId = extensionHeadingId(index);
  const heading = document.createElement("input");
  heading.id = headingId;
  heading.type = "text";
  heading.maxLength = MAX_HEADING;
  heading.autocomplete = "off";
  // 見える label は短く、複数カードでも一意な名前は aria-label で与える。
  heading.setAttribute("aria-label", `追加事項 ${n} の見出し`);
  heading.value = ext.heading;

  const bodyId = `ext-body-${index}`;
  const body = document.createElement("textarea");
  body.id = bodyId;
  body.rows = 5;
  body.autocomplete = "off";
  body.setAttribute("aria-label", `追加事項 ${n} の本文`);
  body.placeholder = "1行が1項目になります";
  body.value = ext.body;

  const remove = deleteButton(extensionDeleteLabel(ext.heading, index), () =>
    dispatch({ type: "removeExtension", index }),
  );
  // 行は組み直さないため、見出しの入力に削除ボタンの名前を追従させる。
  heading.addEventListener("input", () => {
    remove.setAttribute("aria-label", extensionDeleteLabel(heading.value, index));
    dispatch({ type: "setExtension", index, field: "heading", value: heading.value });
  });
  body.addEventListener("input", () =>
    dispatch({ type: "setExtension", index, field: "body", value: body.value }),
  );

  const card = document.createElement("div");
  card.className = "ext";
  const head = document.createElement("div");
  head.className = "ext-head";
  const headingField = withChildren(
    document.createElement("div"),
    labelFor(headingId, "見出し"),
    heading,
  );
  return withChildren(
    card,
    withChildren(head, headingField, remove),
    labelFor(bodyId, "本文（1行が1項目）"),
    body,
  );
}

// 拡張の行、および上限に応じた追加ボタンの有効/無効を draft から組み直す。
function renderRows(draft: Draft, dispatch: (action: Action) => void): void {
  ifSome(byId("extensions"), (el) => {
    el.replaceChildren(...draft.extensions.map((ext, index) => extensionRow(ext, index, dispatch)));
  });
  setDisabled("ext-add", !canAddExtension(draft));
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-preset]")) {
    button.disabled = !canAddExtension(draft);
  }
}

function setDisabled(id: string, disabled: boolean): void {
  ifSome(byId(id), (el) => {
    if (el instanceof HTMLButtonElement) {
      el.disabled = disabled;
    }
  });
}

// ひな形ボタンは EXTENSION_PRESETS から作る（見出しの二重管理を避ける）。
function bindExtensionButtons(dispatch: (action: Action) => void): void {
  ifSome(byId("ext-presets"), (group) => {
    group.replaceChildren(
      ...EXTENSION_PRESETS.map((preset) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "ghost";
        button.dataset.preset = preset.id;
        button.textContent = preset.heading;
        button.addEventListener("click", () =>
          dispatch({ type: "addExtension", preset: preset.id }),
        );
        return button;
      }),
    );
  });
  ifSome(byId("ext-add"), (btn) =>
    btn.addEventListener("click", () => dispatch({ type: "addExtension" })),
  );
}

// view に対応するタブ要素の id。aria-labelledby とフォーカス移動で共用する。
function tabId(view: View): string {
  return view === "human" ? "tab-h" : "tab-a";
}

// tablist のキー操作で移動先の view を決める（WAI-ARIA tabs パターン）。
// タブは2つなので左右どちらの矢印でも切り替え、Home/End で端へ。対象外キーは null。
function nextView(current: View, key: string): View | null {
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
    case "ArrowLeft":
    case "ArrowUp":
      return current === "human" ? "ai" : "human";
    case "Home":
      return "human";
    case "End":
      return "ai";
    default:
      return null;
  }
}

function bindEvents(getState: () => AppState, dispatch: (action: Action) => void): void {
  ifSome(byId("chips"), (chips) => {
    chips.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      ifSome(fromNullable(target.closest<HTMLButtonElement>(".chip")), (button) => {
        ifSome(fromNullable(button.dataset.tag), (raw) => {
          ifSome(parseTag(raw), (tag) => dispatch({ type: "toggleTag", tag }));
        });
      });
    });
  });

  // クレジットの選択。ラジオの change を fieldset で受け、値は parseCredit で検証してから渡す。
  ifSome(byId("credit-options"), (group) => {
    group.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) {
        return;
      }
      const credit = parseCredit(target.value);
      if (credit.success) {
        dispatch({ type: "setCredit", credit: credit.data });
      }
    });
  });

  ifSome(byId("tab-h"), (el) =>
    el.addEventListener("click", () => dispatch({ type: "setView", view: "human" })),
  );
  ifSome(byId("tab-a"), (el) =>
    el.addEventListener("click", () => dispatch({ type: "setView", view: "ai" })),
  );

  // tablist 内の矢印 / Home / End でタブ移動（フォーカスも移す）。
  ifSome(fromNullable(document.querySelector<HTMLElement>('[role="tablist"]')), (tablist) => {
    tablist.addEventListener("keydown", (event) => {
      const view = nextView(getState().view, event.key);
      if (view === null) {
        return;
      }
      event.preventDefault();
      dispatch({ type: "setView", view });
      ifSome(byId(tabId(view)), (el) => el.focus());
    });
  });

  bindCopy("copy", () => currentMarkdown(getState()));
  bindCopy("ep-copy", () => endpoint(getState()));
  // URL はタグ変更のたびに同期済みで、入力欄を含まない共有 URL になっている。
  bindCopy("link", () => location.href);

  // サイト共有。設定を含まない素の URL と SNS 貼り付け用の文面を配る（状態に依存しない定数）。
  bindShareDisclosure();
  bindCopy("share-url", () => SITE_URL);
  bindCopy("share-msg", () => siteShareMessage());

  bindTextFields(getState, dispatch);
  bindExtensionButtons(dispatch);

  // 入力欄のクリア。draft を初期値へ戻す。追加した拡張の行は dispatch が
  // 状態から組み直し、単一欄の値はここで状態から書き戻す。
  ifSome(byId("clear-fields"), (btn) => {
    btn.addEventListener("click", () => {
      dispatch({ type: "clearDraft" });
      syncTextFields(getState().draft);
      flash(btn, "クリアしました");
    });
  });

  ifSome(byId("download"), (btn) => {
    btn.addEventListener("click", () => {
      const state = getState();
      downloadFile(downloadName(state), currentMarkdown(state));
      flash(btn, "保存しました");
    });
  });
}

// サイト共有。タッチ主体デバイス (pointer: coarse) で Web Share 対応のときだけ summary クリックで
// ネイティブ共有シートを直接開く。デスクトップ（マウス）は OS 共有シートの位置がブラウザ依存で
// ズレるため、また Web Share 非対応環境（X アプリ内ブラウザ等）も、ネイティブ <details> のコピー
// 用ポップアップに任せる。トグル・展開状態の公開・キーボード操作はネイティブ <details> が担う
// ため、<details> が持たない「Escape / 外側クリックでの閉じ」だけをここで補う。
function bindShareDisclosure(): void {
  ifSome(byId("share"), (el) => {
    if (!(el instanceof HTMLDetailsElement)) {
      return;
    }
    const summary = fromNullable(el.querySelector<HTMLElement>("summary"));
    // 外側クリックで閉じる（開いている間のみ）。summary・ポップ内ボタンは details 内なので除外される。
    document.addEventListener("click", (event) => {
      const target = event.target;
      if (el.open && target instanceof Node && !el.contains(target)) {
        el.open = false;
      }
    });
    // Escape で閉じて summary へフォーカスを戻す。
    document.addEventListener("keydown", (event) => {
      if (el.open && event.key === "Escape") {
        el.open = false;
        ifSome(summary, (s) => s.focus());
      }
    });
    ifSome(summary, (s) => {
      // タッチ主体デバイス (pointer: coarse) で Web Share 対応のときだけネイティブ共有シートを
      // 直接開く。デスクトップ（マウス）の OS 共有シートは位置がブラウザ依存でズレるため、また
      // X アプリ内ブラウザ等の非対応環境も、ネイティブ <details> のコピーに任せる。
      const shouldUseNativeShare =
        typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches;
      if (!shouldUseNativeShare) {
        return;
      }
      // summary クリックを横取りして <details> の開閉を抑止しネイティブ共有を直接起動する
      // （キーボードの Enter/Space も click を発火するため同経路）。この時 summary は開示トグル
      // ではなく「共有する」ボタンとして働くため role を button に上書きしてスクリーンリーダーの
      // 誤読（"折りたたみ"）を防ぎ、起動に失敗したときだけ role を戻してコピー用ポップアップを開く。
      s.setAttribute("role", "button");
      s.addEventListener("click", (event) => {
        event.preventDefault();
        shareSiteFailed().then((failed) => {
          if (failed) {
            s.removeAttribute("role");
            el.open = true;
          }
        });
      });
    });
  });
}

function bindCopy(id: string, textOf: () => string): void {
  ifSome(byId(id), (btn) => {
    btn.addEventListener("click", async () => {
      const result = await copyText(textOf());
      if (result.success) {
        flash(btn, "コピーしました");
      }
    });
  });
}

function main(): void {
  // CSS Module のローカルクラスを body に適用（スタイルの起点）
  ifSome(fromNullable(styles.app), (cls) => document.body.classList.add(cls));
  const { tags, options } = parseHash(location.hash);
  // 入力欄は URL から復元しない。名前・連絡先は空のまま（プレースホルダ表示）。
  let state: AppState = {
    tags,
    options,
    view: "human",
    draft: EMPTY_DRAFT,
  };
  const dispatch = (action: Action): void => {
    state = update(state, action);
    render(state);
    if (changesRows(action)) {
      renderRows(state.draft, dispatch);
      ifSome(fromNullable(focusTargetAfter(action, state.draft)), (id) =>
        ifSome(byId(id), (el) => el.focus()),
      );
    }
    // URL へ同期する action（URL に載る状態を変えるもの）をホワイトリストで明示する。
    // 新 action は既定で URL 非同期にする。
    if (action.type === "toggleTag" || action.type === "setCredit" || action.type === "setView") {
      syncUrl(state);
    }
  };
  bindEvents(() => state, dispatch);
  renderRows(state.draft, dispatch);
  render(state);
  // 初期ロードで URL を正規化する（裸タグ→新形式、旧 URL に残る個人情報の除去）。
  syncUrl(state);

  // 本番ビルドでのみ SW を登録する（dev は /sw.js を emit しないため）。import.meta.env は DEV のみ
  // 宣言されているため !DEV を本番判定に使う。登録は load 後に行い初回描画と帯域を奪わない。
  // 失敗しても致命でないため Result は捨てる（配線は E2E で検証する）。
  if (!import.meta.env.DEV && "serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      void registerServiceWorker("/sw.js", navigator.serviceWorker);
    });
  }
}

main();
