// Cloudflare Worker — /license.md を生成し、それ以外は静的アセットへ委譲する。
// 例:
//   /license.md?tags=BY-NC-NAI-TD              -> README（Markdown）
//   /license.md?tags=BY-NC-NAI-TD&format=text  -> README（プレーンテキスト）
//   /license.md?tags=BY-NC-NAI-TD&view=ai      -> AI向け宣言
//   /license.md?tags=ZZZ                        -> 400（未知タグ）
// 生成ロジックは src/core.ts をサイトと共有する。

import {
  aiMD,
  type Format,
  humanMD,
  humanText,
  parseFormat,
  parseTags,
  parseView,
  type State,
  type View,
} from "./core";
import { LINK_HEADER, prefersMarkdown, robotsTxt, sitemapXml } from "./discovery";
import type { ParseError } from "./types/errors";
import { flatMapResult, matchResult, type Result, success } from "./types/result";

const LICENSE_PATH = "/license.md";
const ROBOTS_PATH = "/robots.txt";
const SITEMAP_PATH = "/sitemap.xml";
const HOME_PATH = "/";
const LLMS_PATH = "/llms.txt";

// CORS は全許可（ツール・エージェントから直接取得できるようにする）
const CORS_ORIGIN = "access-control-allow-origin";

// パース済みリクエスト（tags・view・format の組）
type LicenseRequest = { state: State; view: View; format: Format };

// tags（省略時は BY-NC-NAI-TD）・view・format を合成して LicenseRequest にする
function parseLicenseRequest(url: URL): Result<LicenseRequest, ParseError> {
  const rawTags = url.searchParams.get("tags");
  const rawView = url.searchParams.get("view");
  const rawFormat = url.searchParams.get("format");
  const tags = parseTags(rawTags === null ? "BY-NC-NAI-TD" : rawTags);
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
  return new Response(body, {
    headers: {
      "content-type": contentType,
      [CORS_ORIGIN]: "*",
      "cache-control": "public, max-age=300",
    },
  });
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
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-max-age": "86400",
    },
  });
}

// 読み取り専用エンドポイントなので GET/OPTIONS 以外は許可しない
function methodNotAllowedResponse(): Response {
  return new Response(null, {
    status: 405,
    headers: { allow: "GET, OPTIONS", [CORS_ORIGIN]: "*" },
  });
}

// robots.txt（200・text/plain）。origin はリクエストから取得する。
function robotsResponse(origin: string): Response {
  return new Response(robotsTxt(origin), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      [CORS_ORIGIN]: "*",
      "cache-control": "public, max-age=300",
    },
  });
}

// sitemap.xml（200・application/xml）
function sitemapResponse(origin: string): Response {
  return new Response(sitemapXml(origin), {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      [CORS_ORIGIN]: "*",
      "cache-control": "public, max-age=300",
    },
  });
}

// Accept: text/markdown のとき /llms.txt を Markdown として返す。
// ASSETS が ok でなければその応答をそのまま返し、嘘の Content-Type を付けない。
async function markdownHomeResponse(request: Request, env: Env): Promise<Response> {
  const llmsUrl = new URL(LLMS_PATH, request.url);
  const res = await env.ASSETS.fetch(new Request(llmsUrl, request));
  if (!res.ok) {
    return res;
  }
  return new Response(res.body, {
    status: res.status,
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      [CORS_ORIGIN]: "*",
      "cache-control": "public, max-age=300",
    },
  });
}

// ホームページの HTML 応答に Link ヘッダを付与する（既存ヘッダ非破壊）。
async function htmlHomeResponse(request: Request, env: Env): Promise<Response> {
  const res = await env.ASSETS.fetch(request);
  const headers = new Headers(res.headers);
  headers.set("link", LINK_HEADER);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

export default {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === LICENSE_PATH) {
      if (request.method === "OPTIONS") {
        return preflightResponse();
      }
      if (request.method !== "GET") {
        return methodNotAllowedResponse();
      }
      return matchResult(parseLicenseRequest(url), {
        success: licenseResponse,
        error: errorResponse,
      });
    }

    if (request.method === "GET") {
      if (url.pathname === ROBOTS_PATH) {
        return robotsResponse(url.origin);
      }
      if (url.pathname === SITEMAP_PATH) {
        return sitemapResponse(url.origin);
      }
      if (url.pathname === HOME_PATH) {
        return prefersMarkdown(request.headers.get("accept"))
          ? markdownHomeResponse(request, env)
          : htmlHomeResponse(request, env);
      }
    }

    // 上記以外・非 GET は静的アセットへ委譲
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
