import { describe, expect, test } from "vitest";
// workerd では node:fs が使えないため Vite の ?raw で本文を文字列として埋め込む。
import manifestRaw from "../public/manifest.webmanifest?raw";

describe("Web App Manifest", () => {
  // parse できることが第一の検証。再シリアライズ（空白なし）して exact 部分一致で値を固定する。
  // これにより as アサーション無しで構造と値を仕様として固定できる。
  const parsed: unknown = JSON.parse(manifestRaw);
  const json = JSON.stringify(parsed);

  test("有効な JSON オブジェクトである", () => {
    expect(typeof parsed).toBe("object");
    expect(parsed).not.toBeNull();
  });

  test("インストール可能 PWA の必須値を宣言する（standalone / start_url / scope / theme_color）", () => {
    expect(json).toContain('"display":"standalone"');
    expect(json).toContain('"start_url":"/"');
    expect(json).toContain('"scope":"/"');
    expect(json).toContain('"theme_color":"#7b54ff"');
  });

  test("192/512 の any と 512 の maskable アイコンを正確に宣言する", () => {
    expect(json).toContain(
      '"src":"/icons/icon-192.png","sizes":"192x192","type":"image/png","purpose":"any"',
    );
    expect(json).toContain(
      '"src":"/icons/icon-512.png","sizes":"512x512","type":"image/png","purpose":"any"',
    );
    expect(json).toContain(
      '"src":"/icons/icon-512-maskable.png","sizes":"512x512","type":"image/png","purpose":"maskable"',
    );
  });
});
