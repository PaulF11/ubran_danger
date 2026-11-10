// File note: This file handles admin.js.

const express = require("express");
const pool = require("../config/database");
const { createAdminAuth } = require("../middleware/adminAuth");
const { createAdminDataService } = require("../services/adminDataService");
const { createAdminScanService } = require("../services/adminScanService");
const {
  createAdminScanReviewService,
} = require("../services/adminScanReviewService");

function createAdminRouter({
  database = pool,
  environment = process.env,
  now,
  dataService,
  scanService,
  reviewService,
} = {}) {
  const router = express.Router();
  const auth = createAdminAuth({ environment, now });
  const data =
    dataService || createAdminDataService({ database, environment, now });
  const scan = scanService || createAdminScanService({ database, environment });
  const reviews =
    reviewService || createAdminScanReviewService({ database, now });

  router.post("/login", auth.login);
  router.use(auth.authenticate);

  router.post("/run-scan", async (req, res) => {
    try {
      const result = await scan.start();
      return res
        .status(result.status === "RUNNING" ? 202 : 200)
        .json({ success: true, data: result });
    } catch {
      return res.status(503).json({
        success: false,
        message: "Manual ingestion could not be started.",
      });
    }
  });

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

  router.get("/scan-candidates", (req, res) => {
    const runId = req.query.runId;
    if (!/^\d+$/.test(String(runId || "")) || Number(runId) < 1) {
      return res.status(400).json({
        success: false,
        message: "A valid scan run ID is required.",
      });
    }
    return send(() => reviews.listRunCandidates(runId))(req, res);
  });

  const reviewAction = (handler) => async (req, res) => {
    if (!/^\d+$/.test(req.params.id) || Number(req.params.id) < 1) {
      return res.status(400).json({
        success: false,
        message: "Scan candidate ID must be a positive integer.",
      });
    }
    try {
      const reviewer = String(
        req.admin?.username || req.user?.id || req.user?.username || "admin",
      );
      const result = await handler(req.params.id, reviewer, req);
      if (result === null) {
        return res.status(404).json({
          success: false,
          message: "The scan candidate was not found.",
        });
      }
      return res.json({ success: true, data: result });
    } catch (error) {
      const statusCode =
        error.code === "REVIEW_CONFLICT" ||
        error.code === "CANDIDATE_NOT_APPROVABLE"
          ? 409
          : 500;
      return res.status(statusCode).json({
        success: false,
        message:
          statusCode === 409
            ? error.message
            : "The scan review action could not be completed.",
      });
    }
  };

  router.post(
    "/scan-candidates/:id/approve",
    reviewAction((id, reviewer, req) => {
      if (req.body?.confirmed !== true) {
        const error = new Error("Explicit confirmation is required.");
        error.code = "CANDIDATE_NOT_APPROVABLE";
        throw error;
      }
      return reviews.approveCandidate(id, reviewer);
    }),
  );

  router.post(
    "/scan-candidates/:id/reject",
    reviewAction((id, reviewer) => reviews.rejectCandidate(id, reviewer)),
  );

  return router;
}

module.exports = { createAdminRouter };
