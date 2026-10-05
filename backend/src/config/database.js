const mysql = require("mysql2/promise");
require("dotenv").config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

function safeValue(value, pattern) {
  return typeof value === "string" && pattern.test(value) ? value : null;
}

Object.defineProperty(pool, "getSafeConnectionMetadata", {
  value: () => ({
    DB_HOST:
      safeValue(
        process.env.DB_HOST || "127.0.0.1",
        /^[A-Za-z0-9.-]+$|^\[[0-9A-Fa-f:]+\]$|^[0-9A-Fa-f:]+$/,
      ) || "[redacted]",
    DB_PORT: safeValue(
      process.env.DB_PORT || "3306",
      /^\d{1,5}$/,
    ),
    DB_USER:
      safeValue(process.env.DB_USER, /^[A-Za-z0-9_.-]{1,128}$/) ||
      "[redacted]",
    DB_NAME:
      safeValue(process.env.DB_NAME, /^[A-Za-z0-9_.-]{1,128}$/) ||
      "[redacted]",
  }),
});

module.exports = pool;
