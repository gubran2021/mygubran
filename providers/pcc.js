var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

// src/formatter.js
var require_formatter = __commonJS({
  "src/formatter.js"(exports2, module2) {
    function normalizePlaybackHeaders(headers) {
      if (!headers || typeof headers !== "object") return headers;
      const normalized = {};
      for (const [key, value] of Object.entries(headers)) {
        if (value == null) continue;
        const lowerKey = String(key).toLowerCase();
        if (lowerKey === "user-agent") normalized["User-Agent"] = value;
        else if (lowerKey === "referer" || lowerKey === "referrer") normalized["Referer"] = value;
        else if (lowerKey === "origin") normalized["Origin"] = value;
        else if (lowerKey === "accept") normalized["Accept"] = value;
        else if (lowerKey === "accept-language") normalized["Accept-Language"] = value;
        else normalized[key] = value;
      }
      return normalized;
    }
    function shouldForceNotWebReadyForPlugin(stream, providerName, headers, behaviorHints) {
      const text = [
        stream == null ? void 0 : stream.url,
        stream == null ? void 0 : stream.name,
        stream == null ? void 0 : stream.title,
        stream == null ? void 0 : stream.server,
        providerName
      ].filter(Boolean).join(" ").toLowerCase();
      if (text.includes("loadm") || text.includes("loadm.cam") || text.includes("mixdrop") || text.includes("mxcontent")) {
        return true;
      }
      return false;
    }
    function normalizeProviderId(providerName) {
      const normalized = String(providerName || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
      return normalized || void 0;
    }
    function normalizeEpisodeTemplate(value) {
      return String(value || "").replace(
        /\b(\d{1,3})[xX](\d{1,3})\b/g,
        (_, season, episode) => `S${season.padStart(2, "0")}E${episode.padStart(2, "0")}`
      ).replace(
        /\bS(\d{1,3})\s*E(\d{1,3})\b/gi,
        (_, season, episode) => `S${season.padStart(2, "0")}E${episode.padStart(2, "0")}`
      );
    }
    function formatStream2(stream, providerName) {
      let quality = stream.quality || "";
      if (quality === "2160p") quality = "\u{1F525}4K UHD";
      else if (quality === "1440p") quality = "\u2728 QHD";
      else if (quality === "1080p") quality = "\u{1F680} FHD";
      else if (quality === "720p") quality = "\u{1F4BF} HD";
      else if (quality === "576p" || quality === "480p" || quality === "360p" || quality === "240p") quality = "\u{1F4A9} Low Quality";
      else if (!quality || ["auto", "unknown", "unknow"].includes(String(quality).toLowerCase())) quality = "\u{1F4BF} HD";
      const normalizedTitle = normalizeEpisodeTemplate(stream.title || "Stream");
      let title = `\u{1F4C1} ${normalizedTitle}`;
      let language = stream.language;
      if (language === "Italian") {
        language = "\u{1F1EE}\u{1F1F9}";
      } else if (stream.name && (stream.name.includes("SUB ITA") || stream.name.includes("SUB"))) {
        language = "\u{1F1EF}\u{1F1F5} \u{1F1EE}\u{1F1F9}";
      } else if (normalizedTitle.includes("SUB ITA") || normalizedTitle.includes("SUB")) {
        language = "\u{1F1EF}\u{1F1F5} \u{1F1EE}\u{1F1F9}";
      } else if (language === void 0 || language === null) {
        language = "";
      }
      let details = [];
      if (stream.size) details.push(`\u{1F4E6} ${stream.size}`);
      const desc = details.join(" | ");
      let pName = stream.name || stream.server || providerName;
      if (pName) {
        pName = pName.replace(/\s*\[?\(?\s*SUB\s*ITA\s*\)?\]?/i, "").replace(/\s*\[?\(?\s*ITA\s*\)?\]?/i, "").replace(/\s*\[?\(?\s*SUB\s*\)?\]?/i, "").replace(/\(\s*\)/g, "").replace(/\[\s*\]/g, "").trim();
      }
      if (pName === providerName) {
        pName = pName.charAt(0).toUpperCase() + pName.slice(1);
      }
      if (pName) {
        pName = `\u{1F4E1} ${pName}`;
      }
      const behaviorHints = stream.behaviorHints && typeof stream.behaviorHints === "object" ? __spreadValues({}, stream.behaviorHints) : {};
      let finalHeaders = stream.headers;
      if (behaviorHints.proxyHeaders && behaviorHints.proxyHeaders.request) {
        finalHeaders = behaviorHints.proxyHeaders.request;
      } else if (behaviorHints.headers) {
        finalHeaders = behaviorHints.headers;
      }
      finalHeaders = normalizePlaybackHeaders(finalHeaders);
      const isStreamingCommunityProvider = String(providerName || "").toLowerCase() === "streamingcommunity" || String((stream == null ? void 0 : stream.name) || "").toLowerCase().includes("streamingcommunity");
      if (isStreamingCommunityProvider && !finalHeaders) {
        delete behaviorHints.proxyHeaders;
        delete behaviorHints.headers;
        delete behaviorHints.notWebReady;
      }
      if (finalHeaders) {
        behaviorHints.proxyHeaders = behaviorHints.proxyHeaders || {};
        behaviorHints.proxyHeaders.request = finalHeaders;
        behaviorHints.headers = finalHeaders;
      }
      const providerExplicitNotWebReady = stream.behaviorHints && "notWebReady" in stream.behaviorHints;
      const shouldForceNotWebReady = shouldForceNotWebReadyForPlugin(stream, providerName, finalHeaders, behaviorHints);
      if (!isStreamingCommunityProvider && shouldForceNotWebReady) {
        behaviorHints.notWebReady = true;
      } else if (!providerExplicitNotWebReady) {
        delete behaviorHints.notWebReady;
      }
      const finalName = pName;
      let finalTitle = `\u{1F4C1} ${normalizedTitle}`;
      if (desc) finalTitle += ` | ${desc}`;
      if (language) finalTitle += ` | ${language}`;
      const playbackReferer = stream.referer || (finalHeaders == null ? void 0 : finalHeaders.Referer) || (finalHeaders == null ? void 0 : finalHeaders.referer);
      const playbackUserAgent = stream.userAgent || (finalHeaders == null ? void 0 : finalHeaders["User-Agent"]) || (finalHeaders == null ? void 0 : finalHeaders["user-agent"]);
      return __spreadProps(__spreadValues({}, stream), {
        // Keep original properties
        name: finalName,
        title: finalTitle,
        // Metadata for Stremio UI reconstruction (safer names for RN)
        providerName: pName,
        qualityTag: quality,
        description: desc,
        originalTitle: normalizedTitle,
        // Ensure language is set for Stremio/Nuvio sorting
        language,
        // Mark as formatted
        _nuvio_formatted: true,
        behaviorHints,
        provider: stream.provider || normalizeProviderId(providerName),
        referer: playbackReferer,
        userAgent: playbackUserAgent,
        // Explicitly ensure root headers are preserved for Nuvio
        headers: finalHeaders
      });
    }
    module2.exports = { formatStream: formatStream2 };
  }
});

// src/pcc/index.js
var { formatStream } = require_formatter();
var BASE_URL = "https://www.partite.cc";
var TMDB_API_KEY = "68e094699525b18a70bab2f86b1fa706";
var MAPPING_URL = "https://animemapping.realbestia.com";
var siteEpisodeCache = /* @__PURE__ */ new Map();
var SITE_CACHE_TTL = 10 * 60 * 1e3;
function imdb(value) {
  const match = String(value || "").match(/tt\d+/i);
  return match ? match[0] : null;
}
function parsePositiveInt(value) {
  const n = Number.parseInt(String(value != null ? value : ""), 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}
function fetchAnimeMapping(provider, externalId, season, episode) {
  return __async(this, null, function* () {
    var _a, _b, _c;
    try {
      const query = new URLSearchParams({ ep: String(episode || 1), lang: "it" });
      if (season != null && Number.parseInt(season, 10) > 0) query.set("s", String(season));
      const r = yield fetch(`${MAPPING_URL}/${provider}/${externalId}?${query}`);
      if (!r.ok) return null;
      const payload = yield r.json();
      const tmdbEp = ((_a = payload == null ? void 0 : payload.mappings) == null ? void 0 : _a.tmdb_episode) || (payload == null ? void 0 : payload.tmdb_episode);
      return {
        imdbId: imdb((_c = (_b = payload == null ? void 0 : payload.mappings) == null ? void 0 : _b.ids) == null ? void 0 : _c.imdb),
        season: parsePositiveInt(tmdbEp == null ? void 0 : tmdbEp.season),
        episode: parsePositiveInt(tmdbEp == null ? void 0 : tmdbEp.episode),
        rawEpisodeNumber: parsePositiveInt(tmdbEp == null ? void 0 : tmdbEp.rawEpisodeNumber)
      };
    } catch (_) {
      return null;
    }
  });
}
function getSiteEpisodeList(imdbId) {
  return __async(this, null, function* () {
    const cached = siteEpisodeCache.get(imdbId);
    if (cached && Date.now() - cached.at < SITE_CACHE_TTL) return cached.list;
    try {
      const r = yield fetch(`${BASE_URL}/serie-tv/${imdbId}`);
      if (!r.ok) return null;
      const html = yield r.text();
      const list = [];
      const regex = /\/hls\/s(\d+)\/serial\/[^/]+\/(\d+)\/(\d+)\/playlist\.m3u8/g;
      let m;
      while ((m = regex.exec(html)) !== null) {
        list.push({ server: Number(m[1]), season: Number(m[2]), episode: Number(m[3]) });
      }
      siteEpisodeCache.set(imdbId, { at: Date.now(), list });
      return list.length ? list : null;
    } catch (_) {
      return null;
    }
  });
}
function resolveImdbId(id, type, season, episode) {
  return __async(this, null, function* () {
    const raw = String(id || "").trim();
    const direct = imdb(raw);
    const movie = String(type || "").toLowerCase() === "movie";
    if (movie) {
      if (direct) return { imdbId: direct };
      const match2 = raw.match(/^tmdb:(\d+)$/i) || raw.match(/^(\d+)$/);
      if (!match2) return null;
      try {
        const r = yield fetch(`https://api.themoviedb.org/3/movie/${match2[1]}/external_ids?api_key=${TMDB_API_KEY}`);
        return r.ok ? { imdbId: imdb((yield r.json()).imdb_id) } : null;
      } catch (_) {
        return null;
      }
    }
    const anime = raw.match(/^(kitsu|mal|anilist|anidb):(\d+)(?::(\d+))?$/i);
    if (anime) {
      const ep = anime[3] || episode || 1;
      const mapped = yield fetchAnimeMapping(anime[1].toLowerCase(), anime[2], null, 1);
      if (!(mapped == null ? void 0 : mapped.imdbId)) return null;
      return __spreadProps(__spreadValues({}, mapped), { rawEpisodeNumber: ep });
    }
    if (direct) {
      const mapped = yield fetchAnimeMapping("imdb", direct, season, episode);
      if ((mapped == null ? void 0 : mapped.imdbId) && mapped.rawEpisodeNumber) return mapped;
      return { imdbId: direct, season: parsePositiveInt(season), episode: parsePositiveInt(episode) };
    }
    const match = raw.match(/^tmdb:(\d+)$/i) || raw.match(/^(\d+)$/);
    if (!match) return null;
    try {
      const r = yield fetch(`https://api.themoviedb.org/3/tv/${match[1]}/external_ids?api_key=${TMDB_API_KEY}`);
      const imdbId = r.ok ? imdb((yield r.json()).imdb_id) : null;
      if (!imdbId) return null;
      const mapped = yield fetchAnimeMapping("imdb", imdbId, season, episode);
      if ((mapped == null ? void 0 : mapped.imdbId) && mapped.rawEpisodeNumber) return mapped;
      return { imdbId, season: parsePositiveInt(season), episode: parsePositiveInt(episode) };
    } catch (_) {
      return null;
    }
  });
}
function getStreams(id, type, season, episode) {
  return __async(this, null, function* () {
    var _a;
    const animeEpisode = String(id || "").match(/^(?:kitsu|mal|anilist|anidb):\d+:(\d+)$/i);
    let s = Number.parseInt(season, 10) || 1;
    let e = Number.parseInt((animeEpisode == null ? void 0 : animeEpisode[1]) || episode, 10) || 1;
    const resolved = yield resolveImdbId(id, type, s, e);
    const info = typeof resolved === "string" ? { imdbId: resolved } : resolved;
    if (!(info == null ? void 0 : info.imdbId)) return [];
    const finalImdbId = info.imdbId;
    const movie = String(type || "").toLowerCase() === "movie";
    let siteSeason = null;
    let siteEpisode = null;
    let preferredServer = null;
    if (!movie && info.rawEpisodeNumber) {
      const list = yield getSiteEpisodeList(finalImdbId);
      const target = list == null ? void 0 : list[info.rawEpisodeNumber - 1];
      if (target) {
        siteSeason = target.season;
        siteEpisode = target.episode;
        preferredServer = target.server;
      }
    }
    if (siteSeason == null) {
      const ms = parsePositiveInt(info.season);
      const me = parsePositiveInt(info.episode);
      siteSeason = ms != null ? ms : s;
      siteEpisode = me != null ? me : e;
    }
    let mediaTitle = "Server";
    try {
      const r = yield fetch(`https://api.themoviedb.org/3/find/${finalImdbId}?api_key=${TMDB_API_KEY}&external_source=imdb_id`);
      if (r.ok) {
        const data = yield r.json();
        const item = (_a = movie ? data.movie_results : data.tv_results) == null ? void 0 : _a[0];
        mediaTitle = (item == null ? void 0 : item.title) || (item == null ? void 0 : item.name) || mediaTitle;
      }
    } catch (_) {
    }
    const servers = [];
    if (preferredServer) servers.push(preferredServer);
    for (const server of [1, 2, 3, 4, 5]) if (!servers.includes(server)) servers.push(server);
    const streams = [];
    for (const server of servers) {
      const path = movie ? `/hls/s${server}/movie/${finalImdbId}` : `/hls/s${server}/serial/${finalImdbId}/${siteSeason}/${siteEpisode}`;
      const url = `${BASE_URL}${path}/playlist.m3u8`;
      try {
        const r = yield fetch(url, { headers: { Referer: `${BASE_URL}/` } });
        if (r.ok) {
          const text = yield r.text();
          const heights = [...text.matchAll(/RESOLUTION=\d+x(\d+)/gi)].map((m) => Number(m[1])).filter(Boolean);
          const height = Math.max(0, ...heights);
          const quality = height >= 2160 ? "4K" : height >= 1440 ? "1440p" : height >= 1080 ? "1080p" : height >= 720 ? "720p" : height ? `${height}p` : "Unknown";
          const hasItalianAudio = /#EXT-X-MEDIA:[^\r\n]*TYPE=AUDIO[^\r\n]*(?:LANGUAGE="(?:it|ita)"|NAME="(?:Italian|Italiano))/i.test(text);
          const hasAudio = /#EXT-X-MEDIA:[^\r\n]*TYPE=AUDIO/i.test(text);
          if (hasAudio) streams.push(formatStream({ name: `Server ${server}`, title: movie ? mediaTitle : `${mediaTitle} ${siteSeason}x${siteEpisode}`, quality, language: hasItalianAudio ? "Italian" : "", type: "hls", url, behaviorHints: { notWebReady: true, proxyHeaders: { request: { Referer: `${BASE_URL}/` } } } }, "Partite.cc"));
        }
      } catch (_) {
      }
    }
    return streams.filter(Boolean);
  });
}
module.exports = { getStreams };
