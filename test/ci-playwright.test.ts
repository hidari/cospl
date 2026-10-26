import { describe, expect, test } from "vitest";
// workerd では node:fs が使えないため Vite の ?raw で本文を文字列として埋め込む。
import e2eProdRaw from "../.github/workflows/e2e-prod.yml?raw";
import mergeGateRaw from "../.github/workflows/merge-gate.yml?raw";
import lockRaw from "../pnpm-lock.yaml?raw";

// E2E ジョブは Playwright 公式コンテナで動かし、apt でブラウザ依存を入れない。
// コンテナのタグは Dependabot が更新しないので、lockfile の版とのずれをここで止める。
// ずれるとコンテナにその版のブラウザが無く、E2E がテスト前に落ちる。
const workflows = [
  { name: "merge-gate.yml", raw: mergeGateRaw },
  { name: "e2e-prod.yml", raw: e2eProdRaw },
];

const lockVersions = [...lockRaw.matchAll(/^ {2}'@playwright\/test@([0-9.]+)':$/gm)].map(
  (m) => m[1],
);

describe("CI の Playwright コンテナ", () => {
  test("lockfile が解決した @playwright/test の版はただ 1 つ", () => {
    expect(new Set(lockVersions).size).toBe(1);
  });

  test.each(workflows)("$name のイメージの版が lockfile と一致する", ({ raw }) => {
    // YAML パーサを依存に足さないため、image キーの行に固定してコメント行を拾わないようにする。
    const images = [
      ...raw.matchAll(/^ +image: mcr\.microsoft\.com\/playwright:v([0-9.]+)-noble$/gm),
    ].map((m) => m[1]);
    // 0 件だと every が真になって緑で通るので、イメージを使っていること自体を先に固定する。
    expect(images.length).toBeGreaterThan(0);
    expect(images.every((v) => v === lockVersions[0])).toBe(true);
  });

  test.each(workflows)("$name はブラウザを apt で入れない", ({ raw }) => {
    expect(raw).not.toContain("playwright install");
  });
});
