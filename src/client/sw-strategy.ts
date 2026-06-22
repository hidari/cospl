// キャッシュ戦略の判定（純粋関数）。Request/DOM/WebWorker 型に依存せず、素の記述子だけで
// 戦略を決める。これにより workerd の vitest でそのままテストでき、SW 本体（副作用）と分離する。

export type Strategy = "network-first" | "cache-first" | "swr" | "passthrough";

// fetch ハンドラが Request から抽出する最小の記述子。
export type RequestDescriptor = {
  readonly method: string;
  readonly sameOrigin: boolean;
  readonly isNavigate: boolean;
  readonly pathname: string;
};

// 安定名のシェル資産（アイコン/favicon/manifest）。まれに変わるため swr で配る。
function isShellAsset(pathname: string): boolean {
  return (
    pathname.startsWith("/icons/") ||
    pathname === "/favicon.svg" ||
    pathname === "/favicon.ico" ||
    pathname === "/apple-touch-icon.png" ||
    pathname === "/manifest.webmanifest"
  );
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
  // 内容ハッシュ付き or フォントは不変扱いで cache-first。
  if (req.pathname.startsWith("/assets/") || req.pathname.startsWith("/fonts/")) {
    return "cache-first";
  }
  if (isShellAsset(req.pathname)) {
    return "swr";
  }
  // 既定はキャッシュしない（OGP 大画像・Worker 動的ルート・未知パスを安全側で素通し）。
  return "passthrough";
}
