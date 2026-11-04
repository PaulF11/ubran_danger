const { createHash, createHmac, timingSafeEqual } = require("node:crypto");
const jwt = require("jsonwebtoken");

const TOKEN_LIFETIME_SECONDS = 30 * 60;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;
const loginAttempts = new Map();

function fixedDigest(value) {
  return createHash("sha256").update(String(value)).digest();
}

function equalSecret(provided, expected) {
  return timingSafeEqual(fixedDigest(provided), fixedDigest(expected));
}

function signingKey(environment) {
  const secret = environment.ADMIN_TOKEN_SECRET;
  return typeof secret === "string" && Buffer.byteLength(secret) >= 32
    ? secret
    : null;
}

function jwtSigningKey(environment) {
  const secret = environment.JWT_SECRET;
  return typeof secret === "string" && Buffer.byteLength(secret) >= 32
    ? secret
    : null;
}

function sign(payload, secret) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function isRateLimited(address, now) {
  const attempt = loginAttempts.get(address);
  if (!attempt || now - attempt.startedAt >= LOGIN_WINDOW_MS) {
    loginAttempts.delete(address);
    return false;
  }
  return attempt.count >= MAX_LOGIN_ATTEMPTS;
}

function recordFailedAttempt(address, now) {
  if (loginAttempts.size > 5000) loginAttempts.clear();
  const attempt = loginAttempts.get(address);
  if (!attempt || now - attempt.startedAt >= LOGIN_WINDOW_MS) {
    loginAttempts.set(address, { startedAt: now, count: 1 });
  } else {
    attempt.count += 1;
  }
}

function createAdminAuth({ environment = process.env, now = Date.now } = {}) {
  function login(req, res) {
    const address = String(req.ip || req.socket?.remoteAddress || "unknown");
    const currentTime = now();
    const secret = signingKey(environment);
    if (!secret || !environment.ADMIN_USERNAME || !environment.ADMIN_PASSWORD) {
      return res.status(503).json({
        success: false,
        message: "Admin authentication is not configured.",
      });
    }
    if (isRateLimited(address, currentTime)) {
      return res.status(429).json({
        success: false,
        message: "Too many login attempts. Try again later.",
      });
    }

    const { username, password } = req.body || {};
    const validUsername =
      typeof username === "string" &&
      equalSecret(username, environment.ADMIN_USERNAME);
    const validPassword =
      typeof password === "string" &&
      equalSecret(password, environment.ADMIN_PASSWORD);
    if (!validUsername || !validPassword) {
      recordFailedAttempt(address, currentTime);
      return res.status(401).json({
        success: false,
        message: "Invalid admin credentials.",
      });
    }

    loginAttempts.delete(address);
    const expiresAt = Math.floor(currentTime / 1000) + TOKEN_LIFETIME_SECONDS;
    const payload = Buffer.from(
      JSON.stringify({ sub: environment.ADMIN_USERNAME, exp: expiresAt }),
    ).toString("base64url");
    const token = `${payload}.${sign(payload, secret)}`;
    return res.json({
      success: true,
      data: { token, expiresInSeconds: TOKEN_LIFETIME_SECONDS },
    });
  }

  function authenticate(req, res, next) {
    const authorization = req.get("authorization") || "";
    const [scheme, token, extra] = authorization.split(" ");
    if (scheme !== "Bearer" || !token || extra) {
      return res.status(401).json({
        success: false,
        message: "Admin authentication is required.",
      });
    }

    if (token.split(".").length === 3) {
      const secret = jwtSigningKey(environment);
      if (!secret) {
        return res.status(503).json({
          success: false,
          message: "Admin JWT authentication is not configured.",
        });
      }
      try {
        const claims = jwt.verify(token, secret, { algorithms: ["HS256"] });
        if (
          typeof claims.sub !== "string" ||
          !claims.sub ||
          !["ADMIN", "USER"].includes(claims.role)
        ) {
          throw new Error("invalid_admin_token");
        }
        if (claims.role !== "ADMIN") {
          return res.status(403).json({
            success: false,
            message: "Administrator access is required.",
          });
        }
        req.user = { id: claims.sub, role: claims.role };
        req.admin = req.user;
        return next();
      } catch {
        return res.status(401).json({
          success: false,
          message: "Admin authentication is required.",
        });
      }
    }

    const secret = signingKey(environment);
    if (!secret) {
      return res.status(503).json({
        success: false,
        message: "Admin authentication is not configured.",
      });
    }

    const separator = token.lastIndexOf(".");
    if (separator < 1) {
      return res.status(401).json({
        success: false,
        message: "Admin authentication is required.",
      });
    }
    const payload = token.slice(0, separator);
    const providedSignature = Buffer.from(token.slice(separator + 1));
    const expectedSignature = Buffer.from(sign(payload, secret));
    if (
      providedSignature.length !== expectedSignature.length ||
      !timingSafeEqual(providedSignature, expectedSignature)
    ) {
      return res.status(401).json({
        success: false,
        message: "Admin authentication is required.",
      });
    }

    try {
      const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
      if (
        claims.sub !== environment.ADMIN_USERNAME ||
        !Number.isInteger(claims.exp) ||
        claims.exp <= Math.floor(now() / 1000)
      ) {
        throw new Error("invalid_admin_token");
      }
      req.admin = { username: claims.sub };
      req.user = { username: claims.sub, role: "ADMIN" };
      return next();
    } catch {
      return res.status(401).json({
        success: false,
        message: "Admin authentication is required.",
      });
    }
  }

  return { authenticate, login };
}

module.exports = {
  MAX_LOGIN_ATTEMPTS,
  TOKEN_LIFETIME_SECONDS,
  createAdminAuth,
};
