const pool = require("../config/database");
const {
  TAGUIG_BARANGAY_PARAMS,
  TAGUIG_BARANGAY_SQL,
} = require("../constants/taguigBarangays");

exports.getIncidents = async (req, res) => {
  try {
    const [incidents] = await pool.query(
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
      WHERE incidents.verification_status = 'VERIFIED'
        AND incidents.city = 'Taguig City'
        AND incidents.source_name IS NOT NULL
        AND incidents.source_url IS NOT NULL
        AND incidents.verification_method IS NOT NULL
        AND incidents.last_verified_at IS NOT NULL
        AND (locations.barangay IS NULL OR ${TAGUIG_BARANGAY_SQL})
      ORDER BY incidents.incident_date DESC`,
      TAGUIG_BARANGAY_PARAMS,
    );

    return res.json({ success: true, data: incidents });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to retrieve incidents" });
  }
};
