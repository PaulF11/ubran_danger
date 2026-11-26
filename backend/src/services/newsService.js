const pool = require("../config/database");

const APPROVED_PUBLISHERS = new Map([
  ["taguig.gov.ph", "Taguig City Government"],
  ["ncrpo.pnp.gov.ph", "NCRPO"],
  ["pnp.gov.ph", "Philippine National Police"],
  ["pia.gov.ph", "Philippine Information Agency"],
  ["pna.gov.ph", "Philippine News Agency"],
  ["mmda.gov.ph", "Metropolitan Manila Development Authority"],
  ["gmanetwork.com", "GMA News"],
  ["news.tv5.com.ph", "News5 / TV5"],
  ["inquirer.net", "Inquirer.net"],
  ["philstar.com", "Philstar"],
  ["manilatimes.net", "The Manila Times"],
  ["mb.com.ph", "Manila Bulletin"],
  ["abs-cbn.com", "ABS-CBN News"],
  ["rappler.com", "Rappler"],
]);

class NewsValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "NewsValidationError";
    this.status = 400;
  }
}

class NewsConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = "NewsConflictError";
    this.status = 409;
  }
}

function manilaWeek(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map(({ type, value }) => [type, value]),
  );
  const localDate = new Date(
    Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)),
  );
  const daysSinceMonday = (localDate.getUTCDay() + 6) % 7;
  localDate.setUTCDate(localDate.getUTCDate() - daysSinceMonday);
  const start = localDate.toISOString().slice(0, 10);
  localDate.setUTCDate(localDate.getUTCDate() + 7);
  return { startDate: start, endDate: localDate.toISOString().slice(0, 10) };
}

function publisherForUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new NewsValidationError("Enter a valid original publisher article URL.");
  }
  const hostname = url.hostname.toLowerCase();
  const publisher = [...APPROVED_PUBLISHERS.entries()].find(
    ([domain]) => hostname === domain || hostname.endsWith(`.${domain}`),
  );
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    !publisher ||
    url.pathname === "/" ||
    url.pathname.length < 2
  ) {
    throw new NewsValidationError(
      "The article must use HTTPS and a direct article URL from an approved publisher.",
    );
  }
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^utm_/i.test(key) || ["fbclid", "gclid", "mc_cid", "mc_eid"].includes(key.toLowerCase())) {
      url.searchParams.delete(key);
    }
  }
  url.searchParams.sort();
  return { url: url.toString(), sourceName: publisher[1] };
}

function requiredText(value, label, minLength, maxLength) {
  if (typeof value !== "string") {
    throw new NewsValidationError(`${label} is required.`);
  }
  const normalized = value.trim();
  if (normalized.length < minLength || normalized.length > maxLength) {
    throw new NewsValidationError(
      `${label} must contain ${minLength} to ${maxLength} characters.`,
    );
  }
  return normalized;
}

function validateArticle(input) {
  const publisher = publisherForUrl(input?.sourceUrl);
  const publishedDate =
    typeof input?.publishedDate === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(input.publishedDate) &&
    !Number.isNaN(Date.parse(`${input.publishedDate}T00:00:00Z`)) &&
    new Date(`${input.publishedDate}T00:00:00Z`)
      .toISOString()
      .startsWith(input.publishedDate)
      ? input.publishedDate
      : null;
  if (!publishedDate) {
    throw new NewsValidationError("Enter the article's actual publication date.");
  }

  let imageUrl = null;
  if (input.imageUrl != null && input.imageUrl !== "") {
    const image = publisherForUrl(input.imageUrl);
    imageUrl = image.url;
  }

  return {
    title: requiredText(input.title, "Headline", 10, 255),
    sourceName: publisher.sourceName,
    sourceUrl: publisher.url,
    publishedDate,
    summary: requiredText(input.summary, "Description", 30, 600),
    imageUrl,
  };
}

function createNewsService({ database = pool, now = () => new Date() } = {}) {
  return {
    async getPublicArticles() {
      const { startDate, endDate } = manilaWeek(now());
      const [rows] = await database.execute(
        `SELECT
          id,
          title,
          source_name AS sourceName,
          source_url AS sourceUrl,
          DATE_FORMAT(published_date, '%Y-%m-%d') AS publishedDate,
          summary,
          image_url AS imageUrl
        FROM news_articles
        WHERE status = 'VERIFIED'
          AND publisher_verified = TRUE
          AND date_verified = TRUE
          AND taguig_relevance_verified = TRUE
          AND published_date >= ?
          AND published_date < ?
        ORDER BY published_date DESC, id DESC
        LIMIT 3`,
        [startDate, endDate],
      );
      return rows;
    },

    async listAdminArticles(status) {
      const parameters = [];
      const statusFilter = status ? "WHERE status = ?" : "";
      if (status) parameters.push(status);
      const [rows] = await database.execute(
        `SELECT
          id,
          title,
          source_name AS sourceName,
          source_url AS sourceUrl,
          DATE_FORMAT(published_date, '%Y-%m-%d') AS publishedDate,
          summary,
          image_url AS imageUrl,
          status,
          publisher_verified AS publisherVerified,
          date_verified AS dateVerified,
          taguig_relevance_verified AS taguigRelevanceVerified,
          verification_notes AS verificationNotes,
          reviewed_by AS reviewedBy,
          reviewed_at AS reviewedAt,
          verified_by AS verifiedBy,
          verified_at AS verifiedAt,
          created_at AS createdAt
        FROM news_articles
        ${statusFilter}
        ORDER BY created_at DESC, id DESC
        LIMIT 100`,
        parameters,
      );
      return rows;
    },

    async createPendingArticle(input) {
      const article = validateArticle(input);
      const [result] = await database.execute(
        `INSERT INTO news_articles
          (title, source_name, source_url, published_date, summary, image_url, status)
        VALUES (?, ?, ?, ?, ?, ?, 'PENDING')`,
        [
          article.title,
          article.sourceName,
          article.sourceUrl,
          article.publishedDate,
          article.summary,
          article.imageUrl,
        ],
      );
      return { id: result.insertId, ...article, status: "PENDING" };
    },

    async updatePendingArticle(id, input) {
      const article = validateArticle(input);
      const [existingRows] = await database.execute(
        "SELECT status FROM news_articles WHERE id = ? LIMIT 1",
        [id],
      );
      if (!existingRows[0]) return null;
      if (existingRows[0].status !== "PENDING") {
        throw new NewsConflictError("Only pending news articles can be edited.");
      }

      const [result] = await database.execute(
        `UPDATE news_articles
        SET title = ?,
            source_name = ?,
            source_url = ?,
            published_date = ?,
            summary = ?,
            image_url = ?
        WHERE id = ? AND status = 'PENDING'`,
        [
          article.title,
          article.sourceName,
          article.sourceUrl,
          article.publishedDate,
          article.summary,
          article.imageUrl,
          id,
        ],
      );
      if (result.affectedRows === 0) {
        const [currentRows] = await database.execute(
          "SELECT status FROM news_articles WHERE id = ? LIMIT 1",
          [id],
        );
        if (!currentRows[0]) return null;
        if (currentRows[0].status !== "PENDING") {
          throw new NewsConflictError("Only pending news articles can be edited.");
        }
      }
      return { id: Number(id), ...article, status: "PENDING" };
    },

    async reviewArticle(id, input, reviewerId) {
      const status = input?.status;
      if (!["VERIFIED", "REJECTED"].includes(status)) {
        throw new NewsValidationError("Review status must be VERIFIED or REJECTED.");
      }

      const verified = status === "VERIFIED";
      const notes = verified
        ? requiredText(input.verificationNotes, "Verification notes", 20, 500)
        : typeof input.verificationNotes === "string"
          ? input.verificationNotes.trim().slice(0, 500)
          : null;
      if (
        verified &&
        (input.publisherVerified !== true ||
          input.dateVerified !== true ||
          input.taguigRelevanceVerified !== true)
      ) {
        throw new NewsValidationError(
          "Confirm the publisher, publication date, and Taguig relevance before approval.",
        );
      }

      const [result] = await database.execute(
        `UPDATE news_articles
        SET status = ?,
            publisher_verified = ?,
            date_verified = ?,
            taguig_relevance_verified = ?,
            verification_notes = ?,
            reviewed_by = ?,
            reviewed_at = UTC_TIMESTAMP(),
            verified_by = CASE WHEN ? = 'VERIFIED' THEN ? ELSE NULL END,
            verified_at = CASE WHEN ? = 'VERIFIED' THEN UTC_TIMESTAMP() ELSE NULL END
        WHERE id = ?`,
        [
          status,
          verified,
          verified,
          verified,
          notes,
          String(reviewerId),
          status,
          String(reviewerId),
          status,
          id,
        ],
      );
      if (result.affectedRows === 0) return null;
      return { id: Number(id), status };
    },
  };
}

module.exports = {
  APPROVED_PUBLISHERS,
  NewsConflictError,
  NewsValidationError,
  createNewsService,
  manilaWeek,
  publisherForUrl,
  validateArticle,
};
