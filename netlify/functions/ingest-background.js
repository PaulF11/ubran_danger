// File note: This file handles ingest-background.js.
const { timingSafeEqual } = require("node:crypto");

function authorized(event, expected) {
  const headers = event.headers || {};
  const value = headers.authorization || headers.Authorization || "";
  const provided = value.startsWith("Bearer ") ? value.slice(7) : "";
  if (!expected || !provided) return false;
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  );
}

function createBackgroundHandler({
  environment = process.env,
  logger = console,
  runIngestion,
} = {}) {
  return async (event) => {
    const secret =
      environment.SCHEDULED_INGEST_KEY || environment.INTERNAL_INGEST_KEY;
    if (!authorized(event, secret)) {
      logger.warn("[background-ingestion] rejected category=unauthorized");
      return { statusCode: 401, body: "Unauthorized." };
    }

    const service = require("../../backend/src/services/scheduledIngestionService");
    const pipeline =
      require("../../backend/src/services/automatedIncidentPipeline").runAutomatedIngestion;
    const runSource =
      event.headers?.["x-ingestion-run-source"] === "MANUAL" ||
      event.headers?.["X-Ingestion-Run-Source"] === "MANUAL"
        ? "MANUAL"
        : "SCHEDULED";
    try {
      service.validateIngestionEnvironment(environment);
    } catch {
      logger.error(
        "[background-ingestion] failed category=invalid_configuration",
      );
      return { statusCode: 500, body: "Ingestion is not configured." };
    }

    try {
      const reviewStore =
        runSource === "MANUAL"
          ? require("../../backend/src/services/adminScanReviewService").createAdminScanReviewService()
          : null;
      const result = runIngestion
        ? await runIngestion()
        : await service.runScheduledIngestion({
            environment,
            dbPool: require("../../backend/src/config/database"),
            runSource,
            runPipeline:
              runSource === "MANUAL"
                ? ({ runId }) =>
                    pipeline({
                      runId,
                      persistVerifiedCandidates: false,
                      reviewStore,
                    })
                : pipeline,
            logger,
          });
      if (result.status === "FAILED") {
        return { statusCode: 500, body: "Ingestion failed." };
      }
      if (result.status === "SKIPPED") {
        return { statusCode: 200, body: "An ingestion is already running." };
      }
      return { statusCode: 200, body: "Ingestion completed." };
    } catch {
      logger.error("[background-ingestion] failed category=unexpected");
      return { statusCode: 500, body: "Ingestion failed." };
    }
  };
}

exports.handler = createBackgroundHandler();
exports.createBackgroundHandler = createBackgroundHandler;
