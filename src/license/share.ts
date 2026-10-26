// サイト共有の文面とペイロード。

// サイトのトップ URL（設定を含まない素の共有先）。og:url とも一致させる。
export const SITE_URL = "https://cospl.org/";

// 共有文面の構成要素。コピー文面（siteShareMessage）とネイティブ共有（siteSharePayload）の
// 単一ソース。ヒーロー・OGP の文言と整合させ、文面変更は単体テストで検知する。
const SHARE_TITLE = "CosPL — Cosplay Public License";
const SHARE_TAGLINE = "撮った写真の ”使っていい範囲” を言葉にする";

// 共有本文（タイトル + タグライン）。コピー文面とネイティブ共有 text の単一ソースにして、
// 両者が同じ2行ブロックを共有することを構造的に保証する（手書きの二重定義による drift を防ぐ）。
const SHARE_BODY = `${SHARE_TITLE}\n${SHARE_TAGLINE}`;

// SNS 等へそのまま貼り付ける共有メッセージ（本文 + URL の3行）。
export function siteShareMessage(): string {
  return `${SHARE_BODY}\n${SITE_URL}`;
}

// ネイティブ共有（Web Share API）用ペイロード。url を独立フィールドにして共有先が
// URL を正しく扱えるようにする（X はカードが描画され、他アプリは url を個別に受け取る）。
// text には本文（タイトル + タグライン）を入れる：title フィールドを無視する共有先が多く、
// 本文へ埋めないと共有結果からタイトルが落ちるため。text+url はコピー用 siteShareMessage と一致する。
export type SharePayload = { title: string; text: string; url: string };
export function siteSharePayload(): SharePayload {
  return { title: SHARE_TITLE, text: SHARE_BODY, url: SITE_URL };
}
