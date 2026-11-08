// File note: This file handles adminScanService.js.
const pool = require("../config/database");
const { runManualIngestion } = require("./scheduledIngestionService");
const { runAutomatedIngestion } = require("./automatedIncidentPipeline");
const { createAdminScanReviewService } = require("./adminScanReviewService");

const BACKGROUND_FUNCTION_PATH = "/.netlify/functions/ingest-background";

function createAdminScanService({
  database = pool,
  environment = process.env,
  runManual = runManualIngestion,
  runPipeline = runAutomatedIngestion,
  reviewStore = createAdminScanReviewService({ database }),
  fetchImpl = fetch,
  logger = console,
} = {}) {
  async function latestRunId() {
    const [rows] = await database.execute(
      "SELECT id FROM ingestion_runs ORDER BY id DESC LIMIT 1",
    );
    return Number(rows[0]?.id || 0);
  }

  async function start() {
    const afterRunId = await latestRunId();

    if (environment.NODE_ENV === "production") {
      const secret =
        environment.SCHEDULED_INGEST_KEY || environment.INTERNAL_INGEST_KEY;
      let siteUrl;
      try {
        siteUrl = new URL(environment.URL);
      } catch {
        throw new Error("manual_scan_unavailable");
      }
      if (
        !secret ||
        siteUrl.protocol !== "https:" ||
        siteUrl.username ||
        siteUrl.password
      ) {
        throw new Error("manual_scan_unavailable");
      }

      const response = await fetchImpl(
        new URL(BACKGROUND_FUNCTION_PATH, siteUrl),
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${secret}`,
            "x-ingestion-run-source": "MANUAL",
          },
          signal: AbortSignal.timeout(8000),
        },
      );
      if (response.status !== 202) {
        throw new Error("manual_scan_unavailable");
      }
      return { status: "RUNNING", afterRunId };
    }

    const result = await runManual({
      dbPool: database,
      runPipeline: (context) =>
        runPipeline({
          ...context,
          persistVerifiedCandidates: false,
          reviewStore,
        }),
      logger,
    });
    if (result.status === "FAILED") {
      return { status: "FAILED", category: result.category, afterRunId };
    }
    if (result.status === "SKIPPED") {
      return { status: "SKIPPED", category: result.category, afterRunId };
    }
    return {
      status: "COMPLETED",
      afterRunId,
      runId: result.runId,
      summary: result.result,
    };
  }

  return { start };
}

module.exports = { BACKGROUND_FUNCTION_PATH, createAdminScanService };
