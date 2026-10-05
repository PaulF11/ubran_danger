const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");
const { createAdminRouter } = require("../src/routes/admin");
const { createAdminAuth } = require("../src/middleware/adminAuth");

const testEnvironment = {
  ADMIN_USERNAME: "admin-test-user",
  ADMIN_PASSWORD: "test-only-admin-password",
  ADMIN_TOKEN_SECRET: "test-only-token-signing-secret-32-characters-long",
  ADMIN_FRONTEND_ORIGIN: "https://admin.example.test",
  TRUSTED_SOURCE_HOSTS: "www.gmanetwork.com,www.abs-cbn.com",
  TRUSTED_SOURCE_SEED_URLS: "https://www.gmanetwork.com/news/",
  GEMINI_API_KEY: "test-only-provider-config-marker",
  URL: "https://urban-danger.example.test",
  INTERNAL_INGEST_KEY: "test-only-ingestion-config-marker",
};

const incidentRow = {
  id: 4,
  category: "Assault",
  city: "Taguig City",
  barangay: "Tuktukan",
  locationDescription: "Source-reported location",
  incidentDate: "2026-06-01T00:00:00",
  severity: "HIGH",
  sourceName: "Trusted publisher",
  sourceUrl: "https://trusted.example.test/report",
  sourcePublishedAt: "2026-06-02",
  verificationStatus: "VERIFIED",
  verificationMethod: "Source comparison",
  lastVerifiedAt: "2026-06-03T00:00:00Z",
  latitude: null,
  longitude: null,
  locationSourceName: null,
  locationSourceUrl: null,
  description: "Verified test incident.",
};

const runRow = {
  id: 12,
  startedAt: "2026-06-03T00:00:00Z",
  completedAt: "2026-06-03T00:01:00Z",
  status: "SUCCEEDED",
  sourcesChecked: 2,
  articlesCollected: 3,
  articlesPrefiltered: 1,
  articlesProcessed: 3,
  candidatesFound: 2,
  verifiedCount: 1,
  rejectedCount: 1,
  duplicateCount: 0,
  insertedCount: 1,
  errorCount: 0,
  durationMs: 60000,
  errorMessage: null,
};

function createDatabase() {
  return {
    async execute(sql) {
      if (sql.includes("SUM(incidents.created_at")) {
        return [[{ total: 1, recent: 1 }]];
      }
      if (sql.includes("GROUP BY incident_categories.name")) {
        return [[{ label: "Assault", count: 1 }]];
      }
      if (sql.includes("GROUP BY incidents.severity")) {
        return [[{ label: "HIGH", count: 1 }]];
      }
      if (sql.includes("GROUP BY locations.barangay")) {
        return [[{ label: "Tuktukan", count: 1 }]];
      }
      if (sql.includes("SELECT 1 AS available")) return [[{ available: 1 }]];
      if (sql.includes("FROM ingestion_runs") && sql.includes("COUNT(*)")) {
        return [[{ total: 1 }]];
      }
      if (sql.includes("FROM ingestion_runs") && sql.includes("WHERE id")) {
        return [[runRow]];
      }
      if (
        sql.includes("FROM ingestion_runs") &&
        sql.includes("ORDER BY started_at")
      ) {
        return [[runRow]];
      }
      if (sql.includes("FROM ingestion_runs")) return [[runRow]];
      if (sql.includes("SELECT COUNT(*) AS total FROM incidents")) {
        return [[{ total: 1 }]];
      }
      if (sql.includes("FROM incidents") && sql.includes("incidents.id = ?")) {
        return [[incidentRow]];
      }
      if (
        sql.includes("FROM incidents") &&
        sql.includes("ORDER BY incidents.incident_date")
      ) {
        return [[incidentRow]];
      }
      throw new Error("Unexpected test SQL");
    },
  };
}

async function withAdminServer(callback, options = {}) {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/admin",
    createAdminRouter({
      database: options.database || createDatabase(),
      environment: options.environment || testEnvironment,
    }),
  );
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

