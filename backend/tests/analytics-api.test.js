const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createAnalyticsController,
} = require("../src/controllers/analyticsController");

test("public analytics query only verified Taguig and Pateros records", async () => {
  const queries = [];
  const controller = createAnalyticsController({
    database: {
      async execute(sql) {
        queries.push(sql);
        if (sql.includes("COUNT(*) AS total")) return [[{ total: 2 }]];
        return [[{ label: "Pateros", count: 1 }]];
      },
    },
  });
  const response = {
    body: null,
    json(payload) {
      this.body = payload;
      return this;
    },
  };

  await controller.getSummary({}, response, (error) => {
    throw error;
  });

  assert.equal(response.body.data.total, 2);
  assert.equal(queries.length, 6);
  for (const sql of queries) {
    assert.match(sql, /incidents\.city IN \('Taguig City', 'Pateros'\)/);
    assert.match(sql, /incidents\.city = 'Pateros'/);
  }
});
