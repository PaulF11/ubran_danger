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
  parseTrustedSourceSeedUrls,
} = require("../src/services/sourceCollectorService");
const { runAutomatedIngestion } = require("../src/services/automatedIncidentPipeline");
const {
  isPlausibleIndividualIncident,
} = require("../src/services/incidentPreFilterService");
const {
  insertVerifiedCandidate,
} = require("../src/services/incidentPersistenceService");
const curatedCandidates = require("../data/taguig_incidents.json");

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
    sourceName: "Manila Standard",
    sourceUrl: "https://manilastandard.net/article/example",
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
    assert.equal(validateCandidate(candidate).isValid, true);
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

test("trusted HTTPS seed URL is accepted", async () => {
  await withEnvironment(
    {
      TRUSTED_SOURCE_HOSTS: "newsinfo.inquirer.net",
      TRUSTED_SOURCE_SEED_URLS:
        "https://newsinfo.inquirer.net/taguig-news/",
    },
    async () => {
      const seeds = parseTrustedSourceSeedUrls();
      assert.equal(seeds.length, 1);
      assert.equal(
        seeds[0].href,
        "https://newsinfo.inquirer.net/taguig-news/",
      );
    },
  );
});

test("seed URLs from untrusted hosts are rejected", async () => {
  await withEnvironment(
    {
      TRUSTED_SOURCE_HOSTS: "newsinfo.inquirer.net",
      TRUSTED_SOURCE_SEED_URLS: "https://example.com/taguig-news/",
    },
    async () => {
      assert.throws(parseTrustedSourceSeedUrls, /TRUSTED_SOURCE_SEED_URLS/);
    },
  );
});

test("HTTP seed URLs are rejected", async () => {
  await withEnvironment(
    {
      TRUSTED_SOURCE_HOSTS: "newsinfo.inquirer.net",
      TRUSTED_SOURCE_SEED_URLS:
        "http://newsinfo.inquirer.net/taguig-news/",
    },
    async () => {
      assert.throws(parseTrustedSourceSeedUrls, /TRUSTED_SOURCE_SEED_URLS/);
    },
  );
});

test("blocked seed is skipped while other configured seed sources continue", async () => {
  await withEnvironment(
    {
      TRUSTED_SOURCE_HOSTS: "blocked.example,available.example",
      TRUSTED_SOURCE_SEED_URLS:
        "https://blocked.example/news/,https://available.example/taguig/",
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
          if (url.hostname === "blocked.example") {
            return response("", false);
          }
          if (url.pathname === "/taguig/") {
            return response(
              '<a href="/article">A local report about a Taguig incident</a>' +
                '<a href="https://elsewhere.example/article">An external report with enough characters</a>',
            );
          }
          return response("<title>Local report</title><article>News</article>");
        },
      });

      assert.equal(calls[0].url, "https://blocked.example/news/");
      assert.equal(calls[0].options.redirect, "error");
      assert.equal(calls[1].url, "https://available.example/taguig/");
      assert.equal(sources.length, 1);
      assert.equal(
        sources[0].url,
        "https://available.example/article",
      );
      assert.equal(sources[0].sourceName, "available.example");
      assert.equal(calls.some(({ url }) => url.includes("elsewhere.example")), false);
    },
  );
});

test("successful seed pages count as checked even when they expose no article links", async () => {
  await withEnvironment(
    {
      TRUSTED_SOURCE_HOSTS: "news.example",
      TRUSTED_SOURCE_SEED_URLS: "https://news.example/news/",
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

      assert.equal(fetchedUrl, "https://news.example/news/");
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
      TRUSTED_SOURCE_SEED_URLS: "https://www.gmanetwork.com/news/",
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
      assert.equal(
        sources[0].url,
        `https://www.gmanetwork.com${gmaStory}`,
      );
      assert.deepEqual(requested, [
        "https://www.gmanetwork.com/news/",
        `https://www.gmanetwork.com${gmaStory}`,
      ]);
    },
  );
});

