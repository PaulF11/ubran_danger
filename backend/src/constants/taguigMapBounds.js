const TAGUIG_MAP_BOUNDS = {
  minLatitude: 14.45,
  maxLatitude: 14.62,
  minLongitude: 120.98,
  maxLongitude: 121.12,
};

const PATEROS_MAP_BOUNDS = {
  minLatitude: 14.48,
  maxLatitude: 14.56,
  minLongitude: 121.02,
  maxLongitude: 121.09,
};

const isWithinSupportedCoverageArea = (latitude, longitude) =>
  Number.isFinite(latitude) &&
  Number.isFinite(longitude) &&
  ((latitude >= TAGUIG_MAP_BOUNDS.minLatitude &&
    latitude <= TAGUIG_MAP_BOUNDS.maxLatitude &&
    longitude >= TAGUIG_MAP_BOUNDS.minLongitude &&
    longitude <= TAGUIG_MAP_BOUNDS.maxLongitude) ||
    (latitude >= PATEROS_MAP_BOUNDS.minLatitude &&
      latitude <= PATEROS_MAP_BOUNDS.maxLatitude &&
      longitude >= PATEROS_MAP_BOUNDS.minLongitude &&
      longitude <= PATEROS_MAP_BOUNDS.maxLongitude));

const isWithinTaguigMapArea = (latitude, longitude) =>
  isWithinSupportedCoverageArea(latitude, longitude);

module.exports = {
  TAGUIG_MAP_BOUNDS,
  PATEROS_MAP_BOUNDS,
  isWithinSupportedCoverageArea,
  isWithinTaguigMapArea,
};