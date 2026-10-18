const { isWithinTaguigMapArea } = require("../constants/taguigMapBounds");
const { TAGUIG_BARANGAYS } = require("../constants/taguigBarangays");

const EARTH_RADIUS_METERS = 6371008.8;
const DISTANCE_COMPARISON_EPSILON_METERS = 0.000001;
const DEFAULT_PROXIMITY_METERS = 500;
const MAX_CONFIGURED_PROXIMITY_METERS = 5000;
const DAY_MS = 24 * 60 * 60 * 1000;
const TAGUIG_BARANGAY_SET = new Set(
  TAGUIG_BARANGAYS.map((barangay) => barangay.toLowerCase()),
);

function proximityThresholdFromEnvironment(environment = process.env) {
  const configured = environment.ROUTE_INCIDENT_PROXIMITY_METERS;
  if (configured === undefined || configured === "") {
    return DEFAULT_PROXIMITY_METERS;
  }
  const threshold = Number(configured);
  if (
    !Number.isFinite(threshold) ||
    threshold <= 0 ||
    threshold > MAX_CONFIGURED_PROXIMITY_METERS
  ) {
    throw new Error("invalid_configuration:route_proximity_threshold");
  }
  return threshold;
}

function coordinate(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function isValidPosition(latitude, longitude) {
  return (
    latitude !== null &&
    longitude !== null &&
    isWithinTaguigMapArea(latitude, longitude)
  );
}

function validateRouteGeometry(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    throw new Error("invalid_route_geometry");
  }
  const points = coordinates.map((point) => {
    if (!Array.isArray(point) || point.length < 2) {
      throw new Error("invalid_route_coordinates");
    }
    const longitude = coordinate(point[0]);
    const latitude = coordinate(point[1]);
    if (
      latitude === null ||
      longitude === null ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw new Error("invalid_route_coordinates");
    }
    if (!isValidPosition(latitude, longitude)) {
      throw new Error("route_out_of_scope");
    }
    return { latitude, longitude };
  });
  return points;
}

function nearestRoutePosition(latitude, longitude, routePoints) {
  const incidentLatitude = (latitude * Math.PI) / 180;
  const longitudeScale = Math.cos(incidentLatitude);
  const project = (point) => ({
    x:
      ((point.longitude - longitude) * Math.PI * EARTH_RADIUS_METERS * longitudeScale) /
      180,
    y:
      ((point.latitude - latitude) * Math.PI * EARTH_RADIUS_METERS) / 180,
  });
  const origin = { x: 0, y: 0 };
  let closestDistance = Number.POSITIVE_INFINITY;
  let closestAlongRouteMeters = 0;
  let traveledMeters = 0;

  for (let index = 0; index < routePoints.length - 1; index += 1) {
    const first = project(routePoints[index]);
    const second = project(routePoints[index + 1]);
    const segmentX = second.x - first.x;
    const segmentY = second.y - first.y;
    const segmentLengthSquared = segmentX ** 2 + segmentY ** 2;
    const fraction =
      segmentLengthSquared === 0
        ? 0
        : Math.max(
            0,
            Math.min(
              1,
              ((origin.x - first.x) * segmentX +
                (origin.y - first.y) * segmentY) /
                segmentLengthSquared,
            ),
          );
    const segmentLength = Math.sqrt(segmentLengthSquared);
    const nearestX = first.x + fraction * segmentX;
    const nearestY = first.y + fraction * segmentY;
    const distance = Math.hypot(nearestX, nearestY);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestAlongRouteMeters = traveledMeters + segmentLength * fraction;
    }
    traveledMeters += segmentLength;
  }
  return {
    distanceMeters: closestDistance,
    alongRouteMeters: closestAlongRouteMeters,
    routeLengthMeters: traveledMeters,
  };
}

function distanceFromRouteMeters(latitude, longitude, routePoints) {
  return nearestRoutePosition(latitude, longitude, routePoints).distanceMeters;
}

function incidentRecencyWeight(incidentDate, now) {
  if (!incidentDate) return 1;
  const timestamp = new Date(incidentDate).getTime();
  if (!Number.isFinite(timestamp)) return 1;
  const ageDays = Math.max(0, (now - timestamp) / DAY_MS);
  if (ageDays <= 30) return 1.5;
  if (ageDays <= 365) return 1.25;
  return 1;
}

