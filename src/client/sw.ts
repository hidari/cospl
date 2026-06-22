/// <reference lib="webworker" />
// Service Worker 本体（副作用の薄い配線）。戦略判定は sw-strategy（純粋）に委譲する。
// __PRECACHE__ / __CACHE_VERSION__ はビルド時に Vite プラグインが define で注入する。

import { chooseStrategy, type Strategy } from "./sw-strategy";

declare const self: ServiceWorkerGlobalScope;
declare const __PRECACHE__: readonly string[];
declare const __CACHE_VERSION__: string;

const CACHE = `cospl-${__CACHE_VERSION__}`;

self.addEventListener("install", (event) => {
  // shell 一式を precache し、待機せず即座に新 SW を有効化する。
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll([...__PRECACHE__])));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // 旧バージョンのキャッシュを破棄し、開いている全クライアントの制御を奪う。
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const strategy = chooseStrategy({
    method: event.request.method,
    sameOrigin: url.origin === self.location.origin,
    isNavigate: event.request.mode === "navigate",
    pathname: url.pathname,
  });
  // passthrough は respondWith せずブラウザ既定に任せる。
  if (strategy === "passthrough") {
    return;
  }
  event.respondWith(handle(strategy, event.request));
});

function handle(strategy: Exclude<Strategy, "passthrough">, request: Request): Promise<Response> {
  switch (strategy) {
    case "cache-first":
      return cacheFirst(request);
    case "network-first":
      return networkFirst(request);
    case "swr":
      return staleWhileRevalidate(request);
  }
}

// 不変アセット: キャッシュ優先。未取得時のみネットワークから取得しキャッシュへ格納する。
async function cacheFirst(request: Request): Promise<Response> {
  // Vite は <script type="module" crossorigin> を生成するため、ブラウザは cors モードでリクエストする。
  // caches.match はデフォルトで Vary/モードを考慮するため、同一 URL でもキャッシュ miss が起きる。
  // コンテンツハッシュ済みアセットは URL が同じなら内容も同じなので ignoreVary で URL ベース照合にする。
  const cached = await caches.match(request, { ignoreVary: true });
  if (cached) {
    return cached;
  }
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

// ナビゲーション: ネットワーク優先。失敗時はキャッシュ、無ければ shell（"/"）へフォールバック。
async function networkFirst(request: Request): Promise<Response> {
  const fromNetwork = await fetch(request).then(
    (response) => response,
    () => undefined,
  );
  if (fromNetwork?.ok) {
    const cache = await caches.open(CACHE);
    await cache.put(request, fromNetwork.clone());
    return fromNetwork;
  }
  const cached = await caches.match(request, { ignoreVary: true });
  if (cached) {
    return cached;
  }
  if (fromNetwork) {
    return fromNetwork;
  }
  const shell = await caches.match("/", { ignoreVary: true });
  if (shell) {
    return shell;
  }
  return Response.error();
}

// シェル資産: キャッシュ即返し + 背景で再検証（失敗は握りつぶす）。
async function staleWhileRevalidate(request: Request): Promise<Response> {
  const cached = await caches.match(request, { ignoreVary: true });
  const network = fetch(request).then(async (response) => {
    if (response.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  });
  if (cached) {
    network.catch(() => undefined);
    return cached;
  }
  return network;
}
