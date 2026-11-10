// File note: This file handles auth-api.test.js.

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { createAdminRouter } = require("../src/routes/admin");
const { createAuthRouter } = require("../src/routes/auth");

const environment = {
  JWT_SECRET: "test-only-jwt-signing-secret-with-at-least-32-bytes",
  ADMIN_USERNAME: "legacy-admin",
  ADMIN_PASSWORD: "legacy-admin-password",
  ADMIN_TOKEN_SECRET: "test-only-legacy-token-secret-at-least-32-bytes",
};

async function withServer(callback, database) {
  const app = express();
  app.use(express.json());
  app.use("/api/auth", createAuthRouter({ database, environment }));
  app.use(
    "/api/admin",
    createAdminRouter({
      database,
      environment,
      dataService: {
        async getDashboard() {
          return { available: true };
        },
      },
    }),
  );
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    await callback(baseUrl);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

function userDatabase(user) {
  return {
    async execute(sql, parameters) {
      assert.match(sql, /FROM users WHERE email = \? LIMIT 1/);
      assert.deepEqual(parameters, ["admin@example.test"]);
      return [[user].filter(Boolean)];
    },
  };
}

async function postLogin(baseUrl, email, password) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return { response, payload: await response.json() };
}

test("admin email login returns a JWT accepted by protected admin endpoints", async () => {
  const password = "test-admin-password";
  const passwordHash = await bcrypt.hash(password, 4);
  const database = userDatabase({
    id: 42,
    email: "admin@example.test",
    password_hash: passwordHash,
    role: "ADMIN",
  });

  await withServer(async (baseUrl) => {
    const { response, payload } = await postLogin(
      baseUrl,
      "  ADMIN@EXAMPLE.TEST ",
      password,
    );
    assert.equal(response.status, 200);
    assert.equal(payload.success, true);
    assert.equal(payload.data.expiresInSeconds, 1800);
    assert.deepEqual(payload.data.user, {
      id: "42",
      email: "admin@example.test",
      role: "ADMIN",
    });
    assert.equal(JSON.stringify(payload).includes(passwordHash), false);

    const claims = jwt.verify(payload.data.token, environment.JWT_SECRET, {
      algorithms: ["HS256"],
    });
    assert.equal(claims.sub, "42");
    assert.equal(claims.role, "ADMIN");

    const protectedResponse = await fetch(`${baseUrl}/api/admin/dashboard`, {
      headers: { authorization: `Bearer ${payload.data.token}` },
    });
    assert.equal(protectedResponse.status, 200);
    assert.deepEqual((await protectedResponse.json()).data, {
      available: true,
    });
  }, database);
});

test("invalid credentials and valid USER accounts cannot access admin APIs", async () => {
  const password = "test-user-password";
  const passwordHash = await bcrypt.hash(password, 4);
  const database = userDatabase({
    id: 14,
    email: "admin@example.test",
    password_hash: passwordHash,
    role: "USER",
  });

  await withServer(async (baseUrl) => {
    const invalid = await postLogin(
      baseUrl,
      "admin@example.test",
      "wrong-password",
    );
    assert.equal(invalid.response.status, 401);
    assert.deepEqual(invalid.payload, {
      success: false,
      message: "Invalid email or password.",
    });

    const userLogin = await postLogin(baseUrl, "admin@example.test", password);
    assert.equal(userLogin.response.status, 403);
    assert.equal(userLogin.payload.data, undefined);

    const userToken = jwt.sign({ role: "USER" }, environment.JWT_SECRET, {
      algorithm: "HS256",
      expiresIn: 1800,
      subject: "14",
    });
    const denied = await fetch(`${baseUrl}/api/admin/dashboard`, {
      headers: { authorization: `Bearer ${userToken}` },
    });
    assert.equal(denied.status, 403);

    const invalidToken = await fetch(`${baseUrl}/api/admin/dashboard`, {
      headers: { authorization: "Bearer invalid.jwt.token" },
    });
    assert.equal(invalidToken.status, 401);
  }, database);
});

test("database failures return a generic login error without internal details", async () => {
  const database = {
    async execute() {
      throw new Error("sensitive SQL connection detail");
    },
  };

  await withServer(async (baseUrl) => {
    const { response, payload } = await postLogin(
      baseUrl,
      "admin@example.test",
      "test-password",
    );
    assert.equal(response.status, 503);
    assert.deepEqual(payload, {
      success: false,
      message: "Authentication is temporarily unavailable.",
    });
    assert.equal(JSON.stringify(payload).includes("sensitive SQL"), false);
  }, database);
});
