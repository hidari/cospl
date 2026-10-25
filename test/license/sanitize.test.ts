import { describe, expect, test } from "vitest";
import {
  cleanFields,
  DEFAULT_FIELDS,
  type Fields,
  sanitizeFields,
} from "../../src/license/sanitize";

describe("cleanFields / sanitizeFields", () => {
  const empty: Fields = { date: "", photographer: "", contact: "" };

  test("空入力は sanitizeFields で既定プレースホルダに畳まれる", () => {
    expect(sanitizeFields(empty)).toEqual(DEFAULT_FIELDS);
  });

  test("空入力は cleanFields では空のまま（プレースホルダにしない）", () => {
    expect(cleanFields(empty)).toEqual(empty);
  });

  test("改行・C0 制御文字を除去する", () => {
    expect(cleanFields({ ...empty, photographer: "Hi\n\tdari" }).photographer).toBe("Hidari");
  });

  test("双方向テキスト制御文字（Trojan Source）を除去する", () => {
    expect(cleanFields({ ...empty, photographer: "a\u202Eb\u2066c" }).photographer).toBe("abc");
  });

  test("山括弧を除去する（休眠 XSS の保険）", () => {
    expect(cleanFields({ ...empty, contact: "<script>x</script>" }).contact).toBe("scriptx/script");
  });

  test("撮影者名はコードポイント 50 で切る", () => {
    const long = "あ".repeat(60);
    expect([...cleanFields({ ...empty, photographer: long }).photographer].length).toBe(50);
  });

  test("連絡先はコードポイント 100 で切る", () => {
    const long = "x".repeat(120);
    expect(cleanFields({ ...empty, contact: long }).contact.length).toBe(100);
  });

  test("サロゲートペア（絵文字）を途中で割らない", () => {
    const emoji = "😀".repeat(60);
    const cut = cleanFields({ ...empty, photographer: emoji }).photographer;
    expect([...cut].length).toBe(50);
    expect(cut).toBe("😀".repeat(50));
  });

  test("形式不正・非実在日はフォールバック（cleanFields は空・sanitizeFields はプレースホルダ）", () => {
    for (const bad of [
      "2026-13-40",
      "2026-02-30",
      "2026/06/17",
      "20260617",
      "abc",
      "0000-01-01", // year < 1000 は弾く（JS Date の 0-99 解釈ずれ回避）
      "0099-02-29",
    ]) {
      expect(cleanFields({ ...empty, date: bad }).date).toBe("");
      expect(sanitizeFields({ ...empty, date: bad }).date).toBe(DEFAULT_FIELDS.date);
    }
  });

  test("実在する暦日は保持する（閏日含む）", () => {
    for (const ok of ["2026-06-17", "2026-02-28", "2024-02-29"]) {
      expect(cleanFields({ ...empty, date: ok }).date).toBe(ok);
      expect(sanitizeFields({ ...empty, date: ok }).date).toBe(ok);
    }
  });
});
