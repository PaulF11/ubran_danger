// File note: This file handles ingestionRunRepository.js.
const COUNTER_COLUMNS = [
  "sources_checked",
  "articles_collected",
  "articles_prefiltered",
  "articles_processed",
  "candidates_found",
  "verified_count",
  "rejected_count",
  "duplicate_count",
  "inserted_count",
  "error_count",
  "articles_skipped",
  "gemini_requests",
  "rate_limit_count",
];

function safeCount(value) {
  const count = Number(value || 0);
  return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
}

async function startRun(connection, startedAt, runSource = "SCHEDULED") {
  const [result] = await connection.query(
    "INSERT INTO ingestion_runs (started_at, status, run_source) VALUES (?, 'RUNNING', ?)",
    [startedAt, runSource],
  );
  return result.insertId;
}

async function finishRun(connection, id, run) {
  const counts = COUNTER_COLUMNS.map((column) => safeCount(run[column]));
  await connection.query(
    `UPDATE ingestion_runs
     SET completed_at = ?, status = ?,
         sources_checked = ?, articles_collected = ?,
         articles_prefiltered = ?, articles_processed = ?,
         candidates_found = ?, verified_count = ?, rejected_count = ?,
         duplicate_count = ?, inserted_count = ?, error_count = ?,
         articles_skipped = ?, gemini_requests = ?, rate_limit_count = ?,
         duration_ms = ?, error_message = ?
     WHERE id = ?`,
    [
      run.completedAt,
      run.status,
      ...counts,
      safeCount(run.durationMs),
      run.errorMessage || null,
      id,
    ],
  );
}

module.exports = { COUNTER_COLUMNS, finishRun, safeCount, startRun };
