// Cloudflare Worker — リクエストパスに応じて動的生成または静的アセット委譲を行う。
//
// 動的生成ルート（Worker が処理）:
//   /robots.txt                               -> text/plain（全許可 + sitemap 参照）
//   /sitemap.xml                              -> application/xml（正規 URL 一覧）
//   /.well-known/api-catalog                  -> application/linkset+json（API カタログ）
//   /openapi.json                             -> application/json（OpenAPI 定義）
//   / [Accept: text/markdown]                 -> /llms.txt を Markdown として配信
//   / [通常]                                  -> HTML + Link ヘッダ付与
//   /llms.txt                                 -> text/markdown + CORS（/ の Accept 交渉と同一本文）
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

// 全レスポンス共通のセキュリティヘッダ（多層防御）。fetch 境界の withSecurityHeaders で
// Worker が生成する全応答（アセット委譲・エラー経路含む）へ一括付与する。HSTS は HTTPS 文書に
// 1度届けばブラウザがホスト全体へ適用する。CSP は HTML 文書にのみ別途付与する（下記）。
const SECURITY_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "strict-transport-security": "max-age=63072000; includeSubDomains",
  "x-frame-options": "DENY",
};

// HTML 文書にのみ付与する CSP。本番のビルド成果物はインライン script/style を持たず、全リソースが
// same-origin（JS/CSS/フォント/アイコン SVG/画像）なので 'unsafe-inline' 無しの 'self' で足りる。
// dev だけは例外で、Vite が HMR 用に注入するインライン <style> を通すため style-src にのみ
// 'unsafe-inline' を許可する（他ディレクティブは厳格に保つ）。isDev は呼び出し側で
// import.meta.env.DEV を渡す。本番ビルドでは false に静的置換され、緩い枝は dead-code 除去される。
// upgrade-insecure-requests は HTTPS 文書の subresource を https へ昇格させる本番向け指示で、
// HTTP 文書（ローカル preview / E2E）に付くと WebKit が localhost の http subresource まで https
// へ昇格させ TLS 失敗でバンドルが読めなくなる。本番は常に HTTPS なので isSecure=true で従来同等、
// プレーン HTTP の preview だけ除外する（production の CSP はバイト単位で不変）。
export function buildCsp(isDev: boolean, isSecure: boolean): string {
  const styleSrc = isDev ? "style-src 'self' 'unsafe-inline'" : "style-src 'self'";
  const directives = [
    "default-src 'self'",
    "img-src 'self' data:",
    styleSrc,
    "script-src 'self'",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ];
  if (isSecure) {
    directives.push("upgrade-insecure-requests");
  }
  return directives.join("; ");
}

// 動的生成レスポンス共通のヘッダ（CORS 全許可・5分キャッシュ）を付けて 200 を返す。
// セキュリティヘッダは fetch 境界の withSecurityHeaders でまとめて付与する。
function cachedResponse(body: BodyInit | null, contentType: string): Response {
  return new Response(body, {
    headers: {
      "content-type": contentType,
      [CORS_ORIGIN]: "*",
      "cache-control": "public, max-age=300",
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
    },
  });
}

// 読み取り専用エンドポイントなので GET/OPTIONS 以外は許可しない
function methodNotAllowedResponse(): Response {
  return new Response(null, {
    status: 405,
    headers: { allow: "GET, HEAD, OPTIONS", [CORS_ORIGIN]: "*" },
  });
}

// /llms.txt の内容を Markdown（text/markdown + CORS）として返す。ASSETS から実体を読み、
// / の Accept: text/markdown ネゴシエーションと /llms.txt 直アクセスの両方で共有する（単一ソース）。
// ASSETS が ok でなければその応答をそのまま返し、嘘の Content-Type を付けない。
async function llmsMarkdownResponse(request: Request, env: Env): Promise<Response> {
  const llmsUrl = new URL(LLMS_PATH, request.url);
  const res = await env.ASSETS.fetch(new Request(llmsUrl.toString(), { method: "GET" }));
  if (!res.ok) {
    return res;
  }
  return cachedResponse(res.body, "text/markdown; charset=utf-8");
}

// ホームページの HTML 応答に Link ヘッダと CSP を付与する（既存ヘッダ非破壊）。
// 基本セキュリティヘッダは fetch 境界で付くので、ここは HTML 固有の CSP のみ。
async function htmlHomeResponse(request: Request, env: Env): Promise<Response> {
  const res = await env.ASSETS.fetch(request);
  const headers = new Headers(res.headers);
  headers.set("link", LINK_HEADER);
  headers.set(CORS_ORIGIN, "*");
  // upgrade-insecure-requests は HTTPS 文書でのみ意味を持つため、リクエストのスキームで切り替える。
  const isSecure = new URL(request.url).protocol === "https:";
  headers.set("content-security-policy", buildCsp(import.meta.env.DEV, isSecure));
  return new Response(res.body, { status: res.status, headers });
}

// Worker が生成する全応答に共通セキュリティヘッダを一括付与する finalizer。set は冪等なので
// 二重適用しても安全。これにより各ビルダーへの分散付与と、付与漏れ（アセット委譲・エラー経路）を防ぐ。
function withSecurityHeaders(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value);
  }
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
    // /llms.txt は実体アセットだが、Worker 経由で text/markdown + CORS に統一して
    // api-catalog の広告（service-doc: text/markdown）と一致させる（run_worker_first 登録が前提）。
    if (url.pathname === LLMS_PATH) {
      return llmsMarkdownResponse(request, env);
    }
    if (url.pathname === HOME_PATH) {
      return prefersMarkdown(request.headers.get("accept"))
        ? llmsMarkdownResponse(request, env)
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
    const built = await resolve(request, env, isHead ? "GET" : request.method);
    const response = withSecurityHeaders(built);
    return isHead
      ? new Response(null, { status: response.status, headers: response.headers })
      : response;
  },
} satisfies ExportedHandler<Env>;
