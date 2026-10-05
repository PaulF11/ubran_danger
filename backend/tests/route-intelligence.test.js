const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_PROXIMITY_METERS,
  analyzeRouteSafety,
  proximityThresholdFromEnvironment,
  validateRouteGeometry,
} = require("../src/services/routeIntelligenceService");
const {
  createRoutesController,
  ROUTE_INCIDENTS_QUERY,
} = require("../src/controllers/routesController");

const route = [
  [121.0, 14.5],
  [121.005, 14.5],
  [121.01, 14.5],
];

function incident(id, overrides = {}) {
  return {
    id,
    category_name: "Theft",
    city: "Taguig City",
    barangay: "Santa Ana",
    latitude: 14.5,
    longitude: 121.005,
    severity: "LOW",
    incident_date: "2025-09-24",
    verification_status: "VERIFIED",
    ...overrides,
  };
}

function latitudeOffset(meters) {
  return 14.5 + (meters / 6371008.8) * (180 / Math.PI);
}

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(value) {
      this.statusCode = value;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
  };
}

function request(start = { latitude: 14.5, longitude: 121 }) {
  return {
    body: {
      start,
      destination: { latitude: 14.5, longitude: 121.01 },
    },
  };
}

test("no nearby incidents returns a specific evidence-based category", () => {
  const result = analyzeRouteSafety(route, [
    incident(1, { latitude: 14.51, longitude: 121.005 }),
  ]);
  assert.equal(result.nearbyVerifiedIncidentCount, 0);
  assert.equal(result.category, "NO_VERIFIED_INCIDENTS_NEAR_ROUTE");
  assert.equal(result.message, "No verified incidents found near this route.");
});

test("a single verified incident is returned with barangay and route distance", () => {
  const result = analyzeRouteSafety(route, [
    incident(1, {
      severity: "MEDIUM",
      location_description: "Near a public road",
    }),
  ]);
  assert.equal(result.nearbyVerifiedIncidentCount, 1);
  assert.deepEqual(result.severityCounts, { HIGH: 0, MEDIUM: 1, LOW: 0 });
  assert.equal(result.incidents[0].barangay, "Santa Ana");
  assert.equal(result.incidents[0].distanceMeters, 0);
  assert.equal(result.datasetLimited, true);
});

test("multiple incidents have deterministic severity counts and ordering", () => {
  const result = analyzeRouteSafety(route, [
    incident(3, { severity: "LOW" }),
    incident(2, { severity: "HIGH" }),
    incident(1, { severity: "MEDIUM" }),
  ]);
  assert.equal(result.nearbyVerifiedIncidentCount, 3);
  assert.deepEqual(result.severityCounts, { HIGH: 1, MEDIUM: 1, LOW: 1 });
  assert.deepEqual(
    result.incidents.map(({ id }) => id),
    [1, 2, 3],
  );
  assert.equal(
    result.category,
    "HIGHER_SEVERITY_VERIFIED_INCIDENTS_NEAR_ROUTE",
  );
  assert.equal(
    /safe|dangerous|crime-free|guaranteed/i.test(result.message),
    false,
  );
});

test("distance threshold includes exact-boundary and inside incidents only", () => {
  const exact = latitudeOffset(500);
  const inside = latitudeOffset(499);
  const outside = latitudeOffset(501);
  const result = analyzeRouteSafety(
    route,
    [
      incident(1, { latitude: exact }),
      incident(2, { latitude: inside }),
      incident(3, { latitude: outside }),
    ],
    { thresholdMeters: 500 },
  );
  assert.deepEqual(result.incidents.map(({ id }) => id).sort(), [1, 2]);
});

test("null, malformed, out-of-area, unverified, and pending incidents are ignored", () => {
  const result = analyzeRouteSafety(route, [
    incident(1, { latitude: null }),
    incident(2, { longitude: "not-a-longitude" }),
    incident(7, { longitude: null }),
    incident(3, { latitude: 14.7 }),
    incident(4, { verification_status: "UNVERIFIED" }),
    incident(5, { verification_status: "PENDING_REVIEW" }),
    incident(6, { city: "Makati City" }),
  ]);
  assert.equal(result.usableVerifiedIncidentCount, 0);
  assert.equal(result.nearbyVerifiedIncidentCount, 0);
  assert.equal(result.category, "NO_GEOCODED_VERIFIED_INCIDENTS");
});

test("same incident is counted once even when its row is repeated", () => {
  const result = analyzeRouteSafety(route, [
    incident(7, { severity: "HIGH" }),
    incident(7, { severity: "HIGH" }),
  ]);
  assert.equal(result.nearbyVerifiedIncidentCount, 1);
  assert.equal(result.severityCounts.HIGH, 1);
});

