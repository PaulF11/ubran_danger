// File note: This file handles automated-pipeline-safety.test.js.

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  runAutomatedIngestion,
} = require("../src/services/automatedIncidentPipeline");
const {
  collectTrustedSources,
} = require("../src/services/sourceCollectorService");

const article = {
  source: "Trusted source",
  sourceName: "Trusted source",
  url: "https://trusted.example.test/incident",
  publishedAt: "2025-09-24",
  retrievedAt: "2025-09-25T00:00:00.000Z",
  content: "Police arrested a suspect after a theft in Taguig City.",
};
const candidate = { category: "Theft", city: "Taguig City" };
const emptyProcessedSources = {
  findProcessed: async () => new Set(),
  recordProcessed: async () => {},
};

test("rate limits, timeouts, and malformed responses remain distinct and never persist", async () => {
  for (const [error, expectedStatus, retryable] of [
    [
      new Error(
        "Incident extraction provider was rate-limited after retries (HTTP 429).",
      ),
      "RATE_LIMITED",
      true,
    ],
    [new Error("Gemini request timed out."), "EXTRACTION_FAILED", true],
    [
      new Error("Incident extraction provider returned a non-JSON candidate."),
      "EXTRACTION_FAILED",
      false,
    ],
  ]) {
    let persistenceCalls = 0;
    const summary = await runAutomatedIngestion({
      collector: async () => [article],
      processedSources: emptyProcessedSources,
      extractor: async () => {
        throw error;
      },
      persister: async () => {
        persistenceCalls += 1;
        return { status: "INSERTED" };
      },
    });
    assert.equal(summary.insertedIncidents, 0);
    assert.equal(summary.results[0].status, expectedStatus);
    assert.equal(summary.results[0].verified, false);
    assert.equal(summary.results[0].retryable, retryable);
    assert.equal(persistenceCalls, 0);
  }
});

test("source retrieval failure returns an empty result and a failure count", async () => {
  const summary = await runAutomatedIngestion({
    collector: async () => {
      const articles = [];
      Object.defineProperties(articles, {
        sourcesChecked: { value: 0 },
        sourcesFailed: { value: 2 },
      });
      return articles;
    },
  });
  assert.equal(summary.articlesCollected, 0);
  assert.equal(summary.sourcesFailed, 2);
  assert.equal(summary.insertedIncidents, 0);
});

test("database persistence failures are retryable and are not classified as rejected articles", async () => {
  const recorded = [];
  const summary = await runAutomatedIngestion({
    collector: async () => [article],
    processedSources: {
      findProcessed: async () => new Set(),
      recordProcessed: async (url, status) => recorded.push({ url, status }),
    },
    extractor: async () => candidate,
    verifier: async () => ({ verified: true, status: "VERIFIED" }),
    persister: async () => {
      throw new Error("Database query failed.");
    },
  });
  assert.equal(summary.insertedIncidents, 0);
  assert.equal(summary.results[0].status, "PERSISTENCE_FAILED");
  assert.equal(summary.results[0].verified, false);
  assert.equal(summary.results[0].retryable, true);
  assert.equal(summary.candidatesRejected, 0);
  assert.deepEqual(recorded, [{ url: article.url, status: "RETRY" }]);
});

test("previously processed sources are skipped before Gemini extraction", async () => {
  let extractionCalls = 0;
  const summary = await runAutomatedIngestion({
    collector: async () => [article],
    processedSources: {
      findProcessed: async () => new Set([article.url]),
      recordProcessed: async () => {},
    },
    extractor: async () => {
      extractionCalls += 1;
      return candidate;
    },
  });

  assert.equal(extractionCalls, 0);
  assert.equal(summary.articlesSkipped, 1);
  assert.equal(summary.geminiRequests, 0);
  assert.equal(summary.results[0].status, "SKIPPED_PROCESSED");
});

test("expired extracted incidents are skipped and marked processed without persistence", async () => {
  const recorded = [];
  let verifierCalls = 0;
  let persistenceCalls = 0;
  const summary = await runAutomatedIngestion({
    collector: async () => [article],
    processedSources: {
      findProcessed: async () => new Set(),
      recordProcessed: async (url, status) => recorded.push({ url, status }),
    },
    extractor: async () => ({ ...candidate, incidentDate: "2025-11-14" }),
    verifier: async () => {
      verifierCalls += 1;
      return { verified: true, status: "VERIFIED" };
    },
    persister: async () => {
      persistenceCalls += 1;
      return { status: "INSERTED" };
    },
    now: () => new Date("2026-11-15T16:00:00Z"),
  });

  assert.equal(summary.expiredCandidates, 1);
  assert.equal(summary.insertedIncidents, 0);
  assert.equal(summary.results[0].status, "EXPIRED");
  assert.equal(summary.results[0].candidate, null);
  assert.equal(verifierCalls, 0);
  assert.equal(persistenceCalls, 0);
  assert.deepEqual(recorded, [{ url: article.url, status: "PROCESSED" }]);
});

