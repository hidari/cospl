import { describe, expect, test } from "vitest";
import { registerServiceWorker } from "../src/client/sw-register";

describe("registerServiceWorker（SW 登録アダプタ）", () => {
  test("container が無ければ未対応として fail を返す（例外を投げない）", async () => {
    const result = await registerServiceWorker("/sw.js", undefined);
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("expected fail but got success");
    }
    expect(result.error).toBe("service worker unsupported");
  });

  test("register が解決すれば success を返し、渡した URL で登録する", async () => {
    const calls: string[] = [];
    const container = {
      register: (url: string) => {
        calls.push(url);
        return Promise.resolve(undefined);
      },
    };
    const result = await registerServiceWorker("/sw.js", container);
    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error("expected success but got fail");
    }
    expect(result.data).toBeUndefined();
    expect(calls).toEqual(["/sw.js"]);
  });

  test("register が reject したら fail を返す（例外を漏らさない）", async () => {
    const container = { register: () => Promise.reject(new Error("boom")) };
    const result = await registerServiceWorker("/sw.js", container);
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("expected fail but got success");
    }
    expect(result.error).toBe("service worker registration failed");
  });
});
