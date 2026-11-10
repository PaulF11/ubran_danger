// File note: This file handles apiProxy.js.

const PUBLIC_API_BASE_URL = "https://urbandanger.netlify.app";
const FUNCTION_PATH = "/.netlify/functions/api-proxy";

function requestUrl(event) {
  const rawUrl = event.rawUrl ? new URL(event.rawUrl) : null;
  const pathname = event.path || rawUrl?.pathname || "";
  const functionPathIndex = pathname.indexOf(FUNCTION_PATH);
  let apiPath;

  if (pathname === "/api" || pathname.startsWith("/api/")) {
    apiPath = pathname;
  } else if (
    functionPathIndex >= 0 &&
    (pathname.length === functionPathIndex + FUNCTION_PATH.length ||
      pathname[functionPathIndex + FUNCTION_PATH.length] === "/")
  ) {
    apiPath = `/api${pathname.slice(functionPathIndex + FUNCTION_PATH.length)}`;
  } else {
    throw new Error("invalid_proxy_path");
  }

  const url = new URL(apiPath, `${PUBLIC_API_BASE_URL}/`);
  if (
    url.origin !== PUBLIC_API_BASE_URL ||
    (url.pathname !== "/api" && !url.pathname.startsWith("/api/"))
  ) {
    throw new Error("invalid_proxy_path");
  }
  if (rawUrl?.search) {
    url.search = rawUrl.search;
  } else if (typeof event.rawQuery === "string" && event.rawQuery) {
    url.search = `?${event.rawQuery}`;
  } else if (event.multiValueQueryStringParameters) {
    for (const [key, values] of Object.entries(
      event.multiValueQueryStringParameters,
    )) {
      for (const value of values || []) url.searchParams.append(key, value);
    }
  } else if (event.queryStringParameters) {
    for (const [key, value] of Object.entries(event.queryStringParameters)) {
      if (value !== null && value !== undefined) {
        url.searchParams.set(key, value);
      }
    }
  }
  return url;
}

function createProxyHandler({ fetchImpl = fetch, timeoutMs = 25000 } = {}) {
  return async (event) => {
    try {
      const headers = {};
      for (const name of ["accept", "authorization", "content-type"]) {
        const value =
          event.headers?.[name] ||
          event.headers?.[name.toUpperCase()] ||
          event.headers?.[
            name.replace(/(^|-)([a-z])/g, (_, prefix, letter) =>
              `${prefix}${letter.toUpperCase()}`,
            )
          ];
        if (value) headers[name] = value;
      }

      const method = String(event.httpMethod || "GET").toUpperCase();
      const body =
        method === "GET" || method === "HEAD" || event.body == null
          ? undefined
          : event.isBase64Encoded
            ? Buffer.from(event.body, "base64")
            : event.body;
      const response = await fetchImpl(requestUrl(event), {
        method,
        headers,
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
      const responseHeaders = {};
      for (const name of ["content-type", "cache-control"]) {
        const value = response.headers.get(name);
        if (value) responseHeaders[name] = value;
      }
      return {
        statusCode: response.status,
        headers: responseHeaders,
        body: method === "HEAD" ? "" : await response.text(),
      };
    } catch {
      return {
        statusCode: 502,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          success: false,
          message: "The API is temporarily unavailable.",
        }),
      };
    }
  };
}

module.exports = { createProxyHandler, PUBLIC_API_BASE_URL };
