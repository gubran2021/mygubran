"use strict";

const BASE_URL = "https://1embed.cc";
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_KEY = "307b7b8ef035c6aa336900aef4e203bd";
const SERVERS = [
  { id: "MAIN", label: "Main", endpoint: "/server/vidsrc" },
  { id: "EMP", label: "EMP", endpoint: "/server/emp" },
];

const ALLOWED_QUALITIES = new Set(["1080p", "2160p"]);

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";
const buildHeaders = (embedReferer = `${BASE_URL}/`) => ({
  Accept: "*/*",
  Origin: BASE_URL,
  Referer: embedReferer,
  "User-Agent": USER_AGENT,
});

const qualityFromPlaylist = (m3u8Content) => {
  let peakHeight = 0;
  for (const resMatch of m3u8Content.matchAll(/RESOLUTION=(\d+)x(\d+)/gi))
    peakHeight = Math.max(peakHeight, Math.min(Number(resMatch[1]) || 0, Number(resMatch[2]) || 0));
  if (peakHeight >= 2000) return "2160p";
  if (peakHeight >= 1000) return "1080p";
  if (peakHeight >= 700) return "720p";
  if (peakHeight >= 470) return "480p";
  if (peakHeight >= 350) return "360p";
  return "Auto";
};

const normalizeSubtitles = (subtitleEntries) => {
  if (!Array.isArray(subtitleEntries)) return [];
  return subtitleEntries
    .filter((entry) => entry?.url || entry?.file)
    .map((entry) => {
      const displayLabel = entry.label || entry.display || entry.language || "Subtitle";
      const langCode = String(entry.language || displayLabel).toLowerCase();
      return { url: entry.url || entry.file, label: displayLabel, name: displayLabel, lang: langCode, language: langCode };
    });
};

const fetchTmdbDetails = async (tmdbId, contentType) => {
  try {
    const tmdbEndpoint = contentType === "tv" ? "tv" : "movie";
    const tmdbResponse = await fetch(
      `${TMDB_BASE}/${tmdbEndpoint}/${tmdbId}?api_key=${TMDB_KEY}&append_to_response=external_ids`
    );
    if (!tmdbResponse.ok) return null;
    const tmdbData = await tmdbResponse.json();
    return {
      title: contentType === "tv" ? tmdbData.name : tmdbData.title,
      imdbId: tmdbData.external_ids?.imdb_id || null,
    };
  } catch {
    return null;
  }
};

const acquireStreamToken = async (embedReferer) => {
  const tokenResponse = await fetch(`${BASE_URL}/api/token`, { headers: buildHeaders(embedReferer) });
  if (!tokenResponse.ok) return "";
  const tokenPayload = await tokenResponse.json();
  return tokenPayload?.token ?? "";
};

const buildEndpoint = (server, tmdbId, contentType, season, episode, streamToken, mediaTitle) => {
  const baseUrl = `${BASE_URL}${server.endpoint}/id=${encodeURIComponent(tmdbId)}`;
  const queryString = contentType === "tv"
    ? `?s=${encodeURIComponent(season)}&e=${encodeURIComponent(episode)}&type=tv`
    : "?type=movie";
  return `${baseUrl}${queryString}&title=${encodeURIComponent(mediaTitle || "")}&server=${server.id}&_st=${encodeURIComponent(streamToken)}`;
};

const extractServerStream = async (server, tmdbId, contentType, season, episode, streamToken, embedReferer, mediaTitle) => {
  try {
    const serverResponse = await fetch(
      buildEndpoint(server, tmdbId, contentType, season, episode, streamToken, mediaTitle),
      { headers: { ...buildHeaders(embedReferer), "X-Stream-Token": streamToken }, redirect: "follow" }
    );
    if (!serverResponse.ok) return [];

    const serverPayload = await serverResponse.json();
    const m3u8Url = serverPayload?.streams?.proxy_m3u8 || serverPayload?.streams?.raw_m3u8 || serverPayload?.streams?.m3u8;
    if (!m3u8Url || serverPayload.success === false || serverPayload.isIframe) return [];

    const playlistResponse = await fetch(m3u8Url, { headers: buildHeaders(embedReferer), redirect: "follow" });
    if (!playlistResponse.ok) return [];

    const m3u8Content = await playlistResponse.text();
    if (!m3u8Content.trimStart().startsWith("#EXTM3U")) return [];

    const qualityLabel = qualityFromPlaylist(m3u8Content);
    return [{
      name: `1Embed \u2022 ${server.label}`,
      title: `1Embed \u2022 ${server.label}`,
      url: m3u8Url,
      quality: qualityLabel,
      type: "application/x-mpegurl",
      provider: "1embed",
      headers: buildHeaders(embedReferer),
      subtitles: normalizeSubtitles(serverPayload.subtitles),
    }];
  } catch {
    return [];
  }
};

const getStreams = async (tmdbId, mediaType, season = null, episode = null) => {
  const contentType = mediaType === "series" ? "tv" : mediaType;
  if (!tmdbId || (contentType !== "movie" && contentType !== "tv")) return [];
  if (contentType === "tv" && (!season || !episode)) return [];

  const tmdbDetails = await fetchTmdbDetails(tmdbId, contentType);
  if (!tmdbDetails?.title) return [];

  const embedReferer = contentType === "tv"
    ? `${BASE_URL}/embed/tv/${tmdbId}/${season}/${episode}`
    : `${BASE_URL}/embed/movie/${tmdbId}`;

  try {
    const streamToken = await acquireStreamToken(embedReferer);
    if (!streamToken) return [];

    const serverGroups = await Promise.all(
      SERVERS.map((server) => extractServerStream(server, tmdbId, contentType, season, episode, streamToken, embedReferer, tmdbDetails.title))
    );

    const uniqueUrls = new Set();
    return serverGroups.flat()
      .filter((stream) => stream && !uniqueUrls.has(stream.url) && uniqueUrls.add(stream.url))
      .filter((stream) => ALLOWED_QUALITIES.has(stream.quality));
  } catch {
    return [];
  }
};

module.exports = { getStreams };