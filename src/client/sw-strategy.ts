// キャッシュ戦略の判定と事前キャッシュ対象の述語（純粋関数）。Request/DOM/WebWorker 型に依存せず、
// 素の記述子だけで戦略を決める。これにより workerd の vitest でそのままテストでき、SW 本体（副作用）と分離する。

export type Strategy = "network-first" | "cache-first" | "passthrough";

// fetch ハンドラが Request から抽出する最小の記述子。
export type RequestDescriptor = {
  readonly method: string;
  readonly sameOrigin: boolean;
  readonly isNavigate: boolean;
  readonly pathname: string;
};

// 安定名のシェル資産（アイコン/favicon/manifest）。
function isShellAsset(pathname: string): boolean {
  return (
    pathname.startsWith("/icons/") ||
    pathname === "/favicon.svg" ||
    pathname === "/favicon.ico" ||
    pathname === "/apple-touch-icon.png" ||
    pathname === "/manifest.webmanifest"
  );
}

// SW が install 時に事前キャッシュする安定名の公開ファイル（シェル資産と woff2 フォント）。
// 名前が変わらないので、内容の変更は SW の版数に畳み込んで更新を届ける（sw-precache.ts）。
// パスの最後の区間（ファイル名）が "." で始まるファイル（Finder の .DS_Store など）は公開物ではないので入れない。
export function isStablePrecache(pathname: string): boolean {
  if (pathname.slice(pathname.lastIndexOf("/") + 1).startsWith(".")) {
    return false;
  }
  return isShellAsset(pathname) || (pathname.startsWith("/fonts/") && pathname.endsWith(".woff2"));
}

export function chooseStrategy(req: RequestDescriptor): Strategy {
  // 読み取り以外・別オリジンは一切触らない（早期リターンで安全側に倒す）。
  if (req.method !== "GET") {
    return "passthrough";
  }
  if (!req.sameOrigin) {
    return "passthrough";
  }
  // ナビゲーション（HTML 文書）は最新を優先し、オフライン時のみキャッシュ shell へ。
  if (req.isNavigate) {
    return "network-first";
  }
  // ハッシュ付き /assets/* は名前が中身で変わるので不変。安定名の事前キャッシュ対象は中身が SW の版数に
  // 入る（sw-precache.ts）ので、差し替えは SW の入れ替わりで届く。どちらも cache-first でよい。
  // 事前キャッシュの対象と同じ述語で決めるので、版数に入らないファイルが cache-first になることはない。
  if (req.pathname.startsWith("/assets/") || isStablePrecache(req.pathname)) {
    return "cache-first";
  }
  // 既定はキャッシュしない（OGP 大画像・Worker 動的ルート・未知パスを安全側で素通し）。
  return "passthrough";
}
