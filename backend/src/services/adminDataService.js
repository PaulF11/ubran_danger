const pool = require("../config/database");
const {
  TAGUIG_BARANGAY_PARAMS,
} = require("../constants/taguigBarangays");
const {
  VERIFIED_INCIDENT_SCOPE,
} = require("../constants/verifiedIncidentScope");
const { parseCollectionTargetUrls } = require("./sourceCollectorService");

const INCIDENT_SELECT = `SELECT
    incidents.id,
    incident_categories.name AS category,
    incidents.city,
    locations.barangay,
    incidents.location_description,
    DATE_FORMAT(incidents.incident_date, '%Y-%m-%dT%H:%i:%s') AS incidentDate,
    incidents.severity,
    incidents.source_name AS sourceName,
    incidents.source_url AS sourceUrl,
    DATE_FORMAT(incidents.source_published_at, '%Y-%m-%d') AS sourcePublishedAt,
    incidents.verification_status AS verificationStatus,
    incidents.verification_method AS verificationMethod,
    DATE_FORMAT(incidents.last_verified_at, '%Y-%m-%dT%H:%i:%sZ') AS lastVerifiedAt,
    locations.latitude,
    locations.longitude,
    locations.location_source_name AS locationSourceName,
    locations.location_source_url AS locationSourceUrl,
    incidents.description
  FROM incidents
  JOIN incident_categories ON incidents.category_id = incident_categories.id
  LEFT JOIN locations ON incidents.location_id = locations.id`;

const RUN_COLUMNS = `id, started_at AS startedAt, completed_at AS completedAt,
  status, run_source AS runSource, sources_checked AS sourcesChecked,
  articles_collected AS articlesCollected,
  articles_prefiltered AS articlesPrefiltered,
  articles_processed AS articlesProcessed,
  candidates_found AS candidatesFound, verified_count AS verifiedCount,
  rejected_count AS rejectedCount, duplicate_count AS duplicateCount,
  inserted_count AS insertedCount, error_count AS errorCount,
  articles_skipped AS articlesSkipped, gemini_requests AS geminiRequests,
  rate_limit_count AS rateLimitCount,
  duration_ms AS durationMs, error_message AS errorMessage`;

function countValue(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
}

function pageValue(value, fallback, maximum) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) return fallback;
  return Math.min(number, maximum);
}

