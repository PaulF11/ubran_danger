const DEFAULT_COLLECTION_TARGET_URLS = [
  "https://news.google.com/rss/search?q=Taguig+City+incident",
  "https://news.google.com/rss/search?q=Pateros+incident",
  "https://www.gmanetwork.com/news/",
  "https://www.pna.gov.ph/",
  "https://www.philstar.com/",
  "https://www.manilatimes.net/",
];
const DEFAULT_HOST_LIST = "gmanetwork.com,news.tv5.com.ph,news.google.com,pna.gov.ph,philstar.com,manilatimes.net";
const APPROVED_SOURCE_HOSTS = [
  "gmanetwork.com",
  "news.tv5.com.ph",
  "news.google.com",
  "pna.gov.ph",
  "philstar.com",
  "manilatimes.net",
  "mb.com.ph",
  "cnnphilippines.com",
];
const SOURCE_NAMES = new Map([
  ["www.gmanetwork.com", "GMA News"],
  ["gmanetwork.com", "GMA News"],
  ["news.tv5.com.ph", "News5 / TV5"],
  ["news.google.com", "Google News RSS"],
  ["www.google.com", "Google News RSS"],
  ["www.pna.gov.ph", "Philippine News Agency"],
  ["pna.gov.ph", "Philippine News Agency"],
  ["www.philstar.com", "Philstar"],
  ["philstar.com", "Philstar"],
  ["www.manilatimes.net", "The Manila Times"],
  ["manilatimes.net", "The Manila Times"],
  ["www.mb.com.ph", "Manila Bulletin"],
  ["mb.com.ph", "Manila Bulletin"],
  ["www.cnnphilippines.com", "CNN Philippines"],
  ["cnnphilippines.com", "CNN Philippines"],
]);
const MAX_SOURCE_ARTICLES = 5;
const MAX_RESPONSE_BYTES = 20000;
const MAX_DISCOVERY_RESPONSE_BYTES = 600000;
const GMA_HOST = "www.gmanetwork.com";

function isApprovedSourceHost(hostname) {
  const normalized = hostname.toLowerCase();
  return APPROVED_SOURCE_HOSTS.some(
    (host) => normalized === host || normalized.endsWith(`.${host}`),
  );
}

function sourceNameForHost(hostname) {
  const normalized = (hostname || "").toLowerCase();
  if (SOURCE_NAMES.has(normalized)) return SOURCE_NAMES.get(normalized);
  for (const [knownHost, label] of SOURCE_NAMES.entries()) {
    if (normalized === knownHost || normalized.endsWith(`.${knownHost}`)) {
      return label;
    }
  }
  return hostname || "unknown-source";
}

function safeSourceUrl(url) {
  return `${url.protocol}//${url.host}${url.pathname}`;
}

function logCollection(logger, details) {
  logger.info(`[source-collection] ${JSON.stringify(details)}`);
}

function fetchErrorCategory(error) {
  const errorDetails = [error?.code, error?.cause?.code, error?.name]
    .filter(Boolean)
    .join(" ");
  if (/redirect|UND_ERR_REDIRECT/i.test(errorDetails)) {
    return "redirect_failure";
  }
  if (/timeout|timed out|abort/i.test(errorDetails)) {
    return "timeout";
  }
  return "network_failure";
}

function httpFailureCategory(status) {
  if (status === 403) return "http_403";
  if (status === 429) return "http_429";
  if (status >= 500) return "http_5xx";
  if (status >= 300 && status < 400) return "http_redirect";
  return "http_error";
}

