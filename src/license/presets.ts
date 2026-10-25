// 拡張のひな形。押すと一般化した文面入りの拡張が足され、利用者が書き換える。
// 数値は [◯] のプレースホルダで置く。実在の名前・URL・受け取りコードは入れない。

export type ExtensionPresetId = "contents" | "editing" | "photographer-use";

export const EXTENSION_PRESETS: readonly Readonly<{
  id: ExtensionPresetId;
  heading: string;
  body: string;
}>[] = [
  {
    id: "contents",
    heading: "データの内容物",
    body: [
      "現像済みJPEG（長辺 [◯]px で書き出し）",
      "本README文書",
      "RAWデータが必要な場合はご相談ください",
    ].join("\n"),
  },
  {
    id: "editing",
    heading: "加工",
    body: "原則として、お渡しした現像済みJPEGをご使用ください",
  },
  {
    id: "photographer-use",
    heading: "撮影者側の利用",
    body: "編集や加工の技術向上のための題材として使用する場合があります",
  },
];
