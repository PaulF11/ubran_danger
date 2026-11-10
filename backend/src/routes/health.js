// File note: This file handles health.js.

const express = require("express");
const router = express.Router();
const healthController = require("../controllers/healthController");

router.get("/", healthController.getHealth);
router.get("/db", healthController.getDbHealth);

module.exports = router;
