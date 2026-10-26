import { describe, expect, test } from "vitest";
import {
  appleTouchSvg,
  faviconSvg,
  ICON_MARK_RATIO,
  iconSvg,
  LOGO,
  logoGroup,
  MASKABLE_SAFE_RADIUS,
  markExtentRadius,
  markShapes,
  maskableSvg,
  PALETTE,
} from "../../src/brand/mark";

// マーク座標系で外形の枠は 71 四方（10.5 14.5 71 71）。
const BOX = 71;

const numbers = (svg: string, pattern: RegExp): number[] => {
  const m = svg.match(pattern);
  return m ? m.slice(1).map(Number) : [];
};
const scaleOf = (svg: string): number => numbers(svg, /scale\(([\d.]+)\)/)[0] ?? Number.NaN;

const iconOpts = {
  bg: PALETTE.iconLight.bg,
  colors: PALETTE.iconLight,
  cornerRadius: 24,
  ratio: ICON_MARK_RATIO,
};

describe("マークの形", () => {
  const shapes = markShapes(PALETTE.iconLight);

  test("弧は中心 (50, 50)・半径 30 の大きい弧を (72, 30) から (72, 70) まで反時計回りに描く", () => {
    expect(shapes).toContain('d="M72 30A30 30 0 1 0 72 70"');
  });

  test("弧は線幅 11・丸い線端で、点は中心 (52, 50)・半径 11", () => {
    expect(shapes).toContain('stroke-width="11"');
    expect(shapes).toContain('stroke-linecap="round"');
    expect(shapes).toContain('cx="52" cy="50" r="11"');
  });

  test("弧と点は class を持ち、色は与えた配色になる", () => {
    expect(shapes).toContain('class="mk-c"');
    expect(shapes).toContain('class="mk-dot"');
    expect(shapes).toContain(`stroke="${PALETTE.iconLight.c}"`);
    expect(shapes).toContain(`fill="${PALETTE.iconLight.dot}"`);
  });
});

describe("アイコン", () => {
  test("マークの高さは一辺 100 の 75%", () => {
    expect(ICON_MARK_RATIO).toBe(0.75);
    expect(scaleOf(iconSvg(iconOpts)) * BOX).toBeCloseTo(75, 1);
  });

  test("ratio を変えると同じ割合でマークの高さが変わる", () => {
    const svg = iconSvg({ ...iconOpts, ratio: 0.5 });
    expect(scaleOf(svg) * BOX).toBeCloseTo(50, 1);
  });

  test("枠の中心 (46, 50) を (50, 50) に置く", () => {
    expect(iconSvg(iconOpts)).toMatch(/translate\(50 50\) scale\([\d.]+\) translate\(-46 -50\)/);
  });

  test("地は指定した角丸と色で viewBox 全面に敷く", () => {
    const svg = iconSvg(iconOpts);
    expect(svg).toContain('viewBox="0 0 100 100"');
    expect(svg).toContain(
      `<rect class="mk-bg" width="100" height="100" rx="24" fill="${PALETTE.iconLight.bg}"/>`,
    );
  });

  test("数値は小数 3 桁以内に丸められる", () => {
    for (const n of iconSvg(iconOpts).match(/\d+\.\d+/g) ?? []) {
      expect(n.split(".")[1]?.length).toBeLessThanOrEqual(3);
    }
  });
});

describe("マークの外形", () => {
  // 描かれる外形（弧の外周、両端の丸い線端、点）を実際に標本化し、枠の中心 (46, 50) からの最遠距離を求める。
  // markExtentRadius の実装（端点と線幅からの閉形式）とは独立に、図形の定義だけから導く。
  const farthestSampled = (): number => {
    const center = { x: 46, y: 50 };
    const dist = (x: number, y: number) => Math.hypot(x - center.x, y - center.y);
    const steps = 7200;
    const circle = (cx: number, cy: number, r: number) =>
      Array.from({ length: steps }, (_, i) => {
        const a = (2 * Math.PI * i) / steps;
        return dist(cx + r * Math.cos(a), cy + r * Math.sin(a));
      });
    // 半径 30 の弧が (72, 30)-(72, 70) を結ぶので、中心は (72 - sqrt(30^2 - 20^2), 50)。
    const arcCx = 72 - Math.sqrt(30 * 30 - 20 * 20);
    const edge = Math.atan2(20, 72 - arcCx);
    const ring = Array.from({ length: steps }, (_, i) => {
      const a = edge + ((2 * Math.PI - 2 * edge) * i) / (steps - 1);
      return dist(arcCx + 35.5 * Math.cos(a), 50 + 35.5 * Math.sin(a));
    });
    return Math.max(...ring, ...circle(72, 30, 5.5), ...circle(72, 70, 5.5), ...circle(52, 50, 11));
  };

  test("外形の最遠点は枠の中心から約 38.3（端の丸い線端の外側）", () => {
    expect(markExtentRadius()).toBeCloseTo(Math.hypot(26, 20) + 5.5, 6);
    expect(markExtentRadius()).toBeCloseTo(farthestSampled(), 2);
  });
});

