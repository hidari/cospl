// 利用者の入力（撮影者名・連絡先・SB の自由記述・拡張）の型と、外部入力のサニタイズ。

export type Extension = Readonly<{ heading: string; body: string }>;

// UI の生入力。
export type Draft = Readonly<{
  photographer: string;
  contacts: string;
  sendBack: string;
  extensions: readonly Extension[];
}>;

// サニタイズ済み・プレースホルダ適用済みの文書入力。
export type Doc = Readonly<{
  photographer: string;
  contacts: readonly string[];
  sendBackItems: readonly string[];
  extensions: readonly Readonly<{ heading: string; items: readonly string[] }>[];
}>;

// 全欄空の初期値（入力欄の初期化とクリアの単一ソース）。
export const EMPTY_DRAFT: Draft = {
  photographer: "",
  contacts: "",
  sendBack: "",
  extensions: [],
};

// 未入力時に文書へ残すプレースホルダ（現行テンプレートのリテラルと一致させる単一ソース）。
export const DEFAULT_DOC: Doc = {
  photographer: "[撮影者名]",
  contacts: ["[連絡先をここに記入]"],
  sendBackItems: [],
  extensions: [],
};

export const MAX_PHOTOGRAPHER = 50;
export const MAX_CONTACT = 100;
export const MAX_CONTACTS = 5;
export const MAX_HEADING = 40;
const MAX_ITEM = 200;
const MAX_ITEMS_PER_EXTENSION = 20;
export const MAX_EXTENSIONS = 10;
const MAX_SEND_BACK_ITEMS = 10;

// 除去対象コードポイントの判定。C0/C1 制御文字（改行・タブ含む）と双方向テキスト制御文字
// （Trojan Source 型の視覚的文言偽装に使われる）を弾く。正規表現を避けてコードポイントで判定し、
// Biome の noControlCharactersInRegex を踏まず、かつサロゲートペアを安全に扱う。
function isStrippableCodePoint(cp: number): boolean {
  return (
    cp <= 0x1f || // C0 制御文字
    (cp >= 0x7f && cp <= 0x9f) || // DEL + C1 制御文字
    cp === 0x2028 || // 行区切り（Markdown の行頭を偽装できる）
    cp === 0x2029 || // 段落区切り
    (cp >= 0x202a && cp <= 0x202e) || // 双方向埋め込み / 上書き
    (cp >= 0x2066 && cp <= 0x2069) // 双方向分離
  );
}

// フリーテキストを徹底サニタイズする。制御 / 双方向文字と山括弧を除去し、trim 後に
// コードポイント単位で長さを切る（UTF-16 単位で切るとサロゲートペアを割って壊すため）。
export function cleanText(raw: string, maxCodePoints: number): string {
  const kept: string[] = [];
  for (const ch of raw) {
    const cp = ch.codePointAt(0) ?? 0;
    if (!isStrippableCodePoint(cp) && ch !== "<" && ch !== ">") {
      kept.push(ch);
    }
  }
  const trimmed = kept.join("").trim();
  // UTF-16 長はコードポイント数以上なので、上限以下なら必ず切り詰め不要。
  // 共通ケースでコードポイント配列への展開を省く。
  if (trimmed.length <= maxCodePoints) {
    return trimmed;
  }
  return [...trimmed].slice(0, maxCodePoints).join("");
}

// 拡張が 1 つ以上あるか。識別子の印と AI 宣言の追加事項行の単一ソース。
export function hasExtensions(doc: Doc): boolean {
  return doc.extensions.length > 0;
}

// 改行区切りの本文を、サニタイズ済みの空でない行に分けて上限まで取る。
function cleanLines(raw: string, maxCodePoints: number, maxLines: number): string[] {
  return raw
    .split("\n")
    .map((line) => cleanText(line, maxCodePoints))
    .filter((line) => line !== "")
    .slice(0, maxLines);
}

// 生入力から文書生成用の Doc を作る。サニタイズし、空欄は既定プレースホルダへ畳む。
export function toDoc(draft: Draft): Doc {
  const contacts = cleanLines(draft.contacts, MAX_CONTACT, MAX_CONTACTS);
  const extensions = draft.extensions
    .map((ext) => ({
      heading: cleanText(ext.heading, MAX_HEADING),
      items: cleanLines(ext.body, MAX_ITEM, MAX_ITEMS_PER_EXTENSION),
    }))
    .filter((ext) => ext.heading !== "" && ext.items.length > 0)
    .slice(0, MAX_EXTENSIONS);
  return {
    photographer: cleanText(draft.photographer, MAX_PHOTOGRAPHER) || DEFAULT_DOC.photographer,
    contacts: contacts.length > 0 ? contacts : DEFAULT_DOC.contacts,
    sendBackItems: cleanLines(draft.sendBack, MAX_ITEM, MAX_SEND_BACK_ITEMS),
    extensions,
  };
}
