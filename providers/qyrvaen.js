"use strict";

const cheerio = require("cheerio-without-node-native");
const BASE_URL = "https://new3.hdhub4u.cl";
const SEARCH_ENDPOINT = "https://search.pingora.fyi/collections/post/documents/search";
const TMDB_ENDPOINT = "https://api.themoviedb.org/3";
const TMDB_KEY = "307b7b8ef035c6aa336900aef4e203bd";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150.0.0.0 Safari/537.36";
const DEFAULT_HEADERS = { "User-Agent": USER_AGENT, Cookie: "xla=s4t", Referer: `${BASE_URL}/` };

async function httpGet(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.text();
}

function b64Decode(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  const input = String(value || "").replace(/=+$/, "");
  let output = "", position = 0, accumulator, current, index = 0;
  while ((current = input.charAt(index++))) {
    current = alphabet.indexOf(current);
    if (current < 0) continue;
    accumulator = position % 4 ? accumulator * 64 + current : current;
    if (position++ % 4) output += String.fromCharCode((accumulator >> (-2 * position & 6)) & 255);
  }
  return output;
}

function rot13(value) {
  return String(value || "").replace(/[a-zA-Z]/g, (c) => {
    const code = c.charCodeAt(0) + 13;
    return String.fromCharCode(code <= (c <= "Z" ? 90 : 122) ? code : code - 26);
  });
}

function toAbsoluteUrl(value, base = BASE_URL) {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  try { return new URL(value, base).toString(); } catch { return ""; }
}

function normalizeTitle(value) {
  return String(value || "").toLowerCase()
    .replace(/\b(the|a|an)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ").trim();
}

function computeTitleScore(expected, candidate, expectedYear, candidateYear) {
  const eTokens = normalizeTitle(expected).split(" ").filter(Boolean);
  const cTokens = normalizeTitle(candidate).split(" ").filter(Boolean);
  if (!eTokens.length || !cTokens.length) return 0;
  const cSet = new Set(cTokens);
  const hits = eTokens.filter(t => cSet.has(t)).length;
  let score = hits / eTokens.length;
  if (eTokens.every(t => cSet.has(t))) score += 0.25;
  if (expectedYear && candidateYear === expectedYear) score += 0.25;
  else if (expectedYear && candidateYear && Math.abs(candidateYear - expectedYear) > 1) score -= 0.5;
  return score;
}

function extractSize(text) {
  const m = String(text || "").match(/([\d.]+)\s*(GB|MB|KB)/i);
  return m ? `${m[1]} ${m[2].toUpperCase()}` : "Unknown";
}

function extractQuality(t) {
  if (/\b(?:2160p|4k)\b/i.test(t)) return "2160p";
  const m = String(t || "").match(/\b(1080|720|480|1440)p\b/i);
  return m ? `${m[1]}p` : null;
}

function isValidStreamHost(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.endsWith(".r2.cloudflarestorage.com") || host.endsWith(".workers.dev");
  } catch { return false; }
}

function toGigabytes(text) {
  const m = String(text || "").match(/([\d.]+)\s*(GB|MB|KB)/i);
  if (!m) return 0;
  const v = parseFloat(m[1]), u = m[2].toUpperCase();
  return u === "GB" ? v : u === "MB" ? v / 1024 : v / (1024 * 1024);
}

function buildStreamLabel(t, size) {
  t = String(t || "");
  size = size || "Unknown";
  const src = /bluray|blu\-ray|bdrip/i.test(t) ? "Blu-ray" : /hdrip|webrip/i.test(t) ? "WEBRip" : "WEB-DL";
  const imax = /imax/i.test(t) ? " • IMAX" : "";
  const range = /dolby\s*vision|dovi/i.test(t) ? "Dolby Vision"
    : /hdr10/i.test(t) ? "HDR10"
      : /hdr/i.test(t) ? "HDR"
        : /10bit|10\-bit/i.test(t) ? "10-Bit"
          : /sdr/i.test(t.toLowerCase()) ? "SDR" : "";
  const codec = /hevc|x265|h265/i.test(t) ? "H.265" : "H.264";
  let audio = "AAC";
  const am = t.match(/(TrueHD\s*7\.1|DDP\s*7\.1|DDP\s*5\.1|DD\s*5\.1|5\.1|AAC)/i);
  if (am) {
    audio = am[1].toUpperCase().replace(/\s+/g, "");
    if (audio === "5.1") audio = "DDP5.1";
    if (audio.includes("TRUEHD")) audio = "TrueHD 7.1";
  } else if (/dolby\s*digital|dd/i.test(t)) {
    audio = "Dolby Digital";
  }
  if (/atmos/i.test(t)) audio += " • Atmos";
  const langs = /dual|hindi\-eng|eng\-hin/i.test(t) ? "English • Hindi"
    : ([/english|eng/i.test(t) && "English", /hindi|hin/i.test(t) && "Hindi"].filter(Boolean).join(" • ") || "English");
  return `${langs}${size !== "Unknown" ? ` • ${size}` : ""}\n${src}${imax} • ${audio}${range ? " • " + range : ""} • ${codec}`;
}

