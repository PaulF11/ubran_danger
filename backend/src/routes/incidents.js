// File note: This file handles incidents.js.
const express = require("express");
const router = express.Router();
const incidentsController = require("../controllers/incidentsController");

router.get("/", incidentsController.getIncidents);

module.exports = router;
