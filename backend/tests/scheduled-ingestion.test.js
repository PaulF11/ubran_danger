// File note: This file handles scheduled-ingestion.test.js.

const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const scheduledTrigger = require("../../netlify/functions/scheduled-ingestion");
const background = require("../../netlify/functions/ingest-background");
const {
  LOCK_NAME,
  runScheduledIngestion,
  validateIngestionEnvironment,
} = require("../src/services/scheduledIngestionService");

const validEnvironment = {
  DB_HOST: "db.example.test",
  DB_PORT: "3306",
  DB_USER: "service-user",
  DB_PASSWORD: "private-db-password",
  DB_NAME: "urban_danger",
  GEMINI_API_KEY: "private-gemini-key",
  INTERNAL_INGEST_KEY: "private-trigger-key",
  URL: "https://urban-danger.example.net",
};

function createLogger() {
  const entries = [];
  return {
    entries,
    info: (message) => entries.push(message),
    warn: (message) => entries.push(message),
    error: (message) => entries.push(message),
  };
}

function createDatabasePool({ acquired = 1 } = {}) {
  const calls = [];
  let released = 0;
  let insertedId = 0;
  const connection = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.includes("INSERT INTO ingestion_runs")) {
        return [{ insertId: ++insertedId }];
      }
      return sql.includes("GET_LOCK") ? [[{ acquired }]] : [[{ released: 1 }]];
    },
    release() {
      released += 1;
    },
  };
  return {
    calls,
    get released() {
      return released;
    },
    async getConnection() {
      return connection;
    },
  };
}

test("Netlify schedule is configured for fixed six-hour UTC intervals", () => {
  const configuration = readFileSync(
    path.join(__dirname, "../../netlify.toml"),
    "utf8",
  );
  const schedule =
    /\[functions\."scheduled-ingestion"\]\s*\r?\n\s*schedule\s*=\s*"([^"]+)"/.exec(
      configuration,
    )?.[1];
  assert.equal(schedule, "0 */6 * * *");
});

test("scheduled trigger starts the background ingestion exactly once", async () => {
  let calls = 0;
  const logger = createLogger();
  const handler = scheduledTrigger.createScheduledHandler({
    environment: validEnvironment,
    logger,
    fetchImpl: async (url, options) => {
      calls += 1;
      assert.equal(
        url.href,
        "https://urban-danger.example.net/.netlify/functions/ingest-background",
      );
      assert.equal(options.method, "POST");
      assert.equal(options.headers.authorization, "Bearer private-trigger-key");
      return { status: 202 };
    },
  });

  assert.deepEqual(await handler(), {
    statusCode: 202,
    body: "Ingestion started.",
  });
  assert.equal(calls, 1);
});

