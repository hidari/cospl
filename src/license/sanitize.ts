// フィールド（撮影者名・日付・連絡先）の型と、外部入力のサニタイズ。

// 撮影者名・日付・連絡先のフィールド。未入力時は現行プレースホルダ文字列を既定にする。
export type Fields = Readonly<{ date: string; photographer: string; contact: string }>;

// 未入力時に文書へ残すプレースホルダ（現行テンプレートのリテラルと一致させる単一ソース）。
export const DEFAULT_FIELDS: Fields = {
  date: "[YYYY-MM-DD]",
  photographer: "[撮影者名]",
  contact: "[連絡先をここに記入]",
};

// 全フィールド空の初期値（入力欄クリアと hash 復元の単一ソース）。空のまま serializeHash すると
// date / photographer / contact は URL に出力されず、PII を残さない。
export const EMPTY_FIELDS: Fields = { date: "", photographer: "", contact: "" };

// 除去対象コードポイントの判定。C0/C1 制御文字（改行・タブ含む）と双方向テキスト制御文字
// （Trojan Source 型の視覚的文言偽装に使われる）を弾く。正規表現を避けてコードポイントで判定し、
// Biome の noControlCharactersInRegex を踏まず、かつサロゲートペアを安全に扱う。
function isStrippableCodePoint(cp: number): boolean {
  return (
    cp <= 0x1f || // C0 制御文字
    (cp >= 0x7f && cp <= 0x9f) || // DEL + C1 制御文字
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

// YYYY-MM-DD 形式かつ実在する暦日かを判定する。正規表現一致だけでは 2026-13-40 等を通すため、
// 月末日数（閏年含む）まで検証する。
function isValidDate(raw: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  // year < 1000 を弾く。0000-0099 は new Date(year, ...) が 1900 年代に解釈され閏判定が狂う
  // JS の既知挙動を避けつつ、撮影日として無意味な極端な年を排除する。
  if (year < 1000 || month < 1 || month > 12) {
    return false;
  }
  // new Date(year, month, 0) は「month の前月の最終日」= 当月（1-based month）の日数。
  const daysInMonth = new Date(year, month, 0).getDate();
  return day >= 1 && day <= daysInMonth;
}

// 生入力をクリーニングのみ行う（空・不正は空文字のまま）。hash 直列化と入力欄復元に使う。
export function cleanFields(input: Fields): Fields {
  const date = input.date.trim();
  return {
    date: isValidDate(date) ? date : "",
    photographer: cleanText(input.photographer, 50),
    contact: cleanText(input.contact, 100),
  };
}

// クリーニング後、空フィールドを既定プレースホルダへ畳んだ文書生成用 Fields。
export function sanitizeFields(input: Fields): Fields {
  const cleaned = cleanFields(input);
  return {
    date: cleaned.date || DEFAULT_FIELDS.date,
    photographer: cleaned.photographer || DEFAULT_FIELDS.photographer,
    contact: cleaned.contact || DEFAULT_FIELDS.contact,
  };
}