test("discovers ABS-CBN Article URLs from its Next.js page data", async () => {
  await withEnvironment(
    {
      TRUSTED_SOURCE_HOSTS: "www.abs-cbn.com",
      TRUSTED_SOURCE_SEED_URLS: "https://www.abs-cbn.com/news",
    },
    async () => {
      const requested = [];
      const pageData = {
        props: {
          pageProps: {
            content: {
              listItem: [
                {
                  profile: "Article",
                  title: "ABS-CBN article headline with sufficient length",
                  slugline_url:
                    "news/nation/2026/10/4/sample-article-123",
                },
                {
                  profile: "Section",
                  title: "Not an article",
                  slugline_url: "news/nation",
                },
              ],
            },
          },
        },
      };
      const sources = await collectTrustedSources({
        fetchImpl: async (url) => {
          requested.push(url.toString());
          if (url.pathname === "/news") {
            return {
              ok: true,
              text: async () =>
                `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(pageData)}</script>`,
            };
          }
          return {
            ok: true,
            text: async () =>
              "<html><head><title>ABS-CBN story</title></head><body>Article text</body></html>",
          };
        },
      });

      assert.equal(sources.length, 1);
      assert.equal(
        sources[0].url,
        "https://www.abs-cbn.com/news/nation/2026/10/4/sample-article-123",
      );
      assert.deepEqual(requested, [
        "https://www.abs-cbn.com/news",
        "https://www.abs-cbn.com/news/nation/2026/10/4/sample-article-123",
      ]);
    },
  );
});

