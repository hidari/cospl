import { describe, expect, test } from "vitest";
import {
  BOX,
  LOGO,
  LOGO_MARKS,
  logoGroup,
  logoMarkSpan,
  markShapes,
  PALETTE,
} from "../../src/brand/mark";

const numbers = (svg: string, pattern: RegExp): number[] => {
  const m = svg.match(pattern);
  return m ? m.slice(1).map(Number) : [];
};
const scaleOf = (svg: string): number => numbers(svg, /scale\(([\d.]+)\)/)[0] ?? Number.NaN;

const shapeColors = { c: "#ffffff", dot: "#ffb37a" };

describe("マークの形", () => {
  const shapes = markShapes(shapeColors);

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
    expect(shapes).toContain(`stroke="${shapeColors.c}"`);
    expect(shapes).toContain(`fill="${shapeColors.dot}"`);
  });
});

describe("ロゴ", () => {
  const fontSize = 64;
  const group = logoGroup(0, 100, fontSize, PALETTE.logoLight);
  const scale = scaleOf(group);
  const markCx = numbers(group, /translate\(([\d.-]+) [\d.-]+\) scale/)[0] ?? Number.NaN;
  const markX = markCx - (scale * BOX.size) / 2;

  test("マークの高さは文字の大きさの 1.05 倍", () => {
    expect(LOGO.markEm).toBe(1.05);
    expect(scale * BOX.size).toBeCloseTo(fontSize * 1.05, 1);
  });

  test("文字の x はマークの右端 + 文字の大きさの 28%", () => {
    expect(LOGO.gapEm).toBe(0.28);
    const textX = numbers(group, /<text x="([\d.-]+)"/)[0] ?? Number.NaN;
    expect(textX).toBeCloseTo(markX + scale * BOX.size + fontSize * 0.28, 1);
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
      logoLight: { c: "#7b54ff", dot: "#ff7a2f", text: "#1c1430" },
      logoDark: { c: "#a98bff", dot: "#ff9e5c", text: "#ffffff" },
    });
  });
});

describe("OGP のロゴの目印", () => {
  const { start, end } = LOGO_MARKS;

  test("ちょうど 1 組なら間の範囲を返す", () => {
    const svg = `<svg>${start}旧${end}</svg>`;
    const span = logoMarkSpan(svg);
    expect(span.success && svg.slice(span.data.from, span.data.to)).toBe("旧");
  });

  test.each([
    ["目印が無い", "<svg></svg>"],
    ["開始だけ", `<svg>${start}</svg>`],
    ["終了だけ", `<svg>${end}</svg>`],
    ["2 組ある", `<svg>${start}${end}${start}${end}</svg>`],
  ])("%s と失敗する", (_label, svg) => {
    expect(logoMarkSpan(svg).success).toBe(false);
  });
});
