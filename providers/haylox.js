"use strict";

const TMDB_API_URL = "https://api.themoviedb.org/3";
const TMDB_API_KEY = "307b7b8ef035c6aa336900aef4e203bd";
const API_BASE = "https://vidlink.pro/api/b";
const ENC_API = "https://enc-dec.app/api";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
  "Connection": "keep-alive",
  "Referer": "https://vidlink.pro/",
  "Origin": "https://vidlink.pro"
};

const ALLOWED_QUALITIES = ["4K", "1440p", "1080p", "720p"];

function resWeight(quality) {
  const q = (quality || "").toUpperCase();
  if (q === "4K" || q === "2160P") return 5;
  if (q === "1440P") return 4;
  if (q === "1080P") return 3;
  if (q === "720P") return 2;
  if (q === "480P") return 1;
  return 0;
}

function getInvertedSortTag(score, maxScore) {
  maxScore = maxScore || 999999;
  let val = Math.max(0, parseInt(score, 10) || 0);
  let inv = Math.max(0, maxScore - val);
  let bin = inv.toString(2);
  while (bin.length < 20) bin = "0" + bin;
  const chars = [];
  for (let i = 0; i < bin.length; i++) {
    chars.push(bin.charAt(i) === "1" ? "\uFEFF" : "\u200B");
  }
  return chars.join("");
}

async function getTmdbInfo(tmdbId, mediaType) {
  try {
    const type = mediaType === "tv" ? "tv" : "movie";
    const res = await fetch(`${TMDB_API_URL}/${type}/${tmdbId}?api_key=${TMDB_API_KEY}`);
    if (!res.ok) return null;
    const data = await res.json();
    const title = mediaType === "tv" ? data.name : data.title;
    if (!title) return null;
    const dateStr = mediaType === "tv" ? data.first_air_date : data.release_date;
    return { title, year: dateStr ? dateStr.substring(0, 4) : null };
  } catch {
    return null;
  }
}

