// File note: This file handles source-collector.test.js.

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  collectTrustedSources,
  isAllowedTrustedSource,
  normalizeTrustedHosts,
  parseCollectionTargetUrls,
} = require("../src/services/sourceCollectorService");
const { runAutomatedIngestion } = require("../src/services/automatedIncidentPipeline");

const BOTH_SOURCES =
  "https://www.gmanetwork.com/news/,https://news.tv5.com.ph/articles";

async function withEnvironment(overrides, action) {
  const original = {
    SOURCE_COLLECTION_TARGET_URLS: process.env.SOURCE_COLLECTION_TARGET_URLS,
    TRUSTED_SOURCE_HOSTS: process.env.TRUSTED_SOURCE_HOSTS,
  };
  for (const [name, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  try {
    return await action();
  } finally {
    for (const [name, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

function response(status, body = "") {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => body,
  };
}

function captureLogger() {
  const entries = [];
  return {
    entries,
    info(message) {
      assert.match(message, /^\[source-collection\] /);
      entries.push(JSON.parse(message.slice("[source-collection] ".length)));
    },
  };
}

const gmaArticle =
  '<a href="/news/topstories/nation/1004724/sample-story/story/">A GMA article headline with enough characters</a>';
const news5Article =
  '<a href="/articles/sample-story">A News5 article headline with enough characters</a>';
const articleBody =
  "<html><head><title>Sample report</title></head><body>Report content.</body></html>";

test("approved default publishers remain trusted and overrides reject blocked hosts", async () => {
  await withEnvironment(
    { TRUSTED_SOURCE_HOSTS: "taguig.gov.ph,pnp.gov.ph,example.com" },
    async () => {
      assert.deepEqual(normalizeTrustedHosts(), [
        "gmanetwork.com",
        "manilatimes.net",
        "news.google.com",
        "news.tv5.com.ph",
        "philstar.com",
        "pna.gov.ph",
      ]);
      assert.equal(
        isAllowedTrustedSource(new URL("https://www.gmanetwork.com/article")),
        true,
      );
      assert.equal(
        isAllowedTrustedSource(new URL("https://news.tv5.com.ph/article")),
        true,
      );
      assert.equal(
        isAllowedTrustedSource(new URL("https://news.google.com/rss/search?q=Taguig+City+theft")),
        true,
      );
      assert.equal(
        isAllowedTrustedSource(new URL("https://taguig.gov.ph/article")),
        false,
      );
      assert.equal(
        isAllowedTrustedSource(new URL("https://pnp.gov.ph/article")),
        false,
      );
      assert.equal(
        isAllowedTrustedSource(new URL("https://example.com/article")),
        false,
      );
    },
  );
});

test("approved extra publisher hosts can be configured and accepted without bypassing disallowed domains", async () => {
  await withEnvironment(
    { TRUSTED_SOURCE_HOSTS: "pna.gov.ph,philstar.com,example.com" },
    async () => {
      assert.deepEqual(normalizeTrustedHosts(), [
        "gmanetwork.com",
        "manilatimes.net",
        "news.google.com",
        "news.tv5.com.ph",
        "philstar.com",
        "pna.gov.ph",
      ]);
      assert.equal(
        isAllowedTrustedSource(new URL("https://www.pna.gov.ph/article")),
        true,
      );
      assert.equal(
        isAllowedTrustedSource(new URL("https://www.philstar.com/nation/story")),
        true,
      );
      assert.equal(
        isAllowedTrustedSource(new URL("https://example.com/article")),
        false,
      );
    },
  );
});

test("built-in collection targets use the approved RSS and publisher sources", async () => {
  await withEnvironment(
    {
      SOURCE_COLLECTION_TARGET_URLS: undefined,
      TRUSTED_SOURCE_HOSTS: undefined,
    },
    async () => {
      assert.deepEqual(
        parseCollectionTargetUrls().map((url) => url.href),
        [
          "https://news.google.com/rss/search?q=Taguig+City+incident",
          "https://news.google.com/rss/search?q=Pateros+incident",
          "https://www.gmanetwork.com/news/",
          "https://www.pna.gov.ph/",
          "https://www.philstar.com/",
          "https://www.manilatimes.net/",
        ],
      );
    },
  );
});

test("GMA success is collected when News5 returns an HTTP failure", async () => {
  await withEnvironment(
    {
      SOURCE_COLLECTION_TARGET_URLS: BOTH_SOURCES,
      TRUSTED_SOURCE_HOSTS: "taguig.gov.ph,pnp.gov.ph",
    },
    async () => {
      const logger = captureLogger();
      const sources = await collectTrustedSources({
        logger,
        fetchImpl: async (url) => {
          if (url.hostname === "news.tv5.com.ph") return response(403);
          if (url.pathname === "/news/") return response(200, gmaArticle);
          return response(200, articleBody);
        },
      });

      assert.equal(sources.length, 1);
      assert.equal(sources[0].sourceName, "GMA News");
      assert.equal(sources.sourcesFailed, 1);
      assert.ok(
        logger.entries.some(
          (entry) =>
            entry.source === "News5 / TV5" &&
            entry.stage === "seed_fetch" &&
            entry.status === 403 &&
            entry.category === "http_403",
        ),
      );
    },
  );
});

test("a failed News5 source does not make the scan return zero GMA articles", async () => {
  await withEnvironment(
    { SOURCE_COLLECTION_TARGET_URLS: BOTH_SOURCES },
    async () => {
      const result = await runAutomatedIngestion({
        collector: () =>
          collectTrustedSources({
            logger: captureLogger(),
            fetchImpl: async (url) => {
              if (url.hostname === "news.tv5.com.ph") return response(403);
              if (url.pathname === "/news/") return response(200, gmaArticle);
              return response(200, articleBody);
            },
          }),
        processedSources: {
          findProcessed: async () => new Set(),
          recordProcessed: async () => {},
        },
        extractor: async () => null,
      });

      assert.equal(result.sourcesFailed, 1);
      assert.equal(result.articlesCollected, 1);
      assert.equal(result.results.length, 1);
      assert.equal(result.results[0].sourceName, "GMA News");
    },
  );
});

test("News5 success is collected when GMA returns an HTTP failure", async () => {
  await withEnvironment(
    { SOURCE_COLLECTION_TARGET_URLS: BOTH_SOURCES },
    async () => {
      const logger = captureLogger();
      const sources = await collectTrustedSources({
        logger,
        fetchImpl: async (url) => {
          if (url.hostname === "www.gmanetwork.com") return response(500);
          if (url.pathname === "/articles")
            return response(200, news5Article);
          return response(200, articleBody);
        },
      });

      assert.equal(sources.length, 1);
      assert.equal(sources[0].sourceName, "News5 / TV5");
      assert.equal(sources[0].url, "https://news.tv5.com.ph/articles/sample-story");
      assert.equal(sources.sourcesFailed, 1);
      assert.ok(
        logger.entries.some(
          (entry) =>
            entry.source === "GMA News" &&
            entry.stage === "seed_fetch" &&
            entry.status === 500 &&
            entry.category === "http_5xx",
        ),
      );
    },
  );
});

test("both source failures are separately logged and counted", async () => {
  await withEnvironment(
    { SOURCE_COLLECTION_TARGET_URLS: BOTH_SOURCES },
    async () => {
      const logger = captureLogger();
      const sources = await collectTrustedSources({
        logger,
        fetchImpl: async (url) =>
          response(url.hostname === "www.gmanetwork.com" ? 429 : 403),
      });

      assert.equal(sources.length, 0);
      assert.equal(sources.sourcesFailed, 2);
      assert.deepEqual(
        logger.entries.map((entry) => [
          entry.source,
          entry.stage,
          entry.status,
          entry.category,
        ]),
        [
          ["GMA News", "seed_fetch", 429, "http_429"],
          ["News5 / TV5", "seed_fetch", 403, "http_403"],
        ],
      );
    },
  );
});

test("a successful page with zero article links is reported as a collection failure", async () => {
  await withEnvironment(
    { SOURCE_COLLECTION_TARGET_URLS: "https://news.tv5.com.ph/articles" },
    async () => {
      const logger = captureLogger();
      const sources = await collectTrustedSources({
        logger,
        fetchImpl: async () => response(200, "<html><body>Index</body></html>"),
      });

      assert.equal(sources.sourcesChecked, 1);
      assert.equal(sources.length, 0);
      assert.equal(sources.sourcesFailed, 1);
      assert.ok(
        logger.entries.some(
          (entry) =>
            entry.stage === "discovery" &&
            entry.status === 200 &&
            entry.result === "failure" &&
            entry.category === "zero_article_links" &&
            entry.articleCount === 0,
        ),
      );
    },
  );
});

test("relative article URLs are normalized, duplicates removed, and external hosts rejected", async () => {
  await withEnvironment(
    { SOURCE_COLLECTION_TARGET_URLS: "https://news.tv5.com.ph/articles" },
    async () => {
      let articleRequests = 0;
      const sources = await collectTrustedSources({
        logger: captureLogger(),
        fetchImpl: async (url) => {
          if (url.pathname === "/articles") {
            return response(
              200,
              '<a href="/articles/story#top">A News5 article headline with enough characters</a>' +
                '<a href="/articles/story#comments">A duplicate News5 article headline with enough characters</a>' +
                '<a href="https://untrusted.example/article">An untrusted article headline with enough characters</a>',
            );
          }
          articleRequests += 1;
          return response(200, articleBody);
        },
      });

      assert.equal(articleRequests, 1);
      assert.equal(sources.length, 1);
      assert.equal(sources[0].url, "https://news.tv5.com.ph/articles/story");
    },
  );
});

test("Google News RSS pages yield live incident-discovery records without bypassing access controls", async () => {
  await withEnvironment(
    { SOURCE_COLLECTION_TARGET_URLS: "https://news.google.com/rss/search?q=Taguig+City+theft" },
    async () => {
      const logger = captureLogger();
      const sources = await collectTrustedSources({
        logger,
        fetchImpl: async (url) => {
          if (url.hostname === "news.google.com") {
            return response(
              200,
              '<rss><channel><item><title>Wanted robbery suspect caught with gun, grenade in Taguig - Manila Bulletin</title><link>https://www.mb.com.ph/2026/06/08/wanted-robbery-suspect-caught-with-gun-grenade-in-taguig/</link><pubDate>Mon, 08 Jun 2026 07:00:00 GMT</pubDate></item></channel></rss>',
            );
          }
          return response(200, "");
        },
      });

      assert.equal(sources.length, 1);
      assert.equal(sources[0].sourceName, "Manila Bulletin");
      assert.equal(
        sources[0].title,
        "Wanted robbery suspect caught with gun, grenade in Taguig - Manila Bulletin",
      );
      assert.ok(sources[0].content.includes("Taguig"));
    },
  );
});

test("redirect, timeout, and network failures are normalized without exposing error text", async () => {
  const cases = [
    [
      Object.assign(new TypeError("redirect to https://private.invalid/?token=secret"), {
        cause: { code: "UND_ERR_REDIRECT" },
      }),
      "redirect_failure",
    ],
    [Object.assign(new Error("secret timeout detail"), { name: "TimeoutError" }), "timeout"],
    [new Error("network failure with secret detail"), "network_failure"],
  ];

  for (const [error, category] of cases) {
    await withEnvironment(
      { SOURCE_COLLECTION_TARGET_URLS: "https://www.gmanetwork.com/news/" },
      async () => {
        const logger = captureLogger();
        const sources = await collectTrustedSources({
          logger,
          fetchImpl: async () => {
            throw error;
          },
        });

        assert.equal(sources.sourcesFailed, 1);
        assert.equal(logger.entries[0].category, category);
        assert.equal(JSON.stringify(logger.entries).includes("secret"), false);
        assert.equal(JSON.stringify(logger.entries).includes("private.invalid"), false);
      },
    );
  }
});

test("unapproved configured hosts are rejected before making requests", async () => {
  await withEnvironment(
    { SOURCE_COLLECTION_TARGET_URLS: "https://example.com/news/" },
    async () => {
      assert.throws(parseCollectionTargetUrls, /approved publisher hosts/);
    },
  );
});

test("article HTTP 403, 429, and 500 failures are individually reported", async () => {
  for (const [status, category] of [
    [403, "http_403"],
    [429, "http_429"],
    [500, "http_5xx"],
  ]) {
    await withEnvironment(
      { SOURCE_COLLECTION_TARGET_URLS: "https://news.tv5.com.ph/articles" },
      async () => {
        const logger = captureLogger();
        const sources = await collectTrustedSources({
          logger,
          fetchImpl: async (url) =>
            url.pathname === "/articles"
              ? response(200, news5Article)
              : response(status),
        });

        const failure = logger.entries.find(
          (entry) => entry.stage === "article_fetch",
        );
        assert.equal(sources.length, 0);
        assert.equal(sources.sourcesFailed, 1);
        assert.equal(failure.status, status);
        assert.equal(failure.category, category);
      },
    );
  }
});
