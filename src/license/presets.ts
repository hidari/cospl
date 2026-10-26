// 拡張のひな形。押すと一般化した文面入りの拡張が足され、利用者が書き換える。
// 実在の名前・URL・受け取りコードは入れない。

export type ExtensionPresetId = "editing" | "photographer-use";

export const EXTENSION_PRESETS: readonly Readonly<{
  id: ExtensionPresetId;
  heading: string;
  body: string;
}>[] = [
  {
    id: "editing",
    heading: "加工",
    body: "原則として、お渡ししたデータのみご使用ください",
  },
  {
    id: "photographer-use",
    heading: "撮影者側の利用",
    body: "編集や加工の技術向上のための題材として使用する場合があります",
  },
];
