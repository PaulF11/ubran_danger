require("dotenv").config();
const express = require("express");
const cors = require("cors");
const healthRouter = require("./routes/health");
const categoriesRouter = require("./routes/categories");
const incidentsRouter = require("./routes/incidents");
const analyticsRouter = require("./routes/analytics");
const routesRouter = require("./routes/routes");
const systemRouter = require("./routes/system");
const { createAuthRouter } = require("./routes/auth");
const { createAdminRouter } = require("./routes/admin");
const errorHandler = require("./middleware/errorHandler");

const app = express();

const allowedOrigins = [
  ...(process.env.CORS_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  process.env.FRONTEND_ORIGIN?.trim(),
  process.env.ADMIN_FRONTEND_ORIGIN?.trim(),
].filter(Boolean);

if (process.env.NODE_ENV === "production" && allowedOrigins.length === 0) {
  throw new Error(
    "CORS_ORIGINS or FRONTEND_ORIGIN must be configured in production.",
  );
}

app.use(
  cors({
    origin(origin, callback) {
      let isDevelopmentLocalhost = false;
      if (process.env.NODE_ENV !== "production" && origin) {
        try {
          const parsedOrigin = new URL(origin);
          isDevelopmentLocalhost =
            parsedOrigin.protocol === "http:" &&
            ["localhost", "127.0.0.1"].includes(parsedOrigin.hostname);
        } catch {}
      }

      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        isDevelopmentLocalhost
      ) {
        return callback(null, true);
      }
      if (
        process.env.NODE_ENV !== "production" &&
        allowedOrigins.length === 0
      ) {
        return callback(null, true);
      }
      return callback(null, false);
    },
  }),
);
app.use(express.json({ limit: "256kb" }));

app.use("/api/health", healthRouter);
app.use("/api/categories", categoriesRouter);
app.use("/api/incidents", incidentsRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/routes", routesRouter);
app.use("/api/system", systemRouter);
app.use("/api/auth", createAuthRouter());
app.use("/api/admin", createAdminRouter());

app.use((req, res) => {
  res.status(404).json({ success: false, message: "Not Found" });
});

app.use(errorHandler);

module.exports = app;
