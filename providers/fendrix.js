"use strict";

const PROVIDER_NAME = "VidKing";
const SPEED_API_BASE = "https://api.speedracelight.com";
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_KEY = "307b7b8ef035c6aa336900aef4e203bd";

const REQUEST_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
  "Origin": "https://www.vidking.net",
  "Referer": "https://www.vidking.net/",
};

const SERVERS = [
  { name: "Yoru", endpoint: "cdn/sources-with-title" },
  { name: "Omen", endpoint: "lamovie/sources-with-title", qualityFilter: "Vimeos" },
];

const ITIR = 8;
const SIZE = 61;
const RL = 2654435769;
const ENC = [
  1116352408, 1899447441, 3049323471, 3921009573, 961987163, 1508970993,
  2453635748, 2870763221, 3624381080, 310598401, 607225278, 1426881987,
  1925078388, 2162078206, 2614888103, 3248222580,
];
const INI_ENC = [1732584193, 4023233417, 2562383102, 271733878];
const SF = [109, 118, 109, 49];

function avalancheMix(value) {
  value >>>= 0;
  value ^= value >>> 16;
  value = Math.imul(value, 2246822507) >>> 0;
  value ^= value >>> 13;
  value = Math.imul(value, 3266489909) >>> 0;
  value ^= value >>> 16;
  return value >>> 0;
}

function rotateLeft(value, shift) {
  value >>>= 0;
  shift &= 31;
  return shift === 0 ? value >>> 0 : ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

function computeSeedHash(seed) {
  let hash = INI_ENC[0] >>> 0;
  for (let i = 0; i < seed.length; i++) {
    hash = rotateLeft((hash ^ Math.imul(seed.charCodeAt(i), ENC[i & 15])) >>> 0, 5);
  }
  return avalancheMix(hash);
}

function buildPermutationTable(seed) {
  const state = new Array(256);
  for (let i = 0; i < 256; i++) state[i] = i;
  let cursor = 0;
  for (let i = 0; i < 256; i++) {
    cursor = (cursor + state[i] + seed.charCodeAt(i % seed.length)) & 255;
    const tmp = state[i];
    state[i] = state[cursor];
    state[cursor] = tmp;
  }
  return state;
}

function computeFnvHash(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash = Math.imul(hash ^ value.charCodeAt(i), 16777619) >>> 0;
  }
  return avalancheMix(hash);
}

function combineWithMask(left, right, mask) {
  return (((left ^ right) >>> 0) | ((left & right & mask) >>> 0)) >>> 0;
}

function createCipher(seed, mediaId) {
  if ((seed.length * (seed.length + 1) & 1) === 1) {
    return { state: buildPermutationTable(seed), accumulator: computeSeedHash(seed) };
  }
  const state = new Array(SIZE);
  let accumulator = avalancheMix(computeFnvHash(seed) ^ avalancheMix((mediaId >>> 0) ^ RL)) >>> 0;
  for (let round = 0; round < ITIR; round++) {
    if ((round * (round + 1) & 1) === 0) {
      const index = accumulator % SIZE;
      accumulator = rotateLeft((accumulator + RL) >>> 0, 7 + (round & 7));
      state[index] = (accumulator ^ avalancheMix(accumulator)) >>> 0;
      accumulator = avalancheMix((accumulator + index) >>> 0);
    } else {
      state[round] = ENC[round & 15];
    }
  }
  return { state, accumulator: avalancheMix(accumulator ^ 2779096485) >>> 0 };
}

function generateNextCipherWord(cipher, index) {
  const state = cipher.state;
  let accumulator = cipher.accumulator;
  const stateIndex = accumulator % SIZE;
  const mask = 0 - Number(stateIndex in state);
  const stateValue = state[stateIndex] >>> 0;
  const offset = Math.imul(RL, index + 1) >>> 0;
  let value = combineWithMask(accumulator, (stateValue ^ offset) >>> 0, mask);
  value = (rotateLeft((value + accumulator) >>> 0, stateIndex & 31) ^
    rotateLeft(accumulator, (Math.imul(stateIndex, 7)) & 31)) >>> 0;
  accumulator = avalancheMix((value + RL) >>> 0);
  state[stateIndex] = accumulator >>> 0;
  cipher.accumulator = accumulator;
  return accumulator >>> 0;
}

function deriveKeyStream(seed, mediaId, length) {
  const cipher = createCipher(seed, mediaId);
  const output = new Uint8Array(length);
  let wordIndex = 0;
  for (let i = 0; i < length;) {
    const word = generateNextCipherWord(cipher, wordIndex++);
    output[i++] = word & 255;
    if (i < length) output[i++] = (word >>> 8) & 255;
    if (i < length) output[i++] = (word >>> 16) & 255;
    if (i < length) output[i++] = (word >>> 24) & 255;
  }
  return output;
}

function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function utf8Decode(bytes) {
  let output = "";
  for (let i = 0; i < bytes.length;) {
    const first = bytes[i++];
    if (first < 128) {
      output += String.fromCharCode(first);
    } else if (first < 224) {
      const second = bytes[i++];
      output += String.fromCharCode(((first & 31) << 6) | (second & 63));
    } else if (first < 240) {
      const second = bytes[i++];
      const third = bytes[i++];
      output += String.fromCharCode(((first & 15) << 12) | ((second & 63) << 6) | (third & 63));
    } else {
      const second = bytes[i++];
      const third = bytes[i++];
      const fourth = bytes[i++];
      let cp = ((first & 7) << 18) | ((second & 63) << 12) | ((third & 63) << 6) | (fourth & 63);
      cp -= 65536;
      output += String.fromCharCode(55296 + (cp >> 10), 56320 + (cp & 1023));
    }
  }
  return output;
}

