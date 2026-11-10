// File note: This file handles auth.js.

const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../config/database");

const TOKEN_LIFETIME_SECONDS = 30 * 60;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;

function createAuthRouter({
  database = pool,
  environment = process.env,
  now = Date.now,
} = {}) {
  const router = express.Router();
  const loginAttempts = new Map();

  function isRateLimited(address, currentTime) {
    const attempt = loginAttempts.get(address);
    if (!attempt || currentTime - attempt.startedAt >= LOGIN_WINDOW_MS) {
      loginAttempts.delete(address);
      return false;
    }
    return attempt.count >= MAX_LOGIN_ATTEMPTS;
  }

  function recordFailedAttempt(address, currentTime) {
    if (loginAttempts.size > 5000) loginAttempts.clear();
    const attempt = loginAttempts.get(address);
    if (!attempt || currentTime - attempt.startedAt >= LOGIN_WINDOW_MS) {
      loginAttempts.set(address, { startedAt: currentTime, count: 1 });
    } else {
      attempt.count += 1;
    }
  }

  router.post("/login", async (req, res) => {
    const secret = environment.JWT_SECRET;
    if (typeof secret !== "string" || Buffer.byteLength(secret) < 32) {
      return res.status(503).json({
        success: false,
        message: "Admin JWT authentication is not configured.",
      });
    }

    const address = String(req.ip || req.socket?.remoteAddress || "unknown");
    const currentTime = now();
    if (isRateLimited(address, currentTime)) {
      return res.status(429).json({
        success: false,
        message: "Too many login attempts. Try again later.",
      });
    }

    const { email, password } = req.body || {};
    if (
      typeof email !== "string" ||
      !email.trim() ||
      typeof password !== "string" ||
      !password
    ) {
      recordFailedAttempt(address, currentTime);
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    try {
      const [users] = await database.execute(
        "SELECT id, email, password_hash, role FROM users WHERE email = ? LIMIT 1",
        [email.trim().toLowerCase()],
      );
      const user = users[0];
      const passwordMatches =
        user &&
        typeof user.password_hash === "string" &&
        (await bcrypt.compare(password, user.password_hash));
      if (!passwordMatches) {
        recordFailedAttempt(address, currentTime);
        return res.status(401).json({
          success: false,
          message: "Invalid email or password.",
        });
      }

      loginAttempts.delete(address);
      if (user.role !== "ADMIN") {
        return res.status(403).json({
          success: false,
          message: "Administrator access is required.",
        });
      }

      const userId = String(user.id);
      const token = jwt.sign({ role: user.role }, secret, {
        algorithm: "HS256",
        expiresIn: TOKEN_LIFETIME_SECONDS,
        subject: userId,
      });
      return res.json({
        success: true,
        data: {
          token,
          expiresInSeconds: TOKEN_LIFETIME_SECONDS,
          user: { id: userId, email: user.email, role: user.role },
        },
      });
    } catch {
      return res.status(503).json({
        success: false,
        message: "Authentication is temporarily unavailable.",
      });
    }
  });

  return router;
}

module.exports = { createAuthRouter, TOKEN_LIFETIME_SECONDS };
