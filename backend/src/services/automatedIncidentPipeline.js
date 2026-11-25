// File note: This file handles automatedIncidentPipeline.js.

const { collectTrustedSources } = require("./sourceCollectorService");
const { extractCandidate } = require("./incidentExtractionService");
const { isPlausibleIndividualIncident } = require("./incidentPreFilterService");
const { verifyCandidate } = require("./automatedVerificationService");
const { insertVerifiedCandidate } = require("./incidentPersistenceService");
const processedSourceRepository = require("./processedSourceRepository");
const { isIncidentExpired } = require("./incidentExpirationPolicy");
const { isRetryableError, isRateLimitError } = require("./ingestionError");

async function runAutomatedIngestion({
  collector = collectTrustedSources,
  extractor = extractCandidate,
  verifier = verifyCandidate,
  persister = insertVerifiedCandidate,
  processedSources = processedSourceRepository,
  scanResultStore = null,
  runId = null,
  now = () => new Date(),
} = {}) {
  const sources = await collector();
  const processedUrls = await processedSources.findProcessed(
    sources.map((source) => source.url),
  );
  const verifiedCandidates = [];
  const results = [];
  let rateLimitedForRun = false;
  const summary = {
    sourcesChecked: sources.sourcesChecked ?? sources.length,
    sourcesFailed: sources.sourcesFailed ?? 0,
    articlesCollected: sources.length,
    articlesScanned: sources.length,
    articlesSkipped: 0,
    geminiRequests: 0,
    rateLimitCount: 0,
    extractionFailures: 0,
    persistenceFailures: 0,
    articlesProcessed: 0,
    preFiltered: 0,
    candidatesExtracted: 0,
    candidatesRejected: 0,
    verificationFailures: 0,
    expiredCandidates: 0,
    duplicates: 0,
    conflicts: 0,
    verifiedCandidates: 0,
    insertedIncidents: 0,
  };

  for (const source of sources) {
    summary.articlesProcessed += 1;
    if (processedUrls.has(source.url)) {
      summary.articlesSkipped += 1;
      results.push({
        source: source.url,
        retrievedAt: source.retrievedAt,
        status: "SKIPPED_PROCESSED",
        verified: false,
        reasons: ["Source was processed during an earlier ingestion run."],
      });
      continue;
    }
    if (!isPlausibleIndividualIncident(source)) {
      summary.preFiltered += 1;
      summary.articlesSkipped += 1;
      await processedSources.recordProcessed(source.url, "PROCESSED");
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

    if (rateLimitedForRun) {
      summary.articlesSkipped += 1;
      await processedSources.recordProcessed(source.url, "RETRY");
      results.push({
        source: source.url,
        retrievedAt: source.retrievedAt,
        status: "RATE_LIMITED",
        verified: false,
        retryable: true,
        reasons: ["Extraction paused after the provider rate limit; retry in a later run."],
      });
      continue;
    }

    let stage = "extraction";
    try {
      summary.geminiRequests += 1;
      const extracted = await extractor(source.content, {
        sourceName: source.sourceName || source.source,
        sourceUrl: source.url,
        sourcePublishedAt: source.publishedAt,
      });
      if (extracted === null) {
        await processedSources.recordProcessed(source.url, "PROCESSED");
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
      const incidentDate =
        extracted.incidentDate ?? extracted.incident_date ?? null;
      if (isIncidentExpired(incidentDate, now())) {
        summary.expiredCandidates += 1;
        summary.articlesSkipped += 1;
        await processedSources.recordProcessed(source.url, "PROCESSED");
        results.push({
          source: source.url,
          retrievedAt: source.retrievedAt,
          status: "EXPIRED",
          verified: false,
          reasons: [
            "The incident occurrence date is outside the 12-month validity period.",
          ],
          candidate: null,
        });
        continue;
      }

      stage = "verification";
      const verification = await verifier(extracted, verifiedCandidates);
      if (verification.status === "RATE_LIMITED") {
        summary.rateLimitCount += 1;
        rateLimitedForRun = true;
      } else if (
        !verification.verified &&
        verification.status === "REJECTED"
      ) {
        summary.candidatesRejected += 1;
      } else if (
        !verification.verified &&
        verification.status !== "RATE_LIMITED"
      ) {
        summary.verificationFailures += 1;
      }
      const result = {
        source: source.url,
        retrievedAt: source.retrievedAt,
        status: verification.status,
        verificationStatus: verification.status,
        verified: verification.verified,
        retryable:
          verification.retryable === true ||
          verification.status === "RATE_LIMITED",
        reasons: verification.reasons || [],
        candidate: extracted,
      };

      if (verification.verified) {
        verifiedCandidates.push(extracted);
        summary.verifiedCandidates += 1;
        stage = "persistence";
        const persistence = await persister(
          verification.normalized || extracted,
        );
        result.persistence = persistence.status;
        if (persistence.status === "INSERTED") {
          summary.insertedIncidents += 1;
          result.status = "VERIFIED";
          result.verificationStatus = "VERIFIED";
        }
        if (persistence.status === "DUPLICATE") {
          summary.duplicates += 1;
          result.status = "DUPLICATE";
        }
        if (persistence.status === "CONFLICT") {
          summary.conflicts += 1;
          result.status = "CONFLICT";
        }
        if (!["INSERTED", "DUPLICATE", "CONFLICT"].includes(persistence.status)) {
          result.status = persistence.status;
        }
      }

      await processedSources.recordProcessed(
        source.url,
        verification.retryable === true ||
          verification.status === "RATE_LIMITED"
          ? "RETRY"
          : "PROCESSED",
      );
      results.push(result);
    } catch (error) {
      const rateLimited = isRateLimitError(error);
      if (rateLimited) {
        summary.rateLimitCount += 1;
        rateLimitedForRun = true;
      }
      const retry = rateLimited || isRetryableError(error);
      if (!rateLimited && stage === "extraction")
        summary.extractionFailures += 1;
      if (!rateLimited && stage === "persistence")
        summary.persistenceFailures += 1;
      await processedSources.recordProcessed(
        source.url,
        retry ? "RETRY" : "PROCESSED",
      );
      results.push({
        source: source.url,
        retrievedAt: source.retrievedAt,
        status: rateLimited
          ? "RATE_LIMITED"
          : stage === "extraction"
            ? "EXTRACTION_FAILED"
            : stage === "verification"
              ? "VERIFICATION_FAILED"
              : "PERSISTENCE_FAILED",
        verified: false,
        retryable: retry,
        reasons: [error.message || "Extraction could not be completed."],
      });
    }
  }

  const reportResults = results.map((result, index) => {
    const source = sources[index];
    return {
      ...result,
      title: source?.title || null,
      sourceName: source?.sourceName || source?.source || null,
      sourceUrl: source?.url || result.source,
      sourcePublishedAt: source?.publishedAt || null,
    };
  });

  if (scanResultStore && runId !== null && runId !== undefined) {
    await scanResultStore.saveRunResults(runId, reportResults);
  }

  return {
    ...summary,
    processingFailures:
      summary.extractionFailures +
      summary.persistenceFailures +
      summary.verificationFailures +
      summary.rateLimitCount,
    results: reportResults,
  };
}

module.exports = {
  runAutomatedIngestion,
};
