// File note: This file handles automatedIncidentPipeline.js.

const { collectTrustedSources } = require("./sourceCollectorService");
const { extractCandidate } = require("./incidentExtractionService");
const { isPlausibleIndividualIncident } = require("./incidentPreFilterService");
const { verifyCandidate } = require("./automatedVerificationService");
const { insertVerifiedCandidate } = require("./incidentPersistenceService");
const processedSourceRepository = require("./processedSourceRepository");

async function runAutomatedIngestion({
  collector = collectTrustedSources,
  extractor = extractCandidate,
  verifier = verifyCandidate,
  persister = insertVerifiedCandidate,
  processedSources = processedSourceRepository,
  persistVerifiedCandidates = true,
  reviewStore = null,
  runId = null,
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
        status: "PENDING_REVIEW",
        verified: false,
        reasons: ["Extraction paused after the provider rate limit."],
      });
      continue;
    }

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
        if (persistVerifiedCandidates) {
          const persistence = await persister(
            verification.normalized || extracted,
          );
          result.persistence = persistence.status;
          if (persistence.status === "INSERTED")
            summary.insertedIncidents += 1;
          if (persistence.status === "DUPLICATE") summary.duplicates += 1;
          if (persistence.status === "CONFLICT") summary.conflicts += 1;
        } else {
          result.persistence = "PENDING_REVIEW";
        }
      }

      await processedSources.recordProcessed(source.url, "PROCESSED");
      results.push(result);
    } catch (error) {
      const rateLimited = /429|rate-limit/i.test(error.message || "");
      if (rateLimited) {
        summary.rateLimitCount += 1;
        rateLimitedForRun = true;
      }
      const retryableHttpFailure = /\bHTTP\s+(?:408|5\d{2})\b/i.test(
        error.message || "",
      );
      const retry =
        rateLimited ||
        retryableHttpFailure ||
        /timeout|timed out|abort|database|mysql|connection/i.test(
          error.message || "",
        );
      await processedSources.recordProcessed(
        source.url,
        retry ? "RETRY" : "PROCESSED",
      );
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

  if (reviewStore && runId !== null && runId !== undefined) {
    await reviewStore.saveRunCandidates(runId, reportResults);
  }

  return {
    ...summary,
    results: reportResults,
  };
}

module.exports = {
  runAutomatedIngestion,
};
