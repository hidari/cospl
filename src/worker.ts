// Cloudflare Worker — リクエストパスに応じて動的生成または静的アセット委譲を行う。
//
// 動的生成ルート（Worker が処理）:
//   /robots.txt                               -> text/plain（全許可 + sitemap 参照）
//   /sitemap.xml                              -> application/xml（正規 URL 一覧）
//   / [Accept: text/markdown]                 -> /llms.txt を Markdown として配信
//   / [通常]                                  -> HTML + Link ヘッダ付与
//   /license.md?tags=BY-NC-NAI-TD             -> README（Markdown）
//   /license.md?tags=BY-NC-NAI-TD&format=text -> README（プレーンテキスト）
//   /license.md?tags=BY-NC-NAI-TD&view=ai     -> AI向け宣言
//   /license.md?tags=ZZZ                       -> 400（未知タグ）
//
// 上記以外（非 GET 含む）は静的アセット（ASSETS）へ委譲する。
// 生成ロジックは src/core.ts をサイトと共有し、発見性リソースは src/discovery.ts が担う。

import {
  aiMD,
  DEFAULT_TAGS,
  type Format,
  humanMD,
  humanText,
  parseFormat,
  parseTags,
  parseView,
  type State,
  type View,
} from "./core";
import {
  apiCatalogJson,
  LINK_HEADER,
  openApiJson,
  prefersMarkdown,
  robotsTxt,
  sitemapXml,
} from "./discovery";
import type { ParseError } from "./types/errors";
import { flatMapResult, matchResult, type Result, success } from "./types/result";

const LICENSE_PATH = "/license.md";
const ROBOTS_PATH = "/robots.txt";
const SITEMAP_PATH = "/sitemap.xml";
const HOME_PATH = "/";
const LLMS_PATH = "/llms.txt";
const API_CATALOG_PATH = "/.well-known/api-catalog";
const OPENAPI_PATH = "/openapi.json";

// 発見性リソースの動的生成ルート表。各ルートは「origin → 本文文字列」生成 + 固定 Content-Type で
// 配信する同一形状なので個別の分岐ではなく表で表現する（/ と /license.md は Accept 交渉・メソッド
// 処理を持つ別ルートなので含めない）。新ルートはここに1行足し、wrangler.toml の run_worker_first
// にも登録する（その整合は test/worker.test.ts が静的に検証する）。
export const DISCOVERY_ROUTES: Readonly<
  Record<string, { generate: (origin: string) => string; contentType: string }>
> = {
  [ROBOTS_PATH]: { generate: robotsTxt, contentType: "text/plain; charset=utf-8" },
  [SITEMAP_PATH]: { generate: sitemapXml, contentType: "application/xml; charset=utf-8" },
  [API_CATALOG_PATH]: { generate: apiCatalogJson, contentType: "application/linkset+json" },
  [OPENAPI_PATH]: { generate: openApiJson, contentType: "application/json" },
};

// CORS は全許可（ツール・エージェントから直接取得できるようにする）
const CORS_ORIGIN = "access-control-allow-origin";

// 全レスポンス共通のセキュリティヘッダ（多層防御）。HSTS は HTTPS 文書に1度届けば
// ブラウザがホスト全体へ適用する。CSP は HTML 文書にのみ別途付与する（下記）。
const SECURITY_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "strict-transport-security": "max-age=63072000; includeSubDomains",
  "x-frame-options": "DENY",
};

// HTML 文書にのみ付与する CSP。ビルド成果物はインライン script/style を持たず、全リソースが
// same-origin（JS/CSS/フォント/アイコン SVG/画像）なので 'unsafe-inline' 無しの 'self' で足りる。
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "img-src 'self' data:",
  "style-src 'self'",
  "script-src 'self'",
  "font-src 'self'",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

// 動的生成レスポンス共通のヘッダ（CORS 全許可・5分キャッシュ・セキュリティ）を付けて 200 を返す
function cachedResponse(body: BodyInit | null, contentType: string): Response {
  return new Response(body, {
    headers: {
      "content-type": contentType,
      [CORS_ORIGIN]: "*",
      "cache-control": "public, max-age=300",
      ...SECURITY_HEADERS,
    },
  });
}

// パース済みリクエスト（tags・view・format の組）
type LicenseRequest = { state: State; view: View; format: Format };

