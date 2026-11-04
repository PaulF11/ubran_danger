const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");
const jwt = require("jsonwebtoken");
const { createAdminRouter } = require("../src/routes/admin");
const {
  createAdminScanReviewService,
} = require("../src/services/adminScanReviewService");
const {
  runAutomatedIngestion,
} = require("../src/services/automatedIncidentPipeline");

const testEnvironment = {
  ADMIN_USERNAME: "scan-review-admin",
  ADMIN_PASSWORD: "test-only-admin-password",
  ADMIN_TOKEN_SECRET: "scan-review-test-token-signing-secret-over-32-bytes",
  JWT_SECRET: "scan-review-jwt-signing-secret-over-32-bytes-long",
};

function validCandidate(overrides = {}) {
  return {
    category: "Assault",
    city: "Taguig City",
    barangay: "Santa Ana",
    locationDescription: "Source-reported area in Barangay Santa Ana",
    latitude: null,
    longitude: null,
    description: "A documented TEST incident candidate for admin review.",
    severity: "HIGH",
    severityFacts: { firearmUsed: true, deaths: 0 },
    incidentDate: "2026-10-08",
    incidentTimeKnown: false,
    sourceName: "GMA News",
    sourceUrl: "https://www.gmanetwork.com/news/test-fixture/story/",
    sourcePublishedAt: "2026-10-08T10:00:00+08:00",
    sourceEvidence: {
      sourceReviewed: true,
      city: "Taguig City",
      incidentDate: "2026-10-08",
      location: "Barangay Santa Ana",
      eventFacts: "TEST fixture; no real-world incident.",
    },
    ...overrides,
  };
}