function severityWeight(severity) {
  switch (String(severity || "").toUpperCase()) {
    case "HIGH":
      return 3;
    case "MEDIUM":
      return 2;
    case "LOW":
      return 1;
    default:
      return 1;
  }
}

function analyzeRouteSafety(
  coordinates,
  incidents,
  {
    thresholdMeters = DEFAULT_PROXIMITY_METERS,
    routeDurationSeconds,
    now = Date.now(),
  } = {},
) {
  if (!Number.isFinite(thresholdMeters) || thresholdMeters <= 0) {
    throw new Error("invalid_configuration:route_proximity_threshold");
  }
  const routePoints = validateRouteGeometry(coordinates);
  const seenIds = new Set();
  const usableIncidents = [];

  for (const incident of incidents || []) {
    if (
      incident?.verification_status !== "VERIFIED" ||
      incident.city !== "Taguig City" ||
      (incident.barangay !== null &&
        incident.barangay !== undefined &&
        !TAGUIG_BARANGAY_SET.has(String(incident.barangay).trim().toLowerCase()))
    ) {
      continue;
    }
    const id = incident.id;
    if (id === null || id === undefined || seenIds.has(String(id))) continue;

    const latitude = coordinate(incident.latitude);
    const longitude = coordinate(incident.longitude);
    if (!isValidPosition(latitude, longitude)) continue;
    seenIds.add(String(id));
    usableIncidents.push({ incident, latitude, longitude });
  }

  const nearbyIncidents = [];
  for (const { incident, latitude, longitude } of usableIncidents) {
    const routePosition = nearestRoutePosition(
      latitude,
      longitude,
      routePoints,
    );
    if (
      routePosition.distanceMeters <=
      thresholdMeters + DISTANCE_COMPARISON_EPSILON_METERS
    ) {
      nearbyIncidents.push({
        id: incident.id,
        category: incident.category_name,
        severity: String(incident.severity || "").toUpperCase(),
        barangay: incident.barangay || null,
        locationDescription: incident.location_description || null,
        incidentDate: incident.incident_date || null,
        distanceMeters: Math.round(routePosition.distanceMeters * 100) / 100,
        sourceUrl: incident.source_url || null,
        exposureWeight:
          severityWeight(incident.severity) *
          incidentRecencyWeight(incident.incident_date, now) *
          Math.max(
            0,
            1 - routePosition.distanceMeters / thresholdMeters,
          ),
        ...(Number.isFinite(routeDurationSeconds) &&
            routePosition.routeLengthMeters > 0
          ? {
              estimatedMinutesFromStart: Math.ceil(
                (routePosition.alongRouteMeters /
                  routePosition.routeLengthMeters) *
                  routeDurationSeconds /
                  60,
              ),
            }
          : {}),
      });
    }
  }
  nearbyIncidents.sort(
    (first, second) =>
      first.distanceMeters - second.distanceMeters ||
      String(first.id).localeCompare(String(second.id)),
  );

  const severityCounts = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const incident of nearbyIncidents) {
    if (Object.hasOwn(severityCounts, incident.severity)) {
      severityCounts[incident.severity] += 1;
    }
  }

  const category =
    usableIncidents.length === 0
      ? "NO_GEOCODED_VERIFIED_INCIDENTS"
      : nearbyIncidents.length === 0
        ? "NO_VERIFIED_INCIDENTS_NEAR_ROUTE"
        : severityCounts.HIGH > 0
          ? "HIGHER_SEVERITY_VERIFIED_INCIDENTS_NEAR_ROUTE"
          : "VERIFIED_INCIDENTS_NEAR_ROUTE";
  const message = {
    NO_GEOCODED_VERIFIED_INCIDENTS:
      "No verified incidents with usable coordinates are currently available for route comparison.",
    NO_VERIFIED_INCIDENTS_NEAR_ROUTE:
      "No verified incidents found near this route.",
    HIGHER_SEVERITY_VERIFIED_INCIDENTS_NEAR_ROUTE:
      "Higher-severity verified incidents found near this route.",
    VERIFIED_INCIDENTS_NEAR_ROUTE:
      "Verified incidents found near this route.",
  }[category];
  const weightedExposureScore = Math.round(
    nearbyIncidents.reduce(
      (score, incident) => score + incident.exposureWeight,
      0,
    ) * 100,
  ) / 100;

  return {
    category,
    message,
    nearbyVerifiedIncidentCount: nearbyIncidents.length,
    severityCounts,
    incidents: nearbyIncidents,
    weightedExposureScore,
    usableVerifiedIncidentCount: usableIncidents.length,
    proximityThresholdMeters: thresholdMeters,
    datasetLimited: true,
    basis: "Currently verified incidents in the system",
  };
}

