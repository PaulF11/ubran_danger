// File note: This file handles gemini-provider.test.js.
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  extract,
  GEMINI_API_BASE_URL,
  DEFAULT_MODEL,
} = require("../src/services/extractionProviders/geminiProvider");

const extraction = {
  category: "Assault",
  city: "Taguig City",
  barangay: "Santa Ana",
  incidentDate: "2025-09-24",
  incidentTimeKnown: false,
  description: "A sourced assault reported in Taguig City.",
  severity: "HIGH",
  severityFacts: { firearmUsed: true },
  latitude: null,
  longitude: null,
  locationDescription: "Barangay Santa Ana",
  sourceEvidence: {
    sourceReviewed: true,
    city: "Taguig City",
    incidentDate: "2025-09-24",
    location: "Barangay Santa Ana",
    eventFacts: "The article reports an assault.",
  },
};

function response(status, content, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return headers[name.toLowerCase()] ?? null;
      },
    },
    json: async () => ({
      candidates: [
        {
          content: {
            parts: [{ text: content }],
          },
        },
      ],
    }),
  };
}

async function withGeminiEnvironment(callback) {
  const originalKey = process.env.GEMINI_API_KEY;
  const originalModel = process.env.GEMINI_MODEL;
  process.env.GEMINI_API_KEY = "test-key";
  delete process.env.GEMINI_MODEL;
  try {
    await callback();
  } finally {
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = originalModel;
  }
}

test("Gemini extraction returns a successful JSON candidate", async () => {
  await withGeminiEnvironment(async () => {
    const calls = [];
    const result = await extract("A sourced Taguig article.", {
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        return response(200, JSON.stringify(extraction));
      },
      sleep: async () => assert.fail("A successful request must not retry."),
    });

    assert.equal(calls.length, 1);
    assert.equal(
      calls[0].url,
      `${GEMINI_API_BASE_URL}/${DEFAULT_MODEL}:generateContent`,
    );
    assert.equal(calls[0].options.headers["x-goog-api-key"], "test-key");
    assert.equal(
      JSON.parse(calls[0].options.body).generationConfig.responseMimeType,
      "application/json",
    );
    assert.deepEqual(result, extraction);
  });
});

test("Gemini extraction rejects an invalid or non-JSON model response", async () => {
  await withGeminiEnvironment(async () => {
    await assert.rejects(
      extract("A sourced Taguig article.", {
        fetchImpl: async () => response(200, "not JSON"),
      }),
      /non-JSON candidate/,
    );
  });
});

test("Gemini extraction retries HTTP 429 and succeeds", async () => {
  await withGeminiEnvironment(async () => {
    const delays = [];
    let calls = 0;
    const result = await extract("A sourced Taguig article.", {
      fetchImpl: async () => {
        calls += 1;
        return calls === 1
          ? response(429, "", { "retry-after": "2" })
          : response(200, JSON.stringify(extraction));
      },
      sleep: async (delayMs) => delays.push(delayMs),
    });

    assert.equal(calls, 2);
    assert.deepEqual(delays, [2000]);
    assert.deepEqual(result, extraction);
  });
});

test("Gemini extraction reports rate limiting after bounded retries", async () => {
  await withGeminiEnvironment(async () => {
    const delays = [];
    let calls = 0;
    await assert.rejects(
      extract("A sourced Taguig article.", {
        fetchImpl: async () => {
          calls += 1;
          return response(429, "", { "retry-after": "120" });
        },
        sleep: async (delayMs) => delays.push(delayMs),
      }),
      /rate-limited after retries/,
    );

    assert.equal(calls, 4);
    assert.deepEqual(delays, [8000, 8000, 8000]);
  });
});

test("Gemini authentication/API-key errors are clean and not retried", async () => {
  await withGeminiEnvironment(async () => {
    let calls = 0;
    await assert.rejects(
      extract("A sourced Taguig article.", {
        fetchImpl: async () => {
          calls += 1;
          return response(401, "");
        },
        sleep: async () => assert.fail("A 401 response must not retry."),
      }),
      (error) => {
        assert.match(error.message, /HTTP 401/);
        assert.equal(error.message.includes("test-key"), false);
        return true;
      },
    );
    assert.equal(calls, 1);
  });
});

test("concurrent Gemini extractions are serialized", async () => {
  await withGeminiEnvironment(async () => {
    let activeRequests = 0;
    let maximumActiveRequests = 0;
    const fetchImpl = async () => {
      activeRequests += 1;
      maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests);
      await new Promise((resolve) => setTimeout(resolve, 5));
      activeRequests -= 1;
      return response(200, JSON.stringify(extraction));
    };

    await Promise.all([
      extract("First article.", { fetchImpl }),
      extract("Second article.", { fetchImpl }),
    ]);
    assert.equal(maximumActiveRequests, 1);
  });
});

test("Gemini can return null when the article is not an individual incident", async () => {
  await withGeminiEnvironment(async () => {
    const result = await extract("An aggregate crime statistics report.", {
      fetchImpl: async () => response(200, "null"),
    });
    assert.equal(result, null);
  });
});
