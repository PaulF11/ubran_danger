const express = require("express");
const pool = require("../config/database");
const { createNewsController } = require("../controllers/newsController");

function createNewsRouter({ database = pool, controller } = {}) {
  const router = express.Router();
  const news = controller || createNewsController({ database });
  router.get("/", news.getPublicArticles);
  return router;
}

module.exports = { createNewsRouter };
