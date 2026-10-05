const express = require("express");
const pool = require("../config/database");
const {
  runAutomatedIngestion,
} = require("../services/automatedIncidentPipeline");
const { runManualIngestion } = require("../services/scheduledIngestionService");

const router = express.Router();

router.get("/status", (req, res) => {
  res.json({
    success: true,
    data: {
      architecture: "automated_verified_incident_pipeline",
      coverage: "Taguig City, Philippines",
      publicApi: "/api/incidents",
      trustedSourceAllowlist: (
        process.env.TRUSTED_SOURCE_HOSTS || "taguig.gov.ph,pnp.gov.ph"
      )
        .split(",")
        .map((host) => host.trim())
        .filter(Boolean),
      ingestionEnabled: process.env.NODE_ENV !== "production",
    },
  });
});

router.post("/ingest", async (req, res, next) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({
      success: false,
      message: "Automated ingestion is restricted to development mode.",
    });
  }

  const expectedKey = (process.env.INTERNAL_INGEST_KEY || "").trim();
  const providedKey = req.get("x-internal-ingest-key") || "";

  if (!expectedKey || providedKey !== expectedKey) {
    return res.status(401).json({
      success: false,
      message: "Internal ingestion is not authorized.",
    });
  }

  try {
    const run = await runManualIngestion({
      dbPool: pool,
      runPipeline: runAutomatedIngestion,
    });
    if (run.status === "FAILED") {
      return res.status(500).json({
        success: false,
        message: "Automated ingestion failed.",
        data: { category: run.category },
      });
    }
    return res.json({ success: true, data: run.result });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
