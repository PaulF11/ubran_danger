const test = require("node:test");
const assert = require("node:assert/strict");

const {
  deriveSeverity,
  validateCandidate,
} = require("../src/services/incidentValidationService");
const {
  findConflict,
  isDuplicate,
} = require("../src/services/incidentDeduplicationService");
const {
  verifyCandidate,
} = require("../src/services/automatedVerificationService");
const {
  isAllowedTrustedSource,
  collectTrustedSources,
  parseCollectionTargetUrls,
} = require("../src/services/sourceCollectorService");
const {
  runAutomatedIngestion,
} = require("../src/services/automatedIncidentPipeline");
const {
  isPlausibleIndividualIncident,
} = require("../src/services/incidentPreFilterService");
const {
  insertVerifiedCandidate,
} = require("../src/services/incidentPersistenceService");
const curatedCandidates = require("../data/taguig_incidents.json");
const emptyProcessedSources = {
  findProcessed: async () => new Set(),
  recordProcessed: async () => {},
};

function validCandidate(overrides = {}) {
  return {
    category: "Assault",
    city: "Taguig City",
    barangay: "Santa Ana",
    locationDescription: "Source-named area in Barangay Santa Ana",
    latitude: null,
    longitude: null,
    description:
      "A documented assault reported by an established source in Taguig City.",
    severity: "HIGH",
    severityFacts: { firearmUsed: true, deaths: 0 },
    incidentDate: "2025-09-24",
    sourceName: "News5 / TV5",
    sourceUrl: "https://news.tv5.com.ph/articles/example",
    sourceEvidence: {
      sourceReviewed: true,
      city: "Taguig City",
      incidentDate: "2025-09-24",
      location: "Barangay Santa Ana",
      eventFacts: "Two victims were shot.",
    },
    ...overrides,
  };
}

test("incident pre-filter allows obvious individual incident articles through", () => {
  assert.equal(
    isPlausibleIndividualIncident({
      title: "Two people shot; police arrest suspect",
      content: "Victims were injured in the shooting.",
    }),
    true,
  );
});

test("incident pre-filter skips obvious general-news articles", () => {
  const obviousGeneralNews = [
    {
      title: "No winners of major lotto games",
      content: "The draw results were announced.",
    },
    {
      title: "Heat index forecast to reach 50°C",
      content: "Weather conditions are expected to remain hot.",
    },
    {
      title: "DepEd flags fake nationwide class suspension announcement",
      content: "The department clarified that classes remain in session.",
    },
    {
      title: "As World Teachers Day comes, lawmakers push for programs/funds",
      content: "Lawmakers called for more education funding.",
    },
    {
      title: "Bukidnon airport project displaces Lumad families",
      content: "The infrastructure project is under development.",
    },
  ];

  for (const article of obviousGeneralNews) {
    assert.equal(isPlausibleIndividualIncident(article), false, article.title);
  }
});

test("incident pre-filter lets ambiguous articles through", () => {
  assert.equal(
    isPlausibleIndividualIncident({
      title: "City officials meet Tuesday",
      content: "The meeting focused on local priorities.",
    }),
    true,
  );
});

