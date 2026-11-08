// File note: This file handles incidentDeduplicationService.js.
function normalizeText(value) {
  if (typeof value !== "string") return "";
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function incidentDay(candidate = {}) {
  const date = candidate.incidentDate || candidate.incident_date;
  if (!date || Number.isNaN(Date.parse(date))) return "";
  return new Date(date).toISOString().slice(0, 10);
}

function locationKey(candidate = {}) {
  const hasCoordinates =
    candidate.latitude !== null &&
    candidate.latitude !== undefined &&
    candidate.longitude !== null &&
    candidate.longitude !== undefined;
  const latitude = hasCoordinates ? Number(candidate.latitude) : NaN;
  const longitude = hasCoordinates ? Number(candidate.longitude) : NaN;
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    return `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
  }
  return normalizeText(
    candidate.locationDescription ||
      candidate.location_description ||
      candidate.barangay ||
      "",
  );
}

function buildDuplicateKey(candidate = {}) {
  return JSON.stringify({
    category: normalizeText(candidate.category || candidate.categoryName || ""),
    city: normalizeText(candidate.city || ""),
    barangay: normalizeText(candidate.barangay || ""),
    date: incidentDay(candidate),
    location: locationKey(candidate),
  });
}

function isDuplicate(candidate, existingCandidates = []) {
  const candidateKey = buildDuplicateKey(candidate);
  return existingCandidates.some(
    (existing) => existing && buildDuplicateKey(existing) === candidateKey,
  );
}

function findConflict(candidate, existingCandidates = []) {
  const candidateDay = incidentDay(candidate);
  const candidateLocation = locationKey(candidate);
  const candidateCity = normalizeText(candidate.city || "");
  const candidateDescription = normalizeText(
    candidate.locationDescription || "",
  );

  return existingCandidates.some((existing) => {
    if (!existing || incidentDay(existing) !== candidateDay) return false;
    if (normalizeText(existing.city || "") !== candidateCity) return false;

    const existingLocation = locationKey(existing);
    const existingDescription = normalizeText(
      existing.locationDescription || "",
    );
    const locationsOverlap =
      candidateDescription && existingDescription
        ? candidateDescription === existingDescription
        : candidateLocation && existingLocation
          ? candidateLocation === existingLocation
          : normalizeText(candidate.barangay || "") ===
            normalizeText(existing.barangay || "");
    if (!locationsOverlap) return false;

    return (
      normalizeText(existing.category || existing.categoryName || "") !==
        normalizeText(candidate.category || candidate.categoryName || "") ||
      normalizeText(existing.severity || "") !==
        normalizeText(candidate.severity || "")
    );
  });
}

module.exports = {
  buildDuplicateKey,
  isDuplicate,
  findConflict,
  normalizeText,
};
