const pool = require("../config/database");
const routingService = require("../services/osrmRoutingService");
const {
  analyzeRouteSafety,
  proximityThresholdFromEnvironment,
  validateRouteGeometry,
} = require("../services/routeIntelligenceService");
const { isWithinTaguigMapArea } = require("../constants/taguigMapBounds");
const {
  TAGUIG_BARANGAY_PARAMS,
  TAGUIG_BARANGAY_SQL,
} = require("../constants/taguigBarangays");

const ROUTE_INCIDENTS_QUERY = `SELECT
    incidents.id,
    incidents.verification_status,
    incident_categories.name AS category_name,
    incidents.city,
    locations.barangay,
    locations.latitude,
    locations.longitude,
    incidents.location_description,
    incidents.severity,
    DATE_FORMAT(incidents.incident_date, '%Y-%m-%d') AS incident_date
  FROM incidents
  JOIN incident_categories
    ON incidents.category_id = incident_categories.id
  LEFT JOIN locations
    ON incidents.location_id = locations.id
  WHERE incidents.verification_status = 'VERIFIED'
    AND incidents.city = 'Taguig City'
    AND incidents.source_name IS NOT NULL
    AND incidents.source_url IS NOT NULL
    AND incidents.verification_method IS NOT NULL
    AND incidents.last_verified_at IS NOT NULL
    AND locations.latitude IS NOT NULL
    AND locations.longitude IS NOT NULL
    AND (locations.barangay IS NULL OR ${TAGUIG_BARANGAY_SQL})`;

function unavailableIntelligence() {
  return {
    category: "UNAVAILABLE",
    message:
      "Route incident information is temporarily unavailable. The calculated route is shown without incident comparison.",
    nearbyVerifiedIncidentCount: null,
    severityCounts: null,
    incidents: [],
    usableVerifiedIncidentCount: null,
    proximityThresholdMeters: null,
    datasetLimited: true,
    basis: "Currently verified incidents in the system",
  };
}

function createRoutesController({
  getRoute = routingService.getRoute,
  getIncidentRows = async () => {
    const [rows] = await pool.query(
      ROUTE_INCIDENTS_QUERY,
      TAGUIG_BARANGAY_PARAMS,
    );
    return rows;
  },
  getThreshold = () => proximityThresholdFromEnvironment(),
  logger = console,
} = {}) {
  return async (req, res) => {
    const { start, destination } = req.body || {};
    const validCoordinate = (point) =>
      point &&
      Number.isFinite(point.latitude) &&
      Number.isFinite(point.longitude) &&
      isWithinTaguigMapArea(point.latitude, point.longitude);

    if (!validCoordinate(start) || !validCoordinate(destination)) {
      return res.status(400).json({
        success: false,
        message:
          "Start and destination coordinates must be within the Taguig map area.",
      });
    }

    let route;
    let routePoints;
    try {
      route = await getRoute(start, destination);
      if (
        !Number.isFinite(route?.distanceMeters) ||
        route.distanceMeters < 0 ||
        !Number.isFinite(route?.durationSeconds) ||
        route.durationSeconds < 0
      ) {
        throw new Error("invalid_route_metrics");
      }
      routePoints = validateRouteGeometry(route?.coordinates);
    } catch (error) {
      if (error?.message === "route_out_of_scope") {
        return res.status(400).json({
          success: false,
          message: "The calculated route extends outside the Taguig map area.",
        });
      }
      logger.error("[route-analysis] failed category=osrm");
      return res.status(502).json({
        success: false,
        message: "Route service is unavailable. Please try again later.",
      });
    }

    let routeIntelligence;
    try {
      const incidents = await getIncidentRows();
      routeIntelligence = analyzeRouteSafety(route.coordinates, incidents, {
        thresholdMeters: getThreshold(),
      });
    } catch (error) {
      const category = /configuration/i.test(error?.message || "")
        ? "invalid_configuration"
        : "incident_data_unavailable";
      logger.error(`[route-analysis] failed category=${category}`);
      routeIntelligence = unavailableIntelligence();
    }

    return res.json({
      success: true,
      data: {
        ...route,
        coordinates: routePoints.map((point) => [
          point.longitude,
          point.latitude,
        ]),
        routeIntelligence,
      },
    });
  };
}

exports.getRoute = createRoutesController();
exports.createRoutesController = createRoutesController;
exports.ROUTE_INCIDENTS_QUERY = ROUTE_INCIDENTS_QUERY;
