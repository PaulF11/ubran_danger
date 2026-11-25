const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");
const { createAdminRouter } = require("../src/routes/admin");
const {
  createIngestionScanResultService,
} = require("../src/services/ingestionScanResultService");

const environment = {
  ADMIN_USERNAME: "scan-test-admin",
  ADMIN_PASSWORD: "test-only-admin-password",
  ADMIN_TOKEN_SECRET: "scan-test-token-signing-secret-over-32-bytes",
};

function createDatabase() {
  const rows = new Map();
  let nextId = 1;
  return {
    rows,
    async execute(sql, parameters = []) {
      if (sql.includes("INSERT INTO ingestion_scan_results")) {
        const [
          runId,
          ,
          sourceUrl,
          title,
          sourceName,
          sourcePublishedAt,
          retrievedAt,
          scanStatus,
          verificationStatus,
          persistenceStatus,
          retryable,
          reasons,
          candidate,
        ] = parameters;
        const row = {
          id: nextId++,
          runId,
          sourceUrl,
          title,
          sourceName,
          sourcePublishedAt,
          retrievedAt,
          scanStatus,
          verificationStatus,
          persistenceStatus,
          retryable,
          reasons: JSON.parse(reasons),
          candidate: candidate ? JSON.parse(candidate) : null,
        };
        rows.set(row.id, row);
        return [{ insertId: row.id, affectedRows: 1 }];
      }
      if (sql.includes("FROM ingestion_scan_results")) {
        return [
          [...rows.values()]
            .filter((row) => String(row.runId) === String(parameters[0]))
            .map((row) => ({ ...row })),
        ];
      }
      throw new Error(`Unexpected fake database query: ${sql}`);
    },
  };
}

async function withAdminServer(database, callback) {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/admin",
    createAdminRouter({
      database,
      environment,
      scanService: { async start() { return { status: "RUNNING" }; } },
      dataService: {
        async getDashboard() { return {}; },
        async getIncidents() { return { items: [] }; },
        async getIncident() { return null; },
        async getIngestionRun() { return null; },
        async getIngestionRuns() { return { items: [] }; },
        async getSources() { return []; },
        async getSystemStatus() { return {}; },
      },
    }),
  );
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

test("scan result records preserve statuses, retry state, and extracted details", async () => {
  const database = createDatabase();
  const service = createIngestionScanResultService({ database });

  await service.saveRunResults(22, [
    {
      source: "https://trusted.example.test/incident",
      sourceUrl: "https://trusted.example.test/incident",
      title: "Test incident report",
      sourceName: "Trusted publisher",
      status: "RATE_LIMITED",
      verificationStatus: "RATE_LIMITED",
      retryable: true,
      reasons: ["Provider rate limited the request."],
      candidate: { category: "Theft" },
    },
  ]);

  const [result] = await service.listRunResults(22);
  assert.equal(result.scanStatus, "RATE_LIMITED");
  assert.equal(result.verificationStatus, "RATE_LIMITED");
  assert.equal(result.retryable, true);
  assert.equal(result.sourceName, "Trusted publisher");
  assert.deepEqual(result.candidate, { category: "Theft" });
});

test("scan results are authenticated and administrator approval endpoints are absent", async () => {
  const database = createDatabase();
  const service = createIngestionScanResultService({ database });
  await service.saveRunResults(22, [{
    source: "https://trusted.example.test/incident",
    status: "INSERTED",
    verificationStatus: "VERIFIED",
    persistence: "INSERTED",
  }]);

  await withAdminServer(database, async (baseUrl) => {
    const unauthenticated = await fetch(
      `${baseUrl}/api/admin/scan-results?runId=22`,
    );
    assert.equal(unauthenticated.status, 401);

    const login = await fetch(`${baseUrl}/api/admin/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: environment.ADMIN_USERNAME,
        password: environment.ADMIN_PASSWORD,
      }),
    });
    const { data } = await login.json();
    const headers = { authorization: `Bearer ${data.token}` };
    const results = await fetch(
      `${baseUrl}/api/admin/scan-results?runId=22`,
      { headers },
    );
    assert.equal(results.status, 200);
    assert.equal((await results.json()).data[0].persistenceStatus, "INSERTED");

    const obsoleteReviewRequests = [
      fetch(`${baseUrl}/api/admin/scan-candidates?runId=22`, { headers }),
      fetch(`${baseUrl}/api/admin/scan-candidates/1/approve`, {
        method: "POST",
        headers,
      }),
      fetch(`${baseUrl}/api/admin/scan-candidates/1/reject`, {
        method: "POST",
        headers,
      }),
    ];
    const obsoleteResponses = await Promise.all(obsoleteReviewRequests);
    assert.deepEqual(
      obsoleteResponses.map((response) => response.status),
      [404, 404, 404],
    );
  });
});
