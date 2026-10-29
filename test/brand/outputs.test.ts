import { describe, expect, test } from "vitest";
import { inspectMaster, LOGO, OGP_LANDSCAPE } from "../../src/brand/masters.ts";
import {
  buildIndexHtml,
  darkLogo,
  INDEX_HTML_SLOTS,
  LOGO_DARK_COLORS,
  OGP_IMAGE,
  renderIndexHtml,
} from "../../src/brand/outputs.ts";
import { SITE_URL } from "../../src/license/share.ts";

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

  // animate / set の値の色は対応表で置き換えないので、ライトの色のまま動いてしまう。
  test.each([
    [
      "animate",
      '<rect fill="#7b54ff"><animate attributeName="fill" values="#7b54ff;#ff7a2f"/></rect>',
    ],
    ["set", '<rect fill="#7b54ff"><set attributeName="fill" to="#ff7a2f"/></rect>'],
  ])("%s を含むと失敗する", (name, body) => {
    const result = darkLogo(svgOf(body));
    expect(result.success).toBe(false);
    expect(!result.success && result.error).toContain(name);
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

// index.html と同じ形のテンプレート。生成する値の場所にだけトークンを置く。
const LOGO_IMG = (width: string, height: string): string =>
  `<img src="/${LOGO.light}" alt="CosPL" width="${width}" height="${height}">`;
const TEMPLATE = [
  '<meta property="og:image" content="{{COSPL_OG_IMAGE}}">',
  '<meta property="og:image:width" content="{{COSPL_OG_IMAGE_WIDTH}}">',
  '<meta property="og:image:height" content="{{COSPL_OG_IMAGE_HEIGHT}}">',
  '<meta property="og:image:alt" content="alt">',
  '<meta name="twitter:image" content="{{COSPL_TWITTER_IMAGE}}">',
  `<p class="logo"><picture>${LOGO_IMG("{{COSPL_LOGO_WIDTH}}", "{{COSPL_LOGO_HEIGHT}}")}</picture></p>`,
].join("\n");
const VALUES = { ogpVersion: "abcd1234", logo: { width: 940, height: 330 } };
const SLOTS = Object.keys(INDEX_HTML_SLOTS);

describe("renderIndexHtml", () => {
  test("トークンを値で置き換える。og:image と twitter:image は同じ URL を指す", () => {
    const ogImage = `${SITE_URL}${OGP_IMAGE}?v=abcd1234`;
    expect(renderIndexHtml(TEMPLATE, VALUES)).toEqual({
      success: true,
      data: [
        `<meta property="og:image" content="${ogImage}">`,
        `<meta property="og:image:width" content="${OGP_LANDSCAPE.raster.width}">`,
        `<meta property="og:image:height" content="${OGP_LANDSCAPE.raster.height}">`,
        '<meta property="og:image:alt" content="alt">',
        `<meta name="twitter:image" content="${ogImage}">`,
        `<p class="logo"><picture>${LOGO_IMG("940", "330")}</picture></p>`,
      ].join("\n"),
    });
  });

  // クローラが読む URL そのもの。定数を組み替えたときに公開 URL が変わったことを見せる。
  test("og:image は https://cospl.org/ogp/ogp-landscape.jpg に ?v= を付けた URL", () => {
    const result = renderIndexHtml(TEMPLATE, VALUES);
    expect(result.success && result.data).toContain(
      'content="https://cospl.org/ogp/ogp-landscape.jpg?v=abcd1234"',
    );
  });

  test("ロゴの寸法が小数なら四捨五入した整数にする", () => {
    const result = renderIndexHtml(TEMPLATE, { ...VALUES, logo: { width: 940.4, height: 329.6 } });
    expect(result.success && result.data).toContain('width="940" height="330"');
  });

  test("トークンは 6 つで、生成する値 1 つにつき 1 つ", () => {
    expect(SLOTS.sort()).toEqual(
      [
        "COSPL_LOGO_HEIGHT",
        "COSPL_LOGO_WIDTH",
        "COSPL_OG_IMAGE",
        "COSPL_OG_IMAGE_HEIGHT",
        "COSPL_OG_IMAGE_WIDTH",
        "COSPL_TWITTER_IMAGE",
      ].sort(),
    );
  });

  // 置き換え漏れのまま成功すると、トークンの文字列がそのまま配信される。
  test.each(SLOTS)("%s が無いと失敗する", (slot) => {
    const result = renderIndexHtml(TEMPLATE.replace(`{{${slot}}}`, "1"), VALUES);
    expect(!result.success && result.error).toContain(`{{${slot}}} が 0 個`);
  });

  test.each(SLOTS)("%s が 2 つあると失敗する", (slot) => {
    const result = renderIndexHtml(`${TEMPLATE}\n<meta name="x" content="{{${slot}}}">`, VALUES);
    expect(!result.success && result.error).toContain(`{{${slot}}} が 2 個`);
  });

  // 検査の順に並べる。各行は狙った検査より手前の検査をすべて通る入力にする。
  test.each([
    ["未知のトークン", `${TEMPLATE}\n<meta name="x" content="{{COSPL_X}}">`, "未知のトークン"],
    ["形の崩れたトークン", `${TEMPLATE}\n<meta name="x" content="{{cospl}}">`, "形の崩れた"],
    [
      "og:image と twitter:image のトークンの入れ替え",
      TEMPLATE.replace("{{COSPL_OG_IMAGE}}", "{{T}}")
        .replace("{{COSPL_TWITTER_IMAGE}}", "{{COSPL_OG_IMAGE}}")
        .replace("{{T}}", "{{COSPL_TWITTER_IMAGE}}"),
      "置いてよいタグにない",
    ],
    [
      "og:image が 2 つで twitter:image が無い",
      TEMPLATE.replace(
        '<meta name="twitter:image" content="{{COSPL_TWITTER_IMAGE}}">',
        '<meta property="og:image" content="{{COSPL_TWITTER_IMAGE}}">',
      ),
      "置いてよいタグにない",
    ],
    [
      "ロゴのトークンが別の img にある",
      TEMPLATE.replace(`src="/${LOGO.light}"`, 'src="/icons/x.svg"'),
      "置いてよいタグにない",
    ],
    [
      "手で書いた og:image:width の meta がもう 1 つある",
      `${TEMPLATE}\n<meta property="og:image:width" content="999">`,
      "og:image:width の meta が 2 個",
    ],
    [
      "手で書いた twitter:image の meta がもう 1 つある",
      `${TEMPLATE}\n<meta name="twitter:image" content="https://cospl.org/x.jpg">`,
      "twitter:image の meta が 2 個",
    ],
    ["ロゴの img がもう 1 つある", `${TEMPLATE}\n${LOGO_IMG("1", "2")}`, "ロゴの img が 2 個"],
  ])("%s と失敗する", (_label, template, message) => {
    const result = renderIndexHtml(template, VALUES);
    expect(!result.success && result.error).toContain(message);
  });

  test.each(["ABCD1234", "abc1234", "abcd12345", ""])(
    "?v= の値 %j が 8 桁の小文字 16 進でないと失敗する",
    (ogpVersion) => {
      const result = renderIndexHtml(TEMPLATE, { ...VALUES, ogpVersion });
      expect(!result.success && result.error).toContain("8 桁の小文字 16 進でない");
    },
  );

  test("ロゴの寸法が四捨五入で 0 になると失敗する", () => {
    const result = renderIndexHtml(TEMPLATE, { ...VALUES, logo: { width: 0.4, height: 330 } });
    expect(!result.success && result.error).toContain("ロゴの寸法が正の整数にならない");
  });
});

describe("buildIndexHtml", () => {
  const logoSvg = `<svg ${SVG_NS} viewBox="0 0 940.4 329.6"></svg>`;
  // "abc" の SHA-256 は ba7816bf…（test/brand/masters.test.ts の既知の値）。
  const abc = new Uint8Array([0x61, 0x62, 0x63]);

  test("?v= は配信する OG 画像のバイト列の SHA-256 の先頭 8 文字、ロゴの寸法は viewBox から作る", async () => {
    const built = await buildIndexHtml(TEMPLATE, { ogpJpg: abc, logoSvg });
    const expected = renderIndexHtml(TEMPLATE, {
      ogpVersion: "ba7816bf",
      logo: { width: 940, height: 330 },
    });
    expect(expected.success).toBe(true);
    expect(built).toEqual(expected);
  });

  test("OG 画像が空なら失敗する", async () => {
    const result = await buildIndexHtml(TEMPLATE, { ogpJpg: new Uint8Array(), logoSvg });
    expect(!result.success && result.error).toContain("OG 画像が空");
  });

  test("ロゴが検査を通らなければ、その理由を付けて失敗する", async () => {
    const result = await buildIndexHtml(TEMPLATE, {
      ogpJpg: abc,
      logoSvg: `<svg ${SVG_NS}></svg>`,
    });
    expect(!result.success && result.error).toContain("ロゴ: ルート要素に viewBox が無い");
  });

  test("テンプレートが壊れていれば失敗する", async () => {
    const result = await buildIndexHtml("<p></p>", { ogpJpg: abc, logoSvg });
    expect(result.success).toBe(false);
  });
});