function recommendRoute(routes) {
  if (!Array.isArray(routes) || routes.length < 2) {
    return {
      recommendedRouteIndex: null,
      reason: "Only one route is available; there is no alternative to compare.",
      methodology:
        "Recommendations require at least two routes and comparable verified-incident data.",
    };
  }
  if (
    routes.some(
      (route) =>
        route.routeIntelligence.category === "UNAVAILABLE" ||
        route.routeIntelligence.weightedExposureScore === null,
    )
  ) {
    return {
      recommendedRouteIndex: null,
      reason:
        "Verified incident comparison is unavailable for one or more routes.",
      methodology:
        "No route is recommended when verified incident data cannot be compared.",
    };
  }
  if (
    routes.every(
      (route) =>
        route.routeIntelligence.usableVerifiedIncidentCount === 0,
    )
  ) {
    return {
      recommendedRouteIndex: null,
      reason:
        "There are no geocoded verified incidents available to distinguish these routes.",
      methodology:
        "A route is suggested only when verified incident data supports a lower-exposure alternative.",
    };
  }

  const baseline = routes[0];
  const baselineScore = baseline.routeIntelligence.weightedExposureScore;
  const candidates = routes
    .map((route, index) => ({ route, index }))
    .filter(({ route, index }) => {
      if (index === 0) return false;
      const candidateScore = route.routeIntelligence.weightedExposureScore;
      const acceptableDistance =
        route.distanceMeters <= baseline.distanceMeters * 1.2;
      const acceptableDuration =
        route.durationSeconds <= baseline.durationSeconds * 1.2;
      return (
        candidateScore < baselineScore &&
        acceptableDistance &&
        acceptableDuration
      );
    })
    .sort(
      (first, second) =>
        first.route.routeIntelligence.weightedExposureScore -
          second.route.routeIntelligence.weightedExposureScore ||
        first.route.durationSeconds - second.route.durationSeconds ||
        first.route.distanceMeters - second.route.distanceMeters,
    );

  if (candidates.length === 0) {
    return {
      recommendedRouteIndex: null,
      reason:
        "No alternative shows a lower verified-incident exposure without exceeding the route distance and ETA trade-off limits.",
      methodology:
        "Incident exposure weights proximity, system-assigned severity, and incident date. An alternative must have lower exposure and be no more than 20% longer in both distance and estimated duration.",
    };
  }
  const { route, index } = candidates[0];
  const nearbyCount = route.routeIntelligence.nearbyVerifiedIncidentCount;
  const baselineCount = baseline.routeIntelligence.nearbyVerifiedIncidentCount;
  return {
    recommendedRouteIndex: index,
    reason:
      `Route ${index + 1} has a lower weighted verified-incident exposure ` +
      `(${nearbyCount} nearby reports versus ${baselineCount} on Route 1).`,
    methodology:
      "Incident exposure weights route proximity, system-assigned severity, and incident date. The suggested alternative has lower exposure and is no more than 20% longer in both distance and estimated duration. ETA is an estimate, not live traffic.",
  };
}

module.exports = {
  DEFAULT_PROXIMITY_METERS,
  MAX_CONFIGURED_PROXIMITY_METERS,
  analyzeRouteSafety,
  distanceFromRouteMeters,
  recommendRoute,
  proximityThresholdFromEnvironment,
  validateRouteGeometry,
};
