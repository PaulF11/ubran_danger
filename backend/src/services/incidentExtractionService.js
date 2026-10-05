const developmentLabeledProvider = require("./extractionProviders/developmentLabeledProvider");
const geminiProvider = require("./extractionProviders/geminiProvider");

exports.extractCandidate = async (sourceText, metadata = {}) => {
  if (typeof sourceText !== "string" || sourceText.trim().length === 0) {
    throw new Error("Source content is required to build a candidate.");
  }

  if (process.env.DEVELOPMENT_NLP_STUB === "true") {
    return {
      ...developmentLabeledProvider.extract(sourceText),
      sourceName: metadata.sourceName,
      sourceUrl: metadata.sourceUrl,
      sourcePublishedAt: metadata.sourcePublishedAt || null,
    };
  }

  const candidate = await geminiProvider.extract(sourceText);
  if (candidate === null) return null;
  return {
    ...candidate,
    sourceName: metadata.sourceName,
    sourceUrl: metadata.sourceUrl,
    sourcePublishedAt: metadata.sourcePublishedAt || null,
  };
};
