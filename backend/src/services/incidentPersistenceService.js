// File note: This file handles incidentPersistenceService.js.
const pool = require("../config/database");
const { findConflict, isDuplicate } = require("./incidentDeduplicationService");

function toDatabaseCandidate(row) {
  return {
    category: row.category,
    city: row.city,
    barangay: row.barangay,
    latitude: row.latitude,
    longitude: row.longitude,
    locationDescription: row.location_description,
    incidentDate: row.incident_date,
    severity: row.severity,
    sourceUrl: row.source_url,
  };
}

async function findExisting(connection, candidate) {
  const [rows] = await connection.execute(
    `SELECT incidents.id, incident_categories.name AS category,
            incidents.city, locations.barangay, locations.latitude,
            locations.longitude, incidents.location_description,
            incidents.incident_date, incidents.severity, incidents.source_url
     FROM incidents
     JOIN incident_categories ON incidents.category_id = incident_categories.id
     LEFT JOIN locations ON incidents.location_id = locations.id
     WHERE incidents.source_url = ?
        OR (incidents.city = ? AND DATE(incidents.incident_date) = DATE(?)
            AND (locations.barangay = ?
                 OR (locations.latitude = ? AND locations.longitude = ?)))`,
    [
      candidate.sourceUrl,
      candidate.city,
      candidate.incidentDate,
      candidate.barangay,
      candidate.latitude,
      candidate.longitude,
    ],
  );
  return rows.map(toDatabaseCandidate);
}

async function insertVerifiedCandidate(
  candidate,
  { dbPool = pool, verifiedAt = new Date() } = {},
) {
  const connection = await dbPool.getConnection();
  try {
    await connection.beginTransaction();
    const existing = await findExisting(connection, candidate);
    const sameSource = existing.some(
      (item) => item.sourceUrl && item.sourceUrl === candidate.sourceUrl,
    );
    if (sameSource && isDuplicate(candidate, existing)) {
      await connection.rollback();
      return { status: "DUPLICATE", inserted: false };
    }
    if (sameSource || findConflict(candidate, existing)) {
      await connection.rollback();
      return { status: "CONFLICT", inserted: false };
    }

    let locationId = null;
    if (candidate.latitude !== null && candidate.longitude !== null) {
      const [locationResult] = await connection.execute(
        `INSERT INTO locations
          (barangay, latitude, longitude, location_source_name, location_source_url)
         VALUES (?, ?, ?, ?, ?)`,
        [
          candidate.barangay,
          candidate.latitude,
          candidate.longitude,
          candidate.locationSourceName ?? null,
          candidate.locationSourceUrl ?? null,
        ],
      );
      locationId = locationResult.insertId;
    }

    const [categoryRows] = await connection.execute(
      "SELECT id FROM incident_categories WHERE LOWER(name) = LOWER(?) LIMIT 1",
      [candidate.category],
    );
    if (categoryRows.length === 0) {
      await connection.rollback();
      return { status: "REJECTED", inserted: false };
    }

    const [result] = await connection.execute(
      `INSERT INTO incidents
        (category_id, location_id, city, description, severity, incident_date,
         incident_time_known, location_description, source, source_name,
         source_url, source_published_at, verification_status,
         verification_method, last_verified_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'VERIFIED', ?, ?)`,
      [
        categoryRows[0].id,
        locationId,
        candidate.city,
        candidate.description,
        candidate.severity,
        candidate.incidentDate,
        candidate.incidentTimeKnown === true,
        candidate.locationDescription ?? null,
        candidate.sourceName,
        candidate.sourceName,
        candidate.sourceUrl,
        candidate.sourcePublishedAt ?? null,
        "Automated trusted-source validation and verification.",
        verifiedAt,
      ],
    );
    await connection.commit();
    return { status: "INSERTED", inserted: true, id: result.insertId };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { insertVerifiedCandidate, findExisting };
