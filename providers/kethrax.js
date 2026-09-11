"use strict";

const TMDB_API_URL = "https://api.themoviedb.org/3";
const TMDB_API_KEY = "307b7b8ef035c6aa336900aef4e203bd";
const BASE_URL = "https://vixsrc.to";
const USER_AGENT = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36";

function getCommonHeaders() {
  return {
    "User-Agent": USER_AGENT,
    "Referer": `${BASE_URL}/`,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9"
  };
}

function getEmbedHeaders() {
  return {
    "User-Agent": USER_AGENT,
    "Referer": `${BASE_URL}/`,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
  };
}

function getPlaylistHeaders(embedUrl) {
  return {
    "User-Agent": USER_AGENT,
    "Referer": embedUrl,
    "Origin": BASE_URL,
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9"
  };
}

function extractEmbedSrcFromApiPayload(payload) {
  const rawSrc = payload && typeof payload === "object" ? payload.src : null;
  if (!rawSrc) return null;
  try { return new URL(rawSrc, BASE_URL).toString(); } catch { return null; }
}

function extractMasterPlaylistFromEmbedHtml(html) {
  if (!html) return null;
  const tokenMatch = html.match(/'token'\s*:\s*'([^']+)'/i);
  const expiresMatch = html.match(/'expires'\s*:\s*'([^']+)'/i);
  const urlMatch = html.match(/url\s*:\s*'([^']+\/playlist\/\d+[^']*)'/i);
  if (!tokenMatch || !expiresMatch || !urlMatch) return null;
  return { token: tokenMatch[1], expires: expiresMatch[1], url: urlMatch[1] };
}

function getQualityFromName(qualityStr) {
  if (!qualityStr) return "Unknown";
  const upper = qualityStr.toUpperCase();
  if (upper === "ORG" || upper === "ORIGINAL") return "Original";
  if (upper === "4K" || upper === "2160P") return "4K";
  if (upper === "1440P" || upper === "2K") return "1440p";
  if (upper === "1080P" || upper === "FHD") return "1080p";
  if (upper === "720P" || upper === "HD") return "720p";
  if (upper === "480P" || upper === "SD") return "480p";
  if (upper === "360P") return "360p";
  if (upper === "240P") return "240p";
  const match = qualityStr.match(/(\d{3,4})[pP]?/);
  if (match) {
    const res = parseInt(match[1], 10);
    if (res >= 2160) return "4K";
    if (res >= 1440) return "1440p";
    if (res >= 1080) return "1080p";
    if (res >= 720) return "720p";
    if (res >= 480) return "480p";
    if (res >= 360) return "360p";
    return "240p";
  }
  return "Unknown";
}

function checkQualityFromText(playlistText) {
  if (!playlistText) return null;
  if (/RESOLUTION=\d+x2160/i.test(playlistText)) return "4K";
  if (/RESOLUTION=\d+x1440/i.test(playlistText)) return "1440p";
  if (/RESOLUTION=\d+x1080/i.test(playlistText)) return "1080p";
  if (/RESOLUTION=\d+x720/i.test(playlistText)) return "720p";
  if (/RESOLUTION=\d+x480/i.test(playlistText)) return "480p";
  return null;
}

