// File note: This file handles import_verified_incidents.js.

const fs = require("node:fs");
const path = require("node:path");

const pool = require("../src/config/database");
const {
  checkSourceUrl,
  verifyCandidate,
} = require("../src/services/automatedVerificationService");

const SOURCE_FILE = path.join(__dirname, "../data/taguig_incidents.json");
const VERIFICATION_METHOD =
  "Manual source review plus trusted-host, URL, Taguig, date, location, category, severity, and database duplicate checks.";

function toMysqlDateTime(value, timeKnown) {
  const normalized = String(value).replace("T", " ");
  if (timeKnown)
    return normalized.length === 16
      ? `${normalized}:00`
      : normalized.slice(0, 19);
  return `${normalized.slice(0, 10)} 00:00:00`;
}

async function readExistingCandidates(connection) {
  const [rows] = await connection.execute(
    `SELECT
       incident_categories.name AS category,
       incidents.city,
       locations.barangay,
       DATE_FORMAT(incidents.incident_date, '%Y-%m-%d') AS incidentDate,
       incidents.location_description AS locationDescription,
      locations.latitude,
      locations.longitude,
       incidents.severity,
       incidents.source_url AS sourceUrl
     FROM incidents
     JOIN incident_categories ON incidents.category_id = incident_categories.id
     LEFT JOIN locations ON incidents.location_id = locations.id`,
  );
  return rows;
}

async function findOrCreateLocation(connection, candidate) {
  if (!candidate.barangay && candidate.latitude == null) return null;

  const [existing] = await connection.execute(
    `SELECT id
     FROM locations
     WHERE barangay <=> ?
       AND latitude <=> ?
       AND longitude <=> ?
       AND location_source_url <=> ?
     ORDER BY id ASC
     LIMIT 1`,
    [
      candidate.barangay || null,
      candidate.latitude,
      candidate.longitude,
      candidate.locationSourceUrl || null,
    ],
  );
  if (existing.length) return existing[0].id;

  const [result] = await connection.execute(
    `INSERT INTO locations (
       barangay, latitude, longitude, location_source_name, location_source_url
     ) VALUES (?, ?, ?, ?, ?)`,
    [
      candidate.barangay || null,
      candidate.latitude,
      candidate.longitude,
      candidate.locationSourceName || null,
      candidate.locationSourceUrl || null,
    ],
  );
  return result.insertId;
}

async function importCandidate(connection, candidate, categoryId) {
  await connection.beginTransaction();
  try {
    const locationId = await findOrCreateLocation(connection, candidate);
    const [result] = await connection.execute(
      `INSERT INTO incidents (
         category_id, location_id, city, description, severity, incident_date,
         incident_time_known, source, source_name, source_url, source_published_at,
         location_description, verification_status, verification_method, last_verified_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'VERIFIED', ?, UTC_TIMESTAMP())`,
      [
        categoryId,
        locationId,
        candidate.city,
        candidate.description,
        candidate.severity,
        toMysqlDateTime(candidate.incidentDate, candidate.incidentTimeKnown),
        candidate.incidentTimeKnown,
        candidate.sourceName,
        candidate.sourceName,
        candidate.sourceUrl,
        candidate.sourcePublishedAt,
        candidate.locationDescription || null,
        VERIFICATION_METHOD,
      ],
    );
    await connection.commit();
    return result.insertId;
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

async function run() {
  const candidates = JSON.parse(fs.readFileSync(SOURCE_FILE, "utf8"));
  const connection = await pool.getConnection();
  const results = [];

  try {
    const [categories] = await connection.execute(
      "SELECT id, name FROM incident_categories",
    );
    const categoryIds = new Map(
      categories.map((category) => [category.name.toLowerCase(), category.id]),
    );
    const existingCandidates = await readExistingCandidates(connection);
    const sourceChecks = new Map();
    const sourceUrlCheck = (url, reviewed) => {
      const key = `${url}|${reviewed}`;
      if (!sourceChecks.has(key)) {
        sourceChecks.set(key, checkSourceUrl(url, reviewed));
      }
      return sourceChecks.get(key);
    };

    for (const candidate of candidates) {
      const verification = await verifyCandidate(
        candidate,
        existingCandidates,
        {
          sourceUrlCheck,
        },
      );
      if (!verification.verified) {
        results.push({
          sourceUrl: candidate.sourceUrl,
          status: verification.status,
          reasons: verification.reasons,
        });
        continue;
      }

      const categoryId = categoryIds.get(candidate.category.toLowerCase());
      if (!categoryId) {
        results.push({
          sourceUrl: candidate.sourceUrl,
          status: "REJECTED",
          reasons: ["Category is not present in the database category table."],
        });
        continue;
      }

      const id = await importCandidate(connection, candidate, categoryId);
      existingCandidates.push({ ...candidate, sourceUrl: candidate.sourceUrl });
      results.push({
        id,
        sourceUrl: candidate.sourceUrl,
        status: "VERIFIED",
        reasons: verification.reasons,
      });
    }
  } finally {
    connection.release();
    await pool.end();
  }

  console.log(
    JSON.stringify(
      { imported: results.filter((item) => item.id).length, results },
      null,
      2,
    ),
  );
}

if (require.main === module) {
  run().catch((error) => {
    console.error(`Incident import failed: ${error.code || error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { run, toMysqlDateTime };
