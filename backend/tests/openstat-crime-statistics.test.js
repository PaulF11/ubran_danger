// File note: This file handles openstat-crime-statistics.test.js.
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_API_URL,
  retrieveOpenstatCrimeStatistics,
} = require("../src/services/openstatCrimeStatisticsService");

function apiResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function mockFetch(responses) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: url.toString(), options });
    const response = responses.shift();
    if (response instanceof Error) throw response;
    return response;
  };
  return { fetchImpl, calls };
}

const tableMetadata = [
  { code: "Geography", values: ["PH"], valueTexts: ["Philippines"] },
  {
    code: "Year",
    values: ["2017", "2024"],
    valueTexts: ["2017", "2024"],
    time: true,
  },
];

const jsonStat2Response = {
  class: "dataset",
  version: "2.0",
  label: "TABLE 17.1 Reported Crime Incidents: 2017 to 2024",
  id: ["Geography", "Year"],
  size: [1, 1],
  dimension: {
    Geography: {
      label: "Geography",
      category: {
        index: { PH: 0 },
        label: { PH: "Philippines" },
      },
    },
    Year: {
      label: "Year",
      category: {
        index: { "2024": 0 },
        label: { "2024": "2024" },
      },
    },
  },
  value: [12345],
};

test("retrieves and normalizes a bounded official OpenSTAT JSON-stat2 response", async () => {
  const { fetchImpl, calls } = mockFetch([
    apiResponse(tableMetadata),
    apiResponse(jsonStat2Response),
  ]);

  const result = await retrieveOpenstatCrimeStatistics({ fetchImpl });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, DEFAULT_API_URL);
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[1].url, DEFAULT_API_URL);
  assert.equal(calls[1].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    query: [
      {
        code: "Geography",
        selection: { filter: "item", values: ["PH"] },
      },
      {
        code: "Year",
        selection: { filter: "item", values: ["2024"] },
      },
    ],
    response: { format: "json-stat2" },
  });
  assert.equal(result.datasetType, "aggregate_crime_statistics");
  assert.deepEqual(result.observations, [
    {
      dimensions: {
        Geography: { code: "PH", label: "Philippines" },
        Year: { code: "2024", label: "2024" },
      },
      value: 12345,
      status: null,
    },
  ]);
});

test("rejects malformed API metadata and JSON-stat2 responses", async () => {
  const malformedMetadata = mockFetch([apiResponse({ unexpected: true })]);
  await assert.rejects(
    retrieveOpenstatCrimeStatistics({
      fetchImpl: malformedMetadata.fetchImpl,
    }),
    /metadata response is malformed/,
  );

  const malformedDataset = mockFetch([
    apiResponse(tableMetadata),
    apiResponse({ class: "dataset", id: ["Year"], size: [2], value: [1] }),
  ]);
  await assert.rejects(
    retrieveOpenstatCrimeStatistics({
      fetchImpl: malformedDataset.fetchImpl,
    }),
    /malformed JSON-stat2 dataset/,
  );
});

test("reports unavailable OpenSTAT API responses and network errors", async () => {
  const unavailable = mockFetch([apiResponse(null, 503)]);
  await assert.rejects(
    retrieveOpenstatCrimeStatistics({ fetchImpl: unavailable.fetchImpl }),
    /HTTP 503/,
  );

  const networkFailure = mockFetch([new Error("connection refused")]);
  await assert.rejects(
    retrieveOpenstatCrimeStatistics({ fetchImpl: networkFailure.fetchImpl }),
    /connection refused/,
  );
});

test("configuration cannot redirect the adapter to another host or table", async () => {
  const originalUrl = process.env.OPENSTAT_CRIME_API_URL;
  process.env.OPENSTAT_CRIME_API_URL =
    "https://openstat.psa.gov.ph/PXWeb/api/v1/en/DB/another-table";
  try {
    await assert.rejects(
      retrieveOpenstatCrimeStatistics({ fetchImpl: async () => assert.fail() }),
      /official OpenSTAT crime-table API endpoint/,
    );
  } finally {
    if (originalUrl === undefined) {
      delete process.env.OPENSTAT_CRIME_API_URL;
    } else {
      process.env.OPENSTAT_CRIME_API_URL = originalUrl;
    }
  }
});

test("identifies the official PNP CIRAS source and its aggregate table", async () => {
  const { fetchImpl } = mockFetch([
    apiResponse(tableMetadata),
    apiResponse(jsonStat2Response),
  ]);
  const result = await retrieveOpenstatCrimeStatistics({ fetchImpl });

  assert.deepEqual(result.source, {
    organization: "Philippine Statistics Authority",
    publisher: "Philippine National Police",
    system: "Crime Information Reporting and Analysis System (CIRAS)",
    official: true,
    url: "https://openstat.psa.gov.ph/PXWeb/pxweb/en/DB/DB__3S__C17/",
    table: "TABLE 17.1 Reported Crime Incidents: 2017 to 2024",
    matrix: "1H2BRCI0",
    dataType: "aggregate statistics",
  });
});

test("returns aggregate statistics without incident persistence fields", async () => {
  const { fetchImpl, calls } = mockFetch([
    apiResponse(tableMetadata),
    apiResponse(jsonStat2Response),
  ]);
  const result = await retrieveOpenstatCrimeStatistics({ fetchImpl });

  assert.equal(calls.length, 2);
  assert.equal(result.datasetType, "aggregate_crime_statistics");
  assert.equal("incidents" in result, false);
  assert.equal("persistence" in result, false);
  assert.equal("incidentDate" in result.observations[0], false);
  assert.equal("city" in result.observations[0], false);
});
