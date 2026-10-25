// CosPL core — タグロジックと Markdown 生成の単一ソース（src/license/*）への再エクスポート窓口。
// DOM に依存しない純粋関数群。Worker（src/worker.ts）と Client（src/client/main.ts）が共有する。

export { aiMD, humanMD, humanText } from "./license/document";
export { parseHash, serializeHash } from "./license/hash";
export {
  type CreditMethod,
  DEFAULT_OPTIONS,
  type Options,
  parseCredit,
} from "./license/options";
export { type Format, parseFormat, parseView, type View } from "./license/query";
export {
  cleanFields,
  DEFAULT_FIELDS,
  EMPTY_FIELDS,
  type Fields,
  sanitizeFields,
} from "./license/sanitize";
export { type SharePayload, SITE_URL, siteShareMessage, siteSharePayload } from "./license/share";
export {
  DEFAULT_TAGS,
  emptyState,
  ident,
  identParts,
  ORDER,
  parseTag,
  parseTags,
  type State,
  type Tag,
  tagsFrom,
} from "./license/tags";