test("multiple route segments, short geometry, and long geometry are handled", () => {
  const segmented = analyzeRouteSafety(
    [
      [121.0, 14.5],
      [121.0, 14.51],
      [121.01, 14.51],
      [121.01, 14.5],
    ],
    [incident(1, { latitude: 14.51, longitude: 121.005 })],
  );
  assert.equal(segmented.nearbyVerifiedIncidentCount, 1);

  const short = analyzeRouteSafety(
    [
      [121.0, 14.5],
      [121.00001, 14.5],
    ],
    [incident(2, { longitude: 121.000005 })],
  );
  assert.equal(short.nearbyVerifiedIncidentCount, 1);

  const long = analyzeRouteSafety(
    [
      [120.99, 14.46],
      [121.0, 14.5],
      [121.1, 14.6],
    ],
    [incident(3, { latitude: 14.55, longitude: 121.05 })],
  );
  assert.equal(long.nearbyVerifiedIncidentCount, 1);
});

test("incidents near route start, middle, and destination are all included", () => {
  const result = analyzeRouteSafety(route, [
    incident(1, { longitude: 121.0001 }),
    incident(2, { longitude: 121.005 }),
    incident(3, { longitude: 121.0099 }),
  ]);
  assert.equal(result.nearbyVerifiedIncidentCount, 3);
});

test("empty incident input and missing or malformed route geometry are handled", () => {
  assert.equal(
    analyzeRouteSafety(route, []).category,
    "NO_GEOCODED_VERIFIED_INCIDENTS",
  );
  for (const geometry of [null, [], [[121, 14.5]], [[121, 14.5], null]]) {
    assert.throws(() => validateRouteGeometry(geometry));
  }
  assert.throws(() =>
    validateRouteGeometry([
      [121, 14.5],
      ["bad", 14.5],
    ]),
  );
  assert.throws(
    () =>
      validateRouteGeometry([
        [121, 14.5],
        [121.2, 14.5],
      ]),
    /route_out_of_scope/,
  );
});

test("proximity threshold is configurable, bounded, and has a documented default", () => {
  assert.equal(proximityThresholdFromEnvironment({}), DEFAULT_PROXIMITY_METERS);
  assert.equal(
    proximityThresholdFromEnvironment({
      ROUTE_INCIDENT_PROXIMITY_METERS: "275",
    }),
    275,
  );
  for (const value of ["0", "-1", "5001", "NaN"]) {
    assert.throws(
      () =>
        proximityThresholdFromEnvironment({
          ROUTE_INCIDENT_PROXIMITY_METERS: value,
        }),
      /invalid_configuration/,
    );
  }
});

test("route database query filters verified, sourced Taguig reports and development fixtures", () => {
  assert.match(ROUTE_INCIDENTS_QUERY, /incidents\.verification_status,/);
  assert.match(ROUTE_INCIDENTS_QUERY, /verification_status = 'VERIFIED'/);
  assert.match(ROUTE_INCIDENTS_QUERY, /city = 'Taguig City'/);
  assert.match(ROUTE_INCIDENTS_QUERY, /source_name IS NOT NULL/);
  assert.match(ROUTE_INCIDENTS_QUERY, /source_url IS NOT NULL/);
  assert.match(ROUTE_INCIDENTS_QUERY, /verification_method IS NOT NULL/);
  assert.match(ROUTE_INCIDENTS_QUERY, /last_verified_at IS NOT NULL/);
  assert.match(ROUTE_INCIDENTS_QUERY, /locations\.latitude IS NOT NULL/);
  assert.match(ROUTE_INCIDENTS_QUERY, /locations\.longitude IS NOT NULL/);
  assert.match(ROUTE_INCIDENTS_QUERY, /LOWER\(TRIM\(locations\.barangay\)\)/);

  const syntheticDevelopmentRow = incident(100, {
    barangay: "DEVELOPMENT TEST AREA 03 (FICTIONAL)",
    latitude: 14.6,
    longitude: 121.0,
  });
  assert.equal(ROUTE_INCIDENTS_QUERY.includes("DEVELOPMENT TEST AREA"), false);
  assert.equal(
    analyzeRouteSafety(route, [syntheticDevelopmentRow])
      .nearbyVerifiedIncidentCount,
    0,
  );
  assert.equal(
    analyzeRouteSafety(route, [
      incident(100, {
        ...syntheticDevelopmentRow,
        latitude: 14.6203,
        longitude: 121.0003,
      }),
    ]).nearbyVerifiedIncidentCount,
    0,
  );
});

test("start outside Taguig is rejected before requesting OSRM", async () => {
  let routingCalls = 0;
  const controller = createRoutesController({
    getRoute: async () => {
      routingCalls += 1;
      return { coordinates: route, distanceMeters: 1, durationSeconds: 1 };
    },
    logger: createLogger(),
  });
  const response = responseRecorder();
  await controller(request({ latitude: 14.7, longitude: 121 }), response);
  assert.equal(response.statusCode, 400);
  assert.equal(routingCalls, 0);
});

test("destination outside Taguig is rejected before requesting OSRM", async () => {
  const controller = createRoutesController({
    getRoute: async () =>
      assert.fail("Out-of-scope endpoints must be rejected."),
    logger: createLogger(),
  });
  const req = request();
  req.body.destination.latitude = 14.7;
  const response = responseRecorder();
  await controller(req, response);
  assert.equal(response.statusCode, 400);
});

