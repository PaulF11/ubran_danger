const express = require("express");
const pool = require("../config/database");
const { createAdminAuth } = require("../middleware/adminAuth");
const { createAdminDataService } = require("../services/adminDataService");

function createAdminRouter({
  database = pool,
  environment = process.env,
  now,
  dataService,
} = {}) {
  const router = express.Router();
  const auth = createAdminAuth({ environment, now });
  const data =
    dataService || createAdminDataService({ database, environment, now });

  router.post("/login", auth.login);
  router.use(auth.authenticate);

  const send = (handler) => async (req, res) => {
    try {
      const result = await handler(req);
      if (result === null) {
        return res.status(404).json({
          success: false,
          message: "The requested record was not found.",
        });
      }
      return res.json({ success: true, data: result });
    } catch {
      return res.status(500).json({
        success: false,
        message: "Admin data is temporarily unavailable.",
      });
    }
  };

  router.get(
    "/dashboard",
    send(() => data.getDashboard()),
  );
  router.get(
    "/incidents",
    send((req) => data.getIncidents(req.query)),
  );
  router.get("/incidents/:id", (req, res, next) => {
    if (!/^\d+$/.test(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Incident ID must be a positive integer.",
      });
    }
    return send(() => data.getIncident(req.params.id))(req, res, next);
  });
  router.get(
    "/ingestion-runs",
    send((req) => data.getIngestionRuns(req.query)),
  );
  router.get("/ingestion-runs/:id", (req, res, next) => {
    if (!/^\d+$/.test(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Ingestion run ID must be a positive integer.",
      });
    }
    return send(() => data.getIngestionRun(req.params.id))(req, res, next);
  });
  router.get(
    "/sources",
    send(() => data.getSources()),
  );
  router.get(
    "/system-status",
    send(() => data.getSystemStatus()),
  );

  return router;
}

module.exports = { createAdminRouter };
