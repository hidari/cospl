// CosPL のマーク（C のレンズと中の点）の形・比率・色の唯一の定義。
// アイコン・ロゴ・OGP はここから SVG を生成し、同じ比率に揃える。座標は 100 四方の系。

export type MarkColors = { c: string; dot: string };

// 弧: 中心 (50, 50)・半径 30・線幅 11。点: 中心 (52, 50)・半径 11。
const ARC = { from: [72, 30], to: [72, 70], radius: 30, width: 11 } as const;
const DOT = { cx: 52, cy: 50, r: 11 } as const;

// C の外形に見た目の中心を寄せた 71 四方の枠 `10.5 14.5 71 71`。
const BOX = { x: 10.5, y: 14.5, size: 71 } as const;
const BOX_CENTER = { x: BOX.x + BOX.size / 2, y: BOX.y + BOX.size / 2 } as const;

// ロゴの文字の em 箱の縦中央は、基線からこの値だけ上にある（Space Grotesk で line-height 1 のとき）。
const LOGO_CENTER_ABOVE_BASELINE_EM = 0.35;

export const ICON_MARK_RATIO = 0.75;
export const MASKABLE_SAFE_RADIUS = 40;
export const LOGO = { markEm: 1.05, gapEm: 0.28, letterSpacingEm: -0.02 };

export const PALETTE = {
  iconLight: { bg: "#7b54ff", c: "#ffffff", dot: "#ffb37a" },
  iconDark: { bg: "#1c1430", c: "#a98bff", dot: "#ff9e5c" },
  logoLight: { c: "#7b54ff", dot: "#ff7a2f", text: "#1c1430" },
  logoDark: { c: "#a98bff", dot: "#ff9e5c", text: "#ffffff" },
};

// 出力が実行環境で揺れないよう、小数 3 桁以内に丸める。
const fmt = (n: number): string => String(Math.round(n * 1000) / 1000);
const floor3 = (n: number): number => Math.floor(n * 1000) / 1000;

export const markShapes = (colors: MarkColors): string => {
  const [x1, y1] = ARC.from;
  const [x2, y2] = ARC.to;
  const r = ARC.radius;
  return (
    `<path class="mk-c" d="M${x1} ${y1}A${r} ${r} 0 1 0 ${x2} ${y2}" fill="none" stroke="${colors.c}" stroke-width="${ARC.width}" stroke-linecap="round"/>` +
    `<circle class="mk-dot" cx="${DOT.cx}" cy="${DOT.cy}" r="${DOT.r}" fill="${colors.dot}"/>`
  );
};

// 枠の中心から外形の最遠点までの距離。最遠点は弧の両端の丸い線端か点の外周にある
// （外周の円は枠の中心より右に中心があり、最遠方向は弧の切れ目に当たるため両端が最大）。
export const markExtentRadius = (): number => {
  const dist = (x: number, y: number) => Math.hypot(x - BOX_CENTER.x, y - BOX_CENTER.y);
  const caps = [ARC.from, ARC.to].map(([x, y]) => dist(x, y) + ARC.width / 2);
  const dot = dist(DOT.cx, DOT.cy) + DOT.r;
  return Math.max(...caps, dot);
};

// 枠の中心を (cx, cy) に置く。
const placeMark = (cx: number, cy: number, scale: number, colors: MarkColors): string =>
  `<g transform="translate(${fmt(cx)} ${fmt(cy)}) scale(${fmt(scale)}) translate(${-BOX_CENTER.x} ${-BOX_CENTER.y})">${markShapes(colors)}</g>`;

type IconOpts = { bg: string; colors: MarkColors; cornerRadius: number; ratio: number };

const iconSvgWith = (opts: IconOpts, style: string): string => {
  const scale = (opts.ratio * 100) / BOX.size;
  const rx = opts.cornerRadius > 0 ? ` rx="${fmt(opts.cornerRadius)}"` : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${style}` +
    `<rect class="mk-bg" width="100" height="100"${rx} fill="${opts.bg}"/>` +
    placeMark(50, 50, scale, opts.colors) +
    `</svg>`
  );
};

export const iconSvg = (opts: IconOpts): string => iconSvgWith(opts, "");

const lightIcon = (cornerRadius: number, ratio: number): IconOpts => ({
  bg: PALETTE.iconLight.bg,
  colors: PALETTE.iconLight,
  cornerRadius,
  ratio,
});

export const faviconSvg = (): string => {
  const d = PALETTE.iconDark;
  const style =
    `<style>@media (prefers-color-scheme: dark){` +
    `.mk-bg{fill:${d.bg}}.mk-c{stroke:${d.c}}.mk-dot{fill:${d.dot}}` +
    `}</style>`;
  return iconSvgWith(lightIcon(24, ICON_MARK_RATIO), style);
};

// 外形が安全円に収まる最大の倍率（出力の小数 3 桁に切り下げて、丸めで円を越えないようにする）。
export const maskableSvg = (): string => {
  const scale = floor3(MASKABLE_SAFE_RADIUS / markExtentRadius());
  return iconSvg(lightIcon(0, (scale * BOX.size) / 100));
};

export const appleTouchSvg = (): string => iconSvg(lightIcon(0, ICON_MARK_RATIO));

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
