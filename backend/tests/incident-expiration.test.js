const test = require("node:test");
const assert = require("node:assert/strict");
const {
  expirationDate,
  incidentDateOnly,
  activeIncidentDateSql,
  isIncidentExpirationEnabled,
  isIncidentExpired,
  manilaDate,
} = require("../src/services/incidentExpirationPolicy");
const {
  EXPIRATION_LOCK_NAME,
  createIncidentExpirationService,
} = require("../src/services/incidentExpirationService");
const {
  createExpirationHandler,
} = require("../../netlify/functions/incident-expiration");
const {
  insertVerifiedCandidate,
} = require("../src/services/incidentPersistenceService");

test("incident expiration uses the Manila calendar anniversary", () => {
  assert.equal(expirationDate("2025-11-15"), "2026-11-15");
  assert.equal(
    isIncidentExpired("2025-11-15", new Date("2026-11-14T15:59:59Z")),
    false,
  );
  assert.equal(
    isIncidentExpired("2025-11-15", new Date("2026-11-14T16:00:00Z")),
    true,
  );
  assert.equal(manilaDate(new Date("2026-11-14T16:00:00Z")), "2026-11-15");
});

test("calendar expiration clamps leap-day anniversaries and honors offsets", () => {
  assert.equal(expirationDate("2024-02-29"), "2025-02-28");
  assert.equal(
    incidentDateOnly("2025-11-15T23:30:00-02:00"),
    "2025-11-16",
  );
  assert.equal(expirationDate("2025-02-30"), null);
  assert.equal(isIncidentExpired("not-a-date", new Date("2030-01-01")), false);
});

test("expiration visibility and deletion require both opt-in flags", () => {
  assert.equal(
    isIncidentExpirationEnabled({
      INCIDENT_EXPIRATION_ENABLED: "true",
    }),
    false,
  );
  assert.equal(
    activeIncidentDateSql({
      INCIDENT_EXPIRATION_ENABLED: "true",
    }),
    "1 = 1",
  );
  assert.equal(
    activeIncidentDateSql({
      INCIDENT_EXPIRATION_ENABLED: "true",
      ENABLE_INCIDENT_PERMANENT_EXPIRATION: "true",
    }),
    "DATE_ADD(DATE(incidents.incident_date), INTERVAL 12 MONTH) > DATE(UTC_TIMESTAMP() + INTERVAL 8 HOUR)",
  );
});

test("expired and invalid candidates cannot be persisted", async () => {
  let connectionRequested = false;
  const dbPool = {
    async getConnection() {
      connectionRequested = true;
      throw new Error("Persistence should not be reached.");
    },
  };
  const candidate = {
    incidentDate: "2025-11-14",
  };
  const expired = await insertVerifiedCandidate(candidate, {
    dbPool,
    now: () => new Date("2026-11-14T16:00:00Z"),
  });
  const invalid = await insertVerifiedCandidate(
    { incidentDate: "2025-02-30" },
    { dbPool },
  );

  assert.deepEqual(expired, { status: "EXPIRED", inserted: false });
  assert.deepEqual(invalid, { status: "INVALID_DATE", inserted: false });
  assert.equal(connectionRequested, false);
});

