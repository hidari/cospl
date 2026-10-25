import { describe, expect, test } from "vitest";
import { SITE_URL, siteShareMessage, siteSharePayload } from "../../src/license/share";

describe("サイト共有", () => {
  test("SITE_URL は cospl.org のルート", () => {
    expect(SITE_URL).toBe("https://cospl.org/");
  });

  test("siteShareMessage は SNS 貼り付け用の3行（タイトル・タグライン・URL）", () => {
    expect(siteShareMessage()).toBe(
      "CosPL — Cosplay Public License\n撮った写真の ”使っていい範囲” を言葉にする\nhttps://cospl.org/",
    );
  });

  test("siteShareMessage は SITE_URL で終わる", () => {
    expect(siteShareMessage().endsWith(SITE_URL)).toBe(true);
  });

  test("siteSharePayload はネイティブ共有用に title / text / url を分離する", () => {
    expect(siteSharePayload()).toEqual({
      title: "CosPL — Cosplay Public License",
      text: "CosPL — Cosplay Public License\n撮った写真の ”使っていい範囲” を言葉にする",
      url: "https://cospl.org/",
    });
  });

  test("siteSharePayload.text はタイトル行で始まる（title を無視するアプリでも本文にタイトルが残る）", () => {
    expect(siteSharePayload().text.startsWith("CosPL — Cosplay Public License\n")).toBe(true);
  });

  test("siteSharePayload.url は SITE_URL と一致する", () => {
    expect(siteSharePayload().url).toBe(SITE_URL);
  });

  test("siteSharePayload の text+url はコピー用 siteShareMessage と一致する（文面の単一ソース）", () => {
    const p = siteSharePayload();
    expect(`${p.text}\n${p.url}`).toBe(siteShareMessage());
  });
});
