const DEFAULT_COLLECTION_TARGET_URLS = [
  "https://www.gmanetwork.com/news/",
  "https://news.tv5.com.ph/articles",
];
const DEFAULT_HOST_LIST = "taguig.gov.ph,pnp.gov.ph";
const MAX_SOURCE_ARTICLES = 5;
const MAX_RESPONSE_BYTES = 20000;
const MAX_DISCOVERY_RESPONSE_BYTES = 600000;
const ABS_CBN_HOST = "www.abs-cbn.com";
const GMA_HOST = "www.gmanetwork.com";

function normalizeTrustedHosts() {
  return (process.env.TRUSTED_SOURCE_HOSTS || DEFAULT_HOST_LIST)
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
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
      isPrivateOrLocalHostname(url.hostname.toLowerCase())
    ) {
      throw new Error(
        "Every SOURCE_COLLECTION_TARGET_URLS entry must use HTTPS and a non-private host.",
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

function extractArticleLinks(html, baseUrl) {
  const links = [];
  const seen = new Set();
  const addLink = (href, label, structuredArticle = false) => {
    let url;
    try {
      url = new URL(href, baseUrl);
    } catch {
      return;
    }

    if (
      url.protocol !== "https:" ||
      url.hostname !== baseUrl.hostname ||
      seen.has(url.href) ||
      url.pathname === "/" ||
      label.length < 20
    ) {
      return;
    }
    if (
      baseUrl.hostname === GMA_HOST &&
      !/^\/news\/(?:[^/]+\/)+\d+\/[^/]+\/story\/?$/i.test(url.pathname)
    ) {
      return;
    }
    if (baseUrl.hostname === ABS_CBN_HOST && !structuredArticle) return;

    seen.add(url.href);
    links.push(url);
  };
  const pattern = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = pattern.exec(html)) && links.length < MAX_SOURCE_ARTICLES) {
    addLink(match[1], htmlToText(match[2]));
  }

  if (baseUrl.hostname === ABS_CBN_HOST && links.length < MAX_SOURCE_ARTICLES) {
    const nextData =
      /<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i.exec(
        html,
      )?.[1];
    if (nextData) {
      try {
        const pageProps = JSON.parse(nextData).props?.pageProps;
        const items = pageProps?.content?.listItem;
        if (Array.isArray(items)) {
          for (const item of items) {
            if (links.length >= MAX_SOURCE_ARTICLES) break;
            if (
              item?.profile === "Article" &&
              typeof item.slugline_url === "string"
            ) {
              addLink(
                item.slugline_url,
                item.title || item.slugline || "",
                true,
              );
            }
          }
        }
      } catch {
        return links;
      }
    }
  }
  return links;
}

async function fetchSource(url, sourceName, fetchImpl) {
  const response = await fetchImpl(url, {
    redirect: "error",
    headers: { "user-agent": "UrbanDangerTrustedSourceCollector/1.0" },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) return null;
  const content = (await response.text()).slice(0, MAX_RESPONSE_BYTES);
  if (!content.trim()) return null;
  const metadata = extractMetadata(content);
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

async function collectTrustedSources({ fetchImpl = fetch } = {}) {
  const startUrls = parseCollectionTargetUrls();
  const collected = [];
  const collectedUrls = new Set();
  let sourcesChecked = 0;
  let sourcesFailed = 0;

  for (const url of startUrls) {
    const host = url.hostname.toLowerCase();

    try {
      const response = await fetchImpl(url, {
        redirect: "error",
        headers: { "user-agent": "UrbanDangerTrustedSourceCollector/1.0" },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        sourcesFailed += 1;
        continue;
      }
      const homepage = (await response.text()).slice(
        0,
        MAX_DISCOVERY_RESPONSE_BYTES,
      );
      sourcesChecked += 1;
      const links = extractArticleLinks(homepage, url);
      for (const articleUrl of links) {
        if (collectedUrls.has(articleUrl.href)) continue;
        collectedUrls.add(articleUrl.href);
        try {
          const article = await fetchSource(articleUrl, host, fetchImpl);
          if (article) collected.push(article);
          else sourcesFailed += 1;
        } catch {
          sourcesFailed += 1;
          continue;
        }
      }
    } catch (error) {
      sourcesFailed += 1;
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
