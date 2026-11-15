const {
  createIncidentExpirationService,
} = require("../../backend/src/services/incidentExpirationService");
const {
  isIncidentExpirationEnabled,
} = require("../../backend/src/services/incidentExpirationPolicy");

function createExpirationHandler({
  environment = process.env,
  logger = console,
  expirationService,
} = {}) {
  const service =
    expirationService || createIncidentExpirationService({ logger });

  return async () => {
    if (!isIncidentExpirationEnabled(environment)) {
      logger.info("[incident-expiration] skipped category=disabled");
      return {
        statusCode: 200,
        body: "Incident expiration is disabled.",
      };
    }

    try {
      const result = await service.run();
      return {
        statusCode: 200,
        body: JSON.stringify(result),
      };
    } catch (error) {
      logger.error(
        `[incident-expiration] failed category=cleanup message=${error.message || "unknown"}`,
      );
      return {
        statusCode: 500,
        body: "Incident expiration failed.",
      };
    }
  };
}

exports.handler = createExpirationHandler();
exports.createExpirationHandler = createExpirationHandler;