async function withEnvironment(values, callback) {
  const previous = new Map(
    Object.keys(values).map((key) => [key, process.env[key]]),
  );
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    return await callback();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("verification accepts sourced Taguig candidates without invented coordinates", async () => {
  const result = await verifyCandidate(validCandidate(), [], {
    sourceUrlCheck: async () => ({ exists: true }),
  });

  assert.equal(result.verified, true);
  assert.equal(result.normalized.latitude, null);
  assert.equal(result.normalized.longitude, null);
});

test("verification accepts Pateros candidates when the source explicitly identifies the municipality", async () => {
  const result = await verifyCandidate(
    validCandidate({
      city: "Pateros",
      barangay: "Aplaya",
      sourceEvidence: {
        sourceReviewed: true,
        city: "Pateros",
        incidentDate: "2025-09-24",
        location: "Aplaya, Pateros",
        eventFacts: "Two victims were shot.",
      },
    }),
    [],
    { sourceUrlCheck: async () => ({ exists: true }) },
  );

  assert.equal(result.verified, true);
  assert.equal(result.normalized.city, "Pateros");
});

test("verification rejects non-Taguig locations and unsupported categories", () => {
  assert.equal(
    validateCandidate(validCandidate({ city: "Makati City" })).status,
    "REJECTED",
  );
  assert.equal(
    validateCandidate(validCandidate({ category: "Burglary" })).status,
    "REJECTED",
  );
  assert.equal(
    validateCandidate(
      validCandidate({
        sourceEvidence: {
          sourceReviewed: true,
          city: "Makati City",
          incidentDate: "2025-09-24",
          location: "Barangay Santa Ana",
          eventFacts: "Two victims were shot.",
        },
      }),
    ).status,
    "REJECTED",
  );
  assert.equal(
    validateCandidate(
      validCandidate({
        sourceEvidence: {
          sourceReviewed: true,
          city: "Taguig City",
          incidentDate: "2025-09-23",
          location: "Barangay Santa Ana",
          eventFacts: "Two victims were shot.",
        },
      }),
    ).status,
    "REJECTED",
  );
});

test("verification rejects coordinates without a matched geographic source", () => {
  const candidate = validCandidate({ latitude: 14.55, longitude: 121.05 });
  const result = validateCandidate(candidate);

  assert.equal(result.isValid, false);
  assert.ok(result.errors.some((error) => error.includes("geographic source")));
});

test("severity is deterministic and mismatches are rejected", () => {
  assert.equal(deriveSeverity({ deaths: 1 }), "HIGH");
  assert.equal(
    deriveSeverity({ weaponUsed: true, physicalInjury: true }),
    "MEDIUM",
  );
  assert.equal(deriveSeverity({}), "LOW");
  assert.equal(
    validateCandidate(validCandidate({ severity: "MEDIUM" })).isValid,
    false,
  );
});

test("source URL failures do not silently verify candidates", async () => {
  const result = await verifyCandidate(validCandidate(), [], {
    sourceUrlCheck: async () => ({
      exists: false,
      pending: false,
      reason: "HTTP 404",
    }),
  });

  assert.equal(result.status, "REJECTED");
  assert.equal(result.verified, false);
});

test("same event is deduplicated but distinct source-described locations are not", () => {
  const first = validCandidate({
    locationDescription: "Front of Barangay Hall",
  });
  const sameEvent = {
    ...first,
    description: "A different summary of the same report.",
  };
  const separateEvent = {
    ...first,
    locationDescription: "Bagong Calzada Street",
  };

  assert.equal(isDuplicate(sameEvent, [first]), true);
  assert.equal(isDuplicate(separateEvent, [first]), false);
});

test("conflicting severity at the same incident location is flagged", () => {
  const candidate = validCandidate({ severity: "MEDIUM" });
  const existing = validCandidate({ severity: "HIGH" });

  assert.equal(findConflict(candidate, [existing]), true);
});

test("verification leaves conflicting records pending instead of treating them as duplicates", async () => {
  const existing = validCandidate({ severity: "HIGH" });
  const candidate = validCandidate({
    severity: "MEDIUM",
    severityFacts: { weaponUsed: true },
    sourceEvidence: {
      sourceReviewed: true,
      city: "Taguig City",
      incidentDate: "2025-09-24",
      location: "Barangay Santa Ana",
      eventFacts: "A weapon was used.",
    },
  });
  const result = await verifyCandidate(candidate, [existing], {
    sourceUrlCheck: async () => ({ exists: true }),
  });

  assert.equal(result.status, "PENDING_REVIEW");
  assert.match(result.reasons[0], /Conflicting/);
});

test("curated starter records validate and retain distinct same-article events", () => {
  assert.equal(curatedCandidates.length, 3);
  for (const candidate of curatedCandidates) {
    assert.equal(
      validateCandidate({
        ...candidate,
        sourceName: "News5 / TV5",
        sourceUrl: "https://news.tv5.com.ph/articles/curated-example",
      }).isValid,
      true,
    );
  }
  assert.notEqual(
    curatedCandidates[0].locationDescription,
    curatedCandidates[1].locationDescription,
  );
  assert.equal(curatedCandidates[1].latitude, null);
  assert.equal(curatedCandidates[2].latitude, null);
  assert.notEqual(
    require("../src/services/incidentDeduplicationService").buildDuplicateKey(
      curatedCandidates[0],
    ),
    require("../src/services/incidentDeduplicationService").buildDuplicateKey(
      curatedCandidates[1],
    ),
  );
});

test("untrusted source hosts are rejected", () => {
  assert.equal(
    isAllowedTrustedSource(new URL("https://example.com/article")),
    false,
  );
  assert.equal(
    isAllowedTrustedSource(new URL("http://taguig.gov.ph/article")),
    false,
  );
});

test("News5 is trusted by candidate validation when no host override is set", async () => {
  await withEnvironment({ TRUSTED_SOURCE_HOSTS: undefined }, async () => {
    const candidate = validCandidate({
      sourceName: "News5 / TV5",
      sourceUrl: "https://news.tv5.com.ph/articles/sample-report",
    });

    assert.equal(validateCandidate(candidate).isValid, true);
  });
});

test("default collection targets use approved publishers and block untrusted hosts", async () => {
  await withEnvironment(
    {
      TRUSTED_SOURCE_HOSTS: undefined,
      SOURCE_COLLECTION_TARGET_URLS: undefined,
    },
    async () => {
      const targets = parseCollectionTargetUrls();
      assert.deepEqual(
        targets.map((url) => url.href),
        [
          "https://news.google.com/rss/search?q=Taguig+City+incident",
          "https://news.google.com/rss/search?q=Pateros+incident",
          "https://www.gmanetwork.com/news/",
          "https://www.pna.gov.ph/",
          "https://www.philstar.com/",
          "https://www.manilatimes.net/",
        ],
      );
      assert.equal(
        isAllowedTrustedSource(new URL("https://www.gmanetwork.com/article")),
        true,
      );
      assert.equal(
        isAllowedTrustedSource(new URL("https://news.tv5.com.ph/article")),
        true,
      );
      assert.equal(
        isAllowedTrustedSource(new URL("https://news.google.com/article")),
        true,
      );
      assert.equal(
        isAllowedTrustedSource(new URL("https://www.pna.gov.ph/article")),
        true,
      );
      assert.equal(
        isAllowedTrustedSource(new URL("https://www.philstar.com/nation/story")),
        true,
      );
      assert.equal(
        isAllowedTrustedSource(new URL("https://www.manilatimes.net/news")),
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
    },
  );
});

test("collector uses the active publishers regardless of verification hosts", async () => {
  await withEnvironment(
    {
      TRUSTED_SOURCE_HOSTS: "taguig.gov.ph,pnp.gov.ph",
      SOURCE_COLLECTION_TARGET_URLS:
        "https://www.gmanetwork.com/news/,https://news.tv5.com.ph/articles",
    },
    async () => {
      const requested = [];
      const sources = await collectTrustedSources({
        fetchImpl: async (url) => {
          requested.push(url.toString());
          return { ok: true, text: async () => "<html></html>" };
        },
      });
      assert.deepEqual(requested, [
        "https://www.gmanetwork.com/news/",
        "https://news.tv5.com.ph/articles",
      ]);
      assert.equal(sources.sourcesChecked, 2);
    },
  );
});

test("collection targets reject hosts outside the active publisher allowlist", async () => {
  await withEnvironment(
    {
      TRUSTED_SOURCE_HOSTS: "newsinfo.inquirer.net",
      SOURCE_COLLECTION_TARGET_URLS: "https://example.com/taguig-news/",
    },
    async () => {
      assert.throws(
        parseCollectionTargetUrls,
        /approved publisher hosts/,
      );
    },
  );
});

test("HTTP collection target URLs are rejected", async () => {
  await withEnvironment(
    {
      SOURCE_COLLECTION_TARGET_URLS:
        "http://news.tv5.com.ph/articles",
    },
    async () => {
      assert.throws(parseCollectionTargetUrls, /SOURCE_COLLECTION_TARGET_URLS/);
    },
  );
});

test("blocked seed is skipped while other configured seed sources continue", async () => {
  await withEnvironment(
    {
      TRUSTED_SOURCE_HOSTS: "blocked.example,available.example",
      SOURCE_COLLECTION_TARGET_URLS:
        "https://www.gmanetwork.com/news/,https://news.tv5.com.ph/articles",
    },
    async () => {
      const calls = [];
      const response = (body, ok = true) => ({
        ok,
        text: async () => body,
      });
      const sources = await collectTrustedSources({
        fetchImpl: async (url, options) => {
          calls.push({ url: url.toString(), options });
          if (url.hostname === "www.gmanetwork.com") {
            return response("", false);
          }
          if (url.pathname === "/articles") {
            return response(
              '<a href="/article">A local report about a Taguig incident</a>' +
                '<a href="https://elsewhere.example/article">An external report with enough characters</a>',
            );
          }
          return response("<title>Local report</title><article>News</article>");
        },
      });

      assert.equal(calls[0].url, "https://www.gmanetwork.com/news/");
      assert.equal(calls[0].options.redirect, "error");
      assert.equal(calls[1].url, "https://news.tv5.com.ph/articles");
      assert.equal(sources.length, 1);
      assert.equal(sources[0].url, "https://news.tv5.com.ph/article");
      assert.equal(sources[0].sourceName, "News5 / TV5");
      assert.equal(
        calls.some(({ url }) => url.includes("elsewhere.example")),
        false,
      );
    },
  );
});

test("successful seed pages count as checked even when they expose no article links", async () => {
  await withEnvironment(
    {
      TRUSTED_SOURCE_HOSTS: "news.tv5.com.ph",
      SOURCE_COLLECTION_TARGET_URLS: "https://news.tv5.com.ph/articles",
    },
    async () => {
      let fetchedUrl;
      const result = await runAutomatedIngestion({
        collector: () =>
          collectTrustedSources({
            fetchImpl: async (url, options) => {
              fetchedUrl = url.toString();
              assert.equal(options.redirect, "error");
              return {
                ok: true,
                text: async () => "<html><body>No article links</body></html>",
              };
            },
          }),
      });

      assert.equal(fetchedUrl, "https://news.tv5.com.ph/articles");
      assert.equal(result.sourcesChecked, 1);
      assert.equal(result.articlesCollected, 0);
      assert.equal(result.articlesProcessed, 0);
      assert.equal(result.candidatesExtracted, 0);
    },
  );
});

test("discovers GMA story links after navigation within the bounded seed HTML", async () => {
  await withEnvironment(
    {
      TRUSTED_SOURCE_HOSTS: "www.gmanetwork.com",
      SOURCE_COLLECTION_TARGET_URLS: "https://www.gmanetwork.com/news/",
    },
    async () => {
      const requested = [];
      const gmaStory =
        "/news/topstories/nation/1004724/sample-tagged-story/story/";
      const sources = await collectTrustedSources({
        fetchImpl: async (url) => {
          requested.push(url.toString());
          if (url.pathname === "/news/") {
            return {
              ok: true,
              text: async () =>
                `${" ".repeat(25000)}<a href="${gmaStory}">A sufficiently long GMA news story headline</a>`,
            };
          }
          return {
            ok: true,
            text: async () =>
              "<html><head><title>GMA story</title></head><body>Article text</body></html>",
          };
        },
      });

      assert.equal(sources.length, 1);
      assert.equal(sources[0].url, `https://www.gmanetwork.com${gmaStory}`);
      assert.deepEqual(requested, [
        "https://www.gmanetwork.com/news/",
        `https://www.gmanetwork.com${gmaStory}`,
      ]);
    },
  );
});

test("ABS-CBN is not accepted as an active collection target", async () => {
  await withEnvironment(
    {
      TRUSTED_SOURCE_HOSTS: "www.abs-cbn.com",
      SOURCE_COLLECTION_TARGET_URLS: "https://www.abs-cbn.com/news",
    },
    async () => {
      assert.throws(parseCollectionTargetUrls, /approved publisher hosts/);
    },
  );
});

test("GMA article discovery rejects external-host links", async () => {
  await withEnvironment(
    {
      TRUSTED_SOURCE_HOSTS: "www.gmanetwork.com",
      SOURCE_COLLECTION_TARGET_URLS: "https://www.gmanetwork.com/news/",
    },
    async () => {
      const requested = [];
      const sources = await collectTrustedSources({
        fetchImpl: async (url) => {
          requested.push(url.toString());
          return {
            ok: true,
            text: async () =>
              '<a href="https://example.com/news/topstories/nation/1004724/sample-story/story/">An external news headline that is long enough</a>',
          };
        },
      });

      assert.equal(sources.length, 0);
      assert.deepEqual(requested, ["https://www.gmanetwork.com/news/"]);
      assert.equal(sources.sourcesChecked, 1);
    },
  );
});

test("INQUIRER Newsinfo is not trusted even when configured as a source", () => {
  const originalHosts = process.env.TRUSTED_SOURCE_HOSTS;
  process.env.TRUSTED_SOURCE_HOSTS = "newsinfo.inquirer.net";
  try {
    assert.equal(
      isAllowedTrustedSource(
        new URL("https://newsinfo.inquirer.net/2026/10/04/taguig-report"),
      ),
      false,
    );
    assert.equal(
      isAllowedTrustedSource(new URL("https://example.com/taguig-report")),
      false,
    );
    assert.equal(
      isAllowedTrustedSource(
        new URL("https://newsinfo.inquirer.net.example.com/article"),
      ),
      false,
    );
    assert.equal(
      isAllowedTrustedSource(new URL("http://newsinfo.inquirer.net/article")),
      false,
    );
  } finally {
    if (originalHosts === undefined) {
      delete process.env.TRUSTED_SOURCE_HOSTS;
    } else {
      process.env.TRUSTED_SOURCE_HOSTS = originalHosts;
    }
  }
});

test("INQUIRER cannot be configured as an active collection target", () => {
  const originalTargets = process.env.SOURCE_COLLECTION_TARGET_URLS;
  process.env.SOURCE_COLLECTION_TARGET_URLS = "https://newsinfo.inquirer.net/";

  try {
    assert.throws(parseCollectionTargetUrls, /approved publisher hosts/);
  } finally {
    if (originalTargets === undefined) {
      delete process.env.SOURCE_COLLECTION_TARGET_URLS;
    } else {
      process.env.SOURCE_COLLECTION_TARGET_URLS = originalTargets;
    }
  }
});

test("collector extracts bounded same-host article text and metadata", async () => {
  const originalHosts = process.env.TRUSTED_SOURCE_HOSTS;
  const originalTargets = process.env.SOURCE_COLLECTION_TARGET_URLS;
  process.env.TRUSTED_SOURCE_HOSTS = "taguig.gov.ph,pnp.gov.ph";
  process.env.SOURCE_COLLECTION_TARGET_URLS = "https://news.tv5.com.ph/articles";
  const calls = [];
  const response = (body) => ({
    ok: true,
    text: async () => body,
  });
  const sources = await collectTrustedSources({
    fetchImpl: async (url) => {
      calls.push(url.toString());
      if (url.pathname === "/articles") {
        return response(
          '<html><body><a href="/article">A Taguig incident article with enough text</a></body></html>',
        );
      }
      return response(
        '<html><head><title>Trusted report</title><meta property="article:published_time" content="2025-09-24"></head><body><article>Category: Assault. Barangay Santa Ana. A verified report with enough source content.</article></body></html>',
      );
    },
  });
  process.env.TRUSTED_SOURCE_HOSTS = originalHosts;
  if (originalTargets === undefined) {
    delete process.env.SOURCE_COLLECTION_TARGET_URLS;
  } else {
    process.env.SOURCE_COLLECTION_TARGET_URLS = originalTargets;
  }

  assert.equal(calls.length, 2);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].url, "https://news.tv5.com.ph/article");
  assert.equal(sources[0].sourceName, "News5 / TV5");
  assert.equal(sources[0].title, "Trusted report");
  assert.match(sources[0].content, /Category: Assault/);
  assert.equal(sources[0].publishedAt, "2025-09-24");
});

