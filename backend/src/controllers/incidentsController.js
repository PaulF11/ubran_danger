// File note: This file handles incidentsController.js.

const pool = require("../config/database");
const {
  TAGUIG_BARANGAY_PARAMS,
} = require("../constants/taguigBarangays");
const {
  VERIFIED_INCIDENT_SCOPE,
} = require("../constants/verifiedIncidentScope");

function createIncidentsController({ database = pool } = {}) {
  return {
    getIncidents: async (req, res) => {
      try {
    const view = typeof req.query.view === "string" ? req.query.view : "recent";
    if (!["recent", "historical", "all"].includes(view)) {
      return res.status(400).json({
        success: false,
        message: "Invalid incident feed view.",
      });
    }
    const dateFilter =
      view === "recent"
        ? "AND COALESCE(incidents.source_published_at, DATE(incidents.incident_date)) >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)"
        : view === "historical"
          ? "AND COALESCE(incidents.source_published_at, DATE(incidents.incident_date)) < DATE_SUB(CURDATE(), INTERVAL 30 DAY)"
          : "";

    const [incidents] = await database.query(
      `SELECT
        incidents.id,
        incident_categories.name AS category_name,
        incident_categories.description AS category_description,
        incidents.city,
        locations.barangay,
        locations.latitude,
        locations.longitude,
        incidents.location_description,
        locations.location_source_name,
        locations.location_source_url,
        incidents.description,
        incidents.severity,
        CASE
          WHEN incidents.incident_time_known = TRUE THEN CONCAT(
            DATE_FORMAT(incidents.incident_date, '%Y-%m-%dT%H:%i:%s'),
            '+08:00'
          )
          ELSE DATE_FORMAT(incidents.incident_date, '%Y-%m-%d')
        END AS incident_date,
        incidents.incident_time_known,
        incidents.source,
        incidents.source_name,
        incidents.source_url,
        DATE_FORMAT(incidents.source_published_at, '%Y-%m-%d')
          AS source_published_at,
        incidents.verification_status,
        incidents.verification_method,
        CONCAT(
          DATE_FORMAT(incidents.last_verified_at, '%Y-%m-%dT%H:%i:%s'),
          'Z'
        ) AS last_verified_at
      FROM incidents
      JOIN incident_categories
        ON incidents.category_id = incident_categories.id
      LEFT JOIN locations
        ON incidents.location_id = locations.id
      WHERE ${VERIFIED_INCIDENT_SCOPE}
        ${dateFilter}
      ORDER BY COALESCE(incidents.source_published_at, DATE(incidents.incident_date)) DESC,
        incidents.incident_date DESC, incidents.id DESC`,
      TAGUIG_BARANGAY_PARAMS,
    );

    return res.json({ success: true, data: incidents });
      } catch (error) {
        console.error(error);
        return res
          .status(500)
          .json({ success: false, message: "Failed to retrieve incidents" });
      }
    },
  };
}

module.exports = {
  ...createIncidentsController(),
  createIncidentsController,
};
