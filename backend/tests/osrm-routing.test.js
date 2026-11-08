// File note: This file handles osrm-routing.test.js.
const test = require("node:test");
const assert = require("node:assert/strict");
const routingService = require("../src/services/osrmRoutingService");

test("OSRM routing requests alternatives and validates returned geometries", async (context) => {
  const originalBaseUrl = process.env.OSRM_BASE_URL;
  process.env.OSRM_BASE_URL = "https://router.example.test/route/v1/driving";
  context.after(() => {
    if (originalBaseUrl === undefined) {
      delete process.env.OSRM_BASE_URL;
    } else {
      process.env.OSRM_BASE_URL = originalBaseUrl;
    }
  });
  context.mock.method(global, "fetch", async (input) => {
    const url = new URL(input);
    assert.equal(url.searchParams.get("alternatives"), "true");
    assert.equal(url.searchParams.get("geometries"), "geojson");
    return {
      ok: true,
      json: async () => ({
        code: "Ok",
        routes: [
          {
            distance: 1000,
            duration: 600,
            geometry: { coordinates: [[121, 14.5], [121.01, 14.51]] },
          },
          {
            distance: 1200,
            duration: 720,
            geometry: { coordinates: [[121, 14.5], [121.02, 14.52]] },
          },
        ],
      }),
    };
  });

  const routes = await routingService.getRoutes(
    { latitude: 14.5, longitude: 121 },
    { latitude: 14.51, longitude: 121.01 },
  );

  assert.equal(routes.length, 2);
  assert.equal(routes[1].distanceMeters, 1200);
  assert.deepEqual(routes[0].coordinates[0], [121, 14.5]);
});

test("walking and bicycle modes use their configured network profiles", async (context) => {
  const originalWalkingUrl = process.env.OSRM_WALKING_BASE_URL;
  const originalBicycleUrl = process.env.OSRM_BICYCLE_BASE_URL;
  process.env.OSRM_WALKING_BASE_URL =
    "https://walking.example.test/route/v1/foot";
  process.env.OSRM_BICYCLE_BASE_URL =
    "https://bicycle.example.test/route/v1/bike";
  context.after(() => {
    if (originalWalkingUrl === undefined) {
      delete process.env.OSRM_WALKING_BASE_URL;
    } else {
      process.env.OSRM_WALKING_BASE_URL = originalWalkingUrl;
    }
    if (originalBicycleUrl === undefined) {
      delete process.env.OSRM_BICYCLE_BASE_URL;
    } else {
      process.env.OSRM_BICYCLE_BASE_URL = originalBicycleUrl;
    }
  });

  const requestedUrls = [];
  context.mock.method(global, "fetch", async (input) => {
    requestedUrls.push(new URL(input).toString());
    return {
      ok: true,
      json: async () => ({
        code: "Ok",
        routes: [
          {
            distance: 1000,
            duration: 600,
            geometry: { coordinates: [[121, 14.5], [121.01, 14.51]] },
          },
        ],
      }),
    };
  });

  for (const [mode, baseUrl, providerProfile] of [
    ["walking", process.env.OSRM_WALKING_BASE_URL, "foot"],
    ["bicycle", process.env.OSRM_BICYCLE_BASE_URL, "bike"],
  ]) {
    const [route] = await routingService.getRoutes(
      { latitude: 14.5, longitude: 121 },
      { latitude: 14.51, longitude: 121.01 },
      { mode },
    );
    assert.equal(new URL(requestedUrls.at(-1)).origin, new URL(baseUrl).origin);
    assert.equal(route.routeMode, mode);
    assert.equal(route.providerProfile, providerProfile);
    assert.equal(route.durationSource, "provider");
    assert.equal(route.durationSeconds, 600);
  }
});

test("motorcycle and truck ETAs use disclosed mode-specific speed estimates", async (context) => {
  const originalMotorcycleSpeed =
    process.env.ROUTE_MOTORCYCLE_ESTIMATED_SPEED_KMH;
  const originalTruckSpeed = process.env.ROUTE_TRUCK_ESTIMATED_SPEED_KMH;
  process.env.ROUTE_MOTORCYCLE_ESTIMATED_SPEED_KMH = "30";
  process.env.ROUTE_TRUCK_ESTIMATED_SPEED_KMH = "20";
  context.after(() => {
    if (originalMotorcycleSpeed === undefined) {
      delete process.env.ROUTE_MOTORCYCLE_ESTIMATED_SPEED_KMH;
    } else {
      process.env.ROUTE_MOTORCYCLE_ESTIMATED_SPEED_KMH =
        originalMotorcycleSpeed;
    }
    if (originalTruckSpeed === undefined) {
      delete process.env.ROUTE_TRUCK_ESTIMATED_SPEED_KMH;
    } else {
      process.env.ROUTE_TRUCK_ESTIMATED_SPEED_KMH = originalTruckSpeed;
    }
  });
  context.mock.method(global, "fetch", async () => ({
    ok: true,
    json: async () => ({
      code: "Ok",
      routes: [
        {
          distance: 1000,
          duration: 600,
          geometry: { coordinates: [[121, 14.5], [121.01, 14.51]] },
        },
      ],
    }),
  }));

  const start = { latitude: 14.5, longitude: 121 };
  const destination = { latitude: 14.51, longitude: 121.01 };
  const [motorcycle] = await routingService.getRoutes(start, destination, {
    mode: "motorcycle",
  });
  const [truck] = await routingService.getRoutes(start, destination, {
    mode: "truck",
  });

  assert.equal(motorcycle.distanceMeters, 1000);
  assert.equal(motorcycle.durationSeconds, 120);
  assert.equal(motorcycle.durationSource, "estimated");
  assert.match(motorcycle.etaDescription, /not motorcycle-specific routing/);
  assert.equal(truck.distanceMeters, 1000);
  assert.equal(truck.durationSeconds, 180);
  assert.equal(truck.durationSource, "estimated");
  assert.match(truck.etaDescription, /does not model vehicle restrictions/);
});

test("unknown routing modes are rejected without calling a provider", async (context) => {
  context.mock.method(global, "fetch", async () => {
    assert.fail("Unknown route modes must not call a provider.");
  });

  await assert.rejects(
    routingService.getRoutes(
      { latitude: 14.5, longitude: 121 },
      { latitude: 14.51, longitude: 121.01 },
      { mode: "helicopter" },
    ),
    (error) =>
      error.code === "UNSUPPORTED_ROUTE_MODE" &&
      /not supported/.test(error.message),
  );
});

test("invalid estimated speeds are classified as route configuration errors", () => {
  assert.throws(
    () =>
      routingService.routeProfileInfo("truck", {
        ROUTE_TRUCK_ESTIMATED_SPEED_KMH: "invalid",
      }),
    (error) =>
      error.code === "INVALID_ROUTE_CONFIGURATION" &&
      /invalid_configuration:ROUTE_TRUCK_ESTIMATED_SPEED_KMH/.test(
        error.message,
      ),
  );
});
