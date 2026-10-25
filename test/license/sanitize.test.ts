import { describe, expect, test } from "vitest";
import { humanMD } from "../../src/license/document";
import { DEFAULT_OPTIONS } from "../../src/license/options";
import {
  DEFAULT_DOC,
  type Draft,
  EMPTY_DRAFT,
  hasExtensions,
  toDoc,
} from "../../src/license/sanitize";
import { unwrapState } from "./helpers";

describe("toDoc", () => {
  const empty: Draft = EMPTY_DRAFT;

  test("EMPTY_DRAFT は全欄が空", () => {
    expect(EMPTY_DRAFT).toEqual({
      date: "",
      photographer: "",
      contacts: [],
      sendBack: "",
      extensions: [],
    });
  });

  test("DEFAULT_DOC は既定プレースホルダと空の拡張", () => {
    expect(DEFAULT_DOC).toEqual({
      date: "[YYYY-MM-DD]",
      photographer: "[撮影者名]",
      contacts: ["[連絡先をここに記入]"],
      sendBackItems: [],
      extensions: [],
    });
  });

  test("空入力は既定プレースホルダに畳まれる", () => {
    expect(toDoc(empty)).toEqual(DEFAULT_DOC);
  });

  test("改行・C0 制御文字を除去する", () => {
    expect(toDoc({ ...empty, photographer: "Hi\n\tdari" }).photographer).toBe("Hidari");
  });

  test("双方向テキスト制御文字（Trojan Source）を除去する", () => {
    expect(toDoc({ ...empty, photographer: "a‮b⁦c" }).photographer).toBe("abc");
  });

  test("山括弧を除去する（休眠 XSS の保険）", () => {
    expect(toDoc({ ...empty, contacts: ["<script>x</script>"] }).contacts).toEqual([
      "scriptx/script",
    ]);
  });

  test("撮影者名はコードポイント 50 で切る", () => {
    const long = "あ".repeat(60);
    expect([...toDoc({ ...empty, photographer: long }).photographer].length).toBe(50);
  });

  test("連絡先は 1 件あたりコードポイント 100 で切る", () => {
    const long = "x".repeat(120);
    expect(toDoc({ ...empty, contacts: [long] }).contacts[0]?.length).toBe(100);
  });

  test("サロゲートペア（絵文字）を途中で割らない", () => {
    const emoji = "😀".repeat(60);
    const cut = toDoc({ ...empty, photographer: emoji }).photographer;
    expect([...cut].length).toBe(50);
    expect(cut).toBe("😀".repeat(50));
  });

  test("形式不正・非実在日はプレースホルダに畳まれる", () => {
    for (const bad of [
      "2026-13-40",
      "2026-02-30",
      "2026/06/17",
      "20260617",
      "abc",
      "0000-01-01", // year < 1000 は弾く（JS Date の 0-99 解釈ずれ回避）
      "0099-02-29",
    ]) {
      expect(toDoc({ ...empty, date: bad }).date).toBe(DEFAULT_DOC.date);
    }
  });

  test("実在する暦日は保持する（閏日含む）", () => {
    for (const ok of ["2026-06-17", "2026-02-28", "2024-02-29"]) {
      expect(toDoc({ ...empty, date: ok }).date).toBe(ok);
    }
  });

  test("連絡先は空行を捨てて詰める", () => {
    expect(toDoc({ ...empty, contacts: ["X: @a", "  ", "B"] }).contacts).toEqual(["X: @a", "B"]);
  });

  test("連絡先がすべて空ならプレースホルダ 1 件", () => {
    expect(toDoc({ ...empty, contacts: ["", " "] }).contacts).toEqual(["[連絡先をここに記入]"]);
  });

  test("連絡先は 5 件で切る", () => {
    const contacts = ["1", "2", "3", "4", "5", "6"];
    expect(toDoc({ ...empty, contacts }).contacts).toEqual(["1", "2", "3", "4", "5"]);
  });

  test("拡張は見出しが空のものを捨て、本文を 1 行 1 項目にして山括弧と空行を除く", () => {
    const doc = toDoc({
      ...empty,
      extensions: [
        { heading: "", body: "a" },
        { heading: "加工", body: "a\n\n<b>b</b>\n" },
      ],
    });
    // 山括弧だけを除くので </b> は "/b" が残る（cleanText と同じ挙動）。
    expect(doc.extensions).toEqual([{ heading: "加工", items: ["a", "bb/b"] }]);
  });

  test("拡張は 10 個、1 つあたり 20 行で切る", () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ heading: `h${i}`, body: "x" }));
    expect(toDoc({ ...empty, extensions: many }).extensions).toHaveLength(10);
    const lines = Array.from({ length: 21 }, (_, i) => `l${i}`).join("\n");
    const doc = toDoc({ ...empty, extensions: [{ heading: "h", body: lines }] });
    expect(doc.extensions[0]?.items).toHaveLength(20);
    expect(doc.extensions[0]?.items[19]).toBe("l19");
  });

  test("見出しは 40、項目は 200 コードポイントで切る", () => {
    const doc = toDoc({
      ...empty,
      extensions: [{ heading: "あ".repeat(50), body: "い".repeat(250) }],
    });
    expect([...(doc.extensions[0]?.heading ?? "")]).toHaveLength(40);
    expect([...(doc.extensions[0]?.items[0] ?? "")]).toHaveLength(200);
  });

  test("SB の自由記述は 1 行 1 項目、空行を捨てて 10 行で切る", () => {
    expect(toDoc({ ...empty, sendBack: "a\n\n b \n" }).sendBackItems).toEqual(["a", "b"]);
    const lines = Array.from({ length: 11 }, (_, i) => `l${i}`).join("\n");
    expect(toDoc({ ...empty, sendBack: lines }).sendBackItems).toHaveLength(10);
  });

  test("U+2028 / U+2029 を除去し、改行を使った見出し偽装を防ぐ", () => {
    expect(toDoc({ ...empty, photographer: "a\u2028## 偽" }).photographer).toBe("a## 偽");
    expect(toDoc({ ...empty, photographer: "a\u2029## 偽" }).photographer).toBe("a## 偽");
  });

  test("単一行の値に混ざった改行は潰れる（見出し・区切り線の偽装）", () => {
    const doc = toDoc({
      ...empty,
      contacts: ["x\n----"],
      extensions: [{ heading: "a\n## 偽", body: "x" }],
    });
    expect(doc.extensions[0]?.heading).toBe("a## 偽");
    expect(doc.contacts).toEqual(["x----"]);
  });

  test("SB の自由記述は改行で項目に分かれ、見出し記法も項目のまま", () => {
    const doc = toDoc({ ...empty, sendBack: "a\n## 偽" });
    expect(doc.sendBackItems).toEqual(["a", "## 偽"]);
    expect(humanMD(unwrapState("SB"), DEFAULT_OPTIONS, doc)).toContain("\n- ## 偽\n");
  });

  test("hasExtensions は拡張の有無を返す", () => {
    expect(hasExtensions(DEFAULT_DOC)).toBe(false);
    expect(hasExtensions(toDoc({ ...empty, extensions: [{ heading: "h", body: "" }] }))).toBe(true);
  });
});
