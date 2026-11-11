// File note: This file handles local-preview-proxy.js.

const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const path = require("node:path");

const HOST = "127.0.0.1";
const PORT = Number(process.env.LOCAL_PREVIEW_PORT || 5190);
const BUILD_ROOT = path.resolve(__dirname, "..", "build", "web");
const API_ORIGIN = "https://urbandanger.netlify.app";
const LOCAL_ORIGIN = `http://${HOST}:${PORT}`;
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function proxyApi(req, res, requestUrl) {
  const upstreamUrl = new URL(requestUrl.pathname + requestUrl.search, API_ORIGIN);
  const headers = { ...req.headers };
  for (const header of HOP_BY_HOP_HEADERS) {
    delete headers[header];
  }
  delete headers.host;

  const upstream = https.request(
    {
      hostname: upstreamUrl.hostname,
      method: req.method,
      path: upstreamUrl.pathname + upstreamUrl.search,
      headers,
      timeout: 30_000,
    },
    (upstreamResponse) => {
      const responseHeaders = { ...upstreamResponse.headers };
      for (const header of HOP_BY_HOP_HEADERS) {
        delete responseHeaders[header];
      }
      res.writeHead(upstreamResponse.statusCode || 502, responseHeaders);
      upstreamResponse.pipe(res);
    },
  );

  upstream.on("timeout", () => upstream.destroy(new Error("Upstream timed out")));
  upstream.on("error", (error) => {
    if (!res.headersSent) {
      res.writeHead(error.message === "Upstream timed out" ? 504 : 502, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      });
    }
    if (!res.writableEnded) {
      res.end(JSON.stringify({ error: "The production API proxy failed." }));
    }
  });
  req.pipe(upstream);
}

function serveBuild(req, res, requestUrl) {
  let pathname;
  try {
    pathname = decodeURIComponent(requestUrl.pathname);
  } catch {
    res.writeHead(400).end("Bad request");
    return;
  }

  const requestedPath = path.resolve(BUILD_ROOT, `.${pathname}`);
  if (
    requestedPath !== BUILD_ROOT &&
    !requestedPath.startsWith(BUILD_ROOT + path.sep)
  ) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  let filePath = requestedPath;
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    if (path.extname(pathname)) {
      res.writeHead(404).end("Not found");
      return;
    }
    filePath = path.join(BUILD_ROOT, "index.html");
  }

  let contents;
  try {
    contents = fs.readFileSync(filePath);
  } catch (error) {
    console.error(`Unable to read preview asset ${path.basename(filePath)}:`, error.message);
    res.writeHead(500).end("Unable to read preview asset");
    return;
  }

  if (path.basename(filePath) === "main.dart.js") {
    const javascript = contents.toString("utf8");
    if (!javascript.includes(API_ORIGIN)) {
      console.error("The built Flutter bundle does not contain the expected production API origin.");
      res.writeHead(500).end("Preview bundle API origin could not be verified");
      return;
    }
    const requestOrigin =
      req.headers.host === `localhost:${PORT}`
        ? `http://localhost:${PORT}`
        : LOCAL_ORIGIN;
    contents = Buffer.from(javascript.replaceAll(API_ORIGIN, requestOrigin));
  }

  res.writeHead(200, {
    "content-type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
    "content-length": contents.length,
    "cache-control": "no-cache",
  });
  if (req.method === "HEAD") {
    res.end();
  } else {
    res.end(contents);
  }
}

if (!fs.existsSync(path.join(BUILD_ROOT, "index.html"))) {
  throw new Error(`Flutter Web build not found at ${BUILD_ROOT}`);
}

const server = http.createServer((req, res) => {
  let requestUrl;
  try {
    requestUrl = new URL(req.url, LOCAL_ORIGIN);
  } catch {
    res.writeHead(400).end("Bad request");
    return;
  }

  if (requestUrl.pathname === "/api" || requestUrl.pathname.startsWith("/api/")) {
    proxyApi(req, res, requestUrl);
  } else {
    serveBuild(req, res, requestUrl);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Local Urban Danger preview: ${LOCAL_ORIGIN}`);
  console.log(`API proxy target: ${API_ORIGIN}/api`);
});

server.on("error", (error) => {
  console.error("Unable to start the local preview:", error.message);
  process.exitCode = 1;
});
