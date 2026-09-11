"use strict";
const cheerio = require("cheerio");
const PROVIDER_NAME = "Anikoto";
const TMDB_API_URL = "https://api.themoviedb.org/3";
const TMDB_API_KEY = "307b7b8ef035c6aa336900aef4e203bd";
const BASE_URL = "https://anikototv.to";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
  "Referer": BASE_URL + "/",
  "x-requested-with": "XMLHttpRequest",
};
const PAGE_HEADERS = {
  "User-Agent": HEADERS["User-Agent"],
  "Referer": BASE_URL + "/",
};

async function safeFetch(url, options) {
  try {
    const res = await fetch(url, options);
    return res.ok ? res : null;
  } catch {
    return null;
  }
}

async function fetchJson(url, options) {
  try {
    const res = await safeFetch(url, options);
    if (!res) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchText(url, options) {
  try {
    const res = await safeFetch(url, options);
    if (!res) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function getTmdbInfo(tmdbId, mediaType) {
  if (!TMDB_API_KEY) return null;
  const endpoint = mediaType === "tv" ? "tv" : "movie";
  const data = await fetchJson(
    `${TMDB_API_URL}/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}`
  );
  if (!data) return null;
  return {
    title: mediaType === "tv" ? (data.name || data.original_name) : (data.title || data.original_title),
    year: (data.first_air_date || data.release_date || "").slice(0, 4),
  };
}

async function searchAnime(title, year) {
  const url = `${BASE_URL}/filter?keyword=${encodeURIComponent(title)}&type=&year%5B%5D=${year}&ep_min=&ep_max=&sort=default`;
  const html = await fetchText(url, { headers: PAGE_HEADERS });
  if (!html) return null;
  const $ = cheerio.load(html);
  return $("div.tip.ani").attr("data-tip") || null;
}

async function getEpisodeDataIds(dataTip, episode) {
  const url = `${BASE_URL}/ajax/episode/list/${dataTip}?vrf=`;
  const data = await fetchJson(url, { headers: HEADERS });
  if (!data || !data.result) return null;

  const cheerio = require("cheerio");
  const $ = cheerio.load(data.result);
  const anchor = $(`ul.ep-range li a[data-num='${episode}']`);
  if (!anchor.length) return null;
  return anchor.attr("data-ids") || null;
}

async function getServers(dataIds) {
  const url = `${BASE_URL}/ajax/server/list?servers=${dataIds}`;
  const data = await fetchJson(url, { headers: HEADERS });
  if (!data || !data.result) return [];

  const cheerio = require("cheerio");
  const $ = cheerio.load(data.result);
  const servers = [];

  $("div.servers div.type").each((i, typeEl) => {
    const type = $(typeEl).attr("data-type") || "sub";
    $(typeEl).find("ul li").each((j, li) => {
      const linkId = $(li).attr("data-link-id");
      const serverName = $(li).text().trim();
      if (linkId) servers.push({ type, linkId, serverName });
    });
  });
  return servers;
}

async function getEmbedUrl(linkId) {
  const data = await fetchJson(
    `${BASE_URL}/ajax/server?get=${linkId}`,
    { headers: HEADERS }
  );
  return data && data.result && data.result.url ? data.result.url : null;
}

async function extractMegaPlay(embedUrl, type, serverName) {
  const hostMatch = embedUrl.match(/^(https?:\/\/[^/]+)/);
  const host = hostMatch ? hostMatch[1] : "";

  const html = await fetchText(embedUrl, {
    headers: { "User-Agent": HEADERS["User-Agent"], "Referer": BASE_URL + "/" }
  });
  if (!html) return [];

  const cheerio = require("cheerio");
  const $ = cheerio.load(html);
  const playerEl = $("#megaplay-player");

  let streamId = playerEl.attr("data-id") || playerEl.attr("data-realid");
  if (!streamId) {
    const m = embedUrl.match(/\/stream\/s-\d+\/(\d+)\//);
    if (m) streamId = m[1];
  }
  if (!streamId) return [];

  const streamType = embedUrl.includes("/dub") ? "dub" : type;

  const sourcesRes = await fetchJson(
    `${host}/stream/getSources?id=${streamId}&type=${streamType}`,
    { headers: { "Referer": embedUrl } }
  );
  if (!sourcesRes || !sourcesRes.sources || !sourcesRes.sources.file) return [];

  const m3u8 = sourcesRes.sources.file;
  const playbackHeaders = {
    "Referer": host + "/",
    "Origin": host,
    "User-Agent": HEADERS["User-Agent"],
  };

  const typeLabel = streamType === "dub" ? "English" : streamType === "hsub" ? "Japanese [Hard Sub]" : "Japanese [Sub]";

  const stream = {
    name: `${PROVIDER_NAME} • ${typeLabel}`,
    title: `${PROVIDER_NAME} • ${typeLabel}`,
    quality: "1080p",
    headers: playbackHeaders,
    url: m3u8,
  };

  if (sourcesRes.tracks && sourcesRes.tracks.length) {
    stream.subtitles = sourcesRes.tracks
      .filter(t => (t.kind === "captions" || t.kind === "subtitles") && t.file)
      .map(t => ({
        url: t.file,
        language: t.label || "Unknown",
        headers: playbackHeaders,
      }));
  }

  return [stream];
}

async function processServer(server) {
  try {
    const embedUrl = await getEmbedUrl(server.linkId);
    if (!embedUrl) return [];

    const isMegaPlay = (
      embedUrl.includes("megaplay.buzz") ||
      embedUrl.includes("vidwish.live") ||
      embedUrl.includes("vidtube.site")
    );

    if (isMegaPlay) {
      return await extractMegaPlay(embedUrl, server.type, server.serverName);
    }

    return [];
  } catch {
    return [];
  }
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    if (mediaType !== "tv") return [];
    if (episode == null) return [];
    if (!TMDB_API_KEY) return [];

    const info = await getTmdbInfo(tmdbId, mediaType);
    if (!info || !info.title) return [];
    const { title, year } = info;

    const dataTip = await searchAnime(title, year);
    if (!dataTip) return [];

    const dataIds = await getEpisodeDataIds(dataTip, episode);
    if (!dataIds) return [];

    const servers = await getServers(dataIds);
    if (!servers.length) return [];

    const results = await Promise.all(servers.map(s => processServer(s)));
    const all = results.flat();

    const seen = new Set();
    return all.filter(s => s.url && !seen.has(s.url) && seen.add(s.url));

  } catch {
    return [];
  }
}

module.exports = { getStreams };