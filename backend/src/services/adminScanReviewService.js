const { createHash } = require("node:crypto");
const pool = require("../config/database");
const {
  checkSourceUrl,
  verifyCandidate,
} = require("./automatedVerificationService");
const { insertVerifiedCandidate } = require("./incidentPersistenceService");

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

function toReviewCandidate(row) {
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
    reasons: parseJson(row.reasons, []),
    candidate: parseJson(row.candidate, null),
    reviewStatus: row.reviewStatus,
    incidentId: row.incidentId,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt,
  };
}

function createAdminScanReviewService({
  database = pool,
  verifier = verifyCandidate,
  sourceUrlCheck = checkSourceUrl,
  persister = insertVerifiedCandidate,
  now = () => new Date(),
} = {}) {
  async function saveRunCandidates(runId, results) {
    for (const result of results) {
      const sourceUrl = result.sourceUrl || result.source;
      if (typeof sourceUrl !== "string" || !sourceUrl) continue;

      await database.execute(
        `INSERT INTO admin_scan_candidates
          (ingestion_run_id, source_url_hash, source_url, title, source_name,
           source_published_at, retrieved_at, scan_status,
           verification_status, reasons_json, candidate_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           title = VALUES(title), source_name = VALUES(source_name),
           source_published_at = VALUES(source_published_at),
           retrieved_at = VALUES(retrieved_at),
           scan_status = VALUES(scan_status),
           verification_status = VALUES(verification_status),
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
          result.status || "PENDING_REVIEW",
          result.status || "PENDING_REVIEW",
          JSON.stringify(result.reasons || []),
          result.candidate ? JSON.stringify(result.candidate) : null,
        ],
      );
    }
  }

  async function listRunCandidates(runId) {
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
              reasons_json AS reasons, candidate_json AS candidate,
              review_status AS reviewStatus, incident_id AS incidentId,
              reviewed_by AS reviewedBy,
              DATE_FORMAT(reviewed_at, '%Y-%m-%dT%H:%i:%sZ') AS reviewedAt
       FROM admin_scan_candidates
       WHERE ingestion_run_id = ?
       ORDER BY id ASC`,
      [runId],
    );
    return rows.map(toReviewCandidate);
  }

  async function getCandidate(id) {
    const [rows] = await database.execute(
      `SELECT id, ingestion_run_id AS runId, title,
              source_name AS sourceName, source_url AS sourceUrl,
              source_published_at AS sourcePublishedAt,
              retrieved_at AS retrievedAt, scan_status AS scanStatus,
              verification_status AS verificationStatus,
              reasons_json AS reasons, candidate_json AS candidate,
              review_status AS reviewStatus, incident_id AS incidentId,
              reviewed_by AS reviewedBy,
              DATE_FORMAT(reviewed_at, '%Y-%m-%dT%H:%i:%sZ') AS reviewedAt
       FROM admin_scan_candidates WHERE id = ? LIMIT 1`,
      [id],
    );
    return rows[0] ? toReviewCandidate(rows[0]) : null;
  }

  async function rejectCandidate(id, reviewer) {
    const [result] = await database.execute(
      `UPDATE admin_scan_candidates
       SET review_status = 'REJECTED', reviewed_by = ?,
           reviewed_at = UTC_TIMESTAMP(3)
       WHERE id = ? AND review_status = 'PENDING'`,
      [reviewer, id],
    );
    if (Number(result.affectedRows) === 1) {
      return { id: Number(id), reviewStatus: "REJECTED" };
    }
    const existing = await getCandidate(id);
    if (!existing) return null;
    const error = new Error("This scan report is no longer awaiting review.");
    error.code = "REVIEW_CONFLICT";
    throw error;
  }

  async function approveCandidate(id, reviewer) {
    const candidateRecord = await getCandidate(id);
    if (!candidateRecord) return null;
    if (
      candidateRecord.reviewStatus !== "PENDING" ||
      candidateRecord.verificationStatus !== "VERIFIED" ||
      !candidateRecord.candidate
    ) {
      const error = new Error(
        "Only verified scan candidates awaiting review can be added.",
      );
      error.code = "CANDIDATE_NOT_APPROVABLE";
      throw error;
    }

    const [claim] = await database.execute(
      `UPDATE admin_scan_candidates SET review_status = 'APPROVING'
       WHERE id = ? AND review_status = 'PENDING'
         AND verification_status = 'VERIFIED'`,
      [id],
    );
    if (Number(claim.affectedRows) !== 1) {
      const error = new Error("This scan report is already being reviewed.");
      error.code = "REVIEW_CONFLICT";
      throw error;
    }

    try {
      const verification = await verifier(candidateRecord.candidate, [], {
        sourceUrlCheck,
      });
      if (!verification.verified) {
        await database.execute(
          `UPDATE admin_scan_candidates
           SET scan_status = ?, verification_status = ?, reasons_json = ?,
               review_status = 'PENDING'
           WHERE id = ? AND review_status = 'APPROVING'`,
          [
            verification.status,
            verification.status,
            JSON.stringify(verification.reasons || []),
            id,
          ],
        );
        return {
          id: Number(id),
          reviewStatus: "PENDING",
          verificationStatus: verification.status,
          reasons: verification.reasons || [],
        };
      }

      const persistence = await persister(verification.normalized);
      if (persistence.status !== "INSERTED") {
        const reviewStatus = ["DUPLICATE", "CONFLICT"].includes(
          persistence.status,
        )
          ? persistence.status
          : "PENDING";
        await database.execute(
          `UPDATE admin_scan_candidates SET review_status = ?, scan_status = ?
           WHERE id = ? AND review_status = 'APPROVING'`,
          [reviewStatus, persistence.status, id],
        );
        return {
          id: Number(id),
          reviewStatus,
          verificationStatus: persistence.status,
        };
      }

      await database.execute(
        `UPDATE admin_scan_candidates
         SET review_status = 'APPROVED', incident_id = ?, reviewed_by = ?,
             reviewed_at = ?
         WHERE id = ? AND review_status = 'APPROVING'`,
        [persistence.id, reviewer, now(), id],
      );
      return {
        id: Number(id),
        incidentId: persistence.id,
        reviewStatus: "APPROVED",
        verificationStatus: "VERIFIED",
      };
    } catch (error) {
      await database.execute(
        `UPDATE admin_scan_candidates SET review_status = 'PENDING'
         WHERE id = ? AND review_status = 'APPROVING'`,
        [id],
      );
      throw error;
    }
  }

  return {
    approveCandidate,
    listRunCandidates,
    rejectCandidate,
    saveRunCandidates,
  };
}

module.exports = { createAdminScanReviewService };