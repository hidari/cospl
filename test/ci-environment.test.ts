import { describe, expect, test } from "vitest";
// workerd では node:fs が使えないため Vite の ?raw で本文を文字列として埋め込む。
import ciRaw from "../.github/workflows/ci.yml?raw";
import deployRaw from "../.github/workflows/deploy.yml?raw";
import e2eProdRaw from "../.github/workflows/e2e-prod.yml?raw";
import mergeGateRaw from "../.github/workflows/merge-gate.yml?raw";
import nodeVersionRaw from "../.node-version?raw";
import lockRaw from "../pnpm-lock.yaml?raw";

// CI の実行環境はサプライチェーン対策として全ジョブを固定する。ランナーは OS の版を固定しても
// イメージが毎週更新されるので、ジョブは digest で固定したコンテナの中で動かす。
// イメージのタグは Dependabot が更新しないので、版の canonical（.node-version と pnpm-lock.yaml）
// とのずれをここで止める。YAML パーサを依存に足さないため、正規表現はキーの行に固定して
// コメント行を拾わないようにする。
const workflows = [
  { name: "ci.yml", raw: ciRaw },
  { name: "merge-gate.yml", raw: mergeGateRaw },
  { name: "deploy.yml", raw: deployRaw },
  { name: "e2e-prod.yml", raw: e2eProdRaw },
];

const RUNNER = "ubuntu-26.04";
const nodeVersion = nodeVersionRaw.trim();
const lockVersions = [...lockRaw.matchAll(/^ {2}'@playwright\/test@([0-9.]+)':$/gm)].map(
  (m) => m[1],
);

const linesOf = (raw: string, key: string): string[] =>
  [...raw.matchAll(new RegExp(`^ +${key}: (.+)$`, "gm"))].flatMap((m) =>
    m[1] === undefined ? [] : [m[1]],
  );

describe("CI の実行環境の固定", () => {
  test(".node-version は x.y.z の完全な版", () => {
    expect(nodeVersion).toMatch(/^[0-9]+\.[0-9]+\.[0-9]+$/);
  });

  test("lockfile が解決した @playwright/test の版はただ 1 つ", () => {
    expect(new Set(lockVersions).size).toBe(1);
  });

  test.each(workflows)("$name の全ジョブが固定したランナーで動く", ({ raw }) => {
    const runners = linesOf(raw, "runs-on");
    expect(runners.length).toBeGreaterThan(0);
    expect(runners.every((r) => r === RUNNER)).toBe(true);
  });

  test.each(workflows)("$name の全ジョブが digest で固定したコンテナで動く", ({ raw }) => {
    const images = linesOf(raw, "image");
    expect(images.length).toBe(linesOf(raw, "runs-on").length);
    const allowed = [
      new RegExp(`^node:${nodeVersion.replaceAll(".", "\\.")}-trixie@sha256:[0-9a-f]{64}$`),
      new RegExp(
        `^mcr\\.microsoft\\.com/playwright:v${lockVersions[0]?.replaceAll(".", "\\.")}-resolute@sha256:[0-9a-f]{64}$`,
      ),
    ];
    expect(images.filter((image) => !allowed.some((re) => re.test(image)))).toEqual([]);
  });

  test.each(workflows)("$name は Node の版を .node-version からだけ読む", ({ raw }) => {
    expect(linesOf(raw, "node-version")).toEqual([]);
  });

  // Node イメージのジョブはイメージの Node を使う。setup-node を足すと別の Node が PATH の前に入る。
  test.each(workflows)(
    "$name は Playwright イメージのジョブでだけ setup-node を使う",
    ({ raw }) => {
      const playwrightJobs = linesOf(raw, "image").filter((i) => i.includes("/playwright:")).length;
      expect(linesOf(raw, "node-version-file")).toEqual(
        Array(playwrightJobs).fill(".node-version"),
      );
      expect(raw.match(/uses: actions\/setup-node@/g)?.length ?? 0).toBe(playwrightJobs);
    },
  );

  test.each(workflows)("$name はブラウザを apt で入れない", ({ raw }) => {
    expect(raw).not.toContain("playwright install");
  });
});