test("controlled GMA and News5 fixtures exercise ingestion without external services", async () => {
  const database = require("../src/config/database");
  const geminiProvider = require("../src/services/extractionProviders/geminiProvider");
  const databaseDescriptors = new Map(
    ["getConnection", "execute"].map((name) => [
      name,
      Object.getOwnPropertyDescriptor(database, name),
    ]),
  );
  const geminiDescriptor = Object.getOwnPropertyDescriptor(
    geminiProvider,
    "extract",
  );
  const fetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, "fetch");
  let mysqlConnectionAttempts = 0;
  let geminiCalls = 0;
  let liveHttpRequests = 0;

  for (const name of ["getConnection", "execute"]) {
    Object.defineProperty(database, name, {
      configurable: true,
      writable: true,
      value: async () => {
        mysqlConnectionAttempts += 1;
        throw new Error("MySQL access is forbidden in this test.");
      },
    });
  }
  geminiProvider.extract = async () => {
    geminiCalls += 1;
    throw new Error("Gemini access is forbidden in this test.");
  };
  globalThis.fetch = async () => {
    liveHttpRequests += 1;
    throw new Error("Live HTTP is forbidden in this test.");
  };

  try {
    const gmaUrl =
      "https://www.gmanetwork.com/news/test-development/controlled-fixture/story/";
    const news5Url =
      "https://news.tv5.com.ph/articles/test-development-weather-fixture";
    const gmaCandidateFixture = {
      category: "Assault",
      city: "Taguig City",
      barangay: "Santa Ana",
      locationDescription: "TEST/DEVELOPMENT-only Barangay Santa Ana fixture",
      latitude: null,
      longitude: null,
      description:
        "TEST/DEVELOPMENT-only fictional incident fixture for validation.",
      severity: "HIGH",
      severityFacts: { firearmUsed: true, deaths: 0 },
      incidentDate: "2026-10-08",
      incidentTimeKnown: false,
      sourceEvidence: {
        sourceReviewed: true,
        city: "Taguig City",
        incidentDate: "2026-10-08",
        location: "TEST/DEVELOPMENT-only Barangay Santa Ana fixture",
        eventFacts: "TEST/DEVELOPMENT-only; no real-world incident.",
      },
    };
    const articleRecords = [
      {
        source: "www.gmanetwork.com",
        sourceName: "GMA News TEST/DEVELOPMENT fixture",
        title: "TEST/DEVELOPMENT only: police arrested a suspect fixture",
        url: gmaUrl,
        publishedAt: "2026-10-08",
        retrievedAt: "2026-10-08T00:00:00.000Z",
        content: `TEST/DEVELOPMENT ONLY\nTEST_CANDIDATE_JSON=${JSON.stringify(gmaCandidateFixture)}`,
      },
      {
        source: "news.tv5.com.ph",
        sourceName: "News5 TEST/DEVELOPMENT fixture",
        title: "TEST/DEVELOPMENT only: weather advisory fixture",
        url: news5Url,
        publishedAt: "2026-10-08",
        retrievedAt: "2026-10-08T00:00:00.000Z",
        content: "TEST/DEVELOPMENT only; weather advisory, no incident fixture.",
      },
    ];
    const processedStatuses = new Map();
    const processedSources = {
      async findProcessed(urls) {
        return new Set(
          urls.filter((url) => processedStatuses.get(url) === "PROCESSED"),
        );
      },
      async recordProcessed(url, status) {
        processedStatuses.set(url, status);
      },
    };
    const extractedUrls = [];
    const sourceChecks = [];
    const persistedCandidates = [];
    const controlledSourceUrlCheck = async (url) => {
      sourceChecks.push(url);
      return { exists: true };
    };

    const summary = await runAutomatedIngestion({
      collector: async () => articleRecords,
      processedSources,
      extractor: async (content, metadata) => {
        extractedUrls.push(metadata.sourceUrl);
        const fixture = /^TEST_CANDIDATE_JSON=(.+)$/m.exec(content);
        if (!fixture) {
          throw new Error("Expected a structured TEST/DEVELOPMENT fixture.");
        }
        return {
          ...JSON.parse(fixture[1]),
          sourceName: metadata.sourceName,
          sourceUrl: metadata.sourceUrl,
          sourcePublishedAt: metadata.sourcePublishedAt,
        };
      },
      verifier: (candidate, existingCandidates) =>
        verifyCandidate(candidate, existingCandidates, {
          sourceUrlCheck: controlledSourceUrlCheck,
        }),
      persister: async (candidate) => {
        persistedCandidates.push(candidate);
        return { status: "INSERTED", inserted: true, id: "TEST-ONLY-1" };
      },
    });

    assert.equal(articleRecords.length, 2);
    assert.equal(summary.articlesCollected, 2);
    assert.equal(summary.articlesProcessed, 2);
    assert.equal(summary.preFiltered, 1);
    assert.equal(summary.articlesSkipped, 1);
    assert.equal(summary.candidatesExtracted, 1);
    assert.equal(summary.candidatesRejected, 0);
    assert.equal(summary.verificationFailures, 0);
    assert.equal(summary.verifiedCandidates, 1);
    assert.equal(summary.insertedIncidents, 1);
    assert.equal(summary.duplicates, 0);
    assert.equal(summary.conflicts, 0);
    assert.deepEqual(extractedUrls, [gmaUrl]);
    assert.equal(summary.results[0].source, gmaUrl);
    assert.equal(summary.results[0].status, "VERIFIED");
    assert.equal(summary.results[0].candidate.sourceUrl, gmaUrl);
    assert.equal(summary.results[1].source, news5Url);
    assert.equal(summary.results[1].status, "NOT_AN_INCIDENT");
    assert.equal(summary.results[1].candidate, null);
    assert.deepEqual(persistedCandidates.map(({ sourceUrl }) => sourceUrl), [gmaUrl]);
    assert.equal(validateCandidate(summary.results[0].candidate).isValid, true);
    assert.equal(sourceChecks.length, 1);
    assert.equal(sourceChecks[0], gmaUrl);

    const invalidCandidate = {
      ...summary.results[0].candidate,
      city: "Makati City",
      sourceEvidence: {
        ...summary.results[0].candidate.sourceEvidence,
        city: "Makati City",
      },
    };
    const invalidResult = await verifyCandidate(invalidCandidate, [], {
      sourceUrlCheck: controlledSourceUrlCheck,
    });
    assert.equal(invalidResult.status, "REJECTED");
    assert.equal(invalidResult.verified, false);
    assert.equal(sourceChecks.length, 1);

    const duplicateResult = await verifyCandidate(
      summary.results[0].candidate,
      [summary.results[0].candidate],
      { sourceUrlCheck: controlledSourceUrlCheck },
    );
    assert.equal(duplicateResult.status, "REJECTED");
    assert.match(duplicateResult.reasons[0], /Duplicate/);

    const conflictCandidate = {
      ...summary.results[0].candidate,
      severity: "MEDIUM",
      severityFacts: { physicalInjury: true },
    };
    const conflictResult = await verifyCandidate(
      conflictCandidate,
      [summary.results[0].candidate],
      { sourceUrlCheck: controlledSourceUrlCheck },
    );
    assert.equal(conflictResult.status, "PENDING_REVIEW");
    assert.match(conflictResult.reasons[0], /Conflicting/);

    const unavailableSourceResult = await verifyCandidate(
      summary.results[0].candidate,
      [],
      {
        sourceUrlCheck: async () => ({
          exists: false,
          pending: true,
          reason: "TEST/DEVELOPMENT controlled source check result.",
        }),
      },
    );
    assert.equal(unavailableSourceResult.status, "PENDING_REVIEW");

    assert.equal(
      isPlausibleIndividualIncident({
        title: "TEST/DEVELOPMENT only: weather advisory fixture",
        content: "TEST/DEVELOPMENT only; no individual incident.",
      }),
      false,
    );
    assert.deepEqual(
      [...processedStatuses.entries()].sort(),
      [
        [gmaUrl, "PROCESSED"],
        [news5Url, "PROCESSED"],
      ].sort(),
    );
    assert.deepEqual(
      await processedSources.findProcessed([gmaUrl, news5Url]),
      new Set([gmaUrl, news5Url]),
    );
    assert.equal(geminiCalls, 0);
    assert.equal(mysqlConnectionAttempts, 0);
    assert.equal(liveHttpRequests, 0);
  } finally {
    for (const [name, descriptor] of databaseDescriptors) {
      if (descriptor) Object.defineProperty(database, name, descriptor);
      else delete database[name];
    }
    if (geminiDescriptor) {
      Object.defineProperty(geminiProvider, "extract", geminiDescriptor);
    } else {
      delete geminiProvider.extract;
    }
    if (fetchDescriptor) {
      Object.defineProperty(globalThis, "fetch", fetchDescriptor);
    } else {
      delete globalThis.fetch;
    }
  }
});

