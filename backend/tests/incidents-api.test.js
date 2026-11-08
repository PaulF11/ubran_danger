// File note: This file handles incidents-api.test.js.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createIncidentsController } = require("../src/controllers/incidentsController");

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

for (const [view, expectedClause] of [
  ["recent", "DATE_SUB(CURDATE(), INTERVAL 90 DAY)"],
  ["historical", "incidents.incident_date < DATE_SUB(CURDATE(), INTERVAL 90 DAY)"],
  ["all", null],
]) {
  test(`incident feed ${view} applies the correct date scope`, async () => {
    let sql;
    const controller = createIncidentsController({
      database: {
        async query(query) {
          sql = query;
          return [[]];
        },
      },
    });
    const result = response();

    await controller.getIncidents({ query: { view } }, result);

    assert.equal(result.statusCode, 200);
    assert.deepEqual(result.body, { success: true, data: [] });
    if (expectedClause) {
      assert.match(sql, new RegExp(expectedClause.replace(/[()[\]]/g, "\\$&")));
    } else {
      assert.doesNotMatch(sql, /DATE_SUB\(CURDATE\(\), INTERVAL 90 DAY\)/);
    }
  });
}

test("incident feed rejects an unknown view", async () => {
  const controller = createIncidentsController({
    database: { query: async () => { throw new Error("must not query"); } },
  });
  const result = response();

  await controller.getIncidents({ query: { view: "future" } }, result);

  assert.equal(result.statusCode, 400);
  assert.equal(result.body.success, false);
});