async function fetchTmdbMetadata(tmdbId, mediaType) {
  const type = mediaType === "tv" ? "tv" : "movie";
  const res = await fetch(
    `${TMDB_ENDPOINT}/${type}/${encodeURIComponent(tmdbId)}?api_key=${TMDB_KEY}`,
    { headers: { Accept: "application/json", "User-Agent": USER_AGENT } }
  );
  if (!res.ok) throw new Error(`TMDB HTTP ${res.status}`);
  const data = await res.json();
  const date = type === "tv" ? data.first_air_date : data.release_date;
  return {
    title: type === "tv" ? data.name : data.title,
    year: date ? Number(date.slice(0, 4)) : null,
  };
}

async function querySearchIndex(query) {
  const today = new Date().toISOString().slice(0, 10);
  const url = `${SEARCH_ENDPOINT}?q=${encodeURIComponent(query)}&query_by=post_title,category&query_by_weights=4,2&sort_by=sort_by_date:desc&limit=15&highlight_fields=none&use_cache=true&page=1&analytics_tag=${today}`;
  const res = await fetch(url, { headers: DEFAULT_HEADERS });
  if (!res.ok) throw new Error(`Search HTTP ${res.status}`);
  const data = await res.json();
  return (data.hits || []).map(({ document }) => {
    const title = document.post_title || "";
    const yearMatch = title.match(/\b(19|20)\d{2}\b/);
    return { title, year: yearMatch ? Number(yearMatch[0]) : null, url: toAbsoluteUrl(document.permalink) };
  });
}

function selectBestCandidate(metadata, candidates, mediaType, season) {
  let best = null;
  for (const c of candidates) {
    let score = computeTitleScore(metadata.title, c.title, metadata.year, c.year);
    if (mediaType === "tv" && season) {
      const sm = c.title.match(/(?:season\s*|s)(\d+)/i);
      if (sm && Number(sm[1]) === Number(season)) score += 0.5;
      else if (sm) score -= 0.75;
    }
    if (!best || score > best.score) best = Object.assign({}, c, { score });
  }
  return best && best.score >= 0.6 ? best : null;
}

async function resolveObfuscatedRedirect(url) {
  try {
    const html = await httpGet(url, { headers: DEFAULT_HEADERS });
    const pattern = /s\s*\(\s*['"]o['"]\s*,\s*['"]([A-Za-z0-9+/=]+)['"]|ck\s*\(\s*['"]_wp_http_\d+['"]\s*,\s*['"]([^'"]+)['"]/g;
    let encoded = "", match;
    while ((match = pattern.exec(html))) encoded += match[1] || match[2] || "";
    if (!encoded) {
      const redirect = html.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/);
      return redirect ? toAbsoluteUrl(redirect[1], url) : "";
    }
    const decoded = b64Decode(rot13(b64Decode(b64Decode(encoded))));
    const payload = JSON.parse(decoded);
    const direct = b64Decode(payload.o || "").trim();
    if (direct) return direct;
    const token = b64Decode(payload.data || "").trim();
    const blogUrl = String(payload.blog_url || "").trim();
    if (!blogUrl || !token) return "";
    const body = await httpGet(`${blogUrl}?re=${token}`, { headers: DEFAULT_HEADERS });
    return cheerio.load(body)("body").text().trim();
  } catch { return ""; }
}

