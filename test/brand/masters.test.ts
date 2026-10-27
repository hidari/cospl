import { describe, expect, test } from "vitest";
import { inspectMaster, sha256Hex } from "../../src/brand/masters";

const SVG_NS = 'xmlns="http://www.w3.org/2000/svg"';
const XLINK_NS = 'xmlns:xlink="http://www.w3.org/1999/xlink"';

// 検査したい 1 点だけが違反になるよう、それ以外は通る形のルート要素で包む。
const wrap = (body: string, rootAttrs = ""): string =>
  `<svg ${SVG_NS}${rootAttrs} viewBox="0 0 100 100">${body}</svg>`;

// Affinity Designer の書き出しと同じ形（public/ogp/ogp-landscape.svg の先頭に合わせる）。
const AFFINITY = [
  '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
  '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">',
  "<!-- Affinity Designer -->",
  `<svg width="100%" height="100%" viewBox="0 0 1200 630" version="1.1" ${SVG_NS} ${XLINK_NS} xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;">`,
  '    <rect x="0" y="0" width="1200" height="630" style="fill:white;"/>',
  '    <circle cx="870" cy="70" r="220" style="fill:rgb(255,122,47);fill-opacity:0.12;"/>',
  '    <g serif:id="Mark"><path d="M72 30A30 30 0 1 0 72 70" style="fill:none;stroke:rgb(123,84,255);stroke-width:11px;"/></g>',
  "</svg>",
  "",
].join("\n");

describe("inspectMaster", () => {
  test("最小の SVG を通し、viewBox を数で返す", () => {
    const svg = `<svg ${SVG_NS} viewBox="0 0 100 100"><rect width="100" height="100"/></svg>`;
    expect(inspectMaster(svg)).toEqual({
      success: true,
      data: { viewBox: { x: 0, y: 0, width: 100, height: 100 } },
    });
  });

  test("Affinity の書き出し（XML 宣言・外部 DTD・コメント・serif の名前空間・style 属性）を通す", () => {
    expect(inspectMaster(AFFINITY)).toEqual({
      success: true,
      data: { viewBox: { x: 0, y: 0, width: 1200, height: 630 } },
    });
  });

  test("viewBox の負・小数・指数・カンマ区切りを読む", () => {
    expect(inspectMaster(`<svg ${SVG_NS} viewBox="-1.5,0 3e1 10"><rect/></svg>`)).toEqual({
      success: true,
      data: { viewBox: { x: -1.5, y: 0, width: 30, height: 10 } },
    });
  });

  test.each([
    ["href が文書内の id", wrap('<use href="#a"/>')],
    ["xlink:href が文書内の id", wrap('<use xlink:href="#a"/>', ` ${XLINK_NS}`)],
    ["href が PNG の data URL", wrap('<image href="data:image/png;base64,AAAA"/>')],
    ["fill の url() が文書内の id", wrap('<rect fill="url(#g)"/>')],
    [
      "style 属性と style 要素の引用符付き url() が文書内の id",
      wrap(`<style>.a{fill:url("#g")}</style><rect style="fill:url('#g')"/>`),
    ],
  ])("%s なら通す", (_label, svg) => {
    expect(inspectMaster(svg).success).toBe(true);
  });

  test.each([
    ["script 要素", wrap("<script>alert(1)</script>")],
    ["大文字の SCRIPT 要素", wrap("<SCRIPT>alert(1)</SCRIPT>")],
    [
      "接頭辞付きの svg:script 要素",
      wrap("<svg:script>alert(1)</svg:script>", ' xmlns:svg="http://www.w3.org/2000/svg"'),
    ],
    ["foreignObject 要素", wrap('<foreignObject width="1" height="1"/>')],
    ["大文字の FOREIGNOBJECT 要素", wrap('<FOREIGNOBJECT width="1" height="1"/>')],
    ["ルートの onload 属性", wrap("<rect/>", ' onload="x"')],
    ["大文字・単引用符の ONCLICK 属性", wrap("<rect ONCLICK='x'/>")],
    ["a の href が https", wrap('<a href="https://example.com"><rect/></a>')],
    ["href がスキーム相対", wrap('<use href="//example.com/x.svg"/>')],
    [
      "href が文字参照で符号化した javascript:",
      wrap('<a href="java&#115;cript:alert(1)"><rect/></a>'),
    ],
    ["href の id の前に空白", wrap('<use href=" #a"/>')],
    ["image の href が SVG の data URL", wrap('<image href="data:image/svg+xml;base64,AAAA"/>')],
    ["set が href を書き換える", wrap('<set attributeName="href" to="#a"/>')],
    ["animate が xlink:href を書き換える", wrap('<animate attributeName="xlink:href"/>')],
    ["style 属性の url() が外部", wrap('<rect style="fill:url(https://e/x)"/>')],
    ["style 要素の @import", wrap('<style>@import "x.css";</style>')],
    ["style 要素の url() が外部（id 付き）", wrap("<style>.a{fill:url(http://e/#g)}</style>")],
    ["text 要素", wrap("<text>CosPL</text>")],
    ["DOCTYPE の内部サブセット", `<!DOCTYPE svg [<!ENTITY e "x">]>${wrap("<rect/>")}`],
    ["DOCTYPE の空の内部サブセット", `<!DOCTYPE svg []>${wrap("<rect/>")}`],
    ["ルートが html", `<html viewBox="0 0 100 100"><svg ${SVG_NS} viewBox="0 0 100 100"/></html>`],
    ["viewBox が無い", `<svg ${SVG_NS}><rect/></svg>`],
    ["viewBox の数が 4 つでない", `<svg ${SVG_NS} viewBox="0 0 100"><rect/></svg>`],
    ["viewBox に数でないものがある", `<svg ${SVG_NS} viewBox="0 0 a 100"><rect/></svg>`],
    ["viewBox の幅が 0", `<svg ${SVG_NS} viewBox="0 0 0 100"><rect/></svg>`],
    [
      "xml-stylesheet 処理命令の href が外部",
      `<?xml-stylesheet href="https://e/x.css"?>${wrap("<rect/>")}`,
    ],
    [
      "XHTML の名前空間を宣言する",
      wrap('<h:img src="https://e/x.png"/>', ' xmlns:h="http://www.w3.org/1999/xhtml"'),
    ],
    ["数値文字参照で url( を隠す", wrap('<rect style="fill:u&#114;l(https://e/x)"/>')],
    ["CSS のエスケープで url( を隠す", wrap('<rect style="fill:u\\72l(https://e/x)"/>')],
  ])("%s なら拒否する", (_label, svg) => {
    expect(inspectMaster(svg).success).toBe(false);
  });
});

describe("sha256Hex", () => {
  // 期待値は `printf '<text>' | shasum -a 256` で独立に求めた。"あ" は UTF-8（E3 81 82）として計算する。
  test.each([
    ["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
    ["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
    ["あ", "dc5a4d3d82f7e15792959dc661538ae0e541ce66494516f5c9cfd9cd3308494d"],
  ])("%j の SHA-256 を小文字 16 進で返す", async (text, hex) => {
    await expect(sha256Hex(text)).resolves.toBe(hex);
  });
});
