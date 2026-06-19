// サイトのクライアント。core の純粋関数を共有し、関数型 reducer で UI を駆動する。
// 副作用（DOM 取得・clipboard・履歴更新）は境界に押し出し、欠落値は Option、失敗は Result で扱う。

import {
  aiMD,
  EMPTY_FIELDS,
  type Fields,
  humanMD,
  parseHash,
  parseTag,
  SITE_URL,
  type State,
  sanitizeFields,
  serializeHash,
  siteShareMessage,
  siteSharePayload,
  type Tag,
  tagsFrom,
  type View,
} from "../core";
import { fromNullable, ifSome, type Option } from "../types/option";
import { fail, type Result, success } from "../types/result";
import styles from "./styles.module.css";

// アプリ状態（タグ集合 + 出力ビュー + フィールド生入力）。不変に扱う。
type AppState = { tags: State; view: View; draft: Fields };

type Action =
  | { type: "toggleTag"; tag: Tag }
  | { type: "setView"; view: View }
  | { type: "setField"; field: keyof Fields; value: string }
  | { type: "clearFields" };

// 純粋な状態遷移
function update(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "toggleTag":
      return { ...state, tags: { ...state.tags, [action.tag]: !state.tags[action.tag] } };
    case "setView":
      return { ...state, view: action.view };
    case "setField":
      return { ...state, draft: { ...state.draft, [action.field]: action.value } };
    case "clearFields":
      return { ...state, draft: EMPTY_FIELDS };
  }
}

// 状態から導出する純粋な値 ---------------------------------------------------

function currentMarkdown(state: AppState): string {
  return state.view === "ai" ? aiMD(state.tags) : humanMD(state.tags, sanitizeFields(state.draft));
}

// ダウンロードファイル名。中身は Markdown だが、まず開けることを優先して .txt で配る。
function downloadName(state: AppState): string {
  return state.view === "ai" ? "cospl-ai.txt" : "README.txt";
}

function identHTML(state: AppState): string {
  const tags = tagsFrom(state.tags);
  return `CosPL 1.0${tags.length ? ` / <b>${tags.join("-")}</b>` : ""}`;
}

function endpoint(state: AppState): string {
  const tags = tagsFrom(state.tags);
  const query = `tags=${tags.length ? tags.join("-") : "none"}${state.view === "ai" ? "&view=ai" : ""}`;
  return `https://cospl.org/license.md?${query}`;
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
  // identHTML の埋め込み値は ORDER 由来のタグ定数のみで、ユーザー入力を含まないため innerHTML で安全。
  ifSome(byId("ident"), (el) => {
    el.innerHTML = identHTML(state);
  });
  setText("out", currentMarkdown(state));
  setText("ep", endpoint(state));

  // chips の aria-pressed を状態と同期
  for (const chip of document.querySelectorAll<HTMLButtonElement>(".chip")) {
    ifSome(fromNullable(chip.dataset.tag), (raw) => {
      ifSome(parseTag(raw), (tag) => {
        chip.setAttribute("aria-pressed", state.tags[tag] ? "true" : "false");
      });
    });
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

// 状態を URL hash へ同期する（プレビュー更新とは分離）。タグ/ビュー変更は即時、フィールドは
// blur（change）と共有リンク押下でまとめて反映する。入力中に PII を逐次 URL へ書かないため。
function syncUrl(state: AppState): void {
  history.replaceState(null, "", serializeHash(state.tags, state.draft));
}

// 初期化 --------------------------------------------------------------------

// 当日を YYYY-MM-DD で返す（DOM 境界で現在日時を読み、core は純粋に保つ）。
function todayISO(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

// 入力欄 DOM id とフィールドキーの対応（初期化・クリアで共有する単一ソース）。
const FIELD_BINDINGS: ReadonlyArray<readonly [string, keyof Fields]> = [
  ["f-photographer", "photographer"],
  ["f-date", "date"],
  ["f-contact", "contact"],
];

// 入力欄を draft で初期化する。input でプレビューだけ更新し（URL は汚さない）、
// change（値変更を伴う blur）でまとめて URL へ同期する。
function bindFields(getState: () => AppState, dispatch: (action: Action) => void): void {
  for (const [id, field] of FIELD_BINDINGS) {
    ifSome(byId(id), (el) => {
      if (el instanceof HTMLInputElement) {
        el.value = getState().draft[field];
        el.addEventListener("input", () => dispatch({ type: "setField", field, value: el.value }));
        // change では URL 同期前に draft を最新化する。一部ブラウザは date ピッカー選択時に
        // input を発火しないため、change だけが来ても draft とプレビューを取り残さない。
        el.addEventListener("change", () => {
          dispatch({ type: "setField", field, value: el.value });
          syncUrl(getState());
        });
      }
    });
  }
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
  // 未確定の入力（blur 前）も取りこぼさないよう、コピー直前に URL を最新化する。
  bindCopy("link", () => {
    syncUrl(getState());
    return location.href;
  });

  // サイト共有。設定を含まない素の URL と SNS 貼り付け用の文面を配る（状態に依存しない定数）。
  bindShareDisclosure();
  bindCopy("share-url", () => SITE_URL);
  bindCopy("share-msg", () => siteShareMessage());

  bindFields(getState, dispatch);

  // 入力欄のクリア。draft を空にする（dispatch 経由で URL からも PII を除去）と同時に、
  // input への programmatic 代入は input イベントを発火しないため、DOM の値も明示的に空へ戻す。
  ifSome(byId("clear-fields"), (btn) => {
    btn.addEventListener("click", () => {
      dispatch({ type: "clearFields" });
      for (const [id] of FIELD_BINDINGS) {
        ifSome(byId(id), (el) => {
          if (el instanceof HTMLInputElement) {
            el.value = "";
          }
        });
      }
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
  const { tags, fields } = parseHash(location.hash);
  // 日付未指定なら当日を初期表示。名前・連絡先は空のまま（プレースホルダ表示）。
  let state: AppState = {
    tags,
    view: "human",
    draft: { ...fields, date: fields.date || todayISO() },
  };
  const dispatch = (action: Action): void => {
    state = update(state, action);
    render(state);
    // URL へ即時同期する action をホワイトリストで明示する。フィールド入力（setField）は blur まで
    // 書かない一方、クリア（clearFields）は PII を URL から消す操作なので即時同期して安全側に倒す。
    // 新 action は既定で URL 非同期（安全側）にする。
    if (action.type === "toggleTag" || action.type === "setView" || action.type === "clearFields") {
      syncUrl(state);
    }
  };
  bindEvents(() => state, dispatch);
  render(state);
  // 初期ロードで URL を正規化（裸タグ→新形式）。date は当日を初期値とするため URL に含まれる。
  // PII の photographer / contact は空なので含まれない。
  syncUrl(state);
}

main();
