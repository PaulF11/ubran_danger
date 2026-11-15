const pool = require("../config/database");
const {
  incidentDateOnly,
  isIncidentExpired,
  manilaDate,
} = require("./incidentExpirationPolicy");

const EXPIRATION_LOCK_NAME = "urban-danger-incident-expiration";
const CLEANUP_BATCH_SIZE = 200;

function parseCandidate(value) {
  if (value == null) return null;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function candidateIncidentDate(value) {
  const candidate = parseCandidate(value);
  return candidate?.incidentDate ?? candidate?.incident_date ?? null;
}

async function inTransaction(connection, operation) {
  await connection.beginTransaction();
  try {
    const result = await operation();
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

function createIncidentExpirationService({
  database = pool,
  now = () => new Date(),
  logger = console,
  batchSize = CLEANUP_BATCH_SIZE,
} = {}) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000) {
    throw new RangeError("Incident expiration batch size must be 1-1000.");
  }

  async function removeExpiredReviewCandidates(connection, currentDate) {
    let afterId = 0;
    let deleted = 0;
    const invalidCandidateIds = [];

    while (true) {
      const batch = await inTransaction(connection, async () => {
        const [rows] = await connection.execute(
          `SELECT id, candidate_json AS candidate
           FROM admin_scan_candidates
           WHERE id > ? AND candidate_json IS NOT NULL
           ORDER BY id ASC
           LIMIT ? FOR UPDATE`,
          [afterId, batchSize],
        );
        if (rows.length === 0) return { deleted: 0, processed: 0 };

        afterId = rows[rows.length - 1].id;
        const expiredIds = [];
        for (const row of rows) {
          const date = candidateIncidentDate(row.candidate);
          if (!incidentDateOnly(date)) {
            invalidCandidateIds.push(row.id);
          } else if (isIncidentExpired(date, currentDate)) {
            expiredIds.push(row.id);
          }
        }

        if (expiredIds.length > 0) {
          const placeholders = expiredIds.map(() => "?").join(", ");
          await connection.execute(
            `DELETE FROM admin_scan_candidates WHERE id IN (${placeholders})`,
            expiredIds,
          );
        }
        return { deleted: expiredIds.length, processed: rows.length };
      });

      deleted += batch.deleted;
      if (batch.processed < batchSize) break;
    }

    return { deleted, invalidCandidateIds };
  }

  async function deleteExpiredIncidentBatch(connection, currentDate) {
    return inTransaction(connection, async () => {
      const [incidents] = await connection.execute(
        `SELECT id, location_id AS locationId
         FROM incidents
         WHERE incident_date IS NOT NULL
           AND YEAR(incident_date) >= 1000
           AND DATE_ADD(DATE(incident_date), INTERVAL 12 MONTH) <= ?
         ORDER BY id ASC
         LIMIT ? FOR UPDATE`,
        [currentDate, batchSize],
      );
      if (incidents.length === 0) return 0;

      const incidentIds = incidents.map(({ id }) => id);
      const incidentPlaceholders = incidentIds.map(() => "?").join(", ");
      await connection.execute(
        `DELETE FROM admin_scan_candidates
         WHERE incident_id IN (${incidentPlaceholders})`,
        incidentIds,
      );
      await connection.execute(
        `DELETE FROM incidents WHERE id IN (${incidentPlaceholders})`,
        incidentIds,
      );

      const locationIds = [
        ...new Set(
          incidents
            .map(({ locationId }) => locationId)
            .filter((id) => id !== null && id !== undefined),
        ),
      ];
      if (locationIds.length > 0) {
        const locationPlaceholders = locationIds.map(() => "?").join(", ");
        await connection.execute(
          `DELETE FROM locations
           WHERE id IN (${locationPlaceholders})
             AND NOT EXISTS (
               SELECT 1 FROM incidents
               WHERE incidents.location_id = locations.id
             )`,
          locationIds,
        );
      }
      return incidents.length;
    });
  }

  async function run() {
    const currentDate = manilaDate(now());
    const connection = await database.getConnection();
    let locked = false;
    try {
      const [lockRows] = await connection.query(
        "SELECT GET_LOCK(?, 0) AS acquired",
        [EXPIRATION_LOCK_NAME],
      );
      if (Number(lockRows?.[0]?.acquired) !== 1) {
        return { status: "SKIPPED", reason: "already_running" };
      }
      locked = true;

      const [invalidRows] = await connection.execute(
        `SELECT id FROM incidents
         WHERE incident_date IS NULL OR YEAR(incident_date) < 1000
         ORDER BY id ASC`,
      );
      const invalidIncidentIds = invalidRows.map(({ id }) => id);
      if (invalidIncidentIds.length > 0) {
        logger.warn(
          `[incident-expiration] review_required invalid_date_incident_ids=${JSON.stringify(invalidIncidentIds)}`,
        );
      }

      const candidateResult = await removeExpiredReviewCandidates(
        connection,
        currentDate,
      );
      if (candidateResult.invalidCandidateIds.length > 0) {
        logger.warn(
          `[incident-expiration] review_required invalid_date_candidate_ids=${JSON.stringify(candidateResult.invalidCandidateIds)}`,
        );
      }

      let deletedIncidents = 0;
      while (true) {
        const deleted = await deleteExpiredIncidentBatch(
          connection,
          currentDate,
        );
        deletedIncidents += deleted;
        if (deleted < batchSize) break;
      }

      logger.info(
        `[incident-expiration] complete expired_incidents=${deletedIncidents} expired_scan_candidates=${candidateResult.deleted}`,
      );
      return {
        status: "COMPLETED",
        deletedIncidents,
        deletedScanCandidates: candidateResult.deleted,
        invalidIncidentIds,
        invalidCandidateIds: candidateResult.invalidCandidateIds,
      };
    } finally {
      if (locked) {
        try {
          await connection.query("SELECT RELEASE_LOCK(?)", [
            EXPIRATION_LOCK_NAME,
          ]);
        } catch (error) {
          logger.error(
            `[incident-expiration] failed category=lock_release message=${error.message || "unknown"}`,
          );
        }
      }
      connection.release();
    }
  }

  return { run };
}

module.exports = {
  CLEANUP_BATCH_SIZE,
  EXPIRATION_LOCK_NAME,
  createIncidentExpirationService,
};