function createReviewDatabase() {
  const rows = new Map();
  let nextId = 1;
  const project = (row) => ({
    id: row.id,
    runId: row.runId,
    title: row.title,
    sourceName: row.sourceName,
    sourceUrl: row.sourceUrl,
    sourcePublishedAt: row.sourcePublishedAt,
    retrievedAt: row.retrievedAt,
    scanStatus: row.scanStatus,
    verificationStatus: row.verificationStatus,
    reasons: row.reasons,
    candidate: row.candidate,
    reviewStatus: row.reviewStatus,
    incidentId: row.incidentId,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt,
  });

  return {
    rows,
    async execute(sql, parameters = []) {
      if (sql.includes("INSERT INTO admin_scan_candidates")) {
        const [
          runId,
          ,
          sourceUrl,
          title,
          sourceName,
          publishedAt,
          retrievedAt,
          scanStatus,
          verificationStatus,
          reasons,
          candidate,
        ] = parameters;
        const id = nextId++;
        rows.set(id, {
          id,
          runId,
          sourceUrl,
          title,
          sourceName,
          sourcePublishedAt: publishedAt,
          retrievedAt,
          scanStatus,
          verificationStatus,
          reasons: JSON.parse(reasons),
          candidate: candidate ? JSON.parse(candidate) : null,
          reviewStatus: "PENDING",
          incidentId: null,
          reviewedBy: null,
          reviewedAt: null,
        });
        return [{ insertId: id, affectedRows: 1 }];
      }
      if (sql.includes("FROM admin_scan_candidates")) {
        if (sql.includes("WHERE ingestion_run_id = ?")) {
          return [
            [...rows.values()]
              .filter((row) => String(row.runId) === String(parameters[0]))
              .map(project),
          ];
        }
        const row = rows.get(Number(parameters[0]));
        return [[...(row ? [project(row)] : [])]];
      }
      if (sql.includes("UPDATE admin_scan_candidates")) {
        if (sql.includes("SET review_status = 'APPROVING'")) {
          const row = rows.get(Number(parameters[0]));
          if (
            !row ||
            row.reviewStatus !== "PENDING" ||
            row.scanStatus !== "VERIFIED"
          ) {
            return [{ affectedRows: 0 }];
          }
          row.reviewStatus = "APPROVING";
          return [{ affectedRows: 1 }];
        }
        const id = Number(parameters[parameters.length - 1]);
        const row = rows.get(id);
        if (!row) return [{ affectedRows: 0 }];
        if (sql.includes("SET review_status = 'REJECTED'")) {
          row.reviewStatus = "REJECTED";
          row.reviewedBy = parameters[0];
          row.reviewedAt = "2026-10-08T12:00:00Z";
        } else if (sql.includes("SET scan_status = ?")) {
          [row.scanStatus, row.verificationStatus] = parameters;
          row.reasons = JSON.parse(parameters[2]);
          row.reviewStatus = "PENDING";
        } else if (sql.includes("SET review_status = ?, scan_status = ?")) {
          [row.reviewStatus, row.scanStatus] = parameters;
        } else if (sql.includes("SET review_status = 'APPROVED'")) {
          [row.incidentId, row.reviewedBy, row.reviewedAt] = parameters;
          row.reviewStatus = "APPROVED";
        } else if (sql.includes("SET review_status = 'PENDING'")) {
          row.reviewStatus = "PENDING";
        }
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unexpected fake database query: ${sql}`);
    },
  };
}

async function withAdminServer(reviewService, callback) {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/admin",
    createAdminRouter({
      database: {
        async execute() {
          return [[]];
        },
      },
      environment: testEnvironment,
      scanService: {
        async start() {
          return { status: "RUNNING" };
        },
      },
      reviewService,
      dataService: {
        async getDashboard() {
          return {};
        },
        async getIncidents() {
          return { items: [] };
        },
        async getIncident() {
          return null;
        },
        async getIngestionRun() {
          return null;
        },
        async getIngestionRuns() {
          return { items: [] };
        },
        async getSources() {
          return [];
        },
        async getSystemStatus() {
          return {};
        },
      },
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
  assert.equal(response.status, 200);
  return (await response.json()).data.token;
}

test("scan review store preserves source and extracted details", async () => {
  const database = createReviewDatabase();
  const service = createAdminScanReviewService({ database });
  const candidate = validCandidate();

  await service.saveRunCandidates(22, [
    {
      source: candidate.sourceUrl,
      sourceUrl: candidate.sourceUrl,
      sourceName: candidate.sourceName,
      title: "TEST report title",
      sourcePublishedAt: candidate.sourcePublishedAt,
      retrievedAt: "2026-10-08T04:00:00Z",
      status: "VERIFIED",
      verified: true,
      reasons: [],
      candidate,
    },
  ]);

  const [result] = await service.listRunCandidates(22);
  assert.equal(result.title, "TEST report title");
  assert.equal(result.sourceName, "GMA News");
  assert.equal(result.sourceUrl, candidate.sourceUrl);
  assert.equal(result.sourcePublishedAt, candidate.sourcePublishedAt);
  assert.equal(
    result.candidate.locationDescription,
    candidate.locationDescription,
  );
  assert.equal(result.reviewStatus, "PENDING");
});

test("empty scan candidate results are returned as a successful empty list", async () => {
  const database = createReviewDatabase();
  const reviewService = createAdminScanReviewService({ database });

  await withAdminServer(reviewService, async (baseUrl) => {
    const token = await login(baseUrl);
    const list = await fetch(`${baseUrl}/api/admin/scan-candidates?runId=24`, {
      headers: { authorization: `Bearer ${token}` },
    });

    assert.equal(list.status, 200);
    assert.deepEqual(await list.json(), {
      success: true,
      data: [],
    });
  });
});

test("scan candidate database failures remain explicit server errors", async () => {
  const reviewService = createAdminScanReviewService({
    database: {
      async execute() {
        throw new Error("database failure");
      },
    },
  });

  await withAdminServer(reviewService, async (baseUrl) => {
    const token = await login(baseUrl);
    const response = await fetch(
      `${baseUrl}/api/admin/scan-candidates?runId=24`,
      { headers: { authorization: `Bearer ${token}` } },
    );

    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      success: false,
      message: "Admin data is temporarily unavailable.",
    });
  });
});

test("admin approval re-verifies then persists only the approved candidate with NULL coordinates", async () => {
  const database = createReviewDatabase();
  const candidate = validCandidate();
  let persisted;
  const service = createAdminScanReviewService({
    database,
    sourceUrlCheck: async (url) => ({ exists: url === candidate.sourceUrl }),
    persister: async (value) => {
      persisted = value;
      return { status: "INSERTED", id: 731 };
    },
  });
  await service.saveRunCandidates(22, [
    {
      sourceUrl: candidate.sourceUrl,
      status: "VERIFIED",
      candidate,
    },
  ]);

  const result = await service.approveCandidate(1, "admin-1");
  assert.deepEqual(result, {
    id: 1,
    incidentId: 731,
    reviewStatus: "APPROVED",
    verificationStatus: "VERIFIED",
  });
  assert.equal(persisted.latitude, null);
  assert.equal(persisted.longitude, null);
  assert.equal((await service.listRunCandidates(22))[0].incidentId, 731);
});

test("reject marks the scan report rejected without invoking incident persistence", async () => {
  const database = createReviewDatabase();
  let persistenceCalls = 0;
  const service = createAdminScanReviewService({
    database,
    persister: async () => {
      persistenceCalls += 1;
      return { status: "INSERTED", id: 99 };
    },
  });
  await service.saveRunCandidates(22, [
    {
      sourceUrl: "https://www.gmanetwork.com/news/test-fixture/story/",
      status: "PENDING_REVIEW",
      candidate: validCandidate(),
    },
  ]);

  assert.deepEqual(await service.rejectCandidate(1, "admin-1"), {
    id: 1,
    reviewStatus: "REJECTED",
  });
  assert.equal(
    (await service.listRunCandidates(22))[0].reviewStatus,
    "REJECTED",
  );
  assert.equal(persistenceCalls, 0);
});

test("invalid candidates cannot be approved and duplicates are not inserted", async () => {
  const invalidDatabase = createReviewDatabase();
  let invalidPersists = 0;
  const invalidService = createAdminScanReviewService({
    database: invalidDatabase,
    persister: async () => {
      invalidPersists += 1;
      return { status: "INSERTED", id: 1 };
    },
  });
  await invalidService.saveRunCandidates(22, [
    {
      sourceUrl: "https://www.gmanetwork.com/news/test-fixture/story/",
      status: "REJECTED",
      candidate: validCandidate({ city: "Makati City" }),
    },
  ]);
  await assert.rejects(invalidService.approveCandidate(1, "admin-1"), {
    code: "CANDIDATE_NOT_APPROVABLE",
  });
  assert.equal(invalidPersists, 0);

  const duplicateDatabase = createReviewDatabase();
  let duplicatePersists = 0;
  const duplicateService = createAdminScanReviewService({
    database: duplicateDatabase,
    sourceUrlCheck: async () => ({ exists: true }),
    persister: async () => {
      duplicatePersists += 1;
      return { status: "DUPLICATE", inserted: false };
    },
  });
  await duplicateService.saveRunCandidates(22, [
    {
      sourceUrl: validCandidate().sourceUrl,
      status: "VERIFIED",
      candidate: validCandidate(),
    },
  ]);
  const duplicate = await duplicateService.approveCandidate(1, "admin-1");
  assert.equal(duplicate.reviewStatus, "DUPLICATE");
  assert.equal(duplicatePersists, 1);
  assert.equal(
    (await duplicateService.listRunCandidates(22))[0].incidentId,
    null,
  );
});

test("scan candidates and approval/rejection actions require admin authentication", async () => {
  let actions = 0;
  const reviewService = {
    async listRunCandidates() {
      actions += 1;
      return [];
    },
    async approveCandidate() {
      actions += 1;
      return { reviewStatus: "APPROVED" };
    },
    async rejectCandidate() {
      actions += 1;
      return { reviewStatus: "REJECTED" };
    },
  };

  await withAdminServer(reviewService, async (baseUrl) => {
    const denied = await fetch(`${baseUrl}/api/admin/scan-candidates?runId=2`);
    assert.equal(denied.status, 401);
    assert.equal(actions, 0);

    const token = await login(baseUrl);
    const list = await fetch(`${baseUrl}/api/admin/scan-candidates?runId=2`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(list.status, 200);
    assert.equal(actions, 1);

    const unconfirmed = await fetch(
      `${baseUrl}/api/admin/scan-candidates/1/approve`,
      { method: "POST", headers: { authorization: `Bearer ${token}` } },
    );
    assert.equal(unconfirmed.status, 409);
    assert.equal(actions, 1);

    const approved = await fetch(
      `${baseUrl}/api/admin/scan-candidates/1/approve`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ confirmed: true }),
      },
    );
    assert.equal(approved.status, 200);
    assert.equal(actions, 2);

    const rejected = await fetch(
      `${baseUrl}/api/admin/scan-candidates/1/reject`,
      { method: "POST", headers: { authorization: `Bearer ${token}` } },
    );
    assert.equal(rejected.status, 200);
    assert.equal(actions, 3);
  });
});

test("manual review-only pipeline records candidates without incident persistence", async () => {
  const candidate = validCandidate();
  let persisted = 0;
  let savedRun;
  const summary = await runAutomatedIngestion({
    runId: 22,
    persistVerifiedCandidates: false,
    collector: async () => [
      {
        sourceName: "GMA News",
        title: "TEST-only scanned report",
        url: candidate.sourceUrl,
        publishedAt: candidate.sourcePublishedAt,
        retrievedAt: "2026-10-08T04:00:00Z",
        content: "TEST-only fixture article content.",
      },
    ],
    processedSources: {
      async findProcessed() {
        return new Set();
      },
      async recordProcessed() {},
    },
    extractor: async (_content, metadata) => ({
      ...candidate,
      sourceName: metadata.sourceName,
      sourceUrl: metadata.sourceUrl,
      sourcePublishedAt: metadata.sourcePublishedAt,
    }),
    verifier: async (value) => ({
      verified: true,
      status: "VERIFIED",
      normalized: value,
    }),
    persister: async () => {
      persisted += 1;
      return { status: "INSERTED", id: 1 };
    },
    reviewStore: {
      async saveRunCandidates(runId, reports) {
        savedRun = { runId, reports };
      },
    },
  });

  assert.equal(summary.verifiedCandidates, 1);
  assert.equal(summary.insertedIncidents, 0);
  assert.equal(summary.results[0].persistence, "PENDING_REVIEW");
  assert.equal(persisted, 0);
  assert.equal(savedRun.runId, 22);
  assert.equal(savedRun.reports[0].title, "TEST-only scanned report");
  assert.equal(savedRun.reports[0].sourceName, "GMA News");
  assert.equal(savedRun.reports[0].sourceUrl, candidate.sourceUrl);
});

test("authenticated non-admin users cannot approve or reject scan candidates", async () => {
  let actions = 0;
  const reviewService = {
    async approveCandidate() {
      actions += 1;
      return { reviewStatus: "APPROVED" };
    },
    async rejectCandidate() {
      actions += 1;
      return { reviewStatus: "REJECTED" };
    },
    async listRunCandidates() {
      return [];
    },
  };
  const userToken = jwt.sign({ role: "USER" }, testEnvironment.JWT_SECRET, {
    algorithm: "HS256",
    subject: "user-22",
    expiresIn: "5m",
  });

  await withAdminServer(reviewService, async (baseUrl) => {
    for (const [path, body] of [
      ["/approve", { confirmed: true }],
      ["/reject", undefined],
    ]) {
      const response = await fetch(
        `${baseUrl}/api/admin/scan-candidates/1${path}`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${userToken}`,
            ...(body ? { "content-type": "application/json" } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        },
      );
      assert.equal(response.status, 403);
    }
  });

  assert.equal(actions, 0);
});
