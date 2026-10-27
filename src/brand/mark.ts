// CosPL のマーク（C のレンズと中の点）の形と、ヘッダーと OGP に差し込むロゴの定義。座標は 100 四方の系。
// アイコンは brand/ の SVG マスターから作るため、ここでは扱わない。

import { fail, type Result, success } from "../types/result";

export type MarkColors = { c: string; dot: string };

// 弧: 中心 (50, 50)・半径 30・線幅 11。点: 中心 (52, 50)・半径 11。
const ARC = { from: [72, 30], to: [72, 70], radius: 30, width: 11 } as const;
const DOT = { cx: 52, cy: 50, r: 11 } as const;

// C の外形に見た目の中心を寄せた 71 四方の枠 `10.5 14.5 71 71`。
export const BOX = { x: 10.5, y: 14.5, size: 71 } as const;
const BOX_CENTER = { x: BOX.x + BOX.size / 2, y: BOX.y + BOX.size / 2 } as const;

// ロゴの文字の em 箱の縦中央は、基線からこの値だけ上にある（Space Grotesk で line-height 1 のとき）。
const LOGO_CENTER_ABOVE_BASELINE_EM = 0.35;

export const LOGO = { markEm: 1.05, gapEm: 0.28, letterSpacingEm: -0.02 };

// OGP に差し込むロゴの位置。旧ワードマークの基線 x / y と文字サイズに合わせる。
export const OGP_LOGO = {
  "ogp-landscape": { x: 84, baseline: 152, fontSize: 64 },
  "ogp-square": { x: 96, baseline: 222, fontSize: 84 },
} as const;

// OGP の SVG でロゴを差し込む範囲を示す目印。
export const LOGO_MARKS = { start: "<!-- brand:logo -->", end: "<!-- /brand:logo -->" } as const;

// 目印に挟まれた範囲 [from, to)。目印がちょうど 1 組でなければ失敗を返す。
export const logoMarkSpan = (svg: string): Result<{ from: number; to: number }, string> => {
  const count = (m: string) => svg.split(m).length - 1;
  if (count(LOGO_MARKS.start) !== 1 || count(LOGO_MARKS.end) !== 1) {
    return fail("OGP SVG に brand:logo の目印がちょうど 1 組ありません");
  }
  return success({
    from: svg.indexOf(LOGO_MARKS.start) + LOGO_MARKS.start.length,
    to: svg.indexOf(LOGO_MARKS.end),
  });
};

export const PALETTE = {
  logoLight: { c: "#7b54ff", dot: "#ff7a2f", text: "#1c1430" },
  logoDark: { c: "#a98bff", dot: "#ff9e5c", text: "#ffffff" },
};

// 出力が実行環境で揺れないよう、小数 3 桁以内に丸める。
const fmt = (n: number): string => String(Math.round(n * 1000) / 1000);

export const markShapes = (colors: MarkColors): string => {
  const [x1, y1] = ARC.from;
  const [x2, y2] = ARC.to;
  const r = ARC.radius;
  return (
    `<path class="mk-c" d="M${x1} ${y1}A${r} ${r} 0 1 0 ${x2} ${y2}" fill="none" stroke="${colors.c}" stroke-width="${ARC.width}" stroke-linecap="round"/>` +
    `<circle class="mk-dot" cx="${DOT.cx}" cy="${DOT.cy}" r="${DOT.r}" fill="${colors.dot}"/>`
  );
};

// 枠の中心を (cx, cy) に置く。
const placeMark = (cx: number, cy: number, scale: number, colors: MarkColors): string =>
  `<g transform="translate(${fmt(cx)} ${fmt(cy)}) scale(${fmt(scale)}) translate(${-BOX_CENTER.x} ${-BOX_CENTER.y})">${markShapes(colors)}</g>`;

// OGP に差し込むロゴ。マークは文字の em 箱の縦中央に揃える。
export const logoGroup = (
  x: number,
  baselineY: number,
  fontSize: number,
  colors: { c: string; dot: string; text: string },
): string => {
  const markSize = fontSize * LOGO.markEm;
  const centerY = baselineY - fontSize * LOGO_CENTER_ABOVE_BASELINE_EM;
  const textX = x + markSize + fontSize * LOGO.gapEm;
  return (
    `<g>${placeMark(x + markSize / 2, centerY, markSize / BOX.size, colors)}` +
    `<text x="${fmt(textX)}" y="${fmt(baselineY)}" font-family="Space Grotesk, sans-serif" font-weight="700" font-size="${fmt(fontSize)}" letter-spacing="${LOGO.letterSpacingEm}em" fill="${colors.text}">CosPL</text></g>`
  );
};
