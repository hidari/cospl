// CosPL core — タグロジックと Markdown 生成の単一ソース（src/license/*）への再エクスポート窓口。
// DOM に依存しない純粋関数群。Worker（src/worker.ts）と Client（src/client/main.ts）が共有する。

export { aiMD, humanMD, humanText } from "./license/document";
export {
  addExtension,
  canAddExtension,
  removeExtension,
  setExtension,
  setTextField,
  type TextField,
} from "./license/draft-edit";
export { parseHash, serializeHash } from "./license/hash";
export {
  type CreditMethod,
  creditParam,
  DEFAULT_OPTIONS,
  type Options,
  parseCredit,
} from "./license/options";
export { EXTENSION_PRESETS, type ExtensionPresetId } from "./license/presets";
export { type Format, parseFormat, parseView, type View } from "./license/query";
export {
  DEFAULT_DOC,
  type Doc,
  type Draft,
  EMPTY_DRAFT,
  type Extension,
  hasExtensions,
  MAX_CONTACTS,
  MAX_EXTENSIONS,
  MAX_HEADING,
  MAX_PHOTOGRAPHER,
  toDoc,
} from "./license/sanitize";
export { type SharePayload, SITE_URL, siteShareMessage, siteSharePayload } from "./license/share";
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
} from "./license/tags";