async function encryptTmdbId(tmdbId) {
  try {
    const res = await fetch(`${ENC_API}/enc-vidlink?text=${tmdbId}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data && data.result ? data.result : null;
  } catch {
    return null;
  }
}

function extractQuality(str) {
  if (!str) return null;
  const s = str.toString().toLowerCase();
  if (s.includes("2160") || s.includes("4k")) return "4K";
  if (s.includes("1440") || s.includes("2k")) return "1440p";
  if (s.includes("1080") || s.includes("fhd")) return "1080p";
  if (s.includes("720") || s.includes("hd")) return "720p";
  const match = s.match(/(\d{3,4})[p]?/);
  if (match) {
    const h = parseInt(match[1]);
    if (h >= 2160) return "4K";
    if (h >= 1440) return "1440p";
    if (h >= 1080) return "1080p";
    if (h >= 720) return "720p";
  }
  return null;
}

function resolveUrl(url, baseUrl) {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url;
  }
}

function buildStream(url, qualityKey) {
  if (!url) return null;
  const quality = extractQuality(qualityKey);
  if (!quality) return null;
  return {
    name: "Vidlink",
    title: "Vidlink",
    url,
    quality,
    type: url.toLowerCase().includes(".m3u8") ? "m3u8" : "video"
  };
}

function parseM3U8(content, baseUrl) {
  const lines = content.split("\n").map(l => l.trim()).filter(Boolean);
  const streams = [];
  let current = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("#EXT-X-STREAM-INF:")) {
      current = { resolution: null };
      const resMatch = line.match(/RESOLUTION=(\d+x\d+)/);
      if (resMatch) current.resolution = resMatch[1];
    } else if (current && !line.startsWith("#")) {
      current.url = resolveUrl(line, baseUrl);
      streams.push(current);
      current = null;
    }
  }
  return streams;
}

async function fetchM3U8Streams(playlistUrl) {
  try {
    const r = await fetch(playlistUrl, { headers: HEADERS });
    if (!r.ok) return [];
    const content = await r.text();
    if (!content) return [];
    return parseM3U8(content, playlistUrl).map(s => {
      const qualityKey = s.resolution ? s.resolution.split("x").pop() + "p" : null;
      return buildStream(s.url, qualityKey);
    }).filter(Boolean);
  } catch {
    return [];
  }
}

function extractStreamsFromData(data) {
  const results = [];
  if (!data) return results;

  if (data.stream && data.stream.qualities) {
    for (const key of Object.keys(data.stream.qualities)) {
      const item = data.stream.qualities[key];
      if (item && item.url) {
        const s = buildStream(item.url, key);
        if (s) results.push(s);
      }
    }
    if (data.stream.playlist) {
      results.push({ _playlist: true, url: data.stream.playlist });
    }
    return results;
  }

  if (data.stream && data.stream.playlist) {
    results.push({ _playlist: true, url: data.stream.playlist });
    return results;
  }

  if (data.url) {
    const s = buildStream(data.url, data.quality || null);
    if (s) results.push(s);
    return results;
  }

  if (Array.isArray(data.streams)) {
    for (const item of data.streams) {
      if (item && item.url) {
        const s = buildStream(item.url, item.quality || item.resolution || null);
        if (s) results.push(s);
      }
    }
    return results;
  }

  if (Array.isArray(data.links)) {
    for (const item of data.links) {
      if (item && item.url) {
        const s = buildStream(item.url, item.quality || null);
        if (s) results.push(s);
      }
    }
    return results;
  }

  (function findUrls(obj) {
    if (!obj || typeof obj !== "object") return;
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      const keyLower = key.toLowerCase();
      if (keyLower.includes("subtitle") || keyLower.includes("caption")) continue;
      if (typeof val === "string" && val.startsWith("http")) {
        if (val.includes(".srt") || val.includes(".vtt") ||
            val.includes("subtitle") || val.includes("caption")) continue;
        const s = buildStream(val, key);
        if (s) results.push(s);
      } else if (typeof val === "object" && val !== null) {
        findUrls(val);
      }
    }
  })(data);

  return results;
}

function sortAndDedupeStreams(streams) {
  const seen = new Set();
  let result = streams
    .filter(s => ALLOWED_QUALITIES.indexOf(s.quality) !== -1 && s.url && s.url.startsWith("https"))
    .filter(s => !seen.has(s.url) && seen.add(s.url));

  result.sort((a, b) => resWeight(b.quality) - resWeight(a.quality));

  const total = result.length;
  result = result.map((s, i) => {
    const tag = getInvertedSortTag(total - i, total + 1);
    return Object.assign({}, s, { name: tag + s.name, title: tag + s.title });
  });

  return result;
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    const isTv = mediaType === "tv";
    if (isTv && (season == null || episode == null)) return [];

    const [info, encryptedId] = await Promise.all([
      getTmdbInfo(tmdbId, mediaType),
      encryptTmdbId(tmdbId)
    ]);
    if (!info || !encryptedId) return [];

    const vidlinkUrl = isTv
      ? `${API_BASE}/tv/${encryptedId}/${season}/${episode}`
      : `${API_BASE}/movie/${encryptedId}`;

    const r = await fetch(vidlinkUrl, { headers: HEADERS });
    if (!r.ok) return [];
    const data = await r.json();
    if (!data) return [];

    const extracted = extractStreamsFromData(data);
    if (extracted.length === 0) return [];

    const playlists = extracted.filter(x => x._playlist);
    const direct = extracted.filter(x => !x._playlist);

    if (playlists.length === 0) return sortAndDedupeStreams(direct);

    const m3u8Results = await Promise.all(playlists.map(p => fetchM3U8Streams(p.url)));
    return sortAndDedupeStreams(direct.concat(...m3u8Results));
  } catch {
    return [];
  }
}

module.exports = { getStreams };