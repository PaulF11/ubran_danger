// File note: This file handles adminIncidentsController.js.

const pool = require("../config/database");
const {
  TAGUIG_BARANGAY_PARAMS,
  TAGUIG_BARANGAY_SQL,
} = require("../constants/taguigBarangays");

exports.getIncidents = async (req, res, next) => {
  try {
    const [incidents] = await pool.execute(
      `SELECT
        incidents.id,
        incident_categories.name AS category_name,
        incident_categories.description AS category_description,
        locations.barangay,
        locations.latitude,
        locations.longitude,
        incidents.description,
        incidents.severity,
        incidents.incident_date,
        incidents.source,
        incidents.verification_status
      FROM incidents
      JOIN incident_categories
        ON incidents.category_id = incident_categories.id
      JOIN locations
        ON incidents.location_id = locations.id
      WHERE ${TAGUIG_BARANGAY_SQL}
      ORDER BY incidents.incident_date DESC`,
      TAGUIG_BARANGAY_PARAMS,
    );

    return res.json({ success: true, data: incidents });
  } catch (error) {
    return next(error);
  }
};

exports.updateIncident = async (req, res, next) => {
  const incidentId = Number(req.params.id);
  if (!Number.isSafeInteger(incidentId) || incidentId <= 0) {
    return res.status(400).json({
      success: false,
      message: "A valid incident id is required.",
    });
  }

  const body = req.body || {};
  const updates = [];
  const values = [];

  if (Object.hasOwn(body, "description")) {
    if (
      typeof body.description !== "string" ||
      body.description.trim().length === 0 ||
      Buffer.byteLength(body.description, "utf8") > 60000
    ) {
      return res.status(400).json({
        success: false,
        message: "Description must be between 1 and 60000 bytes.",
      });
    }
    updates.push("description = ?");
    values.push(body.description.trim());
  }

  if (Object.hasOwn(body, "severity")) {
    if (!["LOW", "MEDIUM", "HIGH"].includes(body.severity)) {
      return res.status(400).json({
        success: false,
        message: "Severity must be LOW, MEDIUM, or HIGH.",
      });
    }
    updates.push("severity = ?");
    values.push(body.severity);
  }

  if (Object.hasOwn(body, "incidentDate")) {
    const parsedDate = new Date(body.incidentDate);
    if (typeof body.incidentDate !== "string" || !Number.isFinite(parsedDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "A valid incident date is required.",
      });
    }
    updates.push("incident_date = ?");
    values.push(parsedDate.toISOString().slice(0, 19).replace("T", " "));
  }

  if (Object.hasOwn(body, "source")) {
    if (
      typeof body.source !== "string" ||
      body.source.trim().length === 0 ||
      body.source.trim().length > 255
    ) {
      return res.status(400).json({
        success: false,
        message: "Source must be between 1 and 255 characters.",
      });
    }
    updates.push("source = ?");
    values.push(body.source.trim());
  }

  if (updates.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Provide description, severity, incidentDate, or source to update.",
    });
  }

  try {
    const [result] = await pool.execute(
      `UPDATE incidents
       JOIN locations ON incidents.location_id = locations.id
       SET ${updates.join(", ")}
       WHERE incidents.id = ? AND ${TAGUIG_BARANGAY_SQL}`,
      [...values, incidentId, ...TAGUIG_BARANGAY_PARAMS],
    );
    if (result.affectedRows === 0) {
      const [incidents] = await pool.execute(
        `SELECT incidents.id FROM incidents
         JOIN locations ON incidents.location_id = locations.id
         WHERE incidents.id = ? AND ${TAGUIG_BARANGAY_SQL}
         LIMIT 1`,
        [incidentId, ...TAGUIG_BARANGAY_PARAMS],
      );
      if (incidents.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Incident not found.",
        });
      }
    }

    return res.json({ success: true, data: { id: incidentId } });
  } catch (error) {
    return next(error);
  }
};