async function getMetadata(tmdbId, mediaType) {
  const endpoint = mediaType === "movie" ? "movie" : "tv";
  try {
    const res = await fetch(`${TMDB_API_URL}/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US`);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function getEpisodeMetadata(tvId, season, episode) {
  try {
    const res = await fetch(`${TMDB_API_URL}/tv/${tvId}/season/${season}/episode/${episode}?api_key=${TMDB_API_KEY}&language=en-US`);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

function normalizePlaybackHeaders(headers) {
  if (!headers || typeof headers !== "object") return headers;
  const normalized = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value == null) continue;
    const lk = String(key).toLowerCase();
    if (lk === "user-agent") normalized["User-Agent"] = value;
    else if (lk === "referer" || lk === "referrer") normalized["Referer"] = value;
    else if (lk === "origin") normalized["Origin"] = value;
    else if (lk === "accept") normalized["Accept"] = value;
    else if (lk === "accept-language") normalized["Accept-Language"] = value;
    else normalized[key] = value;
  }
  return normalized;
}

function detectLanguage(streamUrl) {
  const u = streamUrl ? streamUrl.toLowerCase() : "";
  if (u.includes("hindi") || u.includes("hin")) return "Hindi";
  if (u.includes("korean") || u.includes("kor")) return "Korean \u2022 Italian";
  if (u.includes("lang=it") || u.includes("ita") || u.includes("dual")) return "English \u2022 Italian";
  if (u.includes("eng") && !u.includes("it")) return "English";
  return "English \u2022 Italian";
}

function formatStream(stream) {
  const rawQuality = stream.quality || "1080p";
  let cleanQuality = "1080p";
  if (["2160p", "4k"].includes(rawQuality.toLowerCase())) cleanQuality = "4K";
  else if (rawQuality.toLowerCase() === "1440p") cleanQuality = "1440p";
  else if (rawQuality.toLowerCase() === "720p") cleanQuality = "720p";
  else if (["576p", "480p", "360p", "240p"].includes(rawQuality.toLowerCase())) cleanQuality = "SD";

  const audioChannels = (cleanQuality === "4K" || (stream.url && (stream.url.includes("hq") || stream.url.includes("hevc"))))
    ? "DD5.1" : "Stereo";
  const formatCodec = (cleanQuality === "4K" || (stream.url && stream.url.includes("hevc"))) ? "HEVC" : "H.264";

  const detectedLang = detectLanguage(stream.url);
  const durationStr = (stream._duration) ? `${stream._duration} min` : "Variable";
  const subLine1 = `${cleanQuality} \u2022 ${durationStr}`;
  const subLine2 = `${formatCodec} \u2022 ${audioChannels}`;
  const finalTitle = `${subLine1}\n${subLine2}`;

  let behaviorHints = stream.behaviorHints && typeof stream.behaviorHints === "object"
    ? Object.assign({}, stream.behaviorHints) : {};
  let finalHeaders = stream.headers;
  if (behaviorHints.proxyHeaders && behaviorHints.proxyHeaders.request) {
    finalHeaders = behaviorHints.proxyHeaders.request;
  } else if (behaviorHints.headers) {
    finalHeaders = behaviorHints.headers;
  }
  finalHeaders = normalizePlaybackHeaders(finalHeaders);
  if (finalHeaders) {
    behaviorHints.proxyHeaders = { request: finalHeaders };
    behaviorHints.headers = finalHeaders;
  }

  return {
    name: `VixSrc \u2022 ${detectedLang}`,
    title: `VixSrc \u2022 ${detectedLang}`,
    quality: finalTitle,
    url: stream.url,
    headers: finalHeaders,
    behaviorHints,
    referer: finalHeaders && (finalHeaders.Referer || finalHeaders.referer),
    userAgent: finalHeaders && (finalHeaders["User-Agent"] || finalHeaders["user-agent"]),
  };
}

async function getStreams(tmdbId, mediaType, season, episode) {
  const isTv = mediaType === "tv";

  if (isTv && (season == null || episode == null)) return [];

  const metadata = await getMetadata(tmdbId, mediaType);

  const layoutDuration = (() => {
    if (!metadata) return "Variable";
    if (metadata.runtime) return String(metadata.runtime);
    if (metadata.episode_run_time && metadata.episode_run_time.length) return String(metadata.episode_run_time[0]);
    return "Variable";
  })();

  let duration = layoutDuration;
  if (isTv) {
    try {
      const epMeta = await getEpisodeMetadata(tmdbId, season, episode);
      if (epMeta && epMeta.runtime) duration = String(epMeta.runtime);
    } catch { }
  }

  const apiUrl = isTv
    ? `${BASE_URL}/api/tv/${tmdbId}/${season}/${episode}`
    : `${BASE_URL}/api/movie/${tmdbId}`;

  try {
    const apiRes = await fetch(apiUrl, { headers: getCommonHeaders() });
    if (!apiRes.ok) return [];

    const apiPayload = await apiRes.json().catch(() => null);
    const embedUrl = extractEmbedSrcFromApiPayload(apiPayload);
    if (!embedUrl) return [];

    const embedRes = await fetch(embedUrl, { headers: getEmbedHeaders() });
    if (!embedRes.ok) return [];

    const embedHtml = await embedRes.text();
    const master = extractMasterPlaylistFromEmbedHtml(embedHtml);
    if (!master) return [];

    const [basePath, existingQuery] = master.url.split("?");
    const urlWithExt = basePath.endsWith(".m3u8") ? basePath : `${basePath}.m3u8`;
    const streamUrl = `${urlWithExt}${existingQuery ? "?" + existingQuery + "&" : "?"}token=${encodeURIComponent(master.token)}&expires=${encodeURIComponent(master.expires)}&h=1&lang=it`;
    const streamHeaders = getPlaylistHeaders(embedUrl);

    let quality = "1080p";
    try {
      const plRes = await fetch(streamUrl, { headers: streamHeaders });
      if (plRes.ok) {
        const detected = checkQualityFromText(await plRes.text());
        if (detected) quality = detected;
      }
    } catch { }

    const normalizedQuality = getQualityFromName(quality);

    const rawStream = {
      url: streamUrl,
      quality: normalizedQuality,
      headers: streamHeaders,
      behaviorHints: { notWebReady: false },
      _duration: duration,
    };

    const formatted = formatStream(rawStream);
    return formatted ? [formatted] : [];
  } catch (e) {
    return [];
  }
}

module.exports = { getStreams };