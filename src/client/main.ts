// サイトのクライアント。core の純粋関数を共有し、関数型 reducer で UI を駆動する。
// 副作用（DOM 取得・clipboard・履歴更新）は境界に押し出し、欠落値は Option、失敗は Result で扱う。

import {
  aiMD,
  emptyState,
  humanMD,
  ident,
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

function identHTML(state: AppState): string {
  const tags = tagsFrom(state.tags);
  return `CosPL 1.0${tags.length ? ` / <b>${tags.join("-")}</b>` : ""}`;
}

function metaText(state: AppState): string {
  const label = state.view === "ai" ? "crawler / agent 向け" : "納品フォルダに同梱する用";
  return `${label} · ${ident(state.tags)}`;
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
  setText("meta", metaText(state));
  setText("ep", endpoint(state));

  // chips の aria-pressed を状態と同期
  for (const chip of document.querySelectorAll<HTMLButtonElement>(".chip")) {
    ifSome(fromNullable(chip.dataset.tag), (raw) => {
      ifSome(parseTag(raw), (tag) => {
        chip.setAttribute("aria-pressed", state.tags[tag] ? "true" : "false");
      });
    });
  }

  // tabs の aria-selected を同期
  ifSome(byId("tab-h"), (el) => el.setAttribute("aria-selected", String(state.view === "human")));
  ifSome(byId("tab-a"), (el) => el.setAttribute("aria-selected", String(state.view === "ai")));

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
  return getOrElse(parseTags("BY-NC-NAI-TD"), emptyState());
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

  bindCopy("copy", () => currentMarkdown(getState()));
  bindCopy("ep-copy", () => endpoint(getState()));
  bindCopy("link", () => location.href);
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
