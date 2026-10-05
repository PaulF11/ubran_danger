const test = require("node:test");
const assert = require("node:assert/strict");
const {
  finishRun,
  startRun,
} = require("../src/services/ingestionRunRepository");
const {
  runManualIngestion,
  runScheduledIngestion,
} = require("../src/services/scheduledIngestionService");

const environment = {
  DB_HOST: "mysql.example.test",
  DB_USER: "service-user",
  DB_PASSWORD: "not-used-by-test-output",
  DB_NAME: "urban_danger",
  GEMINI_API_KEY: "not-used-by-test-output",
};

function createPool() {
  const calls = [];
  const connection = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.includes("INSERT INTO ingestion_runs")) {
        return [{ insertId: 27 }];
      }
      if (sql.includes("GET_LOCK")) return [[{ acquired: 1 }]];
      return [{ affectedRows: 1 }];
    },
    release() {},
  };
  return { calls, getConnection: async () => connection };
}

function historyRecorder() {
  const entries = [];
  return {
    entries,
    async startRun(_connection, startedAt) {
      entries.push({ type: "start", startedAt });
      return 27;
    },
    async finishRun(_connection, id, values) {
      entries.push({ type: "finish", id, ...values });
    },
  };
}

test("ingestion run repository creates and updates the history row", async () => {
  const calls = [];
  const connection = {
    async query(sql, values) {
      calls.push({ sql, values });
      return sql.startsWith("INSERT")
        ? [{ insertId: 8 }]
        : [{ affectedRows: 1 }];
    },
  };
  const startedAt = new Date("2026-01-01T00:00:00Z");
  assert.equal(await startRun(connection, startedAt), 8);
  await finishRun(connection, 8, {
    status: "SUCCEEDED",
    completedAt: new Date("2026-01-01T00:00:02Z"),
    sources_checked: "2",
    articles_collected: 3,
    verified_count: 1,
    durationMs: 2000,
  });
  assert.match(calls[0].sql, /status\) VALUES \(\?, 'RUNNING'\)/);
  assert.match(calls[1].sql, /UPDATE ingestion_runs/);
  assert.equal(calls[1].values[1], "SUCCEEDED");
  assert.equal(calls[1].values[2], 2);
  assert.equal(calls[1].values[7], 1);
});

test("successful scheduled ingestion records summary counters", async () => {
  const history = historyRecorder();
  const result = await runScheduledIngestion({
    environment,
    dbPool: createPool(),
    runHistory: history,
    now: (() => {
      let time = 1000;
      return () => time++;
    })(),
    logger: { info() {}, error() {} },
    runPipeline: async () => ({
      sourcesChecked: 2,
      articlesCollected: 4,
      preFiltered: 1,
      articlesProcessed: 4,
      candidatesExtracted: 2,
      verifiedCandidates: 1,
      candidatesRejected: 1,
      duplicates: 1,
      insertedIncidents: 1,
      verificationFailures: 0,
      sourcesFailed: 0,
    }),
  });
  assert.equal(result.status, "COMPLETED");
  assert.equal(history.entries[1].status, "SUCCEEDED");
  assert.equal(history.entries[1].articles_collected, 4);
  assert.equal(history.entries[1].verified_count, 1);
  assert.equal(history.entries[1].inserted_count, 1);
});

test("failed and partially completed ingestion statuses are recorded safely", async () => {
  const failedHistory = historyRecorder();
  const failed = await runManualIngestion({
    dbPool: createPool(),
    runHistory: failedHistory,
    logger: { error() {} },
    runPipeline: async () => {
      throw new Error("private error details");
    },
  });
  assert.deepEqual(failed, { status: "FAILED", category: "unexpected" });
  assert.equal(failedHistory.entries[1].status, "FAILED");
  assert.equal(
    failedHistory.entries[1].errorMessage,
    "Ingestion failed (unexpected).",
  );
  assert.equal(
    JSON.stringify(failedHistory.entries).includes("private error details"),
    false,
  );

  const partialHistory = historyRecorder();
  await runScheduledIngestion({
    environment,
    dbPool: createPool(),
    runHistory: partialHistory,
    logger: { info() {}, error() {} },
    runPipeline: async () => ({
      sourcesFailed: 1,
      verificationFailures: 0,
      articlesCollected: 1,
    }),
  });
  assert.equal(partialHistory.entries[1].status, "PARTIAL");
  assert.equal(partialHistory.entries[1].error_count, 1);
});
