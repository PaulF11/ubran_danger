const { createHash } = require("node:crypto");
const pool = require("../config/database");

function sourceHash(url) {
  return createHash("sha256").update(url).digest("hex");
}

function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function toScanResult(row) {
  return {
    id: row.id,
    runId: row.runId,
    title: row.title,
    sourceName: row.sourceName,
    sourceUrl: row.sourceUrl,
    sourcePublishedAt: row.sourcePublishedAt,
    retrievedAt: row.retrievedAt,
    scanStatus: row.scanStatus,
    verificationStatus: row.verificationStatus,
    persistenceStatus: row.persistenceStatus,
    retryable: Boolean(row.retryable),
    reasons: parseJson(row.reasons, []),
    candidate: parseJson(row.candidate, null),
  };
}

function createIngestionScanResultService({ database = pool } = {}) {
  async function saveRunResults(runId, results) {
    for (const result of results) {
      const sourceUrl = result.sourceUrl || result.source;
      if (typeof sourceUrl !== "string" || !sourceUrl) continue;

      await database.execute(
        `INSERT INTO ingestion_scan_results
          (ingestion_run_id, source_url_hash, source_url, title, source_name,
           source_published_at, retrieved_at, scan_status,
           verification_status, persistence_status, retryable, reasons_json,
           candidate_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           title = VALUES(title), source_name = VALUES(source_name),
           source_published_at = VALUES(source_published_at),
           retrieved_at = VALUES(retrieved_at),
           scan_status = VALUES(scan_status),
           verification_status = VALUES(verification_status),
           persistence_status = VALUES(persistence_status),
           retryable = VALUES(retryable),
           reasons_json = VALUES(reasons_json),
           candidate_json = VALUES(candidate_json)`,
        [
          runId,
          sourceHash(sourceUrl),
          sourceUrl,
          result.title || null,
          result.sourceName || null,
          result.sourcePublishedAt || null,
          result.retrievedAt || null,
          result.status || "UNAVAILABLE",
          result.verificationStatus || result.status || "UNAVAILABLE",
          result.persistence || null,
          result.retryable === true,
          JSON.stringify(result.reasons || []),
          result.candidate ? JSON.stringify(result.candidate) : null,
        ],
      );
    }
  }

  async function listRunResults(runId) {
    if (!/^\d+$/.test(String(runId || "")) || Number(runId) < 1) {
      const error = new Error("A valid scan run ID is required.");
      error.code = "INVALID_RUN_ID";
      throw error;
    }
    const [rows] = await database.execute(
      `SELECT id, ingestion_run_id AS runId, title,
              source_name AS sourceName, source_url AS sourceUrl,
              source_published_at AS sourcePublishedAt,
              retrieved_at AS retrievedAt, scan_status AS scanStatus,
              verification_status AS verificationStatus,
              persistence_status AS persistenceStatus,
              retryable,
              reasons_json AS reasons, candidate_json AS candidate
       FROM ingestion_scan_results
       WHERE ingestion_run_id = ?
       ORDER BY id ASC`,
      [runId],
    );
    return rows.map(toScanResult);
  }

  return { listRunResults, saveRunResults };
}

module.exports = { createIngestionScanResultService };
