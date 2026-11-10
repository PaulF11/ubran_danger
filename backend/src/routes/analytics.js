// File note: This file handles analytics.js.

const express = require("express");
const analyticsController = require("../controllers/analyticsController");

const router = express.Router();

router.get("/summary", analyticsController.getSummary);

module.exports = router;