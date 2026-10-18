const DEFAULT_ROUTING_URL = "https://router.project-osrm.org/route/v1/driving";

exports.getRoutes = async (start, destination) => {
  const baseUrl = process.env.OSRM_BASE_URL || DEFAULT_ROUTING_URL;
  const coordinates = `${start.longitude},${start.latitude};${destination.longitude},${destination.latitude}`;
  const url = new URL(`${baseUrl.replace(/\/$/, "")}/${coordinates}`);
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
    throw new Error("No drivable route was returned");
  }

  return payload.routes.map((route) => {
    const coordinatesList = route?.geometry?.coordinates;
    if (
      !Array.isArray(coordinatesList) ||
      coordinatesList.length < 2 ||
      !Number.isFinite(route.distance) ||
      !Number.isFinite(route.duration)
    ) {
      throw new Error("Invalid route returned by routing provider");
    }
    return {
      distanceMeters: route.distance,
      durationSeconds: route.duration,
      coordinates: coordinatesList,
    };
  });
};

exports.getRoute = async (start, destination) =>
  (await exports.getRoutes(start, destination))[0];