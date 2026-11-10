// File note: This file handles netlify-api-function.test.js.

const assert = require("node:assert/strict");
const test = require("node:test");
const { handler } = require("../../netlify/functions/api");

test("public Netlify API function serves the bundled Express API", async () => {
  const response = await handler(
    {
      path: "/.netlify/functions/api/health",
      rawUrl:
        "https://urbandanger.netlify.app/.netlify/functions/api/health",
      httpMethod: "GET",
      headers: {
        accept: "application/json",
        host: "urbandanger.netlify.app",
      },
      queryStringParameters: {},
      multiValueQueryStringParameters: {},
      body: null,
      isBase64Encoded: false,
    },
    {},
  );

  assert.equal(response.statusCode, 200);
  assert.equal(JSON.parse(response.body).success, true);
});
