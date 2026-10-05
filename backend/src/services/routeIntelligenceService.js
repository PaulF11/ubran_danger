const { isWithinTaguigMapArea } = require("../constants/taguigMapBounds");
const { TAGUIG_BARANGAYS } = require("../constants/taguigBarangays");

const EARTH_RADIUS_METERS = 6371008.8;
const DISTANCE_COMPARISON_EPSILON_METERS = 0.000001;
const DEFAULT_PROXIMITY_METERS = 500;
const MAX_CONFIGURED_PROXIMITY_METERS = 5000;
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

function distanceFromRouteMeters(latitude, longitude, routePoints) {
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
  let closest = Number.POSITIVE_INFINITY;

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
    const nearestX = first.x + fraction * segmentX;
    const nearestY = first.y + fraction * segmentY;
    closest = Math.min(closest, Math.hypot(nearestX, nearestY));
  }
  return closest;
}

function analyzeRouteSafety(
  coordinates,
  incidents,
  { thresholdMeters = DEFAULT_PROXIMITY_METERS } = {},
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
    const distanceMeters = distanceFromRouteMeters(
      latitude,
      longitude,
      routePoints,
    );
    if (
      distanceMeters <=
      thresholdMeters + DISTANCE_COMPARISON_EPSILON_METERS
    ) {
      nearbyIncidents.push({
        id: incident.id,
        category: incident.category_name,
        severity: String(incident.severity || "").toUpperCase(),
        barangay: incident.barangay || null,
        locationDescription: incident.location_description || null,
        incidentDate: incident.incident_date || null,
        distanceMeters: Math.round(distanceMeters * 100) / 100,
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

  return {
    category,
    message,
    nearbyVerifiedIncidentCount: nearbyIncidents.length,
    severityCounts,
    incidents: nearbyIncidents,
    usableVerifiedIncidentCount: usableIncidents.length,
    proximityThresholdMeters: thresholdMeters,
    datasetLimited: true,
    basis: "Currently verified incidents in the system",
  };
}

module.exports = {
  DEFAULT_PROXIMITY_METERS,
  MAX_CONFIGURED_PROXIMITY_METERS,
  analyzeRouteSafety,
  distanceFromRouteMeters,
  proximityThresholdFromEnvironment,
  validateRouteGeometry,
};
