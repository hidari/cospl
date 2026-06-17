// サイトのクライアント。core の純粋関数を共有し、関数型 reducer で UI を駆動する。
// 副作用（DOM 取得・clipboard・履歴更新）は境界に押し出し、欠落値は Option、失敗は Result で扱う。

import {
  aiMD,
  DEFAULT_TAGS,
  emptyState,
  humanMD,
  parseTag,
  parseTags,
  type State,
  type Tag,
  tagsFrom,
  type View,
} from "../core";
import { fromNullable, ifSome, type Option } from "../types/option";
import { fail, getOrElse, type Result, success } from "../types/result";
import styles from "./styles.module.css";

// アプリ状態（タグ集合 + 出力ビュー）。不変に扱う。
type AppState = { tags: State; view: View };

type Action = { type: "toggleTag"; tag: Tag } | { type: "setView"; view: View };

// 純粋な状態遷移
function update(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "toggleTag":
      return { ...state, tags: { ...state.tags, [action.tag]: !state.tags[action.tag] } };
    case "setView":
      return { ...state, view: action.view };
  }
}

// 状態から導出する純粋な値 ---------------------------------------------------

function currentMarkdown(state: AppState): string {
  return state.view === "ai" ? aiMD(state.tags) : humanMD(state.tags);
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

function hashFragment(state: AppState): string {
  const tags = tagsFrom(state.tags);
  return `#${tags.length ? tags.join("-") : "none"}`;
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

function flash(btn: HTMLElement, label: string): void {
  const original = btn.textContent ?? "";
  btn.textContent = label;
  btn.classList.add("done");
  setTimeout(() => {
    btn.textContent = original;
    btn.classList.remove("done");
  }, 1400);
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

  history.replaceState(null, "", hashFragment(state));
}

// 初期化 --------------------------------------------------------------------

// URL hash からタグ状態を復元する。hash が不正なら既定（BY-NC-NAI-TD）にフォールバック。
function initialTags(): State {
  const raw = (location.hash || "").replace("#", "");
  if (raw) {
    const fromHash = parseTags(raw);
    if (fromHash.success) {
      return fromHash.data;
    }
  }
  // 既定値は必ずパースに成功する。万一の失敗でも emptyState で型安全に畳む。
  return getOrElse(parseTags(DEFAULT_TAGS), emptyState());
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
  bindCopy("link", () => location.href);

  ifSome(byId("download"), (btn) => {
    btn.addEventListener("click", () => {
      const state = getState();
      downloadFile(downloadName(state), currentMarkdown(state));
      flash(btn, "保存しました");
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
  let state: AppState = { tags: initialTags(), view: "human" };
  const dispatch = (action: Action): void => {
    state = update(state, action);
    render(state);
  };
  bindEvents(() => state, dispatch);
  render(state);
}

main();
