const PROVIDER_BASE_URL = "https://uhdmovies.autos";
const TMDB_API_BASE = "https://api.themoviedb.org/3";
const TMDB_API_KEY = "307b7b8ef035c6aa336900aef4e203bd";
const BROWSER_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";

const BROWSER_HEADERS = {
  "User-Agent": BROWSER_USER_AGENT,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9"
};

async function httpFetch(url, options) {
  const httpResponse = await fetch(url, options);
  if (!httpResponse.ok) throw new Error(`HTTP ${httpResponse.status}`);
  return httpResponse.text();
}

function extractOrigin(url) {
  try {
    const parsedUrl = new URL(url);
    return `${parsedUrl.protocol}//${parsedUrl.host}`;
  } catch (e) {
    return "";
  }
}

function resolveAbsoluteUrl(url, base) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("//")) return `https:${url}`;
  return `${extractOrigin(base)}${url.startsWith("/") ? "" : "/"}${url}`;
}

function encodeFormBody(formFields) {
  return Object.keys(formFields).map(
    (fieldKey) => `${encodeURIComponent(fieldKey)}=${encodeURIComponent(formFields[fieldKey] || "")}`
  ).join("&");
}

function unescapeHtml(rawValue) {
  return String(rawValue || "")
    .replace(/&amp;/gi, "&")
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripHtmlTags(rawValue) {
  return unescapeHtml(String(rawValue || "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function extractAttribute(tagSource, attrName) {
  const attrMatch = String(tagSource || "").match(
    new RegExp(`\\b${attrName}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i")
  );
  return attrMatch ? unescapeHtml(attrMatch[2]) : "";
}

function parseAnchors(html) {
  const anchorList = [];
  const anchorPattern = /<a\b[^>]*>[\s\S]*?<\/a>/gi;
  let anchorMatch;
  while (anchorMatch = anchorPattern.exec(String(html || ""))) {
    anchorList.push({
      tag: anchorMatch[0],
      href: extractAttribute(anchorMatch[0], "href"),
      title: extractAttribute(anchorMatch[0], "title"),
      text: stripHtmlTags(anchorMatch[0])
    });
  }
  return anchorList;
}

function parseLandingForm(html) {
  const formElements = String(html || "").match(/<form\b[^>]*>[\s\S]*?<\/form>/gi) || [];
  const landingForm = formElements.find((formEl) => /\bid\s*=\s*["']landing["']/i.test(formEl)) || "";
  const collectedFields = {};
  const inputElements = landingForm.match(/<input\b[^>]*>/gi) || [];
  inputElements.forEach((inputEl) => {
    const fieldName = extractAttribute(inputEl, "name");
    if (fieldName) collectedFields[fieldName] = extractAttribute(inputEl, "value");
  });
  return {
    action: extractAttribute((landingForm.match(/<form\b[^>]*>/i)?.[0]) || "", "action"),
    fields: collectedFields
  };
}

async function traverseGateway(url) {
  const siteOrigin = extractOrigin(url);
  const gatewayHtml = await httpFetch(url, { headers: BROWSER_HEADERS });
  const gatewayForm = parseLandingForm(gatewayHtml);
  if (!gatewayForm.action) return "";

  const handoffHtml = await httpFetch(gatewayForm.action, {
    method: "POST",
    headers: { ...BROWSER_HEADERS, "Content-Type": "application/x-www-form-urlencoded", Referer: url },
    body: encodeFormBody(gatewayForm.fields)
  });
  const handoffForm = parseLandingForm(handoffHtml);
  if (!handoffForm.action) return "";

  const finalGatewayHtml = await httpFetch(handoffForm.action, {
    method: "POST",
    headers: { ...BROWSER_HEADERS, "Content-Type": "application/x-www-form-urlencoded", Referer: gatewayForm.action },
    body: encodeFormBody(handoffForm.fields)
  });
  const accessTokenMatch = finalGatewayHtml.match(/\?go=([^"'&]+)/);
  if (!accessTokenMatch) return "";

  const accessToken = accessTokenMatch[1];
  const sessionCookie = handoffForm.fields._wp_http2 || "";
  const redirectPageHtml = await httpFetch(`${siteOrigin}/?go=${accessToken}`, {
    headers: { ...BROWSER_HEADERS, Cookie: `${accessToken}=${sessionCookie}`, Referer: handoffForm.action }
  });
  const metaRefreshMatch = redirectPageHtml.match(
    /http-equiv=["']refresh["'][^>]+content=["'][^"']*url=([^"']+)/i
  );
  return metaRefreshMatch ? metaRefreshMatch[1].replace(/&amp;/g, "&") : "";
}

async function resolveHostedFile(url) {
  let resolvedPageUrl = url;
  if (/\/r\?key=/i.test(resolvedPageUrl)) {
    const keyRedirectHtml = await httpFetch(resolvedPageUrl, { headers: BROWSER_HEADERS });
    const locationMatch = keyRedirectHtml.match(
      /(?:window\.location\.)?replace\(["']([^"']+)["']\)/i
    );
    if (!locationMatch) return "";
    resolvedPageUrl = resolveAbsoluteUrl(locationMatch[1], resolvedPageUrl);
  }

  const hostPageHtml = await httpFetch(resolvedPageUrl, { headers: BROWSER_HEADERS });
  const hostPageLinks = parseAnchors(hostPageHtml);
  const cloudResumeLink = hostPageLinks.find((anchor) => /resume cloud/i.test(anchor.text));

  if (cloudResumeLink) {
    const cloudResumeUrl = resolveAbsoluteUrl(cloudResumeLink.href, resolvedPageUrl);
    const cloudResumeHtml = await httpFetch(cloudResumeUrl, {
      headers: { ...BROWSER_HEADERS, Referer: resolvedPageUrl }
    });
    const cloudResumeAnchors = parseAnchors(cloudResumeHtml);
    const workerLink = cloudResumeAnchors.find(
      (anchor) => /^https?:\/\//i.test(anchor.href) &&
        (/workers\.dev/i.test(anchor.href) || /\bbtn-success\b/i.test(extractAttribute(anchor.tag, "class")))
    );
    if (workerLink) return workerLink.href;
  }

  const directCloudLink = hostPageLinks.find(
    (anchor) => /cloud download/i.test(anchor.text) && /^https?:\/\//i.test(anchor.href)
  );
  if (directCloudLink) return directCloudLink.href;

  const instantDownloadLink = hostPageLinks.find((anchor) => /instant download/i.test(anchor.text));
  if (instantDownloadLink) {
    const instantResponse = await fetch(resolveAbsoluteUrl(instantDownloadLink.href, resolvedPageUrl), {
      headers: { ...BROWSER_HEADERS, Referer: resolvedPageUrl },
      redirect: "follow"
    });
    const redirectedUrl = instantResponse.url || "";
    const urlParamMatch = redirectedUrl.match(/[?&]url=([^&]+)/i);
    if (urlParamMatch) {
      try {
        return decodeURIComponent(urlParamMatch[1]);
      } catch (e) {
        return urlParamMatch[1];
      }
    }
    if (/\.(?:mkv|mp4)(?:[?#]|$)/i.test(redirectedUrl)) return redirectedUrl;
  }

  return "";
}

async function fetchMovieMetadata(tmdbId) {
  const tmdbResponse = await fetch(
    `${TMDB_API_BASE}/movie/${tmdbId}?api_key=${TMDB_API_KEY}`,
    { headers: { "User-Agent": BROWSER_USER_AGENT, Accept: "application/json" } }
  );
  if (!tmdbResponse.ok) throw new Error(`TMDB HTTP ${tmdbResponse.status}`);
  const tmdbPayload = await tmdbResponse.json();
  return {
    title: tmdbPayload.title || tmdbPayload.original_title || "",
    originalTitle: tmdbPayload.original_title || "",
    year: String(tmdbPayload.release_date || "").slice(0, 4)
  };
}

async function fetchSeriesMetadata(tmdbId) {
  const tmdbResponse = await fetch(
    `${TMDB_API_BASE}/tv/${tmdbId}?api_key=${TMDB_API_KEY}`,
    { headers: { "User-Agent": BROWSER_USER_AGENT, Accept: "application/json" } }
  );
  if (!tmdbResponse.ok) throw new Error(`TMDB HTTP ${tmdbResponse.status}`);
  const tmdbPayload = await tmdbResponse.json();
  return {
    title: tmdbPayload.name || tmdbPayload.original_name || "",
    originalTitle: tmdbPayload.original_name || "",
    year: String(tmdbPayload.first_air_date || "").slice(0, 4)
  };
}

function normalizeTitle(rawValue) {
  return String(rawValue || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

async function locateContentPage(contentMetadata) {
  const searchResultHtml = await httpFetch(
    `${PROVIDER_BASE_URL}/?s=${encodeURIComponent(contentMetadata.title)}`,
    { headers: BROWSER_HEADERS }
  );
  const titleQuery = normalizeTitle(contentMetadata.title);
  const originalTitleQuery = normalizeTitle(contentMetadata.originalTitle);
  let topResult = null;
  const articleElements = searchResultHtml.match(/<article\b[^>]*>[\s\S]*?<\/article>/gi) || [];
  articleElements.forEach((articleEl) => {
    const primaryLink = parseAnchors(articleEl)[0] || {};
    const candidateHref = primaryLink.href;
    const candidateTitle = primaryLink.title || primaryLink.text || stripHtmlTags(articleEl);
    if (!candidateHref || !candidateTitle) return;
    const normalizedCandidate = normalizeTitle(candidateTitle);
    let relevanceScore = 0;
    if (titleQuery && normalizedCandidate.includes(titleQuery)) relevanceScore += 4;
    if (originalTitleQuery && normalizedCandidate.includes(originalTitleQuery)) relevanceScore += 3;
    if (contentMetadata.year && normalizedCandidate.includes(contentMetadata.year)) relevanceScore += 2;
    if (!topResult || relevanceScore > topResult.relevanceScore) topResult = { href: candidateHref, relevanceScore };
  });
  return topResult && topResult.relevanceScore >= 4 ? topResult.href : "";
}

function detectQuality(releaseLabel) {
  if (/\b2160p\b|\b4k\b|\buhd\b/i.test(releaseLabel)) return "2160p";
  const resolutionMatch = releaseLabel.match(/\b(1080|720|480)p\b/i);
  return resolutionMatch ? `${resolutionMatch[1]}p` : "Unknown";
}

function detectFileSize(releaseLabel) {
  const sizeMatch = releaseLabel.match(/\[\s*(\d+(?:\.\d+)?\s*(?:GB|MB))(?:\/E)?\s*\]/i);
  return sizeMatch ? sizeMatch[1].replace(/\s+/g, " ") : "";
}

function detectSeason(releaseLabel) {
  const seasonMatch = releaseLabel.match(/\bS(\d{1,2})\b/i);
  return seasonMatch ? parseInt(seasonMatch[1], 10) : 0;
}

function detectEpisode(releaseLabel) {
  const episodeMatch = releaseLabel.match(/\bS\d{1,2}E(\d{1,2})\b/i);
  return episodeMatch ? parseInt(episodeMatch[1], 10) : 0;
}

function collectEpisodeReleases(html, season, episode) {
  const releaseEntries = [];
  const paragraphElements = String(html || "").match(/<p\b[^>]*>[\s\S]*?<\/p>/gi) || [];

  paragraphElements.forEach((paragraphEl, paragraphIndex) => {
    const eligibleLinks = parseAnchors(paragraphEl).filter(anchor => /unblockedgames/i.test(anchor.href));
    if (!eligibleLinks.length) return;

    const episodePackLink = eligibleLinks.find(anchor => {
      const episodeNumberMatch = anchor.text.trim().match(/^episode\s*(\d+)$/i);
      return episodeNumberMatch && parseInt(episodeNumberMatch[1], 10) === episode;
    });

    const contextBlock = stripHtmlTags(
      paragraphElements.slice(Math.max(0, paragraphIndex - 5), paragraphIndex + 1).join("")
    );

    const contextSeasonMatch = contextBlock.match(/\bS(\d{1,2})\b/i);
    if (!contextSeasonMatch || parseInt(contextSeasonMatch[1], 10) !== season) return;

    if (episodePackLink) {
      releaseEntries.push({
        label: contextBlock,
        url: episodePackLink.href,
        quality: detectQuality(contextBlock),
        size: detectFileSize(contextBlock)
      });
      return;
    }

    const singleEpisodeMatch = contextBlock.match(/\bS\d{1,2}E(\d{1,2})\b/i);
    if (singleEpisodeMatch && parseInt(singleEpisodeMatch[1], 10) === episode) {
      releaseEntries.push({
        label: contextBlock,
        url: eligibleLinks[0].href,
        quality: detectQuality(contextBlock),
        size: detectFileSize(contextBlock)
      });
    }
  });

  return releaseEntries;
}

function trimReleaseLabel(releaseLabel) {
  return releaseLabel
    .replace(/^.*?\(\d{4}\)\s*/i, "")
    .replace(/\([^()]*UHDMovies[^()]*\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function collectMovieReleases(html) {
  const releaseEntries = [];
  const paragraphElements = String(html || "").match(/<p\b[^>]*>[\s\S]*?<\/p>/gi) || [];
  paragraphElements.forEach((paragraphEl, paragraphIndex) => {
    const releaseLabel = stripHtmlTags(paragraphEl);
    if (!/\[\s*(?:\d+(?:\.\d+)?\s*)?(?:GB|MB)\s*\]/i.test(releaseLabel)) return;
    const adjacentParagraphs = paragraphElements.slice(paragraphIndex, paragraphIndex + 3).join("");
    const downloadAnchor = parseAnchors(adjacentParagraphs).find((anchor) => /unblockedgames/i.test(anchor.href));
    const downloadUrl = downloadAnchor ? downloadAnchor.href : "";
    if (!downloadUrl) return;
    releaseEntries.push({ label: releaseLabel, url: downloadUrl, quality: detectQuality(releaseLabel), size: detectFileSize(releaseLabel) });
  });
  return releaseEntries;
}

async function buildStreamEntry(release) {
  try {
    const gatewayExitUrl = await traverseGateway(release.url);
    if (!gatewayExitUrl) return null;

    const directStreamUrl = await resolveHostedFile(gatewayExitUrl);
    if (!directStreamUrl || !/^https?:\/\//i.test(directStreamUrl)) return null;

    const releaseDetails = trimReleaseLabel(release.label);
    return {
      name: "UHDMovies",
      title: `UHDMovies`,
      url: directStreamUrl,
      quality: release.quality,
      type: "video/x-matroska",
      headers: { "User-Agent": BROWSER_USER_AGENT, Referer: gatewayExitUrl },
      size: release.size
    };
  } catch (error) {
    return null;
  }
}

async function getStreams(tmdbId, mediaType, season, episode) {
  if (!tmdbId) return [];
  const isSeriesType = mediaType === "series" || mediaType === "tv";
  if (!isSeriesType && mediaType !== "movie") return [];
  try {
    const contentMetadata = isSeriesType ? await fetchSeriesMetadata(tmdbId) : await fetchMovieMetadata(tmdbId);
    if (!contentMetadata.title) return [];

    const targetPageUrl = await locateContentPage(contentMetadata);
    if (!targetPageUrl) return [];

    const contentPageHtml = await httpFetch(targetPageUrl, { headers: BROWSER_HEADERS });
    const releaseEntries = isSeriesType
      ? collectEpisodeReleases(contentPageHtml, season, episode)
      : collectMovieReleases(contentPageHtml);
    if (!releaseEntries.length) return [];

    const settledEntries = await Promise.all(releaseEntries.map(buildStreamEntry));
    const streamEntries = settledEntries.filter(Boolean);
    if (!streamEntries.length) return [];

    const urlRegistry = {};
    return streamEntries.filter((streamEntry) => {
      if (urlRegistry[streamEntry.url]) return false;
      urlRegistry[streamEntry.url] = true;
      return true;
    });
  } catch (error) {
    return [];
  }
}

module.exports = { getStreams };