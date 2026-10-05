const DEFAULT_ROUTING_URL = "https://router.project-osrm.org/route/v1/driving";

exports.getRoute = async (start, destination) => {
  const baseUrl = process.env.OSRM_BASE_URL || DEFAULT_ROUTING_URL;
  const coordinates = `${start.longitude},${start.latitude};${destination.longitude},${destination.latitude}`;
  const url = new URL(`${baseUrl.replace(/\/$/, "")}/${coordinates}`);
  url.searchParams.set("overview", "full");
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("steps", "false");

  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) {
    throw new Error("Routing provider unavailable");
  }

  const payload = await response.json();
  const route = payload.routes?.[0];
  const coordinatesList = route?.geometry?.coordinates;
  if (
    payload.code !== "Ok" ||
    !Array.isArray(coordinatesList) ||
    coordinatesList.length < 2
  ) {
    throw new Error("No drivable route was returned");
  }

  return {
    distanceMeters: route.distance,
    durationSeconds: route.duration,
    coordinates: coordinatesList,
  };
};