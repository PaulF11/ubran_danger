const { collectTrustedSources } = require("./sourceCollectorService");
const { extractCandidate } = require("./incidentExtractionService");
const {
  isPlausibleIndividualIncident,
} = require("./incidentPreFilterService");
const { verifyCandidate } = require("./automatedVerificationService");
const { insertVerifiedCandidate } = require("./incidentPersistenceService");

async function runAutomatedIngestion({
  collector = collectTrustedSources,
  extractor = extractCandidate,
  verifier = verifyCandidate,
  persister = insertVerifiedCandidate,
} = {}) {
  const sources = await collector();
  const verifiedCandidates = [];
  const results = [];
  const summary = {
    sourcesChecked: sources.sourcesChecked ?? sources.length,
    sourcesFailed: sources.sourcesFailed ?? 0,
    articlesCollected: sources.length,
    articlesProcessed: 0,
    preFiltered: 0,
    candidatesExtracted: 0,
    candidatesRejected: 0,
    verificationFailures: 0,
    duplicates: 0,
    conflicts: 0,
    verifiedCandidates: 0,
    insertedIncidents: 0,
  };

  for (const source of sources) {
    summary.articlesProcessed += 1;
    if (!isPlausibleIndividualIncident(source)) {
      summary.preFiltered += 1;
      results.push({
        source: source.url,
        retrievedAt: source.retrievedAt,
        status: "NOT_AN_INCIDENT",
        verified: false,
        reasons: [
          "Article lacked individual-incident signals and matched a general-news pattern; skipped before extraction.",
        ],
        candidate: null,
      });
      continue;
    }

    try {
      const extracted = await extractor(source.content, {
        sourceName: source.sourceName || source.source,
        sourceUrl: source.url,
        sourcePublishedAt: source.publishedAt,
      });
      if (extracted === null) {
        results.push({
          source: source.url,
          retrievedAt: source.retrievedAt,
          status: "NOT_AN_INCIDENT",
          verified: false,
          reasons: ["Article does not describe an individual incident."],
          candidate: null,
        });
        continue;
      }

      summary.candidatesExtracted += 1;
      const verification = await verifier(extracted, verifiedCandidates);
      if (!verification.verified) {
        summary.candidatesRejected += 1;
        summary.verificationFailures += 1;
      }
      const result = {
        source: source.url,
        retrievedAt: source.retrievedAt,
        status: verification.status,
        verified: verification.verified,
        reasons: verification.reasons || [],
        candidate: extracted,
      };

      if (verification.verified) {
        verifiedCandidates.push(extracted);
        summary.verifiedCandidates += 1;
        const persistence = await persister(verification.normalized || extracted);
        result.persistence = persistence.status;
        if (persistence.status === "INSERTED") summary.insertedIncidents += 1;
        if (persistence.status === "DUPLICATE") summary.duplicates += 1;
        if (persistence.status === "CONFLICT") summary.conflicts += 1;
      }

      results.push(result);
    } catch (error) {
      summary.candidatesRejected += 1;
      summary.verificationFailures += 1;
      results.push({
        source: source.url,
        retrievedAt: source.retrievedAt,
        status: "PENDING_REVIEW",
        verified: false,
        reasons: [error.message || "Extraction could not be completed."],
      });
    }
  }

  return {
    ...summary,
    results,
  };
}

module.exports = {
  runAutomatedIngestion,
};
