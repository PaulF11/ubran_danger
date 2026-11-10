// File note: This file handles routes.js.

const express = require("express");
const routesController = require("../controllers/routesController");

const router = express.Router();

router.post("/route", routesController.getRoute);

module.exports = router;