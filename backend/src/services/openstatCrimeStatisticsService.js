const API_PATH = "/PXWeb/api/v1/en/DB/3S/C17/0011H2BRCI0.px";
const DEFAULT_API_URL = `https://openstat.psa.gov.ph${API_PATH}`;
const API_TIMEOUT_MS = 15000;

const SOURCE_METADATA = Object.freeze({
  organization: "Philippine Statistics Authority",
  publisher: "Philippine National Police",
  system: "Crime Information Reporting and Analysis System (CIRAS)",
  official: true,
  url: "https://openstat.psa.gov.ph/PXWeb/pxweb/en/DB/DB__3S__C17/",
  table: "TABLE 17.1 Reported Crime Incidents: 2017 to 2024",
  matrix: "1H2BRCI0",
  dataType: "aggregate statistics",
});

function apiUrl() {
  const configuredUrl = process.env.OPENSTAT_CRIME_API_URL || DEFAULT_API_URL;
  let url;
  try {
    url = new URL(configuredUrl);
  } catch {
    throw new Error("OPENSTAT_CRIME_API_URL must be a valid HTTPS URL.");
  }

  if (
    url.protocol !== "https:" ||
    url.hostname.toLowerCase() !== "openstat.psa.gov.ph" ||
    url.pathname !== API_PATH ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "OPENSTAT_CRIME_API_URL must target the official OpenSTAT crime-table API endpoint.",
    );
  }
  return url.toString();
}

async function requestJson(fetchImpl, url, options) {
  const response = await fetchImpl(url, {
    ...options,
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`OpenSTAT API returned HTTP ${response.status}.`);
  }
  try {
    return await response.json();
  } catch {
    throw new Error("OpenSTAT API returned a malformed JSON response.");
  }
}

function buildSmallQuery(variables) {
  if (!Array.isArray(variables) || variables.length === 0) {
    throw new Error("OpenSTAT table metadata contains no variables.");
  }

  const crimeDimensions = ["Item", "Indicators", "Year"];
  const hasCrimeDimensions = crimeDimensions.every((code) =>
    variables.some((variable) => variable?.code === code),
  );
  if (hasCrimeDimensions) {
    return crimeDimensions.map((code) => {
      const variable = variables.find((item) => item.code === code);
      if (!Array.isArray(variable.values) || variable.values.length === 0) {
        throw new Error(
          "OpenSTAT table metadata contains a malformed crime dimension.",
        );
      }
      return {
        code,
        selection: {
          filter: "item",
          values: [
            variable.values[
              code === "Year" ? variable.values.length - 1 : 0
            ],
          ],
        },
      };
    });
  }

  // Keep parsing compatible with older metadata fixtures while the official
  // crime table uses the fixed Item, Indicators, and Year dimensions above.
  return variables.map((variable) => {
    if (
      !variable ||
      typeof variable.code !== "string" ||
      !Array.isArray(variable.values) ||
      variable.values.length === 0
    ) {
      throw new Error("OpenSTAT table metadata contains a malformed variable.");
    }
    const selectedIndex = variable.time ? variable.values.length - 1 : 0;
    return {
      code: variable.code,
      selection: {
        filter: "item",
        values: [variable.values[selectedIndex]],
      },
    };
  });
}

function categoryAtIndex(category, index) {
  const categoryIndex = category?.index;
  const code =
    Array.isArray(categoryIndex)
      ? categoryIndex[index]
      : categoryIndex && typeof categoryIndex === "object"
        ? Object.keys(categoryIndex).find(
            (key) => categoryIndex[key] === index,
          )
        : undefined;
  if (code === undefined) {
    throw new Error("OpenSTAT response contains malformed category indexes.");
  }

  const label = category.label?.[code];
  return { code, label: typeof label === "string" ? label : code };
}

function parseJsonStat2(dataset) {
  if (
    !dataset ||
    dataset.class !== "dataset" ||
    !Array.isArray(dataset.id) ||
    !Array.isArray(dataset.size) ||
    dataset.id.length === 0 ||
    dataset.id.length !== dataset.size.length ||
    !dataset.dimension ||
    !Array.isArray(dataset.value)
  ) {
    throw new Error("OpenSTAT returned a malformed JSON-stat2 dataset.");
  }

  const expectedValueCount = dataset.size.reduce(
    (count, size) =>
      Number.isInteger(size) && size >= 0 ? count * size : NaN,
    1,
  );
  if (
    !Number.isInteger(expectedValueCount) ||
    expectedValueCount !== dataset.value.length
  ) {
    throw new Error("OpenSTAT dataset dimensions do not match its values.");
  }

  const dimensions = dataset.id.map((id, position) => {
    const dimension = dataset.dimension[id];
    if (!dimension || !dimension.category) {
      throw new Error("OpenSTAT dataset contains a malformed dimension.");
    }
    return {
      id,
      label: typeof dimension.label === "string" ? dimension.label : id,
      size: dataset.size[position],
      category: dimension.category,
    };
  });

  const observations = dataset.value.map((value, valueIndex) => {
    if (
      value !== null &&
      (typeof value !== "number" || !Number.isFinite(value))
    ) {
      throw new Error("OpenSTAT dataset contains a non-numeric statistic.");
    }

    let remainder = valueIndex;
    const coordinates = new Array(dimensions.length);
    for (let position = dimensions.length - 1; position >= 0; position -= 1) {
      const dimensionSize = dimensions[position].size;
      coordinates[position] = remainder % dimensionSize;
      remainder = Math.floor(remainder / dimensionSize);
    }

    const observationDimensions = {};
    dimensions.forEach((dimension, position) => {
      const category = categoryAtIndex(
        dimension.category,
        coordinates[position],
      );
      observationDimensions[dimension.id] = {
        code: category.code,
        label: category.label,
      };
    });

    return {
      dimensions: observationDimensions,
      value,
      status: dataset.status?.[valueIndex] ?? null,
    };
  });

  return {
    label: typeof dataset.label === "string" ? dataset.label : null,
    observations,
  };
}

async function retrieveOpenstatCrimeStatistics({ fetchImpl = fetch } = {}) {
  const url = apiUrl();
  const metadata = await requestJson(fetchImpl, url, { method: "GET" });
  if (!Array.isArray(metadata)) {
    throw new Error("OpenSTAT table metadata response is malformed.");
  }

  const query = buildSmallQuery(metadata);
  const dataset = await requestJson(fetchImpl, url, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      query,
      response: { format: "json-stat2" },
    }),
  });
  const parsed = parseJsonStat2(dataset);

  return {
    datasetType: "aggregate_crime_statistics",
    source: SOURCE_METADATA,
    retrievedAt: new Date().toISOString(),
    datasetLabel: parsed.label,
    observations: parsed.observations,
  };
}

module.exports = {
  retrieveOpenstatCrimeStatistics,
  parseJsonStat2,
  SOURCE_METADATA,
  DEFAULT_API_URL,
};
