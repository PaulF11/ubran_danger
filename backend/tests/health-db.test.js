// File note: This file handles health-db.test.js.
const test = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../src/config/database");
const healthController = require("../src/controllers/healthController");

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("database health failure logs only safe metadata and preserves its public response", async () => {
  const originalGetConnection = pool.getConnection;
  const originalConsoleError = console.error;
  const originalEnvironment = {
    DB_HOST: process.env.DB_HOST,
    DB_PORT: process.env.DB_PORT,
    DB_USER: process.env.DB_USER,
    DB_NAME: process.env.DB_NAME,
    DB_PASSWORD: process.env.DB_PASSWORD,
  };
  const logged = [];

  Object.assign(process.env, {
    DB_HOST: "mysql.example.test",
    DB_PORT: "25060",
    DB_USER: "diagnostic-user",
    DB_NAME: "urban_danger",
    DB_PASSWORD: "must-not-be-logged",
  });
  pool.getConnection = async () => {
    const error = new Error("private error text");
    error.code = "ECONNREFUSED";
    error.errno = 111;
    error.sqlState = "08001";
    error.sql = "SELECT secret_value";
    throw error;
  };
  console.error = (...values) => logged.push(values);

  try {
    const response = createResponse();
    await healthController.getDbHealth({}, response);

    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.body, {
      success: false,
      message: "Database is unavailable.",
    });
    assert.equal(logged.length, 1);
    assert.equal(logged[0][0], "[health-db] connection failed");
    assert.deepEqual(logged[0][1], {
      DB_HOST: "mysql.example.test",
      DB_PORT: "25060",
      DB_USER: "diagnostic-user",
      DB_NAME: "urban_danger",
      error: {
        code: "ECONNREFUSED",
        errno: 111,
        sqlState: "08001",
      },
    });
    assert.equal(JSON.stringify(logged).includes("must-not-be-logged"), false);
    assert.equal(JSON.stringify(logged).includes("private error text"), false);
    assert.equal(JSON.stringify(logged).includes("SELECT secret_value"), false);
  } finally {
    pool.getConnection = originalGetConnection;
    console.error = originalConsoleError;
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
