const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");
const {
  NewsValidationError,
  createNewsService,
  manilaWeek,
  validateArticle,
} = require("../src/services/newsService");
const { createNewsController } = require("../src/controllers/newsController");
const { createNewsRouter } = require("../src/routes/news");
const { createAdminRouter } = require("../src/routes/admin");

const articleInput = {
  title: "Taguig City opens new public safety facility",
  sourceUrl:
    "https://www.pna.gov.ph/articles/1234567",
  publishedDate: "2026-11-25",
  summary:
    "The report describes a Taguig public safety facility and names the responsible city agency.",
};

const environment = {
  ADMIN_USERNAME: "news-review-admin",
  ADMIN_PASSWORD: "news-review-password",
  ADMIN_TOKEN_SECRET: "news-review-secret-with-at-least-32-characters",
};

async function withServer(callback, database) {
  const app = express();
  app.use(express.json());
  app.use("/api/news", createNewsRouter({ database }));
  app.use("/api/admin", createAdminRouter({ database, environment }));
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

async function getAdminToken(baseUrl) {
  const response = await fetch(`${baseUrl}/api/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: environment.ADMIN_USERNAME,
      password: environment.ADMIN_PASSWORD,
    }),
  });
  assert.equal(response.status, 200);
  return (await response.json()).data.token;
}

test("Manila calendar weeks start Monday and handle UTC date boundaries", () => {
  assert.deepEqual(
    manilaWeek(new Date("2026-11-22T16:30:00.000Z")),
    { startDate: "2026-11-23", endDate: "2026-11-30" },
  );
  assert.deepEqual(
    manilaWeek(new Date("2021-01-03T16:30:00.000Z")),
    { startDate: "2021-01-04", endDate: "2021-01-11" },
  );
});

test("news submissions accept original publisher URLs and derive publisher identity", () => {
  assert.deepEqual(validateArticle(articleInput), {
    title: articleInput.title,
    sourceName: "Philippine News Agency",
    sourceUrl: articleInput.sourceUrl,
    publishedDate: articleInput.publishedDate,
    summary: articleInput.summary,
    imageUrl: null,
  });
});

for (const sourceUrl of [
  "https://news.google.com/rss/articles/123",
  "https://www.facebook.com/example",
  "https://www.pna.gov.ph/",
  "http://www.pna.gov.ph/articles/123",
  "https://www.pna.gov.ph:8443/articles/123",
  "https://pna.gov.ph.evil.example/articles/123",
]) {
  test(`news submission rejects untrusted or non-article URL ${sourceUrl}`, () => {
    assert.throws(
      () => validateArticle({ ...articleInput, sourceUrl }),
      NewsValidationError,
    );
  });
}

test("public news query requires verified Taguig provenance, current Manila week, and max three", async () => {
  let captured;
  const service = createNewsService({
    now: () => new Date("2026-11-25T10:00:00.000Z"),
    database: {
      async execute(sql, parameters) {
        captured = { sql, parameters };
        return [[{ id: 8, title: articleInput.title }]];
      },
    },
  });

  assert.deepEqual(await service.getPublicArticles(), [
    { id: 8, title: articleInput.title },
  ]);
  assert.match(captured.sql, /status = 'VERIFIED'/);
  assert.match(captured.sql, /publisher_verified = TRUE/);
  assert.match(captured.sql, /date_verified = TRUE/);
  assert.match(captured.sql, /taguig_relevance_verified = TRUE/);
  assert.match(captured.sql, /published_date >= \?/);
  assert.match(captured.sql, /published_date < \?/);
  assert.match(captured.sql, /ORDER BY published_date DESC, id DESC/);
  assert.match(captured.sql, /LIMIT 3/);
  assert.deepEqual(captured.parameters, ["2026-11-23", "2026-11-30"]);
});

test("verification requires explicit publisher, date, and Taguig checks", async () => {
  const service = createNewsService({
    database: { execute: async () => { throw new Error("must not query"); } },
  });
  await assert.rejects(
    service.reviewArticle("1", {
      status: "VERIFIED",
      publisherVerified: true,
      dateVerified: true,
      taguigRelevanceVerified: false,
      verificationNotes: "Original source and date confirmed.",
    }, "admin"),
    NewsValidationError,
  );
  await assert.rejects(
    service.reviewArticle("1", {
      status: "VERIFIED",
      publisherVerified: true,
      dateVerified: true,
      taguigRelevanceVerified: true,
      verificationNotes: "Too short.",
    }, "admin"),
    NewsValidationError,
  );
});

test("news review records separate reviewer and verified provenance", async () => {
  let captured;
  const service = createNewsService({
    database: {
      async execute(sql, parameters) {
        captured = { sql, parameters };
        return [{ affectedRows: 1 }];
      },
    },
  });

  assert.deepEqual(
    await service.reviewArticle(
      "4",
      {
        status: "VERIFIED",
        publisherVerified: true,
        dateVerified: true,
        taguigRelevanceVerified: true,
        verificationNotes: "Original publisher, publication date, and Taguig relevance confirmed.",
      },
      "42",
    ),
    { id: 4, status: "VERIFIED" },
  );
  assert.deepEqual(captured.parameters, [
    "VERIFIED",
    true,
    true,
    true,
    "Original publisher, publication date, and Taguig relevance confirmed.",
    "42",
    "VERIFIED",
    "42",
    "VERIFIED",
    "4",
  ]);
  assert.match(captured.sql, /reviewed_by = \?/);
  assert.match(captured.sql, /verified_by = CASE WHEN \? = 'VERIFIED'/);
});

test("pending articles can be corrected without creating a duplicate submission", async () => {
  const queries = [];
  const service = createNewsService({
    database: {
      async execute(sql, parameters) {
        queries.push({ sql, parameters });
        if (sql.startsWith("SELECT status")) return [[{ status: "PENDING" }]];
        if (sql.startsWith("UPDATE news_articles")) return [{ affectedRows: 1 }];
        throw new Error("Unexpected SQL");
      },
    },
  });

  const corrected = await service.updatePendingArticle("7", {
    ...articleInput,
    title: "Corrected Taguig public safety report",
  });

  assert.equal(corrected.id, 7);
  assert.equal(corrected.status, "PENDING");
  assert.equal(corrected.title, "Corrected Taguig public safety report");
  assert.equal(queries.length, 2);
  assert.match(queries[1].sql, /WHERE id = \? AND status = 'PENDING'/);
});

test("public feed is unauthenticated while all news review endpoints require admin auth", async () => {
  const database = {
    async execute(sql) {
      if (sql.includes("FROM news_articles") && sql.includes("status = 'VERIFIED'")) {
        return [[{ id: 2, title: "Verified Taguig news" }]];
      }
      if (sql.includes("INSERT INTO news_articles")) {
        return [{ insertId: 3 }];
      }
      if (sql.includes("UPDATE news_articles")) {
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith("SELECT status FROM news_articles")) {
        return [[{ status: "PENDING" }]];
      }
      if (sql.includes("FROM news_articles")) return [[]];
      throw new Error("Unexpected SQL");
    },
  };
  await withServer(async (baseUrl) => {
    const publicResponse = await fetch(`${baseUrl}/api/news`);
    assert.equal(publicResponse.status, 200);
    assert.deepEqual((await publicResponse.json()).data, [
      { id: 2, title: "Verified Taguig news" },
    ]);

    for (const [path, options] of [
      ["/api/admin/news", {}],
      ["/api/admin/news", { method: "POST" }],
      ["/api/admin/news/3", { method: "PATCH" }],
      ["/api/admin/news/3/status", { method: "PATCH" }],
    ]) {
      const denied = await fetch(`${baseUrl}${path}`, options);
      assert.equal(denied.status, 401);
    }

    const token = await getAdminToken(baseUrl);
    const headers = {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    };
    const submitted = await fetch(`${baseUrl}/api/admin/news`, {
      method: "POST",
      headers,
      body: JSON.stringify(articleInput),
    });
    assert.equal(submitted.status, 201);
    assert.equal((await submitted.json()).data.status, "PENDING");

    const updated = await fetch(`${baseUrl}/api/admin/news/3`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        ...articleInput,
        title: "Corrected Taguig public safety report",
      }),
    });
    assert.equal(updated.status, 200);
    assert.equal(
      (await updated.json()).data.title,
      "Corrected Taguig public safety report",
    );

    const approved = await fetch(`${baseUrl}/api/admin/news/3/status`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        status: "VERIFIED",
        publisherVerified: true,
        dateVerified: true,
        taguigRelevanceVerified: true,
        verificationNotes: "Original publisher, publication date, and Taguig relevance confirmed.",
      }),
    });
    assert.equal(approved.status, 200);
    assert.equal((await approved.json()).data.status, "VERIFIED");
  }, database);
});

test("news API errors do not expose database details", async () => {
  const controller = createNewsController({
    newsService: {
      async getPublicArticles() {
        throw new Error("private database connection detail");
      },
    },
  });
  const app = express();
  app.use("/api/news", createNewsRouter({ controller }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/news`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      success: false,
      message: "Verified news is temporarily unavailable.",
    });
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
