// File note: This file handles verifiedIncidentScope.js.
const { TAGUIG_BARANGAY_SQL } = require("./taguigBarangays");

const VERIFIED_INCIDENT_SCOPE = `incidents.verification_status = 'VERIFIED'
  AND incidents.city IN ('Taguig City', 'Pateros')
  AND incidents.source_name IS NOT NULL
  AND incidents.source_url IS NOT NULL
  AND incidents.verification_method IS NOT NULL
  AND incidents.last_verified_at IS NOT NULL
  AND (
    incidents.city = 'Pateros'
    OR locations.barangay IS NULL
    OR ${TAGUIG_BARANGAY_SQL}
  )`;

module.exports = { VERIFIED_INCIDENT_SCOPE };
