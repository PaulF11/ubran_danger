// File note: This file handles netlify-api-proxy.test.js.
const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createProxyHandler,
  PUBLIC_API_BASE_URL,
} = require("../../netlify/lib/apiProxy");

test("admin API proxy forwards API requests to the fixed public site", async () => {
  let request;
  const handler = createProxyHandler({
    timeoutMs: 10,
    fetchImpl: async (url, options) => {
      request = { url: String(url), ...options };
      return new Response('{"success":true}', {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  const response = await handler({
    path: "/.netlify/functions/api-proxy/categories",
    rawUrl: "https://frontend.example/.netlify/functions/api-proxy/categories?active=true",
    httpMethod: "GET",
    headers: { accept: "application/json" },
  });

  assert.equal(PUBLIC_API_BASE_URL, "https://urbandangerintel.netlify.app");
  assert.equal(
    request.url,
    "https://urbandangerintel.netlify.app/api/categories?active=true",
  );
  assert.equal(request.method, "GET");
  assert.equal(response.statusCode, 200);
  assert.equal(response.body, '{"success":true}');
});

test("admin API proxy preserves authorization, method, and request body", async () => {
  let request;
  const handler = createProxyHandler({
    timeoutMs: 10,
    fetchImpl: async (url, options) => {
      request = { url: String(url), ...options };
      return new Response('{"success":true}', {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  await handler({
    path: "/.netlify/functions/api-proxy/admin/login",
    rawUrl: "https://frontend.example/.netlify/functions/api-proxy/admin/login",
    httpMethod: "POST",
    headers: {
      Authorization: "Bearer session-token",
      "Content-Type": "application/json",
    },
    body: '{"username":"admin"}',
  });

  assert.equal(
    request.url,
    "https://urbandangerintel.netlify.app/api/admin/login",
  );
  assert.equal(request.method, "POST");
  assert.equal(request.headers.authorization, "Bearer session-token");
  assert.equal(request.headers["content-type"], "application/json");
  assert.equal(request.body, '{"username":"admin"}');
});

test("admin API proxy rejects paths outside its fixed API route", async () => {
  let requested = false;
  const handler = createProxyHandler({
    timeoutMs: 10,
    fetchImpl: async () => {
      requested = true;
      return new Response("unexpected");
    },
  });

  const response = await handler({
    path: "/.netlify/functions/api-proxy/../../other",
    httpMethod: "GET",
  });

  assert.equal(requested, false);
  assert.equal(response.statusCode, 502);
});
