// File note: This file handles processed-source.test.js.
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  findProcessed,
  recordProcessed,
  sourceHash,
} = require("../src/services/processedSourceRepository");

test("processed-source lookup hashes URLs and returns only registered URLs", async () => {
  const urls = [
    "https://trusted.example.test/article-one",
    "https://trusted.example.test/article-two",
  ];
  let query;
  const database = {
    async execute(sql, parameters) {
      query = { sql, parameters };
      return [[{ sourceUrlHash: sourceHash(urls[0]) }]];
    },
  };

  const processed = await findProcessed(urls, { database });

  assert.match(query.sql, /status = 'PROCESSED'/);
  assert.deepEqual(query.parameters, urls.map(sourceHash));
  assert.deepEqual([...processed], [urls[0]]);
});

test("processed-source writes retain retry state without logging source content", async () => {
  const calls = [];
  const database = {
    async execute(sql, parameters) {
      calls.push({ sql, parameters });
      return [{}];
    },
  };
  const url = "https://trusted.example.test/article";

  await recordProcessed(url, "PROCESSED", { database });
  await recordProcessed(url, "RETRY", { database });

  assert.equal(calls.length, 2);
  assert.match(calls[0].sql, /ON DUPLICATE KEY UPDATE/);
  assert.equal(calls[0].parameters[0], sourceHash(url));
  assert.equal(calls[0].parameters[2], "PROCESSED");
  assert.equal(calls[1].parameters[2], "RETRY");
});
