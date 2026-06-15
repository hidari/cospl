import { describe, expect, test } from "vitest";
import {
  flatMapOption,
  fromNullable,
  getOrElse,
  ifSome,
  mapOption,
  matchOption,
  none,
  type Option,
  some,
} from "../../src/types/option";

describe("Option型ユーティリティ", () => {
  describe("some / none", () => {
    test("someは値を包んだOptionを返す", () => {
      expect(some(42)).toEqual({ some: true, value: 42 });
    });

    test("noneは空のOptionを返す", () => {
      expect(none()).toEqual({ some: false });
    });
  });

  describe("fromNullable", () => {
    test("値がある場合はSomeを返す", () => {
      expect(fromNullable("hello")).toEqual({ some: true, value: "hello" });
    });

    test("nullの場合はNoneを返す", () => {
      expect(fromNullable(null)).toEqual({ some: false });
    });

    test("undefinedの場合はNoneを返す", () => {
      expect(fromNullable(undefined)).toEqual({ some: false });
    });

    test("0やfalseなどのfalsyな値はSomeとして扱う", () => {
      expect(fromNullable(0)).toEqual({ some: true, value: 0 });
      expect(fromNullable(false)).toEqual({ some: true, value: false });
      expect(fromNullable("")).toEqual({ some: true, value: "" });
    });
  });

  describe("mapOption", () => {
    test("Some時に値を変換する", () => {
      const result = mapOption(some(10), (x) => x * 2);
      expect(result).toEqual({ some: true, value: 20 });
    });

    test("None時は変換をスキップする", () => {
      const result = mapOption(none<number>(), (x) => x * 2);
      expect(result).toEqual({ some: false });
    });
  });

  describe("flatMapOption", () => {
    test("Some時に新しいOptionを返す関数を適用する", () => {
      const safeDivide = (x: number): Option<number> => (x === 0 ? none() : some(100 / x));

      const result = flatMapOption(some(5), safeDivide);
      expect(result).toEqual({ some: true, value: 20 });
    });

    test("関数がNoneを返す場合はNoneになる", () => {
      const safeDivide = (x: number): Option<number> => (x === 0 ? none() : some(100 / x));

      const result = flatMapOption(some(0), safeDivide);
      expect(result).toEqual({ some: false });
    });

    test("元がNoneなら関数を実行しない", () => {
      let called = false;
      flatMapOption(none<number>(), () => {
        called = true;
        return some(42);
      });
      expect(called).toBe(false);
    });
  });

  describe("matchOption", () => {
    test("Some時はsome分岐の結果を返す", () => {
      const output = matchOption(some(42), {
        some: (v) => `value:${v}`,
        none: () => "empty",
      });
      expect(output).toBe("value:42");
    });

    test("None時はnone分岐の結果を返す", () => {
      const output = matchOption(none<number>(), {
        some: (v) => `value:${v}`,
        none: () => "empty",
      });
      expect(output).toBe("empty");
    });
  });

  describe("getOrElse", () => {
    test("Some時は値を返す", () => {
      expect(getOrElse(some(42), 0)).toBe(42);
    });

    test("None時はデフォルト値を返す", () => {
      expect(getOrElse(none<number>(), 0)).toBe(0);
    });
  });

  describe("ifSome", () => {
    test("Some時のみ副作用を実行する", () => {
      let called = false;
      ifSome(some("hello"), () => {
        called = true;
      });
      expect(called).toBe(true);
    });

    test("None時は副作用を実行しない", () => {
      let called = false;
      ifSome(none<string>(), () => {
        called = true;
      });
      expect(called).toBe(false);
    });
  });
});
