const TAGUIG_MAP_BOUNDS = {
  minLatitude: 14.45,
  maxLatitude: 14.62,
  minLongitude: 120.98,
  maxLongitude: 121.12,
};

const isWithinTaguigMapArea = (latitude, longitude) =>
  Number.isFinite(latitude) &&
  Number.isFinite(longitude) &&
  latitude >= TAGUIG_MAP_BOUNDS.minLatitude &&
  latitude <= TAGUIG_MAP_BOUNDS.maxLatitude &&
  longitude >= TAGUIG_MAP_BOUNDS.minLongitude &&
  longitude <= TAGUIG_MAP_BOUNDS.maxLongitude;

module.exports = { isWithinTaguigMapArea };