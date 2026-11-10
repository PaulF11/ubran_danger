// File note: This file handles categoriesController.js.

const pool = require("../config/database");

exports.getCategories = async (req, res, next) => {
  try {
    const [categories] = await pool.query(
      "SELECT id, name, description FROM incident_categories ORDER BY id ASC",
    );
    return res.json(categories);
  } catch (error) {
    return next(error);
  }
};