test("ingestion pipeline never persists failed verification and reports outcomes", async () => {
  const candidate = validCandidate();
  let persisted = 0;
  const result = await runAutomatedIngestion({
    processedSources: emptyProcessedSources,
    collector: async () => [
      {
        source: "trusted.example",
        sourceName: "Trusted source",
        url: candidate.sourceUrl,
        content: "article",
        retrievedAt: "2025-09-24T00:00:00.000Z",
      },
      {
        source: "trusted.example",
        sourceName: "Trusted source",
        url: "https://trusted.example/invalid",
        content: "invalid",
        retrievedAt: "2025-09-24T00:00:00.000Z",
      },
    ],
    extractor: async (_content, metadata) => ({
      ...candidate,
      sourceName: metadata.sourceName,
      sourceUrl: metadata.sourceUrl,
    }),
    verifier: async (_candidate, existing) => {
      if (existing.length > 0) {
        return {
          verified: false,
          status: "PENDING_REVIEW",
          reasons: ["verification failed"],
        };
      }
      return { verified: true, status: "VERIFIED", normalized: candidate };
    },
    persister: async (value) => {
      persisted += 1;
      assert.equal(value.latitude, null);
      assert.equal(value.longitude, null);
      return { status: "INSERTED", inserted: true };
    },
  });

  assert.equal(persisted, 1);
  assert.equal(result.insertedIncidents, 1);
  assert.equal(result.verifiedCandidates, 1);
  assert.equal(result.verificationFailures, 1);
  assert.equal(result.results[1].verified, false);
});

