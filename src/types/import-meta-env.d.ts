// Vite が注入する import.meta.env の型定義。本コードベースでは dev/本番の判定に DEV のみ使う
// （本番ビルドでは false に静的置換され、緩い CSP 枝が dead-code 除去される）。
interface ImportMetaEnv {
  readonly DEV: boolean;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
