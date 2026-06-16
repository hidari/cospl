// Vite の ?raw インポート型定義。ファイル内容を transform 時に文字列として埋め込む。
declare module "*?raw" {
  const content: string;
  export default content;
}