test("null extraction is recorded as not an incident without verification or persistence", async () => {
  let verified = 0;
  let persisted = 0;
  const result = await runAutomatedIngestion({
    processedSources: emptyProcessedSources,
    collector: async () => [
      {
        sourceName: "news.example",
        url: "https://news.example/weather",
        content: "A weather warning.",
        retrievedAt: "2026-10-04T00:00:00.000Z",
      },
    ],
    extractor: async () => null,
    verifier: async () => {
      verified += 1;
      throw new Error("Null extraction must not reach verification.");
    },
    persister: async () => {
      persisted += 1;
      throw new Error("Null extraction must not reach persistence.");
    },
  });

  assert.equal(result.articlesProcessed, 1);
  assert.equal(result.candidatesExtracted, 0);
  assert.equal(result.candidatesRejected, 0);
  assert.equal(result.verificationFailures, 0);
  assert.equal(result.verifiedCandidates, 0);
  assert.equal(result.insertedIncidents, 0);
  assert.equal(result.results[0].status, "NOT_AN_INCIDENT");
  assert.equal(result.results[0].candidate, null);
  assert.equal(verified, 0);
  assert.equal(persisted, 0);
});

test("pre-filtered general news is recorded and skips extraction, verification, and persistence", async () => {
  let extracted = 0;
  let verified = 0;
  let persisted = 0;
  const obviousGeneralNews = [
    {
      title: "No winners of major lotto games",
      content: "The draw results were announced.",
    },
    {
      title: "Heat index forecast to reach 50°C",
      content: "Weather conditions are expected to remain hot.",
    },
    {
      title: "DepEd flags fake nationwide class suspension announcement",
      content: "The department clarified that classes remain in session.",
    },
    {
      title: "As World Teachers Day comes, lawmakers push for programs/funds",
      content: "Lawmakers called for more education funding.",
    },
    {
      title: "Bukidnon airport project displaces Lumad families",
      content: "The infrastructure project is under development.",
    },
  ];
  const result = await runAutomatedIngestion({
    processedSources: emptyProcessedSources,
    collector: async () =>
      obviousGeneralNews.map((article, index) => ({
        ...article,
        sourceName: "news.example",
        url: `https://news.example/article-${index + 1}`,
        retrievedAt: "2026-10-04T00:00:00.000Z",
      })),
    extractor: async () => {
      extracted += 1;
      return validCandidate();
    },
    verifier: async () => {
      verified += 1;
      return { verified: true, status: "VERIFIED" };
    },
    persister: async () => {
      persisted += 1;
      return { status: "INSERTED" };
    },
  });

  assert.equal(result.articlesProcessed, obviousGeneralNews.length);
  assert.equal(result.preFiltered, obviousGeneralNews.length);
  assert.equal(result.candidatesExtracted, 0);
  assert.equal(result.candidatesRejected, 0);
  assert.equal(result.verificationFailures, 0);
  assert.equal(result.verifiedCandidates, 0);
  assert.equal(result.insertedIncidents, 0);
  for (const item of result.results) {
    assert.equal(item.status, "NOT_AN_INCIDENT");
    assert.match(item.reasons[0], /skipped before extraction/);
    assert.equal(item.candidate, null);
  }
  assert.equal(extracted, 0);
  assert.equal(verified, 0);
  assert.equal(persisted, 0);
});

