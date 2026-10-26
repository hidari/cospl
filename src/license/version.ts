// 仕様バージョンと規約ページ URL の単一ソース。識別子（ident）と AI 向け宣言が共有する。
export const VERSION = "2.0";
// 条文は版ごとに不変なので、main ではなく条文のリリースタグ（cospl-v<VERSION>）の時点を指す。
export const TERMS_URL = `https://github.com/hidari/cospl/blob/cospl-v${VERSION}/v${VERSION}/CosPL-${VERSION}.md`;
