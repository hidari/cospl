// 入力（Draft）の編集操作。UI の action から呼ばれる純粋関数で、上限は追加の時点で守る。

import { EXTENSION_PRESETS, type ExtensionPresetId } from "./presets";
import { type Draft, type Extension, MAX_EXTENSIONS } from "./sanitize";

// 生の文字列で持つ欄（単一行、または 1 行 1 件の複数行）。拡張は件数を持つので別の操作にする。
export type TextField = "photographer" | "contacts" | "sendBack";

export function setTextField(draft: Draft, field: TextField, value: string): Draft {
  return { ...draft, [field]: value };
}

export function canAddExtension(draft: Draft): boolean {
  return draft.extensions.length < MAX_EXTENSIONS;
}

// ひな形を指定すればその文面入り、省略すれば白紙の拡張を末尾に足す。
export function addExtension(draft: Draft, preset?: ExtensionPresetId): Draft {
  if (!canAddExtension(draft)) {
    return draft;
  }
  const found = EXTENSION_PRESETS.find((p) => p.id === preset);
  const extension: Extension = found
    ? { heading: found.heading, body: found.body }
    : { heading: "", body: "" };
  return { ...draft, extensions: [...draft.extensions, extension] };
}

export function setExtension(
  draft: Draft,
  index: number,
  field: keyof Extension,
  value: string,
): Draft {
  return {
    ...draft,
    extensions: draft.extensions.map((ext, i) => (i === index ? { ...ext, [field]: value } : ext)),
  };
}

export function removeExtension(draft: Draft, index: number): Draft {
  return { ...draft, extensions: draft.extensions.filter((_, i) => i !== index) };
}