test("background function authorizes and starts ingestion once", async () => {
  let starts = 0;
  const handler = background.createBackgroundHandler({
    environment: validEnvironment,
    logger: createLogger(),
    runIngestion: async () => {
      starts += 1;
      return { status: "COMPLETED" };
    },
  });

  const response = await handler({
    headers: { authorization: "Bearer private-trigger-key" },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(starts, 1);
});

test("schedule fails safely when required trigger environment is missing", async () => {
  const logger = createLogger();
  const handler = scheduledTrigger.createScheduledHandler({
    environment: {},
    logger,
    fetchImpl: async () =>
      assert.fail("Must not invoke the background function."),
  });

  assert.equal((await handler()).statusCode, 500);
  assert.match(logger.entries.join("\n"), /invalid_configuration/);
});

test("invalid site URL is rejected without making a network request", async () => {
  const handler = scheduledTrigger.createScheduledHandler({
    environment: { ...validEnvironment, URL: "http://localhost:8888" },
    logger: createLogger(),
    fetchImpl: async () =>
      assert.fail("Invalid configuration must fail first."),
  });
  assert.equal((await handler()).statusCode, 500);
});

test("invalid ingestion configuration is recorded before running the pipeline", async () => {
  for (const [overrides, error] of [
    [{ DB_PORT: "3306.5" }, /invalid_configuration:db_port/],
    [{ DB_HOST: "localhost" }, /invalid_configuration:local_db_host/],
  ]) {
    const environment = { ...validEnvironment, ...overrides };
    assert.throws(() => validateIngestionEnvironment(environment), error);
    const logger = createLogger();
    const pool = createDatabasePool();
    const result = await runScheduledIngestion({
      environment,
      logger,
      dbPool: pool,
      runPipeline: async () => assert.fail("Must not run with invalid config."),
    });
    assert.deepEqual(result, { status: "FAILED", category: "configuration" });
    assert.equal(
      pool.calls.filter(({ sql }) => sql.includes("UPDATE ingestion_runs"))
        .length,
      1,
    );
  }
});

test("missing required ingestion environment fails safely", async () => {
  const logger = createLogger();
  const pool = createDatabasePool();
  const result = await runScheduledIngestion({
    environment: {},
    logger,
    dbPool: pool,
    runPipeline: async () => assert.fail("Must not run without config."),
  });
  assert.deepEqual(result, { status: "FAILED", category: "configuration" });
  assert.match(logger.entries.join("\n"), /failed category=configuration/);
  assert.equal(
    pool.calls.filter(({ sql }) => sql.includes("UPDATE ingestion_runs"))
      .length,
    1,
  );
});

test("successful ingestion reports results and releases the MySQL lock", async () => {
  const logger = createLogger();
  const pool = createDatabasePool();
  let pipelineCalls = 0;
  const result = await runScheduledIngestion({
    environment: validEnvironment,
    dbPool: pool,
    logger,
    now: (() => {
      let time = 100;
      return () => time++;
    })(),
    runPipeline: async () => {
      pipelineCalls += 1;
      return {
        sourcesChecked: 2,
        articlesCollected: 3,
        articlesProcessed: 3,
        verifiedCandidates: 1,
        insertedIncidents: 1,
        duplicates: 0,
        conflicts: 0,
        verificationFailures: 0,
      };
    },
  });

  assert.equal(result.status, "COMPLETED");
  assert.equal(pipelineCalls, 1);
  assert.equal(
    pool.calls.filter(({ sql }) => sql.includes("UPDATE ingestion_runs"))
      .length,
    1,
  );
  assert.deepEqual(
    pool.calls.find(({ sql }) => sql.includes("GET_LOCK")).values,
    [LOCK_NAME],
  );
  assert.equal(pool.released, 1);
  assert.match(logger.entries.join("\n"), /inserted=1/);
  assert.match(logger.entries.join("\n"), /sources_failed=0/);
});

test("empty collection completes without persistence and logs its category", async () => {
  const logger = createLogger();
  const pool = createDatabasePool();
  let persistenceCalls = 0;
  const result = await runScheduledIngestion({
    environment: validEnvironment,
    dbPool: pool,
    logger,
    runPipeline: async () => {
      persistenceCalls += 1;
      return { articlesCollected: 0, sourcesFailed: 0 };
    },
  });
  assert.equal(result.status, "COMPLETED");
  assert.equal(persistenceCalls, 1);
  assert.match(logger.entries.join("\n"), /failures=empty_collection/);
});

test("HTTP 429 and Gemini timeout results remain unverified and are categorized", async () => {
  for (const [reason, expectedCategory] of [
    ["Gemini was rate-limited after retries (HTTP 429).", "gemini_rate_limit"],
    ["Gemini request timed out.", "timeout"],
  ]) {
    const logger = createLogger();
    const result = await runScheduledIngestion({
      environment: validEnvironment,
      dbPool: createDatabasePool(),
      logger,
      runPipeline: async () => ({
        articlesCollected: 1,
        sourcesFailed: 0,
        verificationFailures: 1,
        results: [
          { status: "PENDING_REVIEW", verified: false, reasons: [reason] },
        ],
      }),
    });
    assert.equal(result.status, "COMPLETED");
    assert.match(
      logger.entries.join("\n"),
      new RegExp(`failures=${expectedCategory}`),
    );
    assert.equal(result.result.insertedIncidents, undefined);
  }
});

test("source and database pipeline failures are categorized without exposing errors", async () => {
  for (const [result, expected] of [
    [{ sourcesFailed: 2, verificationFailures: 0 }, "source"],
    [
      {
        articlesCollected: 1,
        sourcesFailed: 0,
        verificationFailures: 1,
        results: [{ reasons: ["Database query failed: private-db-password"] }],
      },
      "database",
    ],
  ]) {
    const logger = createLogger();
    await runScheduledIngestion({
      environment: validEnvironment,
      dbPool: createDatabasePool(),
      logger,
      runPipeline: async () => result,
    });
    assert.match(logger.entries.join("\n"), new RegExp(`failures=${expected}`));
    assert.equal(
      logger.entries.join("\n").includes("private-db-password"),
      false,
    );
  }
});

test("unexpected ingestion exceptions fail safely without logging exception text", async () => {
  const logger = createLogger();
  const result = await runScheduledIngestion({
    environment: validEnvironment,
    dbPool: createDatabasePool(),
    logger,
    runPipeline: async () => {
      throw new Error("unexpected private-gemini-key");
    },
  });
  assert.deepEqual(result, { status: "FAILED", category: "unexpected" });
  assert.equal(logger.entries.join("\n").includes("private-gemini-key"), false);
});

test("overlapping schedule executions are skipped using the MySQL lock", async () => {
  let releasePipeline;
  let started;
  const pipelineStarted = new Promise((resolve) => {
    started = resolve;
  });
  const firstPool = createDatabasePool();
  const firstRun = runScheduledIngestion({
    environment: validEnvironment,
    dbPool: firstPool,
    logger: createLogger(),
    runPipeline: async () => {
      started();
      await new Promise((resolve) => {
        releasePipeline = resolve;
      });
      return {};
    },
  });
  await pipelineStarted;

  let secondPipelineCalls = 0;
  const secondPool = createDatabasePool({ acquired: 0 });
  const secondRun = await runScheduledIngestion({
    environment: validEnvironment,
    dbPool: secondPool,
    logger: createLogger(),
    runPipeline: async () => {
      secondPipelineCalls += 1;
      return {};
    },
  });
  releasePipeline();

  assert.equal((await firstRun).status, "COMPLETED");
  assert.deepEqual(secondRun, {
    status: "SKIPPED",
    category: "already_running",
  });
  assert.equal(secondPipelineCalls, 0);
  assert.equal(secondPool.released, 1);
});

test("repeated schedule invocations do not insert duplicate incidents", async () => {
  const {
    insertVerifiedCandidate,
  } = require("../src/services/incidentPersistenceService");
  const stored = [];
  let incidentInserts = 0;
  const dbPool = {
    async getConnection() {
      return {
        async beginTransaction() {},
        async commit() {},
        async rollback() {},
        release() {},
        async execute(sql, values) {
          if (sql.includes("SELECT incidents.id")) return [stored.slice()];
          if (sql.includes("SELECT id FROM incident_categories")) {
            return [[{ id: 1 }]];
          }
          if (sql.includes("INSERT INTO incidents")) {
            incidentInserts += 1;
            stored.push({
              category: "Theft",
              city: "Taguig City",
              barangay: "Santa Ana",
              latitude: null,
              longitude: null,
              location_description: "Santa Ana",
              incident_date: "2025-09-24",
              severity: "LOW",
              source_url: "https://trusted.example.test/incident-1",
            });
            return [{ insertId: incidentInserts }];
          }
          assert.fail("Unexpected SQL in persistence test.");
        },
      };
    },
  };
  const candidate = {
    category: "Theft",
    city: "Taguig City",
    barangay: "Santa Ana",
    latitude: null,
    longitude: null,
    locationDescription: "Santa Ana",
    incidentDate: "2025-09-24",
    severity: "LOW",
    sourceUrl: "https://trusted.example.test/incident-1",
    description: "A verified theft was reported.",
    sourceName: "Trusted source",
  };

  const first = await insertVerifiedCandidate(candidate, { dbPool });
  const second = await insertVerifiedCandidate(candidate, { dbPool });
  assert.equal(first.status, "INSERTED");
  assert.equal(second.status, "DUPLICATE");
  assert.equal(incidentInserts, 1);
});

test("secrets never appear in scheduled trigger or background logs", async () => {
  const logger = createLogger();
  const trigger = scheduledTrigger.createScheduledHandler({
    environment: validEnvironment,
    logger,
    fetchImpl: async () => ({ status: 202 }),
  });
  await trigger();
  const backgroundHandler = background.createBackgroundHandler({
    environment: validEnvironment,
    logger,
    runIngestion: async () => ({ status: "COMPLETED" }),
  });
  await backgroundHandler({
    headers: { authorization: "Bearer private-trigger-key" },
  });
  const output = logger.entries.join("\n");
  for (const secret of [
    validEnvironment.DB_PASSWORD,
    validEnvironment.GEMINI_API_KEY,
    validEnvironment.INTERNAL_INGEST_KEY,
  ]) {
    assert.equal(output.includes(secret), false);
  }
});

test("the existing production-only ingest endpoint remains unavailable", async () => {
  const systemRouter = require("../src/routes/system");
  const route = systemRouter.stack.find(
    (layer) => layer.route?.path === "/ingest",
  ).route.stack[0].handle;
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  let status;
  let payload;
  const response = {
    status(value) {
      status = value;
      return this;
    },
    json(value) {
      payload = value;
      return this;
    },
  };
  try {
    await route({ get: () => "private-trigger-key" }, response, assert.fail);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
  assert.equal(status, 403);
  assert.equal(payload.success, false);
});
