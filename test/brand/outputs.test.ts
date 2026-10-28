import { describe, expect, test } from "vitest";
import { inspectMaster } from "../../src/brand/masters";
import { darkLogo, LOGO_DARK_COLORS, ogpVersion, syncIndexHtml } from "../../src/brand/outputs";

const SVG_NS = 'xmlns="http://www.w3.org/2000/svg"';
const svgOf = (body: string): string => `<svg ${SVG_NS} viewBox="0 0 10 10">${body}</svg>`;

describe("LOGO_DARK_COLORS", () => {
  test("ロゴのライト版の 3 色をダーク版の色へ対応させる", () => {
    expect(LOGO_DARK_COLORS).toEqual({
      "#7b54ff": "#a98bff",
      "#ff7a2f": "#ff9e5c",
      "#333137": "#f4f0ff",
    });
  });
});

describe("darkLogo", () => {
  test("style 属性・表示属性・style 要素の色を対応表で置き換える", () => {
    const light = svgOf(
      '<style>.a{stroke:#7b54ff}</style><path style="fill:#ff7a2f;stroke-width:2px;"/><rect fill="#333137"/>',
    );
    expect(darkLogo(light)).toEqual({
      success: true,
      data: svgOf(
        '<style>.a{stroke:#a98bff}</style><path style="fill:#ff9e5c;stroke-width:2px;"/><rect fill="#f4f0ff"/>',
      ),
    });
  });

  test("大文字の 16 進も同じ色として置き換える", () => {
    const light = svgOf('<rect style="fill:#7B54FF;"/><rect fill="#333137"/>');
    expect(darkLogo(light)).toEqual({
      success: true,
      data: svgOf('<rect style="fill:#a98bff;"/><rect fill="#f4f0ff"/>'),
    });
  });

  test("none・transparent・文書内の url() は色でないのでそのまま残す", () => {
    const light = svgOf(
      '<rect style="fill:none;stroke:transparent;"/><rect fill="url(#g)"/><rect stop-color="#7b54ff"/>',
    );
    expect(darkLogo(light)).toEqual({
      success: true,
      data: svgOf(
        '<rect style="fill:none;stroke:transparent;"/><rect fill="url(#g)"/><rect stop-color="#a98bff"/>',
      ),
    });
  });

  test("fill-rule・stroke-width・clip-path のように色を持たない属性は読まない", () => {
    const light = svgOf(
      '<g style="fill-rule:evenodd;clip-rule:evenodd;stroke-linecap:round;"><rect clip-path="url(#c)" stroke-width="3"/></g>',
    );
    expect(darkLogo(light)).toEqual({ success: true, data: light });
  });

  // 対応表に無い色を黙って残すと、ダーク版の一部だけがライトの色のまま配信される。
  test.each([
    ["対応表に無い 16 進", '<rect style="fill:#123456;"/>', "#123456"],
    ["rgb()", '<rect style="fill:rgb(123,84,255);"/>', "rgb(123,84,255)"],
    ["色の名前", '<rect fill="white"/>', "white"],
    ["currentColor", '<rect fill="currentColor"/>', "currentColor"],
    ["stop-color の対応表に無い色", '<stop stop-color="#000"/>', "#000"],
  ])("%s を含むと、その値を挙げて失敗する", (_label, body, value) => {
    const result = darkLogo(svgOf(body));
    expect(result.success).toBe(false);
    expect(!result.success && result.error).toContain(value);
  });

  test("ダーク版は検査を通り、ライト版の 3 色を含まない", () => {
    const light = svgOf('<path style="fill:none;stroke:#7b54ff;"/><circle fill="#ff7a2f"/>');
    const dark = darkLogo(light);
    expect(dark.success && inspectMaster(dark.data).success).toBe(true);
    for (const color of Object.keys(LOGO_DARK_COLORS)) {
      expect(dark.success && dark.data).not.toContain(color);
    }
  });
});

describe("ogpVersion", () => {
  test("マスターのハッシュの先頭 8 文字", () => {
    expect(ogpVersion("0123456789abcdef")).toBe("01234567");
  });
});

describe("syncIndexHtml", () => {
  const html = (v: string, width: string, height: string): string =>
    [
      `<meta property="og:image" content="https://cospl.org/ogp/ogp-landscape.jpg?v=${v}">`,
      `<meta name="twitter:image" content="https://cospl.org/ogp/ogp-landscape.jpg?v=${v}">`,
      `<p class="logo"><picture><source srcset="/icons/logo-dark.svg" media="(prefers-color-scheme: dark)"><img src="/icons/logo-light.svg" alt="CosPL" width="${width}" height="${height}"></picture></p>`,
    ].join("\n");
  const expected = { ogpVersion: "abcd1234", logo: { width: 940, height: 330 } };

  test("OGP の ?v= とロゴの width / height を書き換える", () => {
    expect(syncIndexHtml(html("old", "1", "2"), expected)).toEqual({
      success: true,
      data: html("abcd1234", "940", "330"),
    });
  });

  test("書き換え済みなら何も変えない（テストはこの不動点で古い index.html を見つける）", () => {
    const current = html("abcd1234", "940", "330");
    expect(syncIndexHtml(current, expected)).toEqual({ success: true, data: current });
  });

  test("viewBox が小数なら width / height は四捨五入した整数にする", () => {
    const result = syncIndexHtml(html("v", "1", "2"), {
      ogpVersion: "v",
      logo: { width: 940.4, height: 329.6 },
    });
    expect(result.success && result.data).toContain('width="940" height="330"');
  });

  // 目印が見つからないまま成功すると、書き換えたつもりで古い値が配信される。
  test.each([
    ["og:image の ?v= が無い", html("v", "1", "2").replace(/ogp-landscape\.jpg\?v=v/g, "x.jpg")],
    ["ロゴの img が無い", html("v", "1", "2").replace("/icons/logo-light.svg", "/icons/x.svg")],
    [
      "ロゴの img が 2 つある",
      `${html("v", "1", "2")}<img src="/icons/logo-light.svg" width="1" height="2">`,
    ],
    ["ロゴの img に height が無い", html("v", "1", "2").replace(' height="2"', "")],
  ])("%s と失敗する", (_label, input) => {
    expect(syncIndexHtml(input, expected).success).toBe(false);
  });
});