function decryptAndValidatePayload(payload, seed, mediaId) {
  const bytes = base64UrlDecode(payload);
  const keyStream = deriveKeyStream(seed, mediaId, bytes.length);
  for (let i = 0; i < bytes.length; i++) bytes[i] ^= keyStream[i];
  for (let i = 0; i < SF.length; i++) {
    if (bytes[i] !== SF[i]) throw new Error("Invalid response signature");
  }
  return utf8Decode(bytes.subarray(SF.length));
}

async function fetchJson(url, options) {
  try {
    const res = await fetch(url, options);
    if (!res.ok) {
      return null;
    }
    return await res.json();
  } catch (e) {
    return null;
  }
}

function normalizeQuality(raw) {
  const s = String(raw || "").toLowerCase();
  if (s === "vimeos") return "1080p";
  if (s.includes("2160") || s.includes("4k")) return "2160p";
  if (s.includes("1080")) return "1080p";
  if (s.includes("720")) return "720p";
  if (s.includes("480")) return "480p";
  return "Unknown";
}

function dedupeByUrl(streams) {
  const seen = new Set();
  return streams.filter(s => s.url && !seen.has(s.url) && seen.add(s.url));
}

function normalizeSubtitles(subtitles) {
  if (!Array.isArray(subtitles)) return [];
  return subtitles
    .filter(sub => sub && sub.url)
    .map(sub => ({
      url: sub.url,
      language: sub.language || sub.lang || "Unknown",
      name: sub.label || sub.display || sub.language || sub.lang || "Subtitle",
    }));
}

async function fetchMetadata(tmdbId, mediaType) {
  const endpoint = mediaType === "tv" ? "tv" : "movie";
  const data = await fetchJson(
    `${TMDB_BASE}/${endpoint}/${tmdbId}?api_key=${TMDB_KEY}&append_to_response=external_ids`
  );
  if (!data) return null;
  return {
    title: mediaType === "tv" ? data.name : data.title,
    year: String(new Date((mediaType === "tv" ? data.first_air_date : data.release_date) || "").getFullYear() || ""),
    imdbId: (data.external_ids && data.external_ids.imdb_id) || "",
  };
}

function constructSourceUrl(server, request, seed) {
  const params = {
    title: request.title,
    mediaType: request.mediaType,
    year: request.year,
    episodeId: request.episode || "1",
    seasonId: request.season || "1",
    tmdbId: request.tmdbId,
    imdbId: request.imdbId,
    enc: "2",
    seed,
    _t: String(Date.now()),
  };
  const query = Object.keys(params)
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join("&");
  return `${SPEED_API_BASE}/${server.endpoint}?${query}`;
}

async function fetchServerSources(server, request, seed) {
  try {
    const res = await fetch(constructSourceUrl(server, request, seed), {
      headers: {
        ...REQUEST_HEADERS,
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
    if (!res.ok) {
      return [];
    }
    const rawText = await res.text();
    const data = JSON.parse(
      decryptAndValidatePayload(rawText, seed, Number(request.tmdbId))
    );
    if (!data || !Array.isArray(data.sources)) return [];
    const sharedSubtitles = normalizeSubtitles(data.subtitles);
    return data.sources
      .filter(source =>
        source &&
        source.url &&
        (!server.qualityFilter || source.quality === server.qualityFilter)
      )
      .map(source => {
        const quality = normalizeQuality(source.quality || source.label);
        return {
          name: `${PROVIDER_NAME} • ${server.name}`,
          title: `${PROVIDER_NAME} • ${server.name} • ${quality}`,
          url: source.url,
          quality,
          headers: { ...REQUEST_HEADERS, ...(source.headers || {}) },
          subtitles: normalizeSubtitles(source.subtitles).concat(sharedSubtitles),
        };
      });
  } catch (e) {
    return [];
  }
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    if (mediaType === "tv" && (season == null || episode == null)) return [];
    if (mediaType !== "movie" && mediaType !== "tv") return [];
    if (!tmdbId) return [];
    const [metadata, seedData] = await Promise.all([
      fetchMetadata(tmdbId, mediaType),
      fetchJson(`${SPEED_API_BASE}/seed?mediaId=${encodeURIComponent(String(tmdbId))}`, {
        headers: REQUEST_HEADERS,
      }),
    ]);
    if (!metadata) {
      return [];
    }
    if (!seedData || !seedData.seed) {
      return [];
    }
    const request = {
      mediaType,
      tmdbId: String(tmdbId),
      season: String(season != null ? season : 1),
      episode: String(episode != null ? episode : 1),
      title: metadata.title,
      year: metadata.year,
      imdbId: metadata.imdbId,
    };
    const results = await Promise.all(
      SERVERS.map(server => fetchServerSources(server, request, seedData.seed))
    );
    const streams = results.flat().filter(s =>
      s.quality === "1080p" || s.quality === "2160p"
    );
    return dedupeByUrl(streams);
  } catch (e) {
    return [];
  }
}

module.exports = { getStreams };