function normalizeTrustedHosts() {
  const configured = (process.env.TRUSTED_SOURCE_HOSTS || "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean)
    .map((host) => host.replace(/^www\./, ""));

  const approved = new Set(APPROVED_SOURCE_HOSTS);
  const merged = new Set(DEFAULT_HOST_LIST.split(","));

  for (const host of configured) {
    if (approved.has(host) || APPROVED_SOURCE_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) {
      merged.add(host);
      if (host.startsWith("www.")) {
        merged.add(host.replace(/^www\./, ""));
      }
    }
  }

  return [...merged].filter((host) => APPROVED_SOURCE_HOSTS.includes(host) || APPROVED_SOURCE_HOSTS.some((allowed) => host.endsWith(`.${allowed}`))).sort();
}

function isPrivateOrLocalHostname(hostname) {
  if (!hostname) return true;

  const normalized = hostname.toLowerCase();
  if (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "0.0.0.0"
  ) {
    return true;
  }

  if (normalized.startsWith("[")) {
    return true;
  }

  const hostSegments = normalized.split(".");
  const isIPv4 = hostSegments.every((segment) => /^\d+$/.test(segment));
  if (isIPv4) {
    return true;
  }

  if (
    normalized.startsWith("10.") ||
    normalized.startsWith("192.168.") ||
    normalized.startsWith("172.")
  ) {
    return true;
  }

  return normalized.startsWith("169.254.") || normalized.startsWith("127.");
}

function isAllowedTrustedSource(url) {
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== "https:") return false;
  if (isPrivateOrLocalHostname(hostname)) return false;

  const allowed = normalizeTrustedHosts();
  return allowed.some(
    (host) => hostname === host || hostname.endsWith(`.${host}`),
  );
}

function parseCollectionTargetUrls(
  configured = process.env.SOURCE_COLLECTION_TARGET_URLS,
) {
  const values = (configured || DEFAULT_COLLECTION_TARGET_URLS.join(","))
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return values.map((value) => {
    let url;
    try {
      url = new URL(value);
    } catch {
      throw new Error("SOURCE_COLLECTION_TARGET_URLS contains an invalid URL.");
    }

    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      isPrivateOrLocalHostname(url.hostname.toLowerCase())
    ) {
      throw new Error(
        "Every SOURCE_COLLECTION_TARGET_URLS entry must use HTTPS and a non-private host.",
      );
    }
    if (!isApprovedSourceHost(url.hostname)) {
      throw new Error(
        "SOURCE_COLLECTION_TARGET_URLS may only contain approved publisher hosts.",
      );
    }
    return url;
  });
}

function decodeHtml(value) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function htmlToText(html) {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function extractMetadata(html) {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  let publishedAt = null;
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const name = /(?:property|name)=["']([^"']+)["']/i.exec(tag)?.[1];
    if (
      name &&
      ["article:published_time", "datepublished", "pubdate"].includes(
        name.toLowerCase(),
      )
    ) {
      publishedAt = /content=["']([^"']+)["']/i.exec(tag)?.[1] || publishedAt;
    }
  }
  return {
    title: title ? htmlToText(title).slice(0, 255) : null,
    publishedAt,
  };
}

