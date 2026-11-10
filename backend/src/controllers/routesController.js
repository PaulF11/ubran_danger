const pool = require("../config/database");
const routingService = require("../services/osrmRoutingService");
const { routeProfileInfo } = routingService;
const {
  analyzeRouteSafety,
  proximityThresholdFromEnvironment,
  recommendRoute,
  validateRouteGeometry,
} = require("../services/routeIntelligenceService");
const { isWithinTaguigMapArea } = require("../constants/taguigMapBounds");
const {
  TAGUIG_BARANGAY_PARAMS,
} = require("../constants/taguigBarangays");
const {
  VERIFIED_INCIDENT_SCOPE,
} = require("../constants/verifiedIncidentScope");

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
    DATE_FORMAT(incidents.incident_date, '%Y-%m-%d') AS incident_date,
    incidents.source_url
  FROM incidents
  JOIN incident_categories
    ON incidents.category_id = incident_categories.id
  LEFT JOIN locations
    ON incidents.location_id = locations.id
  WHERE ${VERIFIED_INCIDENT_SCOPE}
    AND locations.latitude IS NOT NULL
    AND locations.longitude IS NOT NULL
`;

function unavailableIntelligence() {
  return {
    category: "UNAVAILABLE",
    message:
      "Route incident information is temporarily unavailable. The calculated route is shown without incident comparison.",
    nearbyVerifiedIncidentCount: null,
    severityCounts: null,
    incidents: [],
    weightedExposureScore: null,
    usableVerifiedIncidentCount: null,
    proximityThresholdMeters: null,
    datasetLimited: true,
    basis: "Currently verified incidents in the system",
  };
}

function createRoutesController({
  getRoute = routingService.getRoute,
  getRoutes,
  getIncidentRows = async () => {
    const [rows] = await pool.query(
      ROUTE_INCIDENTS_QUERY,
      TAGUIG_BARANGAY_PARAMS,
    );
    return rows;
  },
  getRouteProfileInfo = routeProfileInfo,
  getThreshold = () => proximityThresholdFromEnvironment(),
  logger = console,
} = {}) {
  const fetchRoutes =
    getRoutes ||
    (getRoute === routingService.getRoute
      ? routingService.getRoutes
      : async (start, destination, options) => [
          await getRoute(start, destination, options),
        ]);
  return async (req, res, next) => {
    const { start, destination, mode = "car" } = req.body || {};
    let routeInfo;
    try {
      routeInfo = getRouteProfileInfo(mode);
    } catch (error) {
      if (error?.code !== "INVALID_ROUTE_CONFIGURATION") return next(error);
      logger.error("[route-analysis] failed category=invalid_configuration");
      return res.status(503).json({
        success: false,
        message:
          "Route service is temporarily misconfigured. Please try again later.",
      });
    }
    if (!routeInfo.supported) {
      return res.status(400).json({
        success: false,
        message: routeInfo.message,
      });
    }
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

    let routes;
    try {
      const receivedRoutes = await fetchRoutes(start, destination, {
        mode: routeInfo.mode,
      });
      if (!Array.isArray(receivedRoutes) || receivedRoutes.length === 0) {
        throw new Error("no_routes");
      }
      const normalizeRoute = (route) => {
        if (
          !Number.isFinite(route?.distanceMeters) ||
          route.distanceMeters < 0 ||
          !Number.isFinite(route?.durationSeconds) ||
          route.durationSeconds < 0
        ) {
          throw new Error("invalid_route_metrics");
        }
        const points = validateRouteGeometry(route?.coordinates);
        return {
          ...route,
          coordinates: points.map((point) => [
            point.longitude,
            point.latitude,
          ]),
          routeMode: routeInfo.mode,
          providerProfile: routeInfo.profile,
          durationSource: routeInfo.durationSource,
          etaDescription: routeInfo.etaDescription,
        };
      };
      routes = [normalizeRoute(receivedRoutes[0])];
      for (const alternative of receivedRoutes.slice(1)) {
        try {
          routes.push(normalizeRoute(alternative));
        } catch (error) {
          logger.warn(
            `[route-analysis] alternative_skipped category=${
              error?.message === "route_out_of_scope"
                ? "out_of_scope"
                : "invalid_alternative"
            }`,
          );
        }
      }
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

    let routeIntelligences;
    let recommendation;
    try {
      const incidents = await getIncidentRows();
      const thresholdMeters = getThreshold();
      routeIntelligences = routes.map((route) =>
        analyzeRouteSafety(route.coordinates, incidents, {
          thresholdMeters,
          routeDurationSeconds: route.durationSeconds,
        }),
      );
      recommendation = recommendRoute(
        routes.map((route, index) => ({
          ...route,
          routeIntelligence: routeIntelligences[index],
        })),
      );
    } catch (error) {
      const category = /configuration/i.test(error?.message || "")
        ? "invalid_configuration"
        : "incident_data_unavailable";
      logger.error(`[route-analysis] failed category=${category}`);
      routeIntelligences = routes.map(() => unavailableIntelligence());
      recommendation = {
        recommendedRouteIndex: null,
        reason: "Verified incident comparison is unavailable.",
        methodology:
          "No route is recommended when verified incident data cannot be compared.",
      };
    }

    const dataRoutes = routes.map((route, index) => ({
      ...route,
      routeIntelligence: routeIntelligences[index],
    }));
    const primaryRoute = dataRoutes[0];
    return res.json({
      success: true,
      data: {
        ...primaryRoute,
        alternatives: dataRoutes.slice(1),
        recommendation,
      },
    });
  };
}

exports.getRoute = createRoutesController();
exports.createRoutesController = createRoutesController;
exports.ROUTE_INCIDENTS_QUERY = ROUTE_INCIDENTS_QUERY;
