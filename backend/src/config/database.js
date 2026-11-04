const fs = require("node:fs");
const path = require("node:path");
const mysql = require("mysql2/promise");
require("dotenv").config();

const bundledCaCertificate = fs.readFileSync(
  path.join(__dirname, "aiven-project-ca.pem"),
  "utf8",
);

function getTlsSetting() {
  const host = (process.env.DB_HOST || "127.0.0.1").trim().toLowerCase();
  const isLocalHost = ["localhost", "127.0.0.1", "::1", "0.0.0.0"].includes(host);

  if (isLocalHost || process.env.DB_TLS === "false") {
    return false;
  }

  const tlsConfig = {
    rejectUnauthorized: true,
  };

  const caCertificate = (process.env.DB_SSL_CA || bundledCaCertificate).trim();
  if (caCertificate) {
    tlsConfig.ca = caCertificate;
  }

  return tlsConfig;
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: getTlsSetting(),
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
