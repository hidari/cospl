/**
 * Result型: 成功または失敗を表現する型
 *
 * Rustの Result<T, E> と同じ設計思想で、try-catchを使わずに
 * 型安全なエラーハンドリングを実現する。
 */
export type Result<T, E> = { success: true; data: T } | { success: false; error: E };

// Result構築用ヘルパー関数
export const success = <T, E = never>(data: T): Result<T, E> => ({
  success: true,
  data,
});
export const fail = <E>(error: E): Result<never, E> => ({
  success: false,
  error,
});

// パターンマッチング
export const matchResult = <T, E, R>(
  result: Result<T, E>,
  matcher: {
    success: (data: T) => R;
    error: (error: E) => R;
  },
): R => {
  if (result.success) {
    return matcher.success(result.data);
  }
  return matcher.error(result.error);
};

// 成功値の変換
export const mapResult = <T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> => {
  return result.success ? success(fn(result.data)) : result;
};

// 成功時に新しいResultを返す操作の連鎖
export const flatMapResult = <T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>,
): Result<U, E> => {
  return result.success ? fn(result.data) : result;
};

// エラー型の変換
export const mapError = <T, E1, E2>(
  result: Result<T, E1>,
  fn: (error: E1) => E2,
): Result<T, E2> => {
  return result.success ? result : fail(fn(result.error));
};

// デフォルト値付きの値取得
export const getOrElse = <T, E>(result: Result<T, E>, defaultValue: T): T => {
  return result.success ? result.data : defaultValue;
};

// 成功時のみ副作用を実行
export const ifSuccess = <T, E>(result: Result<T, E>, fn: (value: T) => void): void => {
  if (result.success) {
    fn(result.data);
  }
};

// 失敗時のみ副作用を実行
export const ifError = <T, E>(result: Result<T, E>, fn: (error: E) => void): void => {
  if (!result.success) {
    fn(result.error);
  }
};
