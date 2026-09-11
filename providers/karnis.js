"use strict";

const TMDB_API_URL = "https://api.themoviedb.org/3";
const TMDB_API_KEY = "307b7b8ef035c6aa336900aef4e203bd";
const BASE_API = "https://api.hlowb.com";
const PKG = 'com.external.castle';
const CHANNEL = '2';
const CLIENT = '1';
const LANG = 'en-US';
const API_HEADERS = {
  "User-Agent": "okhttp/4.11.0",
  "Accept": "application/json",
  "Accept-Language": "en-US,en;q=0.9",
  "Connection": "Keep-Alive",
  "Referer": BASE_API,
};

const PLAYBACK_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
  "Accept": "video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5",
  "Accept-Language": "en-US,en;q=0.9",
  "Connection": "keep-alive",
  "Sec-Fetch-Dest": "video",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-origin",
};

const RESOLUTIONS = [3, 2];
const QUALITY_NAME_MAP = { "3": "1080p", "2": "720p", "1": "480p" };
const KARNIS_SUFFIX = "T!BgJB";
const ALLOWED_LANGS = new Set(["english", "hindi", "bangla", "bengali"]);

function isAllowedLang(name) {
  if (!name) return false;
  const n = name.toLowerCase();
  for (const l of ALLOWED_LANGS) if (n.includes(l)) return true;
  return false;
}

async function makeRequest(url, options = {}) {
  if (typeof url !== "string" || !url.startsWith("https://"))
    throw new Error("Invalid URL: Only HTTPS is allowed");

  const response = await fetch(url, {
    method: options.method || "GET",
    headers: options.headers ? { ...API_HEADERS, ...options.headers } : API_HEADERS,
    body: options.body,
  });

  if (!response.ok)
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);

  return response;
}

async function extractCipherFromResponse(response) {
  const text = (await response.text()).trim();
  if (!text) throw new Error("Empty response");

  try {
    const json = JSON.parse(text);
    if (json?.data && typeof json.data === "string") return json.data.trim();
  } catch (_) { }

  return text;
}

function extractDataBlock(obj) {
  return (obj?.data && typeof obj.data === "object") ? obj.data : (obj || {});
}

function resolutionToQuality(resolution) {
  return QUALITY_NAME_MAP[String(resolution)] || `${resolution}p`;
}

function getQualityValue(quality) {
  if (!quality) return 0;
  const clean = quality.toString().toLowerCase()
    .replace(/^(sd|hd|fhd|uhd|4k)\s*/i, "")
    .replace(/p$/, "")
    .trim();
  const map = {
    "4k": 2160, "2160": 2160, "1440": 1440, "1080": 1080,
    "720": 720, "480": 480, "360": 360, "240": 240,
  };
  return map[clean] ?? (parseInt(clean) || 0);
}

function formatSize(sizeValue) {
  if (typeof sizeValue !== "number" || sizeValue <= 0) return "Unknown";
  return sizeValue > 1e9
    ? `${(sizeValue / 1e9).toFixed(2)} GB`
    : `${(sizeValue / 1e6).toFixed(0)} MB`;
}