test("non-Taguig article candidate is rejected by existing validation", async () => {
  const candidate = validCandidate({
    city: "Makati City",
    sourceName: "News5 / TV5",
    sourceUrl: "https://news.tv5.com.ph/articles/article",
    sourceEvidence: {
      sourceReviewed: true,
      city: "Makati City",
      incidentDate: "2025-09-24",
      location: "Makati City",
      eventFacts: "The report describes an assault.",
    },
  });

  const result = await verifyCandidate(candidate, [], {
    sourceUrlCheck: async () => ({ exists: true }),
  });

  assert.equal(result.verified, false);
  assert.equal(result.status, "REJECTED");
  assert.ok(result.reasons.some((reason) => /Taguig City/.test(reason)));
});

test("sufficiently sourced Taguig article can pass extraction and verification without coordinates", async () => {
  const articleUrl = "https://news.tv5.com.ph/articles/taguig-report";
  const candidate = validCandidate({
    sourceName: "News5 / TV5",
    sourceUrl: articleUrl,
    sourcePublishedAt: "2026-10-04",
    latitude: null,
    longitude: null,
  });
  let extractorReceivedArticle = false;
  let persisted = 0;
  const result = await runAutomatedIngestion({
    processedSources: emptyProcessedSources,
    collector: async () => [
      {
        sourceName: "News5 / TV5",
        url: articleUrl,
        content:
          "Taguig City police reported an assault in Barangay Santa Ana on September 24, 2025.",
        retrievedAt: "2026-10-04T00:00:00.000Z",
      },
    ],
    extractor: async (content, metadata) => {
      extractorReceivedArticle = content.includes("Taguig City");
      return {
        ...candidate,
        sourceName: metadata.sourceName,
        sourceUrl: metadata.sourceUrl,
        sourcePublishedAt: metadata.sourcePublishedAt,
      };
    },
    verifier: (value, existing) =>
      verifyCandidate(value, existing, {
        sourceUrlCheck: async () => ({ exists: true }),
      }),
    persister: async (value) => {
      persisted += 1;
      assert.equal(value.latitude, null);
      assert.equal(value.longitude, null);
      return { status: "INSERTED", inserted: true };
    },
  });

  assert.equal(extractorReceivedArticle, true);
  assert.equal(result.articlesProcessed, 1);
  assert.equal(result.candidatesExtracted, 1);
  assert.equal(result.verifiedCandidates, 1);
  assert.equal(result.insertedIncidents, 1);
  assert.equal(persisted, 1);
  assert.equal(result.results[0].status, "VERIFIED");
});

