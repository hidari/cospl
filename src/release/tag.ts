// リリースタグの厳格パースと次のタグの決定。CI と just の release 系 recipe が scripts/release-tag.mjs 経由で使う。

import { fail, type Result, success } from "../types/result.ts";

export type ReleaseTag = { kind: "license"; version: string } | { kind: "site"; version: string };

const LICENSE_TAG = /^cospl-v([0-9]+\.[0-9]+)$/;
const SITE_TAG = /^site-v(([0-9]{4})\.([0-9]{2})\.([0-9]{2})(?:\.[1-9][0-9]*)?)$/;

// 正規表現は桁数しか見ないので、暦に実在する日付かを UTC の Date で往復させて確かめる。
function isRealDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

// 条文のタグ（cospl-v<VERSION>）は現行の VERSION と一致するときだけ、サイトのタグ
// （site-vYYYY.MM.DD[.N]）は実在する日付のときだけ受け付ける。
export function parseReleaseTag(tag: string, licenseVersion: string): Result<ReleaseTag, string> {
  const license = LICENSE_TAG.exec(tag);
  if (license?.[1] !== undefined) {
    if (license[1] !== licenseVersion) {
      return fail(`条文のタグ ${tag} が現行の VERSION ${licenseVersion} と一致しない`);
    }
    return success({ kind: "license", version: license[1] });
  }
  const site = SITE_TAG.exec(tag);
  if (site?.[1] !== undefined) {
    if (!isRealDate(Number(site[2]), Number(site[3]), Number(site[4]))) {
      return fail(`サイトのタグ ${tag} の日付が暦に存在しない`);
    }
    return success({ kind: "site", version: site[1] });
  }
  return fail(`${tag} は cospl-v<版> でも site-vYYYY.MM.DD[.N] でもない`);
}

const ISO_DATE = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;

// 次に打つサイトのタグを決める。date は YYYY-MM-DD、existing は既存のタグ名の一覧。
// その日のタグが無ければ連番なし、あれば既存の最大の連番 + 1（連番なしを 0 とみなす）。
export function nextSiteTag(date: string, existing: readonly string[]): Result<string, string> {
  const m = ISO_DATE.exec(date);
  if (m === null || !isRealDate(Number(m[1]), Number(m[2]), Number(m[3]))) {
    return fail(`日付 ${date} は YYYY-MM-DD の実在する日付ではない`);
  }
  const base = `site-v${m[1]}.${m[2]}.${m[3]}`;
  const sameDay = existing.flatMap((tag) => {
    const parsed = parseReleaseTag(tag, "");
    if (!parsed.success || parsed.data.kind !== "site") {
      return [];
    }
    if (tag === base) {
      return [0];
    }
    return tag.startsWith(`${base}.`) ? [Number(tag.slice(base.length + 1))] : [];
  });
  if (sameDay.length === 0) {
    return success(base);
  }
  return success(`${base}.${Math.max(...sameDay) + 1}`);
}