test("a Gemini rate limit pauses remaining candidate requests in the scan", async () => {
  let extractionCalls = 0;
  const recorded = [];
  const summary = await runAutomatedIngestion({
    collector: async () => [article, { ...article, url: `${article.url}-2` }],
    processedSources: {
      findProcessed: async () => new Set(),
      recordProcessed: async (url, status) => recorded.push({ url, status }),
    },
    extractor: async () => {
      extractionCalls += 1;
      throw new Error("provider rate-limited after retries (HTTP 429)");
    },
  });

  assert.equal(extractionCalls, 1);
  assert.equal(summary.geminiRequests, 1);
  assert.equal(summary.rateLimitCount, 1);
  assert.equal(summary.articlesSkipped, 1);
  assert.equal(summary.results[0].status, "RATE_LIMITED");
  assert.equal(summary.results[1].status, "RATE_LIMITED");
  assert.deepEqual(recorded, [
    { url: article.url, status: "RETRY" },
    { url: `${article.url}-2`, status: "RETRY" },
  ]);
});

test("a Gemini HTTP 5xx failure remains eligible for a later retry", async () => {
  const recorded = [];
  const summary = await runAutomatedIngestion({
    collector: async () => [article],
    processedSources: {
      findProcessed: async () => new Set(),
      recordProcessed: async (url, status) => recorded.push({ url, status }),
    },
    extractor: async () => {
      throw new Error("Incident extraction provider returned HTTP 503.");
    },
  });

  assert.equal(summary.geminiRequests, 1);
  assert.equal(summary.results[0].status, "EXTRACTION_FAILED");
  assert.deepEqual(recorded, [{ url: article.url, status: "RETRY" }]);
});

test("rate-limited sources resume on a later run without inserting duplicates", async () => {
  const retrySources = new Set();
  let extractionCalls = 0;
  let persistenceCalls = 0;
  const processedSources = {
    async findProcessed(urls) {
      return new Set();
    },
    async recordProcessed(url, status) {
      if (status === "PROCESSED") retrySources.delete(url);
      else retrySources.add(url);
    },
  };
  const options = {
    collector: async () => [article],
    processedSources,
    extractor: async () => {
      extractionCalls += 1;
      if (extractionCalls === 1) {
        throw new Error("provider rate-limited after retries (HTTP 429)");
      }
      return candidate;
    },
    verifier: async () => ({ verified: true, status: "VERIFIED" }),
    persister: async () => {
      persistenceCalls += 1;
      return { status: "DUPLICATE", inserted: false };
    },
  };

  const limitedRun = await runAutomatedIngestion(options);
  const resumedRun = await runAutomatedIngestion(options);

  assert.equal(limitedRun.results[0].status, "RATE_LIMITED");
  assert.equal(resumedRun.results[0].status, "DUPLICATE");
  assert.equal(extractionCalls, 2);
  assert.equal(persistenceCalls, 1);
  assert.equal(resumedRun.insertedIncidents, 0);
  assert.equal(retrySources.has(article.url), false);
});

test("unavailable and timed-out source requests are safely counted without live HTTP", async () => {
  const originalHosts = process.env.TRUSTED_SOURCE_HOSTS;
  const originalTargets = process.env.SOURCE_COLLECTION_TARGET_URLS;
  process.env.TRUSTED_SOURCE_HOSTS = "taguig.gov.ph,pnp.gov.ph";
  process.env.SOURCE_COLLECTION_TARGET_URLS =
    "https://news.tv5.com.ph/articles";
  try {
    const unavailable = await collectTrustedSources({
      fetchImpl: async () => {
        throw new Error("source unavailable");
      },
    });
    assert.equal(unavailable.length, 0);
    assert.equal(unavailable.sourcesFailed, 1);

    const unsuccessfulResponse = await collectTrustedSources({
      fetchImpl: async () => ({ ok: false, status: 503 }),
    });
    assert.equal(unsuccessfulResponse.length, 0);
    assert.equal(unsuccessfulResponse.sourcesFailed, 1);

    let requestCount = 0;
    const timedOutArticle = await collectTrustedSources({
      fetchImpl: async () => {
        requestCount += 1;
        if (requestCount === 1) {
          return {
            ok: true,
            text: async () =>
              '<a href="/incident">Police arrested a suspect in a Taguig theft</a>',
          };
        }
        throw new Error("source timeout");
      },
    });
    assert.equal(requestCount, 2);
    assert.equal(timedOutArticle.length, 0);
    assert.equal(timedOutArticle.sourcesFailed, 1);
  } finally {
    if (originalHosts === undefined) delete process.env.TRUSTED_SOURCE_HOSTS;
    else process.env.TRUSTED_SOURCE_HOSTS = originalHosts;
    if (originalTargets === undefined)
      delete process.env.SOURCE_COLLECTION_TARGET_URLS;
    else process.env.SOURCE_COLLECTION_TARGET_URLS = originalTargets;
  }
});
