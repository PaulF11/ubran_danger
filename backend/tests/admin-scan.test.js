const test = require("node:test");
const assert = require("node:assert/strict");
const { createAdminScanService } = require("../src/services/adminScanService");

test("production manual scan triggers the existing background function privately", async () => {
  let request;
  const secret = "test-only-internal-trigger-secret";
  const service = createAdminScanService({
    database: {
      async execute() {
        return [[{ id: 41 }]];
      },
    },
    environment: {
      NODE_ENV: "production",
      URL: "https://urban-danger.example.test",
      INTERNAL_INGEST_KEY: secret,
    },
    fetchImpl: async (url, options) => {
      request = { url: url.href, options };
      return { status: 202 };
    },
  });

  const result = await service.start();

  assert.deepEqual(result, { status: "RUNNING", afterRunId: 41 });
  assert.equal(
    request.url,
    "https://urban-danger.example.test/.netlify/functions/ingest-background",
  );
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers.authorization, `Bearer ${secret}`);
  assert.equal(request.options.headers["x-ingestion-run-source"], "MANUAL");
  assert.equal(JSON.stringify(result).includes(secret), false);
});

test("local manual scan invokes the existing run service and returns its counters", async () => {
  let options;
  const summary = {
    articlesScanned: 2,
    geminiRequests: 1,
    verifiedCandidates: 1,
  };
  const service = createAdminScanService({
    database: {
      async execute() {
        return [[]];
      },
    },
    environment: { NODE_ENV: "development" },
    runManual: async (value) => {
      options = value;
      return { status: "COMPLETED", result: summary };
    },
    runPipeline: async () => summary,
  });

  const result = await service.start();

  assert.equal(result.status, "COMPLETED");
  assert.equal(result.afterRunId, 0);
  assert.equal(result.summary, summary);
  assert.equal(options.runPipeline instanceof Function, true);
});

test("production manual scan fails closed when its server-only trigger key is absent", async () => {
  const service = createAdminScanService({
    database: {
      async execute() {
        return [[]];
      },
    },
    environment: {
      NODE_ENV: "production",
      URL: "https://urban-danger.example.test",
    },
    fetchImpl: async () => assert.fail("Must not trigger without a key."),
  });

  await assert.rejects(service.start(), /manual_scan_unavailable/);
});
