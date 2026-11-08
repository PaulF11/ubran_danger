// File note: This file handles scheduled-ingestion.js.
const { URL } = require("node:url");

const BACKGROUND_FUNCTION_PATH = "/.netlify/functions/ingest-background";
const MAX_TRIGGER_WAIT_MS = 10000;

function validSiteUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !["localhost", "127.0.0.1", "::1"].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

function createScheduledHandler({
  environment = process.env,
  logger = console,
  fetchImpl = fetch,
} = {}) {
  return async () => {
    logger.info("[scheduled-ingestion-trigger] invoked");

    const secret =
      environment.SCHEDULED_INGEST_KEY || environment.INTERNAL_INGEST_KEY;
    const siteUrl = environment.URL;
    if (!secret || !siteUrl || !validSiteUrl(siteUrl)) {
      logger.error(
        "[scheduled-ingestion-trigger] failed category=invalid_configuration",
      );
      return {
        statusCode: 500,
        body: "Scheduled ingestion is not configured.",
      };
    }

    try {
      const endpoint = new URL(BACKGROUND_FUNCTION_PATH, siteUrl);
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: { authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(MAX_TRIGGER_WAIT_MS),
      });
      if (response.status !== 202) {
        logger.error(
          `[scheduled-ingestion-trigger] failed category=background_rejected status=${response.status}`,
        );
        return {
          statusCode: 502,
          body: "Background ingestion was not accepted.",
        };
      }
      logger.info("[scheduled-ingestion-trigger] background_started");
      return { statusCode: 202, body: "Ingestion started." };
    } catch (error) {
      const category =
        error?.name === "TimeoutError" || error?.name === "AbortError"
          ? "trigger_timeout"
          : "trigger_unavailable";
      logger.error(`[scheduled-ingestion-trigger] failed category=${category}`);
      return {
        statusCode: 502,
        body: "Background ingestion could not be started.",
      };
    }
  };
}

exports.handler = createScheduledHandler();
exports.createScheduledHandler = createScheduledHandler;