async function login(baseUrl) {
  const response = await fetch(`${baseUrl}/api/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: testEnvironment.ADMIN_USERNAME,
      password: testEnvironment.ADMIN_PASSWORD,
    }),
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  return payload.data.token;
}

test("admin login issues a short-lived token and rejects invalid credentials", async () => {
  await withAdminServer(async (baseUrl) => {
    const invalid = await fetch(`${baseUrl}/api/admin/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "wrong", password: "wrong" }),
    });
    assert.equal(invalid.status, 401);

    const response = await fetch(`${baseUrl}/api/admin/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: testEnvironment.ADMIN_USERNAME,
        password: testEnvironment.ADMIN_PASSWORD,
      }),
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.success, true);
    assert.equal(payload.data.expiresInSeconds, 1800);
    assert.equal(typeof payload.data.token, "string");
  });
});

test("admin API rejects unauthenticated requests and allows a signed session", async () => {
  await withAdminServer(async (baseUrl) => {
    const denied = await fetch(`${baseUrl}/api/admin/dashboard`);
    assert.equal(denied.status, 401);
    const token = await login(baseUrl);
    const allowed = await fetch(`${baseUrl}/api/admin/dashboard`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(allowed.status, 200);
    assert.equal((await allowed.json()).success, true);
  });
});

test("dashboard reports verified-only system statistics and latest run", async () => {
  await withAdminServer(async (baseUrl) => {
    const token = await login(baseUrl);
    const response = await fetch(`${baseUrl}/api/admin/dashboard`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const payload = await response.json();
    assert.equal(payload.data.totalVerifiedIncidents, 1);
    assert.equal(payload.data.incidentsAddedRecently, 1);
    assert.equal(payload.data.byCategory[0].label, "Assault");
    assert.equal(payload.data.bySeverity[0].label, "HIGH");
    assert.equal(payload.data.byBarangay[0].label, "Tuktukan");
    assert.equal(payload.data.lastRun.status, "SUCCEEDED");
    assert.equal(payload.data.scheduler.status, "CONFIGURED");
    assert.match(payload.data.statisticsLabel, /not official crime rates/);
  });
});

test("admin incident endpoints return only provenance-rich verified records", async () => {
  await withAdminServer(async (baseUrl) => {
    const token = await login(baseUrl);
    for (const path of ["/incidents?severity=HIGH", "/incidents/4"]) {
      const response = await fetch(`${baseUrl}/api/admin${path}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const payload = await response.json();
      assert.equal(response.status, 200);
      const incident = path.includes("?")
        ? payload.data.items[0]
        : payload.data;
      assert.equal(incident.verificationStatus, "VERIFIED");
      assert.equal(incident.latitude, null);
      assert.equal(incident.longitude, null);
      assert.equal(incident.sourceUrl, incidentRow.sourceUrl);
      assert.equal(incident.verificationMethod, "Source comparison");
    }
  });
});

test("ingestion history list and detail return persisted counters", async () => {
  await withAdminServer(async (baseUrl) => {
    const token = await login(baseUrl);
    for (const path of ["/ingestion-runs", "/ingestion-runs/12"]) {
      const response = await fetch(`${baseUrl}/api/admin${path}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const payload = await response.json();
      const run = path.endsWith("12") ? payload.data : payload.data.items[0];
      assert.equal(response.status, 200);
      assert.equal(run.articlesCollected, 3);
      assert.equal(run.verifiedCount, 1);
    }
  });
});

test("sources and system status expose configuration state without source stats or secrets", async () => {
  await withAdminServer(async (baseUrl) => {
    const token = await login(baseUrl);
    const headers = { authorization: `Bearer ${token}` };
    const [sourcesResponse, statusResponse] = await Promise.all([
      fetch(`${baseUrl}/api/admin/sources`, { headers }),
      fetch(`${baseUrl}/api/admin/system-status`, { headers }),
    ]);
    const [sourcesPayload, statusPayload] = await Promise.all([
      sourcesResponse.json(),
      statusResponse.json(),
    ]);
    assert.equal(sourcesPayload.data.length, 2);
    assert.equal(sourcesPayload.data[0].activityAvailable, false);
    assert.equal(sourcesPayload.data[0].articlesCollected, null);
    assert.equal(statusPayload.data.api.status, "OPERATIONAL");
    assert.equal(statusPayload.data.database.status, "OPERATIONAL");
    assert.equal(statusPayload.data.gemini.status, "CONFIGURED");
    const serialized = JSON.stringify([sourcesPayload, statusPayload]);
    for (const secret of [
      testEnvironment.ADMIN_PASSWORD,
      testEnvironment.ADMIN_TOKEN_SECRET,
      testEnvironment.GEMINI_API_KEY,
      testEnvironment.INTERNAL_INGEST_KEY,
    ]) {
      assert.equal(serialized.includes(secret), false);
    }
  });
});

test("admin login rate limiter blocks repeated failures", () => {
  let time = 1000;
  const auth = createAdminAuth({
    environment: testEnvironment,
    now: () => time,
  });
  const address = `rate-limit-test-${Math.random()}`;
  function attempt() {
    const response = {
      statusCode: 200,
      status(value) {
        this.statusCode = value;
        return this;
      },
      json() {
        return this;
      },
    };
    auth.login(
      {
        ip: address,
        body: { username: "wrong", password: "wrong" },
      },
      response,
    );
    return response.statusCode;
  }
  for (let index = 0; index < 5; index += 1) assert.equal(attempt(), 401);
  assert.equal(attempt(), 429);
  time += 16 * 60 * 1000;
  assert.equal(attempt(), 401);
});