test("duplicate News5 article candidate never reaches persistence twice", async () => {
  const candidate = validCandidate({
    sourceName: "News5 / TV5",
    sourceUrl: "https://news.tv5.com.ph/articles/article-one",
  });
  let persisted = 0;
  const result = await runAutomatedIngestion({
    processedSources: emptyProcessedSources,
    collector: async () => [
      {
        sourceName: "News5 / TV5",
        url: "https://news.tv5.com.ph/articles/article-one",
        content: "Article one.",
      },
      {
        sourceName: "News5 / TV5",
        url: "https://news.tv5.com.ph/articles/article-two",
        content: "Article two.",
      },
    ],
    extractor: async (_content, metadata) => ({
      ...candidate,
      sourceUrl: metadata.sourceUrl,
    }),
    verifier: (value, existing) =>
      verifyCandidate(value, existing, {
        sourceUrlCheck: async () => ({ exists: true }),
      }),
    persister: async () => {
      persisted += 1;
      return { status: "INSERTED", inserted: true };
    },
  });

  assert.equal(persisted, 1);
  assert.equal(result.verifiedCandidates, 1);
  assert.equal(result.insertedIncidents, 1);
  assert.equal(result.results[0].status, "VERIFIED");
  assert.equal(result.results[1].verified, false);
  assert.ok(
    result.results[1].reasons.some((reason) => /Duplicate/.test(reason)),
  );
});