function articlePathLooksUsable(pathname) {
  const normalized = (pathname || "").toLowerCase();
  if (!normalized || normalized === "/") return false;
  if (/\.(?:jpg|jpeg|png|gif|svg|pdf|mp4|zip)$/i.test(normalized)) return false;
  if (/\/\d{4}\/\d{2}\/\d{2}\//.test(normalized)) return true;

  return (
    /(?:\/news(?:\/|$)|\/articles?(?:\/|$)|\/article(?:\/|$)|\/story(?:\/|$)|\/stories(?:\/|$)|\/nation(?:\/|$)|\/world(?:\/|$)|\/business(?:\/|$)|\/sports(?:\/|$)|\/topstories(?:\/|$)|\/latest(?:\/|$)|\/archives(?:\/|$)|\/tag(?:\/|$)|\/incident(?:\/|$)|\/report(?:\/|$)|\/breaking(?:\/|$))/i.test(
      normalized,
    ) || /\/\d{4}\/\d{2}\/\d{2}\//.test(normalized)
  );
}

function extractRssArticles(xml, baseUrl) {
  const items = [];
  const seen = new Set();
  const itemPattern = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemPattern.exec(xml)) && items.length < MAX_SOURCE_ARTICLES) {
    const itemXml = match[1];
    const titleMatch = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(itemXml);
    const linkMatch = /<link\b[^>]*>([\s\S]*?)<\/link>/i.exec(itemXml);
    const pubDateMatch = /<pubDate\b[^>]*>([\s\S]*?)<\/pubDate>/i.exec(itemXml);
    if (!titleMatch || !linkMatch) continue;

    let url;
    try {
      url = new URL(decodeHtml(linkMatch[1].trim()), baseUrl);
    } catch {
      continue;
    }

    url.hash = "";
    const titleText = htmlToText(titleMatch[1]).trim();
    if (!titleText || titleText.length < 10) continue;
    if (url.protocol !== "https:" || !isApprovedSourceHost(url.hostname) || seen.has(url.href)) continue;
    if (!articlePathLooksUsable(url.pathname)) continue;
    seen.add(url.href);
    items.push({
      source: sourceNameForHost(url.hostname),
      sourceName: sourceNameForHost(url.hostname),
      title: titleText.slice(0, 255),
      url: url.toString(),
      publishedAt: pubDateMatch ? htmlToText(pubDateMatch[1]).trim() : null,
      retrievedAt: new Date().toISOString(),
      content: `${titleText}${pubDateMatch ? ` ${htmlToText(pubDateMatch[1]).trim()}` : ""}`,
    });
  }
  return items;
}

function extractRssArticleLinks(xml, baseUrl) {
  return extractRssArticles(xml, baseUrl).map((item) => new URL(item.url));
}

function extractArticleLinks(html, baseUrl) {
  const links = [];
  const seen = new Set();
  const addLink = (href, label) => {
    let url;
    try {
      url = new URL(decodeHtml(href), baseUrl);
    } catch {
      return;
    }

    url.hash = "";
    const text = htmlToText(label);
    const hasUsableText = text.length >= 10;
    const isSameHost = url.hostname === baseUrl.hostname || url.hostname.endsWith(`.${baseUrl.hostname}`);
    if (
      url.protocol !== "https:" ||
      !isApprovedSourceHost(url.hostname) ||
      !isSameHost ||
      seen.has(url.href) ||
      !articlePathLooksUsable(url.pathname) ||
      !hasUsableText
    ) {
      return;
    }
    if (
      baseUrl.hostname === GMA_HOST &&
      !/^\/news\/(?:[^/]+\/)+\d+\/[^/]+\/story\/?$/i.test(url.pathname)
    ) {
      return;
    }
    if (
      baseUrl.hostname === "news.tv5.com.ph" &&
      !/^(?:\/articles?(?:\/|$)|\/article(?:\/|$)|\/incident(?:\/|$)|\/report(?:\/|$)|\/breaking(?:\/|$))/i.test(
        url.pathname,
      )
    ) {
      return;
    }
    seen.add(url.href);
    links.push(url);
  };
  const pattern = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = pattern.exec(html)) && links.length < MAX_SOURCE_ARTICLES) {
    addLink(match[1], match[2]);
  }

  return links;
}

