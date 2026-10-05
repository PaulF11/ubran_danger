const test = require("node:test");
const assert = require("node:assert/strict");
const { runAutomatedIngestion } = require("../src/services/automatedIncidentPipeline");
const { collectTrustedSources } = require("../src/services/sourceCollectorService");

const article = {
  source: "Trusted source",
  sourceName: "Trusted source",
  url: "https://trusted.example.test/incident",
  publishedAt: "2025-09-24",
  retrievedAt: "2025-09-25T00:00:00.000Z",
  content: "Police arrested a suspect after a theft in Taguig City.",
};
const candidate = { category: "Theft", city: "Taguig City" };

test("Gemini rate-limit, timeout, and malformed response errors never persist candidates", async () => {
  for (const error of [
    new Error("Incident extraction provider was rate-limited after retries (HTTP 429)."),
    new Error("Gemini request timed out."),
    new Error("Incident extraction provider returned a non-JSON candidate."),
  ]) {
    let persistenceCalls = 0;
    const summary = await runAutomatedIngestion({
      collector: async () => [article],
      extractor: async () => {
        throw error;
      },
      persister: async () => {
        persistenceCalls += 1;
        return { status: "INSERTED" };
      },
    });
    assert.equal(summary.insertedIncidents, 0);
    assert.equal(summary.results[0].status, "PENDING_REVIEW");
    assert.equal(summary.results[0].verified, false);
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

test("database persistence failure leaves the article pending review", async () => {
  const summary = await runAutomatedIngestion({
    collector: async () => [article],
    extractor: async () => candidate,
    verifier: async () => ({ verified: true, status: "VERIFIED" }),
    persister: async () => {
      throw new Error("Database query failed.");
    },
  });
  assert.equal(summary.insertedIncidents, 0);
  assert.equal(summary.results[0].status, "PENDING_REVIEW");
  assert.equal(summary.results[0].verified, false);
});

test("unavailable and timed-out source requests are safely counted without live HTTP", async () => {
  const originalHosts = process.env.TRUSTED_SOURCE_HOSTS;
  const originalSeeds = process.env.TRUSTED_SOURCE_SEED_URLS;
  process.env.TRUSTED_SOURCE_HOSTS = "trusted.example.test";
  process.env.TRUSTED_SOURCE_SEED_URLS = "https://trusted.example.test/news";
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
    if (originalSeeds === undefined) delete process.env.TRUSTED_SOURCE_SEED_URLS;
    else process.env.TRUSTED_SOURCE_SEED_URLS = originalSeeds;
  }
});