function createAdminDataService({
  database = pool,
  environment = process.env,
  now = () => new Date(),
} = {}) {
  const query = async (sql, parameters = []) => {
    const [rows] = await database.execute(sql, parameters);
    return rows;
  };

  async function latestRun() {
    const rows = await query(
      `SELECT ${RUN_COLUMNS} FROM ingestion_runs ORDER BY id DESC LIMIT 1`,
    );
    return rows[0] || null;
  }

  async function getDashboard() {
    const [totals, categories, severities, barangays, run] = await Promise.all([
      query(
        `SELECT COUNT(*) AS total,
          SUM(incidents.created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY)) AS recent
         FROM incidents LEFT JOIN locations ON incidents.location_id = locations.id
         WHERE ${VERIFIED_INCIDENT_SCOPE}`,
        TAGUIG_BARANGAY_PARAMS,
      ),
      query(
        `SELECT incident_categories.name AS label, COUNT(*) AS count
         FROM incidents JOIN incident_categories
           ON incidents.category_id = incident_categories.id
         LEFT JOIN locations ON incidents.location_id = locations.id
         WHERE ${VERIFIED_INCIDENT_SCOPE}
         GROUP BY incident_categories.name ORDER BY count DESC, label ASC`,
        TAGUIG_BARANGAY_PARAMS,
      ),
      query(
        `SELECT incidents.severity AS label, COUNT(*) AS count
         FROM incidents LEFT JOIN locations ON incidents.location_id = locations.id
         WHERE ${VERIFIED_INCIDENT_SCOPE}
         GROUP BY incidents.severity ORDER BY incidents.severity`,
        TAGUIG_BARANGAY_PARAMS,
      ),
      query(
        `SELECT COALESCE(locations.barangay, 'Location not reported') AS label,
          COUNT(*) AS count
         FROM incidents LEFT JOIN locations ON incidents.location_id = locations.id
         WHERE ${VERIFIED_INCIDENT_SCOPE}
         GROUP BY locations.barangay ORDER BY count DESC, label ASC`,
        TAGUIG_BARANGAY_PARAMS,
      ),
      latestRun(),
    ]);
    const toCounts = (rows) =>
      rows.map(({ label, count }) => ({ label, count: countValue(count) }));
    const total = countValue(totals[0]?.total);

    return {
      statisticsLabel:
        "System/application statistics, not official crime rates.",
      totalVerifiedIncidents: total,
      incidentsAddedRecently: countValue(totals[0]?.recent),
      byCategory: toCounts(categories),
      bySeverity: toCounts(severities),
      byBarangay: toCounts(barangays),
      lastRun: run,
      scheduler: {
        status:
          environment.URL &&
          (environment.SCHEDULED_INGEST_KEY || environment.INTERNAL_INGEST_KEY)
            ? "CONFIGURED"
            : "NOT_CONFIGURED",
        schedule: "0 */6 * * *",
      },
    };
  }

  async function getIncidents(filters = {}) {
    const page = pageValue(filters.page, 1, 1000000);
    const limit = pageValue(filters.limit, 25, 100);
    const offset = (page - 1) * limit;
    const where = [VERIFIED_INCIDENT_SCOPE];
    const parameters = [...TAGUIG_BARANGAY_PARAMS];
    for (const [key, clause] of [
      ["category", "incident_categories.name = ?"],
      ["severity", "incidents.severity = ?"],
      ["barangay", "locations.barangay = ?"],
    ]) {
      if (typeof filters[key] === "string" && filters[key].trim()) {
        where.push(clause);
        parameters.push(filters[key].trim());
      }
    }
    if (filters.from && validDate(filters.from)) {
      where.push("incidents.incident_date >= ?");
      parameters.push(filters.from);
    }
    if (filters.to && validDate(filters.to)) {
      where.push("incidents.incident_date < DATE_ADD(?, INTERVAL 1 DAY)");
      parameters.push(filters.to);
    }
    if (typeof filters.source === "string" && filters.source.trim()) {
      where.push("incidents.source_name LIKE ?");
      parameters.push(`%${filters.source.trim()}%`);
    }
    if (typeof filters.q === "string" && filters.q.trim()) {
      where.push(
        `(incidents.description LIKE ? OR incidents.location_description LIKE ?
          OR incidents.source_name LIKE ? OR incidents.source_url LIKE ?)`,
      );
      const term = `%${filters.q.trim()}%`;
      parameters.push(term, term, term, term);
    }
    const whereSql = where.join(" AND ");
    const [items, totals] = await Promise.all([
      query(
        `${INCIDENT_SELECT} WHERE ${whereSql}
         ORDER BY incidents.incident_date DESC, incidents.id DESC
         LIMIT ? OFFSET ?`,
        [...parameters, limit, offset],
      ),
      query(
        `SELECT COUNT(*) AS total FROM incidents
         JOIN incident_categories ON incidents.category_id = incident_categories.id
         LEFT JOIN locations ON incidents.location_id = locations.id
         WHERE ${whereSql}`,
        parameters,
      ),
    ]);
    return {
      items,
      page,
      limit,
      total: countValue(totals[0]?.total),
    };
  }

  async function getIncident(id) {
    const rows = await query(
      `${INCIDENT_SELECT} WHERE ${VERIFIED_INCIDENT_SCOPE} AND incidents.id = ? LIMIT 1`,
      [...TAGUIG_BARANGAY_PARAMS, id],
    );
    return rows[0] || null;
  }

  async function getIngestionRuns(filters = {}) {
    const page = pageValue(filters.page, 1, 1000000);
    const limit = pageValue(filters.limit, 25, 100);
    const offset = (page - 1) * limit;
    const conditions = [];
    const parameters = [];
    if (["MANUAL", "SCHEDULED"].includes(filters.source)) {
      conditions.push("run_source = ?");
      parameters.push(filters.source);
    }
    if (/^\d+$/.test(String(filters.afterId || ""))) {
      conditions.push("id > ?");
      parameters.push(filters.afterId);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const [items, totals] = await Promise.all([
      query(
        `SELECT ${RUN_COLUMNS} FROM ingestion_runs
         ${where} ORDER BY started_at DESC, id DESC LIMIT ? OFFSET ?`,
        [...parameters, limit, offset],
      ),
      query(
        `SELECT COUNT(*) AS total FROM ingestion_runs ${where}`,
        parameters,
      ),
    ]);
    return { items, page, limit, total: countValue(totals[0]?.total) };
  }

  async function getIngestionRun(id) {
    const rows = await query(
      `SELECT ${RUN_COLUMNS} FROM ingestion_runs WHERE id = ? LIMIT 1`,
      [id],
    );
    return rows[0] || null;
  }

  function getSources() {
    const namesByHost = new Map([
      ["www.gmanetwork.com", "GMA News"],
      ["news.tv5.com.ph", "News5 / TV5"],
    ]);
    return parseCollectionTargetUrls(
      environment.SOURCE_COLLECTION_TARGET_URLS,
    ).map((url) => ({
      name: namesByHost.get(url.hostname.toLowerCase()) || url.hostname,
      domain: url.hostname.toLowerCase(),
      enabled: true,
      seedUrls: [url.toString()],
      latestCollectionAt: null,
      articlesCollected: null,
      activityAvailable: false,
    }));
  }

  async function getSystemStatus() {
    const checkedAt = now().toISOString();
    let databaseStatus = "UNAVAILABLE";
    let lastRun = null;
    let historyStatus = "UNAVAILABLE";
    try {
      await query("SELECT 1 AS available");
      databaseStatus = "OPERATIONAL";
    } catch {
      databaseStatus = "UNAVAILABLE";
    }
    if (databaseStatus === "OPERATIONAL") {
      try {
        lastRun = await latestRun();
        historyStatus = "AVAILABLE";
      } catch {
        historyStatus = "UNAVAILABLE";
      }
    }
    const schedulerKey =
      environment.SCHEDULED_INGEST_KEY || environment.INTERNAL_INGEST_KEY;
    return {
      checkedAt,
      api: { status: "OPERATIONAL", checkedAt },
      database: { status: databaseStatus, checkedAt },
      ingestion: {
        status: lastRun?.status || "NO_RUN_RECORDED",
        historyStatus,
        lastRun,
      },
      gemini: {
        status: environment.GEMINI_API_KEY ? "CONFIGURED" : "NOT_CONFIGURED",
        check: "Configuration only; provider connectivity is not probed.",
      },
      scheduler: {
        status:
          environment.URL && schedulerKey ? "CONFIGURED" : "NOT_CONFIGURED",
        schedule: "0 */6 * * *",
        lastRun,
      },
    };
  }

  return {
    getDashboard,
    getIncident,
    getIncidents,
    getIngestionRun,
    getIngestionRuns,
    getSources,
    getSystemStatus,
  };
}

module.exports = {
  createAdminDataService,
  INCIDENT_SELECT,
  VERIFIED_SCOPE: VERIFIED_INCIDENT_SCOPE,
};
