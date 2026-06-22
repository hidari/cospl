// Service Worker 登録の Library Contract アダプタ。navigator.serviceWorker の最小公開面
// （register のみ）に閉じ、feature 検出・no-throw・Result 化を担う。try-catch を使わず
// Promise の then/catch で合成する。テスト時は fake container を注入する。

import { fail, type Result, success } from "../types/result";

// 必要な操作だけの最小契約。navigator.serviceWorker は構造的にこれへ代入できる。
export type Registrar = { register: (url: string) => Promise<unknown> };

export function registerServiceWorker(
  url: string,
  container: Registrar | undefined,
): Promise<Result<void, string>> {
  if (!container) {
    return Promise.resolve(fail("service worker unsupported"));
  }
  return container
    .register(url)
    .then((): Result<void, string> => success(undefined))
    .catch((): Result<void, string> => fail("service worker registration failed"));
}