describe("maskable アイコン", () => {
  test("安全円の半径は 40", () => {
    expect(MASKABLE_SAFE_RADIUS).toBe(40);
  });

  test("外形が安全円に収まる最大の倍率になる", () => {
    const scale = scaleOf(maskableSvg());
    expect(scale * markExtentRadius()).toBeLessThanOrEqual(MASKABLE_SAFE_RADIUS);
    expect(scale * 1.01 * markExtentRadius()).toBeGreaterThan(MASKABLE_SAFE_RADIUS);
  });

  test("角丸を付けず全面を地色で塗る", () => {
    expect(maskableSvg()).not.toContain("rx=");
  });
});

describe("apple-touch-icon", () => {
  test("地の rect に角丸が無い", () => {
    expect(appleTouchSvg()).toMatch(/<rect [^>]*class="mk-bg"/);
    expect(appleTouchSvg()).not.toContain("rx=");
  });

  test("マークの高さは一辺の 75% で配色はライト", () => {
    const svg = appleTouchSvg();
    expect(scaleOf(svg) * BOX).toBeCloseTo(75, 1);
    expect(svg).toContain(PALETTE.iconLight.bg);
  });
});

describe("favicon.svg", () => {
  const svg = faviconSvg();

  test("ダーク配色への切り替えを SVG 内の prefers-color-scheme で持つ", () => {
    expect(svg).toContain("prefers-color-scheme: dark");
  });

  test("ライト・ダークの 6 色すべてを含む", () => {
    for (const color of [...Object.values(PALETTE.iconLight), ...Object.values(PALETTE.iconDark)]) {
      expect(svg).toContain(color);
    }
  });

  test("角丸 24 でマークの高さは 75%", () => {
    expect(svg).toContain('rx="24"');
    expect(scaleOf(svg) * BOX).toBeCloseTo(75, 1);
  });
});

describe("ロゴ", () => {
  const fontSize = 64;
  const group = logoGroup(0, 100, fontSize, PALETTE.logoLight);
  const scale = scaleOf(group);
  const markCx = numbers(group, /translate\(([\d.-]+) [\d.-]+\) scale/)[0] ?? Number.NaN;
  const markX = markCx - (scale * BOX) / 2;

  test("マークの高さは文字の大きさの 1.05 倍", () => {
    expect(LOGO.markEm).toBe(1.05);
    expect(scale * BOX).toBeCloseTo(fontSize * 1.05, 1);
  });

  test("文字の x はマークの右端 + 文字の大きさの 28%", () => {
    expect(LOGO.gapEm).toBe(0.28);
    const textX = numbers(group, /<text x="([\d.-]+)"/)[0] ?? Number.NaN;
    expect(textX).toBeCloseTo(markX + scale * BOX + fontSize * 0.28, 1);
  });

  test("字間は -0.02em で文字は CosPL、基線と大きさ・太さを持つ", () => {
    expect(LOGO.letterSpacingEm).toBe(-0.02);
    expect(group).toContain('letter-spacing="-0.02em"');
    expect(group).toContain('y="100"');
    expect(group).toContain('font-size="64"');
    expect(group).toContain('font-weight="700"');
    expect(group).toMatch(/>CosPL<\/text>/);
  });

  test("文字は text の色、マークは C と点の色で塗る", () => {
    expect(group).toContain(`fill="${PALETTE.logoLight.text}"`);
    expect(group).toContain(`stroke="${PALETTE.logoLight.c}"`);
    expect(group).toContain(`fill="${PALETTE.logoLight.dot}"`);
  });

  // 文字の em 箱の縦中央は基線の 0.35em 上（Space Grotesk・line-height 1 での見積もり）。
  test("マークの縦中央は基線から文字の大きさの 0.35 倍だけ上", () => {
    const cy = numbers(group, /translate\([\d.-]+ ([\d.-]+)\) scale/)[0] ?? Number.NaN;
    expect(cy).toBeCloseTo(100 - 0.35 * fontSize, 2);
  });

  test("x を動かすとマークも文字も同じだけ動く", () => {
    const moved = logoGroup(10, 100, fontSize, PALETTE.logoLight);
    expect(numbers(moved, /translate\(([\d.-]+) [\d.-]+\) scale/)[0]).toBeCloseTo(markCx + 10, 1);
    expect(numbers(moved, /<text x="([\d.-]+)"/)[0]).toBeCloseTo(
      (numbers(group, /<text x="([\d.-]+)"/)[0] ?? Number.NaN) + 10,
      2,
    );
  });
});

describe("配色", () => {
  test("設計で決めた色", () => {
    expect(PALETTE).toEqual({
      iconLight: { bg: "#7b54ff", c: "#ffffff", dot: "#ffb37a" },
      iconDark: { bg: "#1c1430", c: "#a98bff", dot: "#ff9e5c" },
      logoLight: { c: "#7b54ff", dot: "#ff7a2f", text: "#1c1430" },
      logoDark: { c: "#a98bff", dot: "#ff9e5c", text: "#ffffff" },
    });
  });
});