async function decryptKarnis(encryptedB64, securityKeyB64) {
  const CryptoJS = require("crypto-js");

  if (typeof __crypto_aes_decrypt_raw !== "undefined") {
    const originalDecrypt = CryptoJS.AES.decrypt;
    CryptoJS.AES.decrypt = function (cipher, key, options) {
      try {
        const waToBytes = (wa) => {
          const bytes = new Uint8Array(wa.sigBytes);
          for (let i = 0; i < wa.sigBytes; i++)
            bytes[i] = (wa.words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
          return bytes;
        };

        const ciphertextBytes =
          typeof cipher === "string"
            ? new Uint8Array(Array.from(atob(cipher), c => c.charCodeAt(0)))
            : cipher.ciphertext
              ? waToBytes(cipher.ciphertext)
              : new Uint8Array(cipher);

        const kBytes = waToBytes(key);
        const ivBytes = options?.iv ? waToBytes(options.iv) : new Uint8Array(0);

        const toArg = (u8) => typeof Int8Array !== "undefined"
          ? new Int8Array(u8.buffer) : u8;

        const resBytes = __crypto_aes_decrypt_raw(
          "AES-CBC", toArg(kBytes), toArg(ivBytes), toArg(ciphertextBytes)
        );
        const plain = new TextDecoder().decode(resBytes);
        return { toString: () => plain };
      } catch (_) {
        return originalDecrypt.call(CryptoJS.AES, cipher, key, options);
      }
    };
  }

  const keyMaterial = CryptoJS.enc.Base64.parse(securityKeyB64)
    .concat(CryptoJS.enc.Utf8.parse(KARNIS_SUFFIX));

  let finalKey;
  if (keyMaterial.sigBytes < 16) {
    finalKey = keyMaterial.concat(
      CryptoJS.lib.WordArray.create(new Array(16 - keyMaterial.sigBytes).fill(0))
    );
  } else if (keyMaterial.sigBytes > 16) {
    finalKey = CryptoJS.lib.WordArray.create(keyMaterial.words.slice(0, 4), 16);
  } else {
    finalKey = keyMaterial;
  }

  const decrypted = CryptoJS.AES.decrypt(encryptedB64, finalKey, {
    iv: finalKey,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  const result = decrypted.toString(CryptoJS.enc.Utf8);
  if (!result) throw new Error("Decryption resulted in empty string");
  return result;
}

async function getTMDBDetails(tmdbId, mediaType) {
  const endpoint = mediaType === "tv" ? "tv" : "movie";
  const url = `${TMDB_API_URL}/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`;
  const data = await (await makeRequest(url)).json();
  const title = mediaType === "tv" ? data.name : data.title;
  const releaseDate = mediaType === "tv" ? data.first_air_date : data.release_date;
  return { title, year: releaseDate ? parseInt(releaseDate) : null, tmdbId };
}

async function getSecurityKey() {
  const url = `${BASE_API}/v0.1/system/getSecurityKey/1?channel=${CHANNEL}&clientType=${CLIENT}&lang=${LANG}`;
  const data = await (await makeRequest(url)).json();
  if (data.code !== 200 || !data.data)
    throw new Error(`Security key API error: ${JSON.stringify(data)}`);
  return data.data;
}

async function karnisRequest(url, options) {
  const cipher = await extractCipherFromResponse(await makeRequest(url, options));
  const decrypted = await decryptKarnis(cipher, options._securityKey);
  return JSON.parse(decrypted);
}

async function searchKarnis(securityKey, keyword, page = 1, size = 30) {
  const params = new URLSearchParams({
    channel: CHANNEL, clientType: CLIENT, keyword, lang: LANG,
    mode: "1", packageName: PKG, page: String(page), size: String(size),
  });
  return karnisRequest(
    `${BASE_API}/film-api/v2.1.2/movie/searchByKeyword?${params}`,
    { _securityKey: securityKey }
  );
}

async function getDetails(securityKey, movieId) {
  return karnisRequest(
    `${BASE_API}/film-api/v2.1.2/movie?channel=${CHANNEL}&clientType=${CLIENT}&lang=${LANG}&movieId=${movieId}&packageName=${PKG}`,
    { _securityKey: securityKey }
  );
}

function buildVideoBody(base, extras) {
  return JSON.stringify({
    mode: "1", appMarket: "IndiaAGuanWang",
    clientType: CLIENT,
    woolUser: "false", apkSignKey: "ED0955EB04E67A1D9F3305B95454FED485261475",
    androidVersion: "13", isNewUser: "true", packageName: PKG,
    ...base, ...extras,
  });
}

async function getVideoV1(securityKey, movieId, episodeId, languageId, resolution = 2) {
  return karnisRequest(
    `${BASE_API}/film-api/v2.0.7/movie/getVideo2?clientType=${CLIENT}&packageName=${PKG}&channel=${CHANNEL}&lang=${LANG}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: buildVideoBody(
        { movieId: String(movieId), episodeId: String(episodeId), resolution: String(resolution) },
        { languageId: String(languageId) }
      ),
      _securityKey: securityKey,
    }
  );
}

async function getVideo2(securityKey, movieId, episodeId, resolution = 2) {
  return karnisRequest(
    `${BASE_API}/film-api/v2.0.7/movie/getVideo2?clientType=${CLIENT}&packageName=${PKG}&channel=${CHANNEL}&lang=${LANG}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: buildVideoBody({
        movieId: String(movieId), episodeId: String(episodeId), resolution: String(resolution),
      }, {}),
      _securityKey: securityKey,
    }
  );
}

async function findKarnisMovieId(securityKey, tmdbInfo) {
  const searchTerm = tmdbInfo.year ? `${tmdbInfo.title} ${tmdbInfo.year}` : tmdbInfo.title;
  const searchResult = await searchKarnis(securityKey, searchTerm);
  const rows = extractDataBlock(searchResult).rows || [];
  if (!rows.length) throw new Error("No search results found");

  const searchTitle = tmdbInfo.title.toLowerCase();
  const match = rows.find((item) => {
    const t = (item.title || item.name || "").toLowerCase();
    return t.includes(searchTitle) || searchTitle.includes(t);
  }) || rows[0];

  const id = match.id || match.redirectId || match.redirectIdStr;
  if (!id) throw new Error("Could not extract movie ID from search results");
  return id.toString();
}

function processVideoResponse(videoData, mediaInfo, seasonNum, episodeNum, resolution, languageInfo) {
  const data = extractDataBlock(videoData);
  const videoUrl = data.videoUrl;
  if (!videoUrl) return [];

  const subtitles = (data.subtitles || [])
    .filter((s) => s.url)
    .map((s) => ({
      url: s.url,
      language: s.abbreviate || "Unknown",
      name: s.title || s.abbreviate || "Unknown",
      headers: PLAYBACK_HEADERS,
    }));

  let mediaTitle = mediaInfo.title || "Unknown";
  if (seasonNum && episodeNum) {
    mediaTitle = `${mediaInfo.title} S${String(seasonNum).padStart(2, "0")}E${String(episodeNum).padStart(2, "0")}`;
  } else if (mediaInfo.year) {
    mediaTitle += ` (${mediaInfo.year})`;
  }

  const quality = resolutionToQuality(resolution);

  const makeStream = (url, rawQuality, size) => {
    const q = (rawQuality || quality).replace(/^(SD|HD|FHD)\s+/i, "");
    if (getQualityValue(q) < 720) return null;
    return {
      name: `Castle${languageInfo ? ` • ${languageInfo}` : ""}${/preview/i.test(url) ? " (preview)" : ""}`,
      title: `Castle${languageInfo ? ` • ${languageInfo}` : ""}${/preview/i.test(url) ? " (preview)" : ""}`,
      url,
      quality: q,
      size: formatSize(size),
      headers: PLAYBACK_HEADERS,
      subtitles,
    };
  };

  if (data.videos?.length) {
    return data.videos
      .map((v) => makeStream(v.url || videoUrl, v.resolutionDescription || v.resolution, v.size))
      .filter(Boolean);
  }

  const s = makeStream(videoUrl, quality, data.size);
  return s ? [s] : [];
}

async function getStreams(tmdbId, mediaType, season, episode) {
  if (mediaType === "tv" && (season == null || episode == null)) return [];

  try {
    const [tmdbInfo, securityKey] = await Promise.all([
      getTMDBDetails(tmdbId, mediaType),
      getSecurityKey(),
    ]);

    const rootMovieId = await findKarnisMovieId(securityKey, tmdbInfo);
    let currentMovieId = rootMovieId;

    if (mediaType === "tv" && season != null) {
      const rootData = extractDataBlock(await getDetails(securityKey, rootMovieId));
      const seasons = rootData.seasons || [];
      if (seasons.length > 1) {
        const seasonObj = seasons.find((s) => s.number === season);
        if (seasonObj?.movieId && seasonObj.movieId.toString() !== rootMovieId)
          currentMovieId = seasonObj.movieId.toString();
      }
    }

    const detailsData = extractDataBlock(await getDetails(securityKey, currentMovieId));
    const episodes = detailsData.episodes || [];

    const episodeObj = mediaType === "tv" && episode != null
      ? (episodes.find((e) => e.number === episode) ?? null)
      : (episodes[0] ?? null);

    if (!episodeObj?.id) throw new Error("Could not find episode");
    const episodeId = episodeObj.id.toString();

    const tracks = (episodeObj.tracks || []).filter((t) => isAllowedLang(t.languageName || t.abbreviate));
    const hasIndivVideo = tracks.some((t) => t?.existIndividualVideo === true);
    const allStreams = [];

    async function tryResolutions(fetchFn) {
      for (const res of RESOLUTIONS) {
        try {
          const streams = processVideoResponse(
            await fetchFn(res), tmdbInfo, season, episode, res, null
          );
          if (streams.length) { allStreams.push(...streams); return true; }
        } catch (_) { }
      }
      return false;
    }

    if (!hasIndivVideo) {
      await tryResolutions((res) => getVideo2(securityKey, currentMovieId, episodeId, res));
    } else {
      let loaded = false;
      for (const track of tracks) {
        if (!track || track.languageId == null) continue;
        const langName = track.languageName || track.abbreviate || "Unknown";
        for (const res of RESOLUTIONS) {
          try {
            const streams = processVideoResponse(
              await getVideoV1(securityKey, currentMovieId, episodeId, track.languageId, res),
              tmdbInfo, season, episode, res, langName
            );
            if (streams.length) { allStreams.push(...streams); loaded = true; }
          } catch (_) { }
        }
      }
      if (!loaded)
        await tryResolutions((res) => getVideo2(securityKey, currentMovieId, episodeId, res));
    }

    const withQv = allStreams.map((s) => [s, getQualityValue(s.quality)]);
    withQv.sort((a, b) => b[1] - a[1]);

    const seen = new Set();
    return withQv.map(([s]) => s).filter(s => s.url && !seen.has(s.url) && seen.add(s.url));

  } catch (_) {
    return [];
  }
}

module.exports = { getStreams };