test("verified candidate insertion preserves NULL coordinates and never updates existing rows", async () => {
  const statements = [];
  const connection = {
    async beginTransaction() {},
    async rollback() {},
    async commit() {},
    release() {},
    async execute(sql) {
      statements.push(sql);
      if (sql.startsWith("SELECT incidents.id")) return [[]];
      if (sql.startsWith("SELECT id FROM incident_categories"))
        return [[{ id: 2 }]];
      if (sql.startsWith("INSERT INTO incidents")) {
        return [{ insertId: 99 }];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };

  const candidate = validCandidate();
  const result = await insertVerifiedCandidate(candidate, {
    dbPool: { getConnection: async () => connection },
    verifiedAt: new Date("2026-10-04T00:00:00.000Z"),
  });

  assert.deepEqual(result, { status: "INSERTED", inserted: true, id: 99 });
  assert.equal(
    statements.some((sql) => sql.startsWith("UPDATE")),
    false,
  );
  assert.equal(
    statements.some((sql) => sql.startsWith("INSERT INTO locations")),
    false,
  );
  assert.equal(
    statements.filter((sql) => sql.startsWith("INSERT INTO incidents")).length,
    1,
  );
});

test("existing duplicate is rejected before insertion", async () => {
  const statements = [];
  const connection = {
    async beginTransaction() {},
    async rollback() {},
    async commit() {},
    release() {},
    async execute(sql) {
      statements.push(sql);
      if (sql.startsWith("SELECT incidents.id")) {
        return [
          [
            {
              category: "Assault",
              city: "Taguig City",
              barangay: "Santa Ana",
              latitude: null,
              longitude: null,
              location_description: "Source-named area in Barangay Santa Ana",
              incident_date: "2025-09-24",
              severity: "HIGH",
              source_url: "https://manilastandard.net/article/example",
            },
          ],
        ];
      }
      throw new Error("No insertion should be attempted.");
    },
  };

  const result = await insertVerifiedCandidate(
    validCandidate({
      sourceName: "Manila Standard",
      sourceUrl: "https://manilastandard.net/article/example",
    }),
    { dbPool: { getConnection: async () => connection } },
  );

  assert.deepEqual(result, { status: "DUPLICATE", inserted: false });
  assert.equal(statements.length, 1);
});
