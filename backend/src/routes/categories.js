// File note: This file handles categories.js.
const express = require("express");
const router = express.Router();
const categoriesController = require("../controllers/categoriesController");

router.get("/", categoriesController.getCategories);

module.exports = router;
