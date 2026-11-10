// File note: This file handles healthController.js.

const pool = require("../config/database");

exports.getHealth = (req, res) => {
  return res.json({ success: true, message: "Urban Danger API is running" });
};

exports.getDbHealth = async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.query("SELECT 1");
    return res.json({ success: true, message: "Database connection OK" });
  } catch (error) {
    console.error("[health-db] connection failed", {
      ...pool.getSafeConnectionMetadata(),
      error: {
        code: error?.code ?? null,
        errno: error?.errno ?? null,
        sqlState: error?.sqlState ?? null,
      },
    });
    return res.status(500).json({
      success: false,
      message: "Database is unavailable.",
    });
  } finally {
    connection?.release();
  }
};
