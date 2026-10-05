const REQUIRED_ENVIRONMENT = [
  "DB_HOST",
  "DB_USER",
  "DB_PASSWORD",
  "DB_NAME",
  "GEMINI_API_KEY",
];
const LOCK_NAME = "urban-danger-automated-ingestion";

function validateIngestionEnvironment(environment) {
  const missing = REQUIRED_ENVIRONMENT.filter(
    (name) => typeof environment[name] !== "string" || !environment[name].trim(),
  );
  if (missing.length > 0) {
    throw new Error(`missing_configuration:${missing.join(",")}`);
  }

  const databaseHost = environment.DB_HOST.trim().toLowerCase();
  if (
    ["localhost", "127.0.0.1", "::1", "0.0.0.0"].includes(databaseHost) ||
    databaseHost.endsWith(".localhost")
  ) {
    throw new Error("invalid_configuration:local_db_host");
  }

  if (environment.DEVELOPMENT_NLP_STUB === "true") {
    throw new Error("invalid_configuration:development_extractor_enabled");
  }

  if (environment.DB_PORT !== undefined) {
    const port = Number(environment.DB_PORT);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error("invalid_configuration:db_port");
    }
  }
}

function errorCategory(error) {
  const message = error?.message || "";
  if (/configuration/i.test(message)) return "configuration";
  if (/429|rate-limit/i.test(message)) return "gemini_rate_limit";
  if (/timeout|timed out|abort/i.test(message)) return "timeout";
  if (/database|mysql|query|connection/i.test(message)) return "database";
  if (/source/i.test(message)) return "source";
  return "unexpected";
}

async function runScheduledIngestion({
  environment = process.env,
  dbPool,
  runPipeline,
  logger = console,
  now = Date.now,
} = {}) {
  const startedAt = now();
  logger.info("[scheduled-ingestion] start");

  try {
    validateIngestionEnvironment(environment);
  } catch (error) {
    logger.error(
      `[scheduled-ingestion] failed category=${errorCategory(error)}`,
    );
    return { status: "FAILED", category: errorCategory(error) };
  }

  let connection;
  let locked = false;
  try {
    connection = await dbPool.getConnection();
    const [lockRows] = await connection.query(
      "SELECT GET_LOCK(?, 0) AS acquired",
      [LOCK_NAME],
    );
    if (Number(lockRows?.[0]?.acquired) !== 1) {
      logger.info("[scheduled-ingestion] skipped category=already_running");
      return { status: "SKIPPED", category: "already_running" };
    }
    locked = true;

    const result = await runPipeline();
    const durationMs = Math.max(0, now() - startedAt);
    const sourceFailures = Number(result.sourcesFailed || 0);
    const articleFailures = Number(result.verificationFailures || 0);
    const articleError = result.results
      ?.flatMap((item) => item.reasons || [])
      .join(" ");
    const articleErrorCategory = errorCategory({ message: articleError });
    const category =
      sourceFailures > 0
        ? "source"
        : Number(result.articlesCollected || 0) === 0
          ? "empty_collection"
        : articleFailures > 0
          ? articleErrorCategory === "unexpected"
            ? "partial_article_failure"
            : articleErrorCategory
          : "none";
    logger.info(
      `[scheduled-ingestion] complete duration_ms=${durationMs} ` +
        `sources_checked=${Number(result.sourcesChecked || 0)} ` +
        `articles_collected=${Number(result.articlesCollected || 0)} ` +
        `articles_processed=${Number(result.articlesProcessed || 0)} ` +
        `verified=${Number(result.verifiedCandidates || 0)} ` +
        `inserted=${Number(result.insertedIncidents || 0)} ` +
        `duplicates=${Number(result.duplicates || 0)} ` +
        `conflicts=${Number(result.conflicts || 0)} ` +
        `failures=${category}`,
    );
    return { status: "COMPLETED", result };
  } catch (error) {
    const category = errorCategory(error);
    logger.error(
      `[scheduled-ingestion] failed category=${category} ` +
        `duration_ms=${Math.max(0, now() - startedAt)}`,
    );
    return { status: "FAILED", category };
  } finally {
    if (locked) {
      try {
        await connection.query("SELECT RELEASE_LOCK(?)", [LOCK_NAME]);
      } catch {
        logger.error("[scheduled-ingestion] failed category=lock_release");
      }
    }
    connection?.release();
  }
}

module.exports = {
  LOCK_NAME,
  errorCategory,
  runScheduledIngestion,
  validateIngestionEnvironment,
};