test("OSRM failure remains an explicit route error", async () => {
  const controller = createRoutesController({
    getRoute: async () => {
      throw new Error("provider unavailable");
    },
    logger: createLogger(),
  });
  const response = responseRecorder();
  await controller(request(), response);
  assert.equal(response.statusCode, 502);
  assert.equal(response.body.success, false);
});

test("route geometry extending outside Taguig preserves Out of Scope handling", async () => {
  const controller = createRoutesController({
    getRoute: async () => ({
      coordinates: [route[0], [121.2, 14.5]],
      distanceMeters: 1,
      durationSeconds: 1,
    }),
    logger: createLogger(),
  });
  const response = responseRecorder();
  await controller(request(), response);
  assert.equal(response.statusCode, 400);
  assert.match(response.body.message, /outside the Taguig map area/);
});

test("malformed OSRM coordinates fail as an unavailable route instead of being analyzed", async () => {
  const controller = createRoutesController({
    getRoute: async () => ({
      coordinates: [route[0], ["invalid", 14.5]],
      distanceMeters: 100,
      durationSeconds: 60,
    }),
    logger: createLogger(),
  });
  const response = responseRecorder();
  await controller(request(), response);
  assert.equal(response.statusCode, 502);
  assert.equal(response.body.success, false);
});

test("route response includes structured incident intelligence from database rows", async () => {
  let queryRows = null;
  const controller = createRoutesController({
    getRoute: async () => ({
      coordinates: route,
      distanceMeters: 1200,
      durationSeconds: 600,
    }),
    getIncidentRows: async () => [incident(18, { severity: "HIGH" })],
    getThreshold: () => 400,
    logger: createLogger(),
  });
  const response = responseRecorder();
  await controller(request(), response);
  queryRows = response.body.data.routeIntelligence;
  assert.equal(response.statusCode, 200);
  assert.equal(queryRows.nearbyVerifiedIncidentCount, 1);
  assert.equal(queryRows.severityCounts.HIGH, 1);
  assert.equal(queryRows.proximityThresholdMeters, 400);
  assert.equal(queryRows.incidents[0].id, 18);
  assert.equal(response.body.data.coordinates.length, 3);
});

test("route endpoint detects the known Tuktukan incident near OSRM geometry", async () => {
  const latitude = "14.52888540";
  const longitude = "121.07079090";
  const controller = createRoutesController({
    getRoute: async () => ({
      coordinates: [
        [121.066, Number(latitude)],
        [121.076, Number(latitude)],
      ],
      distanceMeters: 1000,
      durationSeconds: 120,
    }),
    getIncidentRows: async () => [
      incident(4, {
        category_name: "Assault",
        severity: "HIGH",
        barangay: "Tuktukan",
        latitude,
        longitude,
        location_description: "In front of Tuktukan Barangay Hall",
      }),
    ],
    logger: createLogger(),
  });
  const response = responseRecorder();
  await controller(request(), response);

  const intelligence = response.body.data.routeIntelligence;
  assert.equal(response.statusCode, 200);
  assert.equal(intelligence.nearbyVerifiedIncidentCount, 1);
  assert.deepEqual(intelligence.severityCounts, { HIGH: 1, MEDIUM: 0, LOW: 0 });
  assert.equal(intelligence.proximityThresholdMeters, 500);
  assert.equal(intelligence.incidents[0].id, 4);
  assert.equal(intelligence.incidents[0].category, "Assault");
  assert.equal(intelligence.incidents[0].barangay, "Tuktukan");
  assert.equal(intelligence.incidents[0].distanceMeters, 0);
  assert.equal(
    /this route is (safe|dangerous)|no crime will happen|completely safe/i.test(
      intelligence.message,
    ),
    false,
  );
});

test("database and invalid-threshold failures preserve the route with unavailable intelligence", async () => {
  for (const options of [
    {
      getIncidentRows: async () =>
        Promise.reject(new Error("database query failed")),
    },
    {
      getIncidentRows: async () => [],
      getThreshold: () => {
        throw new Error("invalid_configuration:route_proximity_threshold");
      },
    },
  ]) {
    const controller = createRoutesController({
      getRoute: async () => ({
        coordinates: route,
        distanceMeters: 1200,
        durationSeconds: 600,
      }),
      logger: createLogger(),
      ...options,
    });
    const response = responseRecorder();
    await controller(request(), response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.data.coordinates.length, 3);
    assert.equal(response.body.data.routeIntelligence.category, "UNAVAILABLE");
    assert.equal(
      response.body.data.routeIntelligence.nearbyVerifiedIncidentCount,
      null,
    );
  }
});

function createLogger() {
  const entries = [];
  return {
    entries,
    info: (message) => entries.push(message),
    warn: (message) => entries.push(message),
    error: (message) => entries.push(message),
  };
}
