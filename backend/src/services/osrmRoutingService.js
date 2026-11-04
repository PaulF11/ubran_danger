const DEFAULT_CAR_ROUTING_URL = "https://router.project-osrm.org/route/v1/driving";
const DEFAULT_WALKING_ROUTING_URL =
  "https://routing.openstreetmap.de/routed-foot/route/v1/driving";
const DEFAULT_BICYCLE_ROUTING_URL =
  "https://routing.openstreetmap.de/routed-bike/route/v1/driving";

function normalizeRouteMode(mode = "car") {
  const value = String(mode ?? "car").trim().toLowerCase();
  if (value === "driving" || value === "drive") return "car";
  if (value === "walking" || value === "walk" || value === "foot") {
    return "walking";
  }
  if (value === "cycling" || value === "cycle" || value === "bike") {
    return "bicycle";
  }
  return value || "car";
}

function estimatedSpeed(mode, environment) {
  const variable =
    mode === "motorcycle"
      ? "ROUTE_MOTORCYCLE_ESTIMATED_SPEED_KMH"
      : "ROUTE_TRUCK_ESTIMATED_SPEED_KMH";
  const fallback = mode === "motorcycle" ? 25 : 20;
  const speed = Number(environment[variable] ?? fallback);
  if (!Number.isFinite(speed) || speed < 5 || speed > 120) {
    const error = new Error(`invalid_configuration:${variable}`);
    error.code = "INVALID_ROUTE_CONFIGURATION";
    throw error;
  }
  return speed;
}

function routeProfileInfo(mode, environment = process.env) {
  const normalized = normalizeRouteMode(mode);
  const carUrl =
    environment.OSRM_CAR_BASE_URL ||
    environment.OSRM_BASE_URL ||
    DEFAULT_CAR_ROUTING_URL;
  const profiles = {
    car: {
      mode: "car",
      profile: "driving",
      baseUrl: carUrl,
      supported: true,
      durationSource: "provider",
      etaDescription:
        "Provider-supplied driving duration; live traffic is not included.",
    },
    walking: {
      mode: "walking",
      profile: "foot",
      baseUrl:
        environment.OSRM_WALKING_BASE_URL || DEFAULT_WALKING_ROUTING_URL,
      supported: true,
      durationSource: "provider",
      etaDescription:
        "Provider-supplied pedestrian-route duration; live traffic is not included.",
    },
    bicycle: {
      mode: "bicycle",
      profile: "bike",
      baseUrl:
        environment.OSRM_BICYCLE_BASE_URL || DEFAULT_BICYCLE_ROUTING_URL,
      supported: true,
      durationSource: "provider",
      etaDescription:
        "Provider-supplied bicycle-route duration; live traffic is not included.",
    },
  };

  if (profiles[normalized]) return profiles[normalized];
  if (normalized === "motorcycle" || normalized === "truck") {
    const speedKmh = estimatedSpeed(normalized, environment);
    const vehicle = normalized === "motorcycle" ? "motorcycle" : "truck";
    return {
      mode: normalized,
      profile: "driving",
      baseUrl: carUrl,
      supported: true,
      durationSource: "estimated",
      estimatedSpeedKmh: speedKmh,
      etaDescription:
        `Estimated at ${speedKmh} km/h over the car-road route. ` +
        `This is not ${vehicle}-specific routing, does not account for ` +
        "live traffic, and does not model vehicle restrictions.",
    };
  }
  return {
    mode: normalized,
    profile: null,
    baseUrl: null,
    supported: false,
    message: `The ${normalized} travel mode is not supported.`,
  };
}

exports.getRoutes = async (start, destination, { mode = "car" } = {}) => {
  const routeInfo = routeProfileInfo(mode);
  if (!routeInfo.supported) {
    const error = new Error(routeInfo.message);
    error.code = "UNSUPPORTED_ROUTE_MODE";
    throw error;
  }

  const coordinates = `${start.longitude},${start.latitude};${destination.longitude},${destination.latitude}`;
  const url = new URL(
    `${routeInfo.baseUrl.replace(/\/$/, "")}/${coordinates}`,
  );
  url.searchParams.set("overview", "full");
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("steps", "false");
  url.searchParams.set("alternatives", "true");

  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) {
    throw new Error("Routing provider unavailable");
  }

  const payload = await response.json();
  if (
    payload.code !== "Ok" ||
    !Array.isArray(payload.routes) ||
    payload.routes.length === 0
  ) {
    throw new Error("No route was returned");
  }

  return payload.routes.map((route) => {
    const coordinatesList = route?.geometry?.coordinates;
    if (
      !Array.isArray(coordinatesList) ||
      coordinatesList.length < 2 ||
      !Number.isFinite(route.distance) ||
      route.distance < 0 ||
      !Number.isFinite(route.duration) ||
      route.duration < 0
    ) {
      throw new Error("Invalid route returned by routing provider");
    }

    return {
      distanceMeters: route.distance,
      durationSeconds:
        routeInfo.durationSource === "estimated"
          ? (route.distance / (routeInfo.estimatedSpeedKmh * 1000)) * 3600
          : route.duration,
      coordinates: coordinatesList,
      routeMode: routeInfo.mode,
      providerProfile: routeInfo.profile,
      durationSource: routeInfo.durationSource,
      etaDescription: routeInfo.etaDescription,
    };
  });
};

exports.normalizeRouteMode = normalizeRouteMode;
exports.routeProfileInfo = routeProfileInfo;

exports.getRoute = async (start, destination, options) =>
  (await exports.getRoutes(start, destination, options))[0];