async function extractHubCloudStreams(url, referer) {
  try {
    let pageUrl = url.replace("hubcloud.ink", "hubcloud.dad");
    let html = await httpGet(pageUrl, { headers: Object.assign({}, DEFAULT_HEADERS, { Referer: referer }) });
    if (!pageUrl.includes("hubcloud.php")) {
      const $p = cheerio.load(html);
      const nextUrl = $p("#download").attr("href") || (html.match(/var url\s*=\s*['"]([^'"]+)/) || [])[1];
      if (nextUrl) {
        pageUrl = toAbsoluteUrl(nextUrl, pageUrl);
        html = await httpGet(pageUrl, { headers: Object.assign({}, DEFAULT_HEADERS, { Referer: url }) });
      }
    }
    const $ = cheerio.load(html);
    const hdr = $("div.card-header").text().replace(/\s+/g, " ").trim();
    const size = extractSize($("i#size").text().trim());
    const streams = [];
    $("a.btn[href]").each((_, el) => {
      const href = $(el).attr("href");
      if (href && isValidStreamHost(href)) streams.push({ url: href, size, title: hdr });
    });
    return streams;
  } catch { return []; }
}

async function resolveStreamUrl(url, referer, depth = 0) {
  if (!url || depth > 4) return [];
  const absolute = toAbsoluteUrl(url, referer);
  if (!absolute) return [];
  if (isValidStreamHost(absolute)) return [{ url: absolute, size: "Unknown", title: "" }];
  let host;
  try { host = new URL(absolute).hostname.toLowerCase(); } catch { return []; }
  if (host.includes("hubcloud")) return extractHubCloudStreams(absolute, referer);
  if (host.includes("hubdrive")) {
    try {
      const html = await httpGet(absolute, { headers: Object.assign({}, DEFAULT_HEADERS, { Referer: referer }) });
      const $ = cheerio.load(html);
      const next = $("a.btn.btn-primary.btn-user.btn-success1[href], a.btn-success[href]").first().attr("href");
      return next ? resolveStreamUrl(next, absolute, depth + 1) : [];
    } catch { return []; }
  }
  if (absolute.includes("?id=") || /techyboy4u|gadgetsweb|cryptoinsights|bloggingvector|ampproject/.test(host)) {
    const unwrapped = await resolveObfuscatedRedirect(absolute);
    return unwrapped ? resolveStreamUrl(unwrapped, absolute, depth + 1) : [];
  }
  if (host.includes("hblinks") || host.includes("hubstream.dad")) {
    try {
      const html = await httpGet(absolute, { headers: Object.assign({}, DEFAULT_HEADERS, { Referer: referer }) });
      const $ = cheerio.load(html);
      const links = $("h3 a[href], h4 a[href], h5 a[href], .entry-content a[href]")
        .map((_, el) => $(el).attr("href")).get();
      return (await Promise.all(links.map(link => resolveStreamUrl(link, absolute, depth + 1)))).flat();
    } catch { return []; }
  }
  return [];
}

async function scrapeMediaPage(pageUrl, mediaType, targetEpisode) {
  const html = await httpGet(pageUrl, { headers: Object.assign({}, DEFAULT_HEADERS, { Referer: `${BASE_URL}/` }) });
  const $ = cheerio.load(html);
  const candidates = [];

  if (mediaType === "movie") {
    $("h3 a[href], h4 a[href], .page-body a[href]").each((_, el) => {
      const anchor = $(el);
      const href = anchor.attr("href");
      const context = `${anchor.text()} ${anchor.parent().text()}`;
      if (href && (/480|720|1080|2160|4k/i.test(context) || /hubcloud|hblinks|hubstream|hdstream4u/i.test(href))) {
        candidates.push({ url: href, episode: null });
      }
    });
  } else {
    $("h3, h4").each((_, el) => {
      const heading = $(el);
      const episodeMatch = heading.text().match(/(?:episode\s*|e)(\d+)/i);
      if (!episodeMatch) return;
      const ep = Number(episodeMatch[1]);
      heading.find("a[href]").each((__, anchor) => { candidates.push({ url: $(anchor).attr("href"), episode: ep }); });
    });
  }

  const targets = candidates.filter(
    c => mediaType === "movie" || targetEpisode == null || c.episode === Number(targetEpisode)
  );

  const results = await Promise.all(
    targets.map(async (c) => {
      const streams = await resolveStreamUrl(c.url, pageUrl);
      return streams.map(s => Object.assign({}, s, { episode: c.episode }));
    })
  );
  return results.flat();
}

async function getStreams(tmdbId, mediaType = "movie", season = null, episode = null) {
  if (!tmdbId) return [];
  if (mediaType !== "movie" && mediaType !== "tv") return [];
  if (mediaType === "tv" && (season == null || episode == null)) return [];

  try {
    const metadata = await fetchTmdbMetadata(tmdbId, mediaType);
    const query = mediaType === "tv" && season ? `${metadata.title} Season ${season}` : metadata.title;
    const match = selectBestCandidate(metadata, await querySearchIndex(query), mediaType, season);
    if (!match) return [];

    const raw = await scrapeMediaPage(match.url, mediaType, episode);
    const seen = new Set();
    const streams = [];

    for (const s of raw) {
      if (!isValidStreamHost(s.url)) continue;
      if (toGigabytes(s.size) < 1.2) continue;
      if (seen.has(s.url)) continue;
      seen.add(s.url);
      const quality = extractQuality(s.title);
      const formatted = buildStreamLabel(s.title, s.size);
      streams.push({
        name: `HDHub4u${quality ? ` • ${quality}` : ""}`,
        title: `HDHub4u${quality ? ` • ${quality}` : ""}`,
        url: s.url,
        size: formatted,
      });
    }
    return streams;
  } catch {
    return [];
  }
}

module.exports = { getStreams };