async function fetchSource(url, sourceName, fetchImpl, logger) {
  const response = await fetchImpl(url, {
    redirect: "error",
    headers: { "user-agent": "UrbanDangerTrustedSourceCollector/1.0" },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    logCollection(logger, {
      source: sourceName,
      hostname: url.hostname,
      stage: "article_fetch",
      status: response.status ?? null,
      result: "failure",
      category: httpFailureCategory(response.status),
      url: safeSourceUrl(url),
    });
    return null;
  }
  const content = (await response.text()).slice(0, MAX_RESPONSE_BYTES);
  if (!content.trim()) {
    logCollection(logger, {
      source: sourceName,
      hostname: url.hostname,
      stage: "article_fetch",
      status: response.status ?? null,
      result: "failure",
      category: "empty_response",
      url: safeSourceUrl(url),
    });
    return null;
  }
  const metadata = extractMetadata(content);
  logCollection(logger, {
    source: sourceName,
    hostname: url.hostname,
    stage: "article_fetch",
    status: response.status ?? null,
    result: "success",
    category: "none",
    url: safeSourceUrl(url),
  });
  return {
    source: sourceName,
    sourceName,
    title: metadata.title,
    url: url.toString(),
    publishedAt: metadata.publishedAt,
    retrievedAt: new Date().toISOString(),
    content: htmlToText(content).slice(0, MAX_RESPONSE_BYTES),
  };
}

async function collectTrustedSources({
  fetchImpl = fetch,
  logger = console,
} = {}) {
  const startUrls = parseCollectionTargetUrls();
  const collected = [];
  const collectedUrls = new Set();
  let sourcesChecked = 0;
  let sourcesFailed = 0;

  for (const url of startUrls) {
    const host = url.hostname.toLowerCase();
    const sourceName = sourceNameForHost(host);

    try {
      const response = await fetchImpl(url, {
        redirect: "error",
        headers: { "user-agent": "UrbanDangerTrustedSourceCollector/1.0" },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        sourcesFailed += 1;
        logCollection(logger, {
          source: sourceName,
          hostname: host,
          stage: "seed_fetch",
          status: response.status,
          result: "failure",
          category: httpFailureCategory(response.status),
          url: safeSourceUrl(url),
        });
        continue;
      }
      const homepage = (await response.text()).slice(
        0,
        MAX_DISCOVERY_RESPONSE_BYTES,
      );
      sourcesChecked += 1;
      const discoveredItems =
        host === "news.google.com"
          ? extractRssArticles(homepage, url)
          : extractArticleLinks(homepage, url).map((articleUrl) => ({
              url: articleUrl.toString(),
              source: sourceName,
              sourceName,
              title: null,
              publishedAt: null,
              content: articleUrl.toString(),
            }));
      logCollection(logger, {
        source: sourceName,
        hostname: host,
        stage: "discovery",
        status: response.status,
        result: discoveredItems.length === 0 ? "failure" : "success",
        category: discoveredItems.length === 0 ? "zero_article_links" : "none",
        articleCount: discoveredItems.length,
        url: safeSourceUrl(url),
      });
      if (discoveredItems.length === 0) sourcesFailed += 1;

      for (const article of discoveredItems) {
        const articleUrl = new URL(article.url);
        if (collectedUrls.has(articleUrl.href)) continue;
        collectedUrls.add(articleUrl.href);
        try {
          const articleRecord =
            host === "news.google.com"
              ? { ...article }
              : await fetchSource(
                  articleUrl,
                  sourceName,
                  fetchImpl,
                  logger,
                );
          if (articleRecord) collected.push(articleRecord);
          else sourcesFailed += 1;
        } catch (error) {
          sourcesFailed += 1;
          logCollection(logger, {
            source: sourceName,
            hostname: articleUrl.hostname,
            stage: "article_fetch",
            status: null,
            result: "failure",
            category: fetchErrorCategory(error),
            url: safeSourceUrl(articleUrl),
          });
          continue;
        }
      }
    } catch (error) {
      sourcesFailed += 1;
      logCollection(logger, {
        source: sourceName,
        hostname: host,
        stage: "seed_fetch",
        status: null,
        result: "failure",
        category: fetchErrorCategory(error),
        url: safeSourceUrl(url),
      });
      continue;
    }
  }

  Object.defineProperty(collected, "sourcesChecked", {
    value: sourcesChecked,
  });
  Object.defineProperty(collected, "sourcesFailed", {
    value: sourcesFailed,
  });
  return collected;
}

module.exports = {
  collectTrustedSources,
  isAllowedTrustedSource,
  isPrivateOrLocalHostname,
  normalizeTrustedHosts,
  parseCollectionTargetUrls,
  extractArticleLinks,
  htmlToText,
};
