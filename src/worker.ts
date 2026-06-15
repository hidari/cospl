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
import type { ParseError } from "./types/errors";
import { flatMapResult, matchResult, type Result, success } from "./types/result";

const LICENSE_PATH = "/license.md";

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

// 成功時のレスポンス（200）。format=text はプレーンテキスト、それ以外は Markdown。
function licenseResponse({ state, view, format }: LicenseRequest): Response {
  const body = view === "ai" ? aiMD(state) : format === "text" ? humanText(state) : humanMD(state);
  const contentType =
    format === "text" ? "text/plain; charset=utf-8" : "text/markdown; charset=utf-8";
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

export default {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname !== LICENSE_PATH) {
      // /license.md 以外は静的アセットへ委譲
      return env.ASSETS.fetch(request);
    }

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
  },
} satisfies ExportedHandler<Env>;
