"use strict";

const TMDB_API_URL = "https://api.themoviedb.org/3";
const TMDB_API_KEY = "307b7b8ef035c6aa336900aef4e203bd";
const BASE_URL = "https://vidrock.net";
const STREAM_KEY = "7f3e9c2a8b5d1f4e6a9c3b7d2e5f8a1c4b6d9e2f5a8c1b4d7e9f2a5c8b1d4e7f";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
  "Referer": "https://vidrock.net/",
  "Origin": "https://vidrock.net"
};

function parseHex(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++)
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

async function decryptAesGcm(encoded) {
  const raw = Uint8Array.from(
    atob(encoded.replace(/-/g, "+").replace(/_/g, "/")),
    c => c.charCodeAt(0)
  );
  const key = await crypto.subtle.importKey(
    "raw", parseHex(STREAM_KEY), { name: "AES-GCM" }, false, ["decrypt"]
  );
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: raw.subarray(0, 12) },
    key,
    raw.subarray(12)
  );
  return new TextDecoder().decode(plain);
}

function resolutionLabel(w, h) {
  if (w >= 3200 || h >= 2000) return "2160p";
  if (w >= 2400 || h >= 1400) return "1440p";
  if (w >= 1800 || h >= 1000) return "1080p";
  if (w >= 1200 || h >= 700) return "720p";
  if (w >= 800 || h >= 460) return "480p";
  if (w >= 600 || h >= 340) return "360p";
  if (w > 0 || h > 0) return "240p";
  return "Unknown";
}

function resWeight(quality) {
  const q = (quality || "").toUpperCase();
  if (q === "2160P") return 5;
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

function toAbsoluteUrl(line, base) {
  try { return new URL(line, base).toString(); } catch { return line; }
}

function extractTopVariant(text, base) {
  const lines = text.split("\n").map(l => l.trim());
  let best = null;
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith("#EXT-X-STREAM-INF")) continue;
    const next = lines[i + 1];
    if (!next || next.startsWith("#")) continue;
    const bw = (lines[i].match(/BANDWIDTH=(\d+)/) || [])[1];
    const res = lines[i].match(/RESOLUTION=(\d+)x(\d+)/);
    const bandwidth = bw ? parseInt(bw, 10) : 0;
    const width = res ? parseInt(res[1], 10) : 0;
    const height = res ? parseInt(res[2], 10) : 0;
    if (!best || bandwidth > best.bandwidth)
      best = { url: toAbsoluteUrl(next, base), bandwidth, width, height };
  }
  return best;
}

function formatStreamTitle(quality, meta) {
  const runtime = meta.runtime || "90 Minutes";
  return [
    `${quality} \u2022 Original Audio`,
    `H.264 \u2022 ${runtime}`
  ].join("\n");
}

async function fetchMediaMeta(tmdbId, mediaType, season, episode) {
  try {
    const type = mediaType === "tv" ? "tv" : "movie";
    const res = await fetch(`${TMDB_API_URL}/${type}/${tmdbId}?api_key=${TMDB_API_KEY}`);
    if (!res.ok) return { title: "Unknown", year: "N/A", runtime: "90 Minutes" };
    const data = await res.json();
    let runtime = data.runtime;
    if (mediaType === "tv") {
      try {
        const epRes = await fetch(
          `${TMDB_API_URL}/tv/${tmdbId}/season/${season || 1}/episode/${episode || 1}?api_key=${TMDB_API_KEY}`
        );
        if (epRes.ok) {
          const epData = await epRes.json();
          if (epData.runtime) runtime = epData.runtime;
        }
      } catch { }
    }
    return {
      title: mediaType === "tv" ? data.name : data.title,
      year: (mediaType === "tv" ? data.first_air_date : data.release_date || "").substring(0, 4),
      runtime: runtime ? `${runtime} Minutes` : (mediaType === "tv" ? "45 Minutes" : "90 Minutes")
    };
  } catch {
    return { title: "Unknown", year: "N/A", runtime: "90 Minutes" };
  }
}

async function resolveStream(serverName, entry, meta) {
  try {
    const masterUrl = await decryptAesGcm(entry.url);
    if (!/^https?:\/\//i.test(masterUrl)) return null;
    const res = await fetch(masterUrl, { headers: HEADERS });
    if (!res.ok) return null;
    const variant = extractTopVariant(await res.text(), masterUrl);
    if (!variant) return null;
    const quality = resolutionLabel(variant.width, variant.height);
    const server = String(serverName).replace(/\s*(1080p\s+)?server\s*2\s*$/gi, "").trim();
    const title = formatStreamTitle(quality, meta);
    return {
      name: `Vidrock \u2022 ${server}`,
      title: `Vidrock \u2022 ${server}`,
      url: masterUrl,
      quality,
      headers: HEADERS,
      subtitles: [],
      _serverKey: serverName,
      _rawQuality: quality
    };
  } catch {
    return null;
  }
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    if (mediaType === "tv" && (season == null || episode == null)) return [];
    const id = parseInt(tmdbId, 10);
    if (!id) return [];
    const path = mediaType === "tv"
      ? `tv/${id}/${season}/${episode}`
      : `movie/${id}`;
    const res = await fetch(`${BASE_URL}/api/${path}`, { headers: HEADERS });
    if (!res.ok) return [];
    const data = await res.json().catch(() => null);
    if (!data || typeof data !== "object" || data.error) return [];
    const entries = Object.keys(data)
      .map(name => ({ name, entry: data[name] }))
      .filter(e => e.entry && typeof e.entry === "object" && e.entry.url);
    if (!entries.length) return [];
    const meta = await fetchMediaMeta(id, mediaType, season, episode);
    const resolved = await Promise.all(
      entries.map(e => resolveStream(e.name, e.entry, meta))
    );
    const seen = new Set();
    let streams = resolved.filter(s => {
      if (!s || seen.has(s.url)) return false;
      seen.add(s.url);
      return true;
    });

    streams.sort((a, b) => resWeight(b._rawQuality) - resWeight(a._rawQuality));

    const total = streams.length;
    streams = streams.map((s, i) => {
      const tag = getInvertedSortTag(total - i, total + 1);
      return Object.assign({}, s, { name: tag + s.name });
    });

    return streams;
  } catch {
    return [];
  }
}

module.exports = { getStreams };