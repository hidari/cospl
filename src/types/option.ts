/**
 * Option型: null/undefinedの安全な表現
 *
 * Rustの Option<T> と同じ設計思想で、nullable値を型安全に扱う。
 */
export type Option<T> = { some: true; value: T } | { some: false };

// Option構築用ヘルパー関数
export const some = <T>(value: T): Option<T> => ({ some: true, value });
export const none = <T = never>(): Option<T> => ({ some: false });

// null/undefinedからOptionへの変換
export const fromNullable = <T>(value: T | null | undefined): Option<T> =>
  value != null ? some(value) : none();

// 値の変換（Some時のみ適用）
export const mapOption = <T, U>(option: Option<T>, fn: (value: T) => U): Option<U> => {
  return option.some ? some(fn(option.value)) : none();
};

// フラットマップ（Someの入れ子を避ける）
export const flatMapOption = <T, U>(option: Option<T>, fn: (value: T) => Option<U>): Option<U> => {
  return option.some ? fn(option.value) : none();
};

// パターンマッチング
export const matchOption = <T, U>(
  option: Option<T>,
  patterns: {
    some: (value: T) => U;
    none: () => U;
  },
): U => {
  return option.some ? patterns.some(option.value) : patterns.none();
};

// デフォルト値付きの値取得
export const getOrElse = <T>(option: Option<T>, defaultValue: T): T => {
  return option.some ? option.value : defaultValue;
};

// Some時のみ副作用を実行
export const ifSome = <T>(option: Option<T>, fn: (value: T) => void): void => {
  if (option.some) {
    fn(option.value);
  }
};