// tags（省略時は BY-NC-NAI-TD）・view・format を合成して LicenseRequest にする
function parseLicenseRequest(url: URL): Result<LicenseRequest, ParseError> {
  const rawTags = url.searchParams.get("tags");
  const rawView = url.searchParams.get("view");
  const rawFormat = url.searchParams.get("format");
  const tags = parseTags(rawTags === null ? DEFAULT_TAGS : rawTags);
  return flatMapResult(tags, (state) =>
    flatMapResult(parseView(rawView), (view) =>
      flatMapResult(parseFormat(rawFormat), (format) => success({ state, view, format })),
    ),
  );
}

// 成功時のレスポンス（200）。README は format=text でプレーンテキスト。
// AI 宣言は機械向けで常に Markdown なので format は無視する（body と content-type を一致させる）。
function licenseResponse({ state, view, format }: LicenseRequest): Response {
  const isAi = view === "ai";
  const asText = !isAi && format === "text";
  const body = isAi ? aiMD(state) : asText ? humanText(state) : humanMD(state);
  const contentType = asText ? "text/plain; charset=utf-8" : "text/markdown; charset=utf-8";
  return cachedResponse(body, contentType);
}

// 失敗時のレスポンス（400 + エラー Markdown）
function errorResponse(error: ParseError): Response {
  const body = `# CosPL — Bad Request\n\nerror: ${error.kind}\nmessage: ${error.message}`;
  return new Response(body, {
    status: 400,
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      [CORS_ORIGIN]: "*",
      ...SECURITY_HEADERS,
    },
  });
}

// クロスオリジンのプリフライトを許可する
function preflightResponse(): Response {
  return new Response(null, {
    headers: {
      [CORS_ORIGIN]: "*",
      "access-control-allow-methods": "GET, HEAD, OPTIONS",
      "access-control-max-age": "86400",
      ...SECURITY_HEADERS,
    },
  });
}

// 読み取り専用エンドポイントなので GET/OPTIONS 以外は許可しない
function methodNotAllowedResponse(): Response {
  return new Response(null, {
    status: 405,
    headers: { allow: "GET, HEAD, OPTIONS", [CORS_ORIGIN]: "*", ...SECURITY_HEADERS },
  });
}

// Accept: text/markdown のとき /llms.txt を Markdown として返す。
// ASSETS が ok でなければその応答をそのまま返し、嘘の Content-Type を付けない。
async function markdownHomeResponse(request: Request, env: Env): Promise<Response> {
  const llmsUrl = new URL(LLMS_PATH, request.url);
  const res = await env.ASSETS.fetch(new Request(llmsUrl.toString(), { method: "GET" }));
  if (!res.ok) {
    return res;
  }
  return cachedResponse(res.body, "text/markdown; charset=utf-8");
}

// ホームページの HTML 応答に Link ヘッダ・セキュリティヘッダ・CSP を付与する（既存ヘッダ非破壊）。
async function htmlHomeResponse(request: Request, env: Env): Promise<Response> {
  const res = await env.ASSETS.fetch(request);
  const headers = new Headers(res.headers);
  headers.set("link", LINK_HEADER);
  headers.set(CORS_ORIGIN, "*");
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value);
  }
  headers.set("content-security-policy", CONTENT_SECURITY_POLICY);
  return new Response(res.body, { status: res.status, headers });
}

// GET と同じ経路で応答を組み立てる。HEAD は呼び出し側で GET 扱いにして渡す。
async function resolve(request: Request, env: Env, method: string): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === LICENSE_PATH) {
    if (method === "OPTIONS") {
      return preflightResponse();
    }
    if (method !== "GET") {
      return methodNotAllowedResponse();
    }
    return matchResult(parseLicenseRequest(url), {
      success: licenseResponse,
      error: errorResponse,
    });
  }

  if (method === "GET") {
    const route = DISCOVERY_ROUTES[url.pathname];
    if (route) {
      return cachedResponse(route.generate(url.origin), route.contentType);
    }
    if (url.pathname === HOME_PATH) {
      return prefersMarkdown(request.headers.get("accept"))
        ? markdownHomeResponse(request, env)
        : htmlHomeResponse(request, env);
    }
  }

  // 上記以外・非 GET は静的アセットへ委譲
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // HEAD は GET と同じ経路で組み立て、ヘッダのみ返す（本文を落とす）。HTTP 仕様上
    // GET 可能なリソースは HEAD も通すべきで、405 を返すと HEAD を使うクローラがコケる。
    const isHead = request.method === "HEAD";
    const response = await resolve(request, env, isHead ? "GET" : request.method);
    return isHead
      ? new Response(null, { status: response.status, headers: response.headers })
      : response;
  },
} satisfies ExportedHandler<Env>;
