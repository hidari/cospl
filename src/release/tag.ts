// リリースタグの厳格パース。CI の deploy / release-license が scripts/check-release-tag.mjs 経由で使う。

import { fail, type Result, success } from "../types/result";

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
