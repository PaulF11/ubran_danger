// File note: This file handles processedSourceRepository.js.

const { createHash } = require("node:crypto");
const pool = require("../config/database");

function sourceHash(url) {
  return createHash("sha256").update(url).digest("hex");
}

async function findProcessed(urls, { database = pool } = {}) {
  const uniqueUrls = [
    ...new Set(urls.filter((url) => typeof url === "string" && url)),
  ];
  if (uniqueUrls.length === 0) return new Set();

  const hashes = uniqueUrls.map(sourceHash);
  const [rows] = await database.execute(
    `SELECT source_url_hash AS sourceUrlHash
     FROM ingestion_processed_sources
     WHERE status = 'PROCESSED' AND source_url_hash IN (${hashes.map(() => "?").join(", ")})`,
    hashes,
  );
  const processedHashes = new Set(rows.map((row) => row.sourceUrlHash));
  return new Set(
    uniqueUrls.filter((url) => processedHashes.has(sourceHash(url))),
  );
}

async function recordProcessed(url, status, { database = pool } = {}) {
  if (typeof url !== "string" || !url) return;
  const storedStatus = status === "PROCESSED" ? "PROCESSED" : "RETRY";
  await database.execute(
    `INSERT INTO ingestion_processed_sources
      (source_url_hash, source_url, status, last_seen_at, processed_at)
     VALUES (?, ?, ?, UTC_TIMESTAMP(3), IF(? = 'PROCESSED', UTC_TIMESTAMP(3), NULL))
     ON DUPLICATE KEY UPDATE
       source_url = VALUES(source_url),
       status = VALUES(status),
       last_seen_at = VALUES(last_seen_at),
       processed_at = IF(VALUES(status) = 'PROCESSED', VALUES(processed_at), NULL)`,
    [sourceHash(url), url, storedStatus, storedStatus],
  );
}

module.exports = { findProcessed, recordProcessed, sourceHash };
