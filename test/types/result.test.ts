import { describe, expect, test } from "vitest";
import {
  fail,
  flatMapResult,
  getOrElse,
  ifError,
  ifSuccess,
  mapError,
  mapResult,
  matchResult,
  success,
} from "../../src/types/result";

describe("Result型ユーティリティ", () => {
  describe("mapResult", () => {
    test("成功時に値を変換する", () => {
      const result = success(10);
      const doubled = mapResult(result, (x) => x * 2);

      expect(doubled).toEqual({ success: true, data: 20 });
    });

    test("失敗時はエラーをそのまま通過させる", () => {
      const result = fail({ message: "Invalid" });
      const mapped = mapResult(result, (x: number) => x * 2);

      expect(mapped).toEqual({ success: false, error: { message: "Invalid" } });
    });
  });

  describe("flatMapResult", () => {
    test("成功時に新しいResultを返す関数を適用する", () => {
      const parseNumber = (s: string) =>
        Number.isNaN(Number(s)) ? fail({ message: "Not a number" }) : success(Number(s));

      const result = flatMapResult(success("42"), parseNumber);
      expect(result).toEqual({ success: true, data: 42 });
    });

    test("元のResultが失敗していれば変換関数を実行しない", () => {
      let called = false;
      const result = flatMapResult(fail({ message: "error" }), () => {
        called = true;
        return success(42);
      });

      expect(called).toBe(false);
      expect(result.success).toBe(false);
    });
  });

  describe("mapError", () => {
    test("失敗時にエラー型を変換する", () => {
      const result = fail({ message: "Error" });
      const converted = mapError(result, (err) => ({
        message: err.message,
        code: 500,
      }));

      expect(converted).toEqual({
        success: false,
        error: { message: "Error", code: 500 },
      });
    });

    test("成功時はエラー変換をスキップする", () => {
      const result = success<number, { message: string }>(42);
      const converted = mapError(result, (err) => ({ ...err, code: 500 }));

      expect(converted).toEqual({ success: true, data: 42 });
    });
  });

  describe("matchResult", () => {
    test("成功時はsuccess分岐の結果を返す", () => {
      const output = matchResult(success(42), {
        success: (data) => `value:${data}`,
        error: (err: { message: string }) => `error:${err.message}`,
      });
      expect(output).toBe("value:42");
    });

    test("失敗時はerror分岐の結果を返す", () => {
      const output = matchResult(fail({ message: "bad" }), {
        success: (data: number) => `value:${data}`,
        error: (err) => `error:${err.message}`,
      });
      expect(output).toBe("error:bad");
    });
  });

  describe("getOrElse", () => {
    test("成功時は値を返す", () => {
      expect(getOrElse(success(42), 0)).toBe(42);
    });

    test("失敗時はデフォルト値を返す", () => {
      expect(getOrElse(fail("error"), 0)).toBe(0);
    });
  });

  describe("ifSuccess", () => {
    test("成功時のみ副作用を実行する", () => {
      let called = false;
      ifSuccess(success("hello"), () => {
        called = true;
      });
      expect(called).toBe(true);
    });

    test("失敗時は副作用を実行しない", () => {
      let called = false;
      ifSuccess(fail("error"), () => {
        called = true;
      });
      expect(called).toBe(false);
    });
  });

  describe("ifError", () => {
    test("失敗時のみ副作用を実行する", () => {
      let message = "";
      ifError(fail("bad"), (err) => {
        message = err;
      });
      expect(message).toBe("bad");
    });

    test("成功時は副作用を実行しない", () => {
      let called = false;
      ifError(success(42), () => {
        called = true;
      });
      expect(called).toBe(false);
    });
  });
});
