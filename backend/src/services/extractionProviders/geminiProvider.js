// File note: This file handles geminiProvider.js.
const GEMINI_API_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-3.5-flash";
const MAX_RATE_LIMIT_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 8000;
let requestQueue = Promise.resolve();

function parseJsonContent(content) {
  const withoutFence = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  return JSON.parse(withoutFence);
}

function serializeRequest(task) {
  const request = requestQueue.then(task, task);
  requestQueue = request.then(
    () => undefined,
    () => undefined,
  );
  return request;
}

function retryAfterDelay(response) {
  const retryAfter = response.headers?.get?.("retry-after");
  if (!retryAfter) return null;

  const seconds = Number(retryAfter);
  const delay =
    Number.isFinite(seconds) && seconds >= 0
      ? seconds * 1000
      : Date.parse(retryAfter) - Date.now();
  if (!Number.isFinite(delay)) return null;
  return Math.min(MAX_RETRY_DELAY_MS, Math.max(0, delay));
}

async function extract(
  sourceText,
  {
    fetchImpl = fetch,
    sleep = (delayMs) =>
      new Promise((resolve) => setTimeout(resolve, delayMs)),
  } = {},
) {
  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error(
      "Incident extraction requires GEMINI_API_KEY to be configured.",
    );
  }

  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const endpoint = `${GEMINI_API_BASE_URL}/${encodeURIComponent(model)}:generateContent`;

  return serializeRequest(async () => {
    const requestOptions = {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text:
                  "Extract one individual incident candidate from the supplied trusted article. " +
                  "If the article does not report an individual incident, return JSON null. " +
                  "Return JSON only. Never infer facts or coordinates. Use null for missing values. " +
                  "category must be exactly one of Theft, Robbery, Assault, Vandalism, Other. " +
                  "Map shooting, stabbing, physical attack, assault, battery, or intentional physical violence to Assault; " +
                  "taking property without direct confrontation to Theft; taking property through force, threat, or intimidation to Robbery; " +
                  "intentional damage or destruction of property to Vandalism; and anything that does not clearly fit to Other. " +
                  "severity must be exactly one of LOW, MEDIUM, HIGH. Use HIGH for death, firearm-related serious incidents, " +
                  "serious injury, or other clearly severe physical harm; MEDIUM for physical harm or significant threats not meeting HIGH; " +
                  "and LOW for minor incidents without serious harm. Base category and severity only on supported facts; do not invent facts. " +
                  "The sourceEvidence object must quote or summarize only facts supported by the article, " +
                  "and sourceReviewed must be true only when the article itself supports the fields.\n\n" +
                  "Return these JSON fields: category, city, barangay, incidentDate, incidentTimeKnown, " +
                  "description, severity, severityFacts, latitude, longitude, locationDescription, " +
                  "sourceEvidence. sourceEvidence must contain sourceReviewed, city, incidentDate, " +
                  `location, and eventFacts.\n\nARTICLE:\n${sourceText}`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
        },
      }),
    };

    for (let attempt = 0; ; attempt += 1) {
      const response = await fetchImpl(endpoint, {
        ...requestOptions,
        signal: AbortSignal.timeout(30000),
      });
      if (response.ok) {
        const payload = await response.json();
        const content = payload.candidates?.[0]?.content?.parts
          ?.map((part) => part.text)
          .filter((part) => typeof part === "string")
          .join("");
        if (typeof content !== "string" || !content.trim()) {
          throw new Error("Incident extraction provider returned no candidate.");
        }
        try {
          return parseJsonContent(content);
        } catch {
          throw new Error(
            "Incident extraction provider returned a non-JSON candidate.",
          );
        }
      }

      if (response.status !== 429) {
        throw new Error(
          `Incident extraction provider returned HTTP ${response.status}.`,
        );
      }
      if (attempt >= MAX_RATE_LIMIT_RETRIES) {
        throw new Error(
          "Incident extraction provider was rate-limited after retries (HTTP 429).",
        );
      }

      const exponentialDelay = Math.min(
        MAX_RETRY_DELAY_MS,
        BASE_RETRY_DELAY_MS * 2 ** attempt,
      );
      await sleep(retryAfterDelay(response) ?? exponentialDelay);
    }
  });
}

module.exports = {
  extract,
  GEMINI_API_BASE_URL,
  DEFAULT_MODEL,
};
