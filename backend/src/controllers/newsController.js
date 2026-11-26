const pool = require("../config/database");
const {
  NewsConflictError,
  NewsValidationError,
  createNewsService,
} = require("../services/newsService");

function createNewsController({
  database = pool,
  newsService,
  logger = console,
} = {}) {
  const news =
    newsService || createNewsService({ database });
  const logFailure = (stage, error) => {
    logger.error("[news] request failed", {
      stage,
      code: error?.code ?? null,
      name: error?.name ?? null,
    });
  };

  return {
    getPublicArticles: async (_req, res) => {
      try {
        const articles = await news.getPublicArticles();
        return res.json({ success: true, data: articles });
      } catch (error) {
        logFailure("public_feed", error);
        return res.status(503).json({
          success: false,
          message: "Verified news is temporarily unavailable.",
        });
      }
    },

    listAdminArticles: async (req, res) => {
      const status =
        typeof req.query.status === "string"
          ? req.query.status.toUpperCase()
          : undefined;
      if (status && !["PENDING", "VERIFIED", "REJECTED"].includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid news review status.",
        });
      }
      try {
        const articles = await news.listAdminArticles(status);
        return res.json({ success: true, data: articles });
      } catch (error) {
        logFailure("admin_list", error);
        return res.status(503).json({
          success: false,
          message: "News review data is temporarily unavailable.",
        });
      }
    },

    createPendingArticle: async (req, res) => {
      try {
        const article = await news.createPendingArticle(req.body || {});
        return res.status(201).json({ success: true, data: article });
      } catch (error) {
        if (error instanceof NewsValidationError) {
          return res.status(error.status).json({
            success: false,
            message: error.message,
          });
        }
        if (error?.code === "ER_DUP_ENTRY") {
          return res.status(409).json({
            success: false,
            message: "This original article URL has already been submitted.",
          });
        }
        logFailure("submit", error);
        return res.status(503).json({
          success: false,
          message: "The article could not be saved.",
        });
      }
    },

    updatePendingArticle: async (req, res) => {
      if (!/^\d+$/.test(req.params.id) || Number(req.params.id) < 1) {
        return res.status(400).json({
          success: false,
          message: "News article ID must be a positive integer.",
        });
      }
      try {
        const article = await news.updatePendingArticle(
          req.params.id,
          req.body || {},
        );
        if (!article) {
          return res.status(404).json({
            success: false,
            message: "The news article was not found.",
          });
        }
        return res.json({ success: true, data: article });
      } catch (error) {
        if (error instanceof NewsValidationError) {
          return res.status(error.status).json({
            success: false,
            message: error.message,
          });
        }
        if (error instanceof NewsConflictError) {
          return res.status(error.status).json({
            success: false,
            message: error.message,
          });
        }
        if (error?.code === "ER_DUP_ENTRY") {
          return res.status(409).json({
            success: false,
            message: "This original article URL has already been submitted.",
          });
        }
        logFailure("update", error);
        return res.status(503).json({
          success: false,
          message: "The article could not be updated.",
        });
      }
    },

    reviewArticle: async (req, res) => {
      if (!/^\d+$/.test(req.params.id) || Number(req.params.id) < 1) {
        return res.status(400).json({
          success: false,
          message: "News article ID must be a positive integer.",
        });
      }
      try {
        const result = await news.reviewArticle(
          req.params.id,
          req.body || {},
          req.user?.id || req.admin?.username || "admin",
        );
        if (!result) {
          return res.status(404).json({
            success: false,
            message: "The news article was not found.",
          });
        }
        return res.json({ success: true, data: result });
      } catch (error) {
        if (error instanceof NewsValidationError) {
          return res.status(error.status).json({
            success: false,
            message: error.message,
          });
        }
        logFailure("review", error);
        return res.status(503).json({
          success: false,
          message: "The news article could not be reviewed.",
        });
      }
    },
  };
}

module.exports = { createNewsController };
