// File note: This file handles automatedVerificationService.js.
const { validateCandidate } = require("./incidentValidationService");
const { findConflict, isDuplicate } = require("./incidentDeduplicationService");

async function checkSourceUrl(sourceUrl, sourceReviewed) {
  try {
    const response = await fetch(sourceUrl, {
      method: "HEAD",
      redirect: "manual",
      headers: { "user-agent": "UrbanDangerSourceVerifier/1.0" },
      signal: AbortSignal.timeout(8000),
    });

    if (response.status === 405 || response.status === 501) {
      const getResponse = await fetch(sourceUrl, {
        method: "GET",
        redirect: "manual",
        headers: {
          "user-agent": "UrbanDangerSourceVerifier/1.0",
          range: "bytes=0-0",
        },
        signal: AbortSignal.timeout(8000),
      });
      return sourceResponseResult(getResponse.status, sourceReviewed);
    }

    return sourceResponseResult(response.status, sourceReviewed);
  } catch (error) {
    return {
      exists: false,
      pending: true,
      reason: `Source URL could not be checked: ${error.message || "network error"}`,
    };
  }
}

function sourceResponseResult(status, sourceReviewed) {
  if (status >= 200 && status < 400) return { exists: true };
  if (status === 403 && sourceReviewed) {
    return {
      exists: true,
      reason:
        "Publisher blocks automated access; the article was manually reviewed.",
    };
  }
  if (status === 404 || status === 410) {
    return {
      exists: false,
      pending: false,
      reason: `Source URL returned HTTP ${status}.`,
    };
  }
  return {
    exists: false,
    pending: true,
    reason: `Source URL returned HTTP ${status}; manual review is required.`,
  };
}

async function verifyCandidate(
  candidate,
  existingCandidates = [],
  { sourceUrlCheck = checkSourceUrl } = {},
) {
  const validation = validateCandidate(candidate);

  if (!validation.isValid) {
    return {
      status: validation.status,
      verified: false,
      reasons: validation.errors,
    };
  }

  const sourceCheck = await sourceUrlCheck(
    validation.normalized.sourceUrl,
    validation.normalized.sourceEvidence.sourceReviewed,
  );
  if (!sourceCheck.exists) {
    return {
      status: sourceCheck.pending ? "PENDING_REVIEW" : "REJECTED",
      verified: false,
      reasons: [sourceCheck.reason],
    };
  }

  if (findConflict(candidate, existingCandidates)) {
    return {
      status: "PENDING_REVIEW",
      verified: false,
      reasons: [
        "Conflicting category or severity exists for the same incident date and location.",
      ],
    };
  }

  if (isDuplicate(candidate, existingCandidates)) {
    return {
      status: "REJECTED",
      verified: false,
      reasons: [
        "Duplicate incident detected by deterministic deduplication checks.",
      ],
    };
  }

  return {
    status: "VERIFIED",
    verified: true,
    reasons: sourceCheck.reason ? [sourceCheck.reason] : [],
    normalized: validation.normalized,
  };
}

module.exports = {
  verifyCandidate,
  checkSourceUrl,
};
