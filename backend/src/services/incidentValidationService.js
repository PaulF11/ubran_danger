// File note: This file handles incidentValidationService.js.

const { TAGUIG_BARANGAYS } = require("../constants/taguigBarangays");
const { isWithinTaguigMapArea } = require("../constants/taguigMapBounds");

const TAGUIG_SET = new Set(
  TAGUIG_BARANGAYS.map((barangay) => barangay.toLowerCase()),
);
const ALLOWED_CITY_NAMES = new Set(["taguig city", "pateros"]);
const CATEGORY_SET = new Set([
  "theft",
  "robbery",
  "assault",
  "shooting",
  "drug-related",
  "police-related",
  "road accident",
  "fire",
  "law enforcement",
  "vandalism",
  "other",
]);
const DEFAULT_TRUSTED_HOSTS = ["gmanetwork.com", "news.tv5.com.ph"];
const APPROVED_TRUSTED_HOSTS = [
  "gmanetwork.com",
  "news.tv5.com.ph",
  "news.google.com",
  "pna.gov.ph",
  "philstar.com",
  "manilatimes.net",
  "mb.com.ph",
  "cnnphilippines.com",
];
const GEOCODING_HOSTS = ["openstreetmap.org", "osm.org"];

function normalizeText(value) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

function trustedHosts() {
  const configured = (process.env.TRUSTED_SOURCE_HOSTS || "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean)
    .filter((host) =>
      APPROVED_TRUSTED_HOSTS.includes(host) ||
      APPROVED_TRUSTED_HOSTS.some((allowed) => host.endsWith(`.${allowed}`)),
    );
  return new Set([...DEFAULT_TRUSTED_HOSTS, ...configured]);
}

function isHostAllowed(hostname, allowedHosts) {
  const normalized = hostname.toLowerCase();
  return [...allowedHosts].some(
    (host) => normalized === host || normalized.endsWith(`.${host}`),
  );
}

function deriveSeverity(facts = {}) {
  if (
    Number(facts.deaths || 0) > 0 ||
    facts.firearmUsed === true ||
    facts.seriousInjury === true
  ) {
    return "HIGH";
  }
  if (
    facts.weaponUsed === true ||
    facts.physicalInjury === true ||
    facts.explicitThreat === true
  ) {
    return "MEDIUM";
  }
  return "LOW";
}

function dateOnly(value) {
  const match = /^(\d{4}-\d{2}-\d{2})(?:$|T)/.exec(String(value));
  return match ? match[1] : null;
}

function validateCandidate(candidate = {}) {
  const errors = [];
  const category = normalizeText(candidate.category || candidate.categoryName);
  const barangay = normalizeText(candidate.barangay);
  const city = normalizeText(candidate.city);
  const severity = normalizeText(candidate.severity).toUpperCase();
  const description = normalizeText(
    candidate.description || candidate.summary || "",
  );
  const incidentDate = candidate.incidentDate || candidate.incident_date;
  const sourceName = normalizeText(
    candidate.sourceName || candidate.source_name || candidate.source || "",
  );
  const sourceUrl = normalizeText(candidate.sourceUrl || candidate.source_url);
  const sourceEvidence = candidate.sourceEvidence || candidate.source_evidence;
  const evidenceCity = normalizeText(sourceEvidence?.city);
  const evidenceDate = normalizeText(sourceEvidence?.incidentDate);
  const evidenceLocation = normalizeText(sourceEvidence?.location);
  const locationDescription = normalizeText(candidate.locationDescription);
  const hasLatitude =
    candidate.latitude !== null && candidate.latitude !== undefined;
  const hasLongitude =
    candidate.longitude !== null && candidate.longitude !== undefined;
  const latitude = hasLatitude ? Number(candidate.latitude) : null;
  const longitude = hasLongitude ? Number(candidate.longitude) : null;

  if (!CATEGORY_SET.has(category.toLowerCase())) {
    errors.push("Category must match an existing incident category.");
  }
  if (!ALLOWED_CITY_NAMES.has(city.toLowerCase())) {
    errors.push("City must be explicitly identified as Taguig City or Pateros.");
  }
  if (city.toLowerCase() === "taguig city" && barangay && !TAGUIG_SET.has(barangay.toLowerCase())) {
    errors.push("Barangay must be within Taguig City.");
  }
  if (!barangay && !locationDescription) {
    errors.push("A source-reported location description is required.");
  }
  if (hasLatitude !== hasLongitude) {
    errors.push(
      "Latitude and longitude must either both be present or both be NULL.",
    );
  } else if (hasLatitude) {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      errors.push("Latitude and longitude must be valid numbers.");
    } else if (!isWithinTaguigMapArea(latitude, longitude)) {
      errors.push("Coordinates are outside the configured Taguig bounds.");
    }
  }
  if (!description || description.length < 20) {
    errors.push("Description is too short or missing.");
  }
  if (!incidentDate || Number.isNaN(Date.parse(incidentDate))) {
    errors.push("Incident date is invalid.");
  }
  if (!sourceName) {
    errors.push("Source name is required.");
  }

  if (!sourceUrl || !/^https:\/\//i.test(sourceUrl)) {
    errors.push("Source URL must use HTTPS.");
  } else {
    try {
      const url = new URL(sourceUrl);
      if (!isHostAllowed(url.hostname, trustedHosts())) {
        errors.push("Source hostname is not on the trusted allowlist.");
      }
    } catch {
      errors.push("Source URL is malformed.");
    }
  }

  if (
    candidate.sourcePublishedAt &&
    Number.isNaN(Date.parse(candidate.sourcePublishedAt))
  ) {
    errors.push("Source publication date is invalid.");
  }
  if (
    !sourceEvidence ||
    sourceEvidence.sourceReviewed !== true ||
    !evidenceCity ||
    !evidenceDate ||
    !evidenceLocation ||
    !normalizeText(sourceEvidence.eventFacts)
  ) {
    errors.push(
      "Reviewed source evidence for city, date, location, and event facts is required.",
    );
  } else {
    const normalizedEvidenceCity = evidenceCity.toLowerCase();
    const supportedEvidenceCity =
      normalizedEvidenceCity.includes("taguig") ||
      normalizedEvidenceCity.includes("pateros");
    if (!supportedEvidenceCity) {
      errors.push(
        "Source evidence does not identify a supported municipality (Taguig City or Pateros).",
      );
    }
    if (dateOnly(evidenceDate) !== dateOnly(incidentDate)) {
      errors.push(
        "Source evidence incident date conflicts with the candidate date.",
      );
    }
    if (
      barangay &&
      !evidenceLocation.toLowerCase().includes(barangay.toLowerCase())
    ) {
      errors.push(
        "Source evidence location does not support the candidate barangay.",
      );
    }
  }

  let locationSourceName = normalizeText(candidate.locationSourceName);
  let locationSourceUrl = normalizeText(candidate.locationSourceUrl);
  if (hasLatitude && hasLongitude) {
    if (!locationSourceName || !locationSourceUrl) {
      errors.push(
        "Mapped coordinates require a named geographic source and exact feature URL.",
      );
    } else {
      try {
        const url = new URL(locationSourceUrl);
        if (
          url.protocol !== "https:" ||
          !isHostAllowed(url.hostname, GEOCODING_HOSTS)
        ) {
          errors.push(
            "Coordinate source must be an approved OpenStreetMap feature URL.",
          );
        }
      } catch {
        errors.push("Coordinate source URL is malformed.");
      }
    }
  } else {
    locationSourceName = "";
    locationSourceUrl = "";
  }

  const assignedSeverity = deriveSeverity(candidate.severityFacts);
  if (!["LOW", "MEDIUM", "HIGH"].includes(severity)) {
    errors.push("Severity must be LOW, MEDIUM, or HIGH.");
  } else if (severity !== assignedSeverity) {
    errors.push(
      `Severity must match the system-assigned rule (${assignedSeverity}).`,
    );
  }

  const normalized = {
    category,
    city,
    barangay,
    severity,
    description,
    incidentDate,
    incidentTimeKnown: candidate.incidentTimeKnown === true,
    latitude,
    longitude,
    locationDescription,
    locationSourceName,
    locationSourceUrl,
    sourceName,
    sourceUrl,
    sourcePublishedAt: candidate.sourcePublishedAt || null,
    sourceEvidence,
    severityFacts: candidate.severityFacts || {},
  };

  const isValid = errors.length === 0;
  const rejectionPattern =
    /Category|City|Barangay|Coordinates|Source name|Source URL|Source evidence|trusted allowlist|Coordinate source/i;

  return {
    isValid,
    errors,
    normalized,
    status: isValid
      ? "VERIFIED"
      : errors.some((error) => rejectionPattern.test(error))
        ? "REJECTED"
        : "PENDING_REVIEW",
  };
}

module.exports = {
  validateCandidate,
  normalizeText,
  deriveSeverity,
  DEFAULT_TRUSTED_HOSTS,
};