test("cleanup deletes only expired incident and candidate records transactionally", async () => {
  const sqlCalls = [];
  const loggerCalls = [];
  const candidateRows = [
    { id: 1, candidate: { incidentDate: "2025-11-14" } },
    { id: 2, candidate: { incidentDate: "2026-10-20" } },
    { id: 3, candidate: { incidentDate: "invalid" } },
  ];
  let incidentBatchRead = false;
  let transactionCount = 0;
  const connection = {
    async query(sql, parameters) {
      if (sql.includes("GET_LOCK")) {
        assert.equal(parameters[0], EXPIRATION_LOCK_NAME);
        return [[{ acquired: 1 }]];
      }
      if (sql.includes("RELEASE_LOCK")) return [[{ released: 1 }]];
      throw new Error(`Unexpected query: ${sql}`);
    },
    async execute(sql, parameters = []) {
      sqlCalls.push({ sql, parameters });
      if (sql.includes("SELECT id FROM incidents")) {
        return [[{ id: 99 }]];
      }
      if (sql.includes("SELECT id, candidate_json AS candidate")) {
        return [
          candidateRows.filter(
            ({ id }) =>
              id > Number(parameters[0]) &&
              id <= Number(parameters[0]) + Number(parameters[1]),
          ),
        ];
      }
      if (sql.startsWith("DELETE FROM admin_scan_candidates WHERE id IN")) {
        return [{ affectedRows: parameters.length }];
      }
      if (
        sql.includes("SELECT id, location_id AS locationId") &&
        !incidentBatchRead
      ) {
        incidentBatchRead = true;
        assert.equal(parameters[0], "2026-11-15");
        return [[{ id: 40, locationId: 7 }]];
      }
      if (sql.includes("SELECT id, location_id AS locationId")) return [[]];
      if (sql.includes("DELETE FROM admin_scan_candidates") && sql.includes("WHERE incident_id IN")) {
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith("DELETE FROM incidents")) {
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith("DELETE FROM locations")) {
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unexpected execution: ${sql}`);
    },
    async beginTransaction() {
      transactionCount += 1;
    },
    async commit() {},
    async rollback() {},
    release() {},
  };
  const service = createIncidentExpirationService({
    database: { getConnection: async () => connection },
    now: () => new Date("2026-11-14T16:00:00Z"),
    batchSize: 2,
    logger: {
      info: (message) => loggerCalls.push(message),
      warn: (message) => loggerCalls.push(message),
      error: (message) => loggerCalls.push(message),
    },
  });

  const result = await service.run();

  assert.equal(result.status, "COMPLETED");
  assert.equal(result.deletedIncidents, 1);
  assert.equal(result.deletedScanCandidates, 1);
  assert.deepEqual(result.invalidIncidentIds, [99]);
  assert.deepEqual(result.invalidCandidateIds, [3]);
  assert.ok(transactionCount >= 3);
  assert.ok(
    sqlCalls.some(({ sql }) => sql.startsWith("DELETE FROM incidents")),
  );
  assert.ok(
    sqlCalls.some(({ sql }) => sql.startsWith("DELETE FROM locations")),
  );
  assert.ok(
    sqlCalls.some(({ sql }) =>
      sql.includes("NOT EXISTS") && sql.includes("incidents.location_id"),
    ),
  );
  assert.ok(
    loggerCalls.some((message) => message.includes("review_required")),
  );
});

test("concurrent cleanup skips without opening a deletion transaction", async () => {
  let transactions = 0;
  const connection = {
    async query() {
      return [[{ acquired: 0 }]];
    },
    async beginTransaction() {
      transactions += 1;
    },
    release() {},
  };
  const service = createIncidentExpirationService({
    database: { getConnection: async () => connection },
  });

  assert.deepEqual(await service.run(), {
    status: "SKIPPED",
    reason: "already_running",
  });
  assert.equal(transactions, 0);
});

test("scheduled deletion is disabled unless explicitly enabled", async () => {
  let calls = 0;
  const handler = createExpirationHandler({
    environment: { INCIDENT_EXPIRATION_ENABLED: "false" },
    logger: { info() {} },
    expirationService: {
      async run() {
        calls += 1;
        return { status: "COMPLETED" };
      },
    },
  });

  test("scheduled deletion requires both opt-in flags", async () => {
    let calls = 0;
    const handler = createExpirationHandler({
      environment: {
        INCIDENT_EXPIRATION_ENABLED: "true",
      },
      logger: { info() {} },
      expirationService: {
        async run() {
          calls += 1;
          return { status: "COMPLETED" };
        },
      },
    });

    const response = await handler();
    assert.equal(response.statusCode, 200);
    assert.equal(calls, 0);
  });

  const response = await handler();
  assert.equal(response.statusCode, 200);
  assert.equal(calls, 0);
});