test("GMA article discovery rejects external-host links", async () => {
  await withEnvironment(
    {
      TRUSTED_SOURCE_HOSTS: "www.gmanetwork.com",
      TRUSTED_SOURCE_SEED_URLS: "https://www.gmanetwork.com/news/",
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

test("INQUIRER Newsinfo is trusted only when its exact host is allowlisted", () => {
  const originalHosts = process.env.TRUSTED_SOURCE_HOSTS;
  process.env.TRUSTED_SOURCE_HOSTS = "newsinfo.inquirer.net";
  try {
    assert.equal(
      isAllowedTrustedSource(
        new URL("https://newsinfo.inquirer.net/2026/10/04/taguig-report"),
      ),
      true,
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
      isAllowedTrustedSource(
        new URL("http://newsinfo.inquirer.net/article"),
      ),
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

test("INQUIRER collector follows only trusted same-host HTTPS article links", async () => {
  const originalHosts = process.env.TRUSTED_SOURCE_HOSTS;
  const originalSeeds = process.env.TRUSTED_SOURCE_SEED_URLS;
  process.env.TRUSTED_SOURCE_HOSTS = "newsinfo.inquirer.net";
  process.env.TRUSTED_SOURCE_SEED_URLS = "";
  const calls = [];
  const response = (body) => ({
    ok: true,
    text: async () => body,
  });

  try {
    const sources = await collectTrustedSources({
      fetchImpl: async (url, options) => {
        calls.push({ url: url.toString(), options });
        if (url.pathname === "/") {
          return response(
            '<a href="/2026/10/04/taguig-report">Police report from Taguig City, Philippines</a>' +
              '<a href="https://example.com/article">Untrusted external report with enough text</a>' +
              '<a href="http://newsinfo.inquirer.net/article">Insecure article link with enough text</a>',
          );
        }
        return response(
          "<html><head><title>Taguig report</title></head><body>Article text</body></html>",
        );
      },
    });

    assert.equal(sources.length, 1);
    assert.equal(
      sources[0].url,
      "https://newsinfo.inquirer.net/2026/10/04/taguig-report",
    );
    assert.equal(sources[0].sourceName, "newsinfo.inquirer.net");
    assert.equal(calls.length, 2);
    assert.equal(calls[0].options.redirect, "error");
    assert.equal(calls[1].options.redirect, "error");
  } finally {
    if (originalHosts === undefined) {
      delete process.env.TRUSTED_SOURCE_HOSTS;
    } else {
      process.env.TRUSTED_SOURCE_HOSTS = originalHosts;
    }
    if (originalSeeds === undefined) {
      delete process.env.TRUSTED_SOURCE_SEED_URLS;
    } else {
      process.env.TRUSTED_SOURCE_SEED_URLS = originalSeeds;
    }
  }
});

test("collector extracts bounded same-host article text and metadata", async () => {
  const originalHosts = process.env.TRUSTED_SOURCE_HOSTS;
  const originalSeeds = process.env.TRUSTED_SOURCE_SEED_URLS;
  process.env.TRUSTED_SOURCE_HOSTS = "trusted.example";
  process.env.TRUSTED_SOURCE_SEED_URLS = "";
  const calls = [];
  const response = (body) => ({
    ok: true,
    text: async () => body,
  });
  const sources = await collectTrustedSources({
    fetchImpl: async (url) => {
      calls.push(url.toString());
      if (url.pathname === "/") {
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
  if (originalSeeds === undefined) {
    delete process.env.TRUSTED_SOURCE_SEED_URLS;
  } else {
    process.env.TRUSTED_SOURCE_SEED_URLS = originalSeeds;
  }

  assert.equal(calls.length, 2);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].url, "https://trusted.example/article");
  assert.equal(sources[0].sourceName, "trusted.example");
  assert.equal(sources[0].title, "Trusted report");
  assert.match(sources[0].content, /Category: Assault/);
  assert.equal(sources[0].publishedAt, "2025-09-24");
});

test("ingestion pipeline never persists failed verification and reports outcomes", async () => {
  const candidate = validCandidate();
  let persisted = 0;
  const result = await runAutomatedIngestion({
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
    sourceName: "newsinfo.inquirer.net",
    sourceUrl: "https://newsinfo.inquirer.net/article",
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
  const articleUrl =
    "https://newsinfo.inquirer.net/2026/10/04/taguig-report";
  const candidate = validCandidate({
    sourceName: "newsinfo.inquirer.net",
    sourceUrl: articleUrl,
    sourcePublishedAt: "2026-10-04",
    latitude: null,
    longitude: null,
  });
  let extractorReceivedArticle = false;
  let persisted = 0;
  const result = await runAutomatedIngestion({
    collector: async () => [
      {
        sourceName: "newsinfo.inquirer.net",
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

test("duplicate INQUIRER article candidate never reaches persistence twice", async () => {
  const candidate = validCandidate({
    sourceName: "newsinfo.inquirer.net",
    sourceUrl: "https://newsinfo.inquirer.net/article-one",
  });
  let persisted = 0;
  const result = await runAutomatedIngestion({
    collector: async () => [
      {
        sourceName: "newsinfo.inquirer.net",
        url: "https://newsinfo.inquirer.net/article-one",
        content: "Article one.",
      },
      {
        sourceName: "newsinfo.inquirer.net",
        url: "https://newsinfo.inquirer.net/article-two",
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
  assert.ok(result.results[1].reasons.some((reason) => /Duplicate/.test(reason)));
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
      if (sql.startsWith("SELECT id FROM incident_categories")) return [[{ id: 2 }]];
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
  assert.equal(statements.some((sql) => sql.startsWith("UPDATE")), false);
  assert.equal(statements.some((sql) => sql.startsWith("INSERT INTO locations")), false);
  assert.equal(statements.filter((sql) => sql.startsWith("INSERT INTO incidents")).length, 1);
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
        return [[{
          category: "Assault",
          city: "Taguig City",
          barangay: "Santa Ana",
          latitude: null,
          longitude: null,
          location_description: "Source-named area in Barangay Santa Ana",
          incident_date: "2025-09-24",
          severity: "HIGH",
          source_url: "https://manilastandard.net/article/example",
        }]];
      }
      throw new Error("No insertion should be attempted.");
    },
  };

  const result = await insertVerifiedCandidate(validCandidate(), {
    dbPool: { getConnection: async () => connection },
  });

  assert.deepEqual(result, { status: "DUPLICATE", inserted: false });
  assert.equal(statements.length, 1);
});
