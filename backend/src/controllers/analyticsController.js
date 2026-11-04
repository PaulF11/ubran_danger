const pool = require("../config/database");
const { TAGUIG_BARANGAY_PARAMS } = require("../constants/taguigBarangays");
const { VERIFIED_INCIDENT_SCOPE } = require("../constants/verifiedIncidentScope");

function createAnalyticsController({ database = pool } = {}) {
  return {
    getSummary: async (req, res, next) => {
      try {
        const [
          totals,
          categories,
          severities,
          barangays,
          months,
          activityRows,
        ] = await Promise.all([
          database.execute(
          `SELECT COUNT(*) AS total
         FROM incidents
         LEFT JOIN locations ON incidents.location_id = locations.id
         WHERE ${VERIFIED_INCIDENT_SCOPE}`,
            TAGUIG_BARANGAY_PARAMS,
          ),
          database.execute(
          `SELECT incident_categories.name AS label, COUNT(*) AS count
         FROM incidents
         JOIN incident_categories ON incidents.category_id = incident_categories.id
         LEFT JOIN locations ON incidents.location_id = locations.id
         WHERE ${VERIFIED_INCIDENT_SCOPE}
         GROUP BY incident_categories.id, incident_categories.name
         ORDER BY count DESC, label ASC`,
            TAGUIG_BARANGAY_PARAMS,
          ),
          database.execute(
          `SELECT incidents.severity AS label, COUNT(*) AS count
         FROM incidents
         LEFT JOIN locations ON incidents.location_id = locations.id
         WHERE ${VERIFIED_INCIDENT_SCOPE}
         GROUP BY incidents.severity
         ORDER BY incidents.severity ASC`,
            TAGUIG_BARANGAY_PARAMS,
          ),
          database.execute(
          `SELECT COALESCE(locations.barangay, 'Location not reported') AS label,
          COUNT(*) AS count
         FROM incidents
         LEFT JOIN locations ON incidents.location_id = locations.id
         WHERE ${VERIFIED_INCIDENT_SCOPE}
         GROUP BY locations.barangay
         ORDER BY count DESC, label ASC`,
            TAGUIG_BARANGAY_PARAMS,
          ),
          database.execute(
          `SELECT DATE_FORMAT(incidents.incident_date, '%Y-%m') AS label,
                COUNT(*) AS count
         FROM incidents
         LEFT JOIN locations ON incidents.location_id = locations.id
         WHERE ${VERIFIED_INCIDENT_SCOPE}
         GROUP BY DATE_FORMAT(incidents.incident_date, '%Y-%m')
         ORDER BY label ASC`,
            TAGUIG_BARANGAY_PARAMS,
          ),
          database.execute(
          `SELECT COALESCE(locations.barangay, 'Location not reported') AS label,
                COUNT(*) AS count
         FROM incidents
         LEFT JOIN locations ON incidents.location_id = locations.id
         WHERE ${VERIFIED_INCIDENT_SCOPE}
         GROUP BY locations.barangay
         ORDER BY count DESC, label ASC`,
            TAGUIG_BARANGAY_PARAMS,
          ),
        ]);

        const toCounts = ([rows]) =>
          rows.map(({ label, count }) => ({ label, count: Number(count) }));
        const activityLevel = (count) => {
          if (count >= 6) return "VERY HIGH";
          if (count >= 3) return "HIGH";
          if (count >= 1) return "MODERATE";
          return "LOW";
        };
        const activityByBarangay = toCounts(activityRows).map((item) => ({
          ...item,
          level: activityLevel(item.count),
        }));

        return res.json({
          success: true,
          data: {
            total: Number(totals[0][0].total),
            byCategory: toCounts(categories),
            bySeverity: toCounts(severities),
            byBarangay: toCounts(barangays),
            byMonth: toCounts(months),
            activityLevel: activityLevel(Number(totals[0][0].total)),
            activityByBarangay,
          },
        });
      } catch (error) {
        return next(error);
      }
    },
  };
}

module.exports = {
  ...createAnalyticsController(),
  createAnalyticsController,
};
