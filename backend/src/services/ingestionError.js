const RATE_LIMIT_PATTERN =
  /\b429\b|rate[\s_-]?limit|quota|resource[\s_-]?exhausted/i;
const RETRYABLE_MESSAGE_PATTERN =
  /\bHTTP\s+(?:408|429|5\d{2})\b|timeout|timed out|abort|database|mysql|connection/i;
const RETRYABLE_CODES = new Set([
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
]);

function messageOf(error) {
  if (typeof error?.message === "string") return error.message;
  return error == null ? "" : String(error);
}

function statusOf(error) {
  const status = Number(
    error?.status ?? error?.statusCode ?? error?.response?.status,
  );
  return Number.isInteger(status) ? status : null;
}

function isRateLimitError(error) {
  return (
    statusOf(error) === 429 || RATE_LIMIT_PATTERN.test(messageOf(error))
  );
}

function isRetryableError(error) {
  const status = statusOf(error);
  return (
    error?.retryable === true ||
    isRateLimitError(error) ||
    status === 408 ||
    (status !== null && status >= 500) ||
    RETRYABLE_CODES.has(error?.code) ||
    RETRYABLE_MESSAGE_PATTERN.test(messageOf(error))
  );
}

module.exports = { isRateLimitError, isRetryableError };
