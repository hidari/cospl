// Vite の ?raw インポート型定義。ファイル内容を transform 時に文字列として埋め込む。
declare module "*?raw" {
  const content: string;
  export default content;
}

// import.meta.glob の、?raw の本文を eager に読む形だけを型付けする（tsconfig は vite/client の型を読まない）。
interface ImportMeta {
  glob(
    pattern: string,
    options: { query: "?raw"; import: "default"; eager: true },
  ): Record<string, string>;
}
