// CosPL core — タグロジックと Markdown 生成の単一ソース（src/license/*）への再エクスポート窓口。
// DOM に依存しない純粋関数群。Worker（src/worker.ts）と Client（src/client/main.ts）が共有する。

export { aiMD, humanMD, humanText } from "./license/document.ts";
export {
  addExtension,
  canAddExtension,
  removeExtension,
  setExtension,
  setTextField,
  type TextField,
} from "./license/draft-edit.ts";
export { licenseQuery, parseHash, serializeHash } from "./license/hash.ts";
export {
  CREDITS,
  type CreditMethod,
  creditParam,
  type Options,
  parseCredit,
} from "./license/options.ts";
export { EXTENSION_PRESETS, type ExtensionPresetId } from "./license/presets.ts";
export { type Format, parseFormat, parseView, type View } from "./license/query.ts";
export {
  type Doc,
  type Draft,
  EMPTY_DRAFT,
  type Extension,
  hasExtensions,
  MAX_EXTENSIONS,
  MAX_HEADING,
  MAX_PHOTOGRAPHER,
  toDoc,
} from "./license/sanitize.ts";
export {
  type SharePayload,
  SITE_URL,
  siteShareMessage,
  siteSharePayload,
} from "./license/share.ts";
export {
  DEFAULT_TAGS,
  EXTENSION_MARK,
  emptyState,
  ident,
  identParts,
  ORDER,
  parseTag,
  parseTags,
  type State,
  type Tag,
  tagsFrom,
} from "./license/tags.ts";
