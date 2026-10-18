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
