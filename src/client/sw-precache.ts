import { sha256Hex } from "../brand/masters.ts";

type StableFile = { readonly path: string; readonly sha256: string };

// SW キャッシュの版数。ハッシュ付きアセットの一覧と、安定名ファイルの（パス, 内容ハッシュ）を
// 並べ替えて JSON にし、その SHA-256 の先頭 16 桁を返す。JSON なので区切りの取り違えで衝突しない。
// 並べ替えに localeCompare は使わない（ロケール依存で、マシンが変わると版数が変わるため）。
export async function cacheVersion(input: {
  readonly hashedAssets: readonly string[];
  readonly stable: readonly StableFile[];
}): Promise<string> {
  const hashedAssets = [...input.hashedAssets].sort();
  const stable = [...input.stable].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return (await sha256Hex(JSON.stringify({ hashedAssets, stable }))).slice(0, 16);
}
