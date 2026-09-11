"use strict";
const API_BASE = "https://api4.aoneroom.com";
const KEY_B64_DEFAULT = "NzZpUmwwN3MweFNOOWpxbUVXQXQ3OUVCSlp1bElRSXNWNjRGWnIyTw==";
const KEY_B64_ALT = "NzZpUmwwN3MweFNOOWpxbUVXQXQ3OUVCSlp1bElRSXNWNjRGWnIyTw==";
const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_API_KEY = "307b7b8ef035c6aa336900aef4e203bd";
const BRAND_MODELS = {
  Samsung: ["SM-S918B", "SM-A528B", "SM-M336B"],
  Xiaomi: ["2201117TI", "M2012K11AI"],
  Google: ["Pixel 7", "Pixel 8"]
};
const PACKAGE_INFO = {
  package_name: "com.community.mbox.in",
  version_name: "3.0.03.0529.03",
  version_code: 50020042
};
let deviceId = "";
let selectedBrand = "";
let selectedModel = "";
let bearerToken = null;
const DUB_ALWAYS_ON = new Set(["Original Audio", "English"]);
const DUB_LANG_KEYS = {
  "Hindi": "dubHindi",
  "Tamil": "dubTamil",
  "Telugu": "dubTelugu",
  "Arabic": "dubArabic",
  "French": "dubFrench",
  "Español [Latino]": "dubEsLA",
  "Português [Brasil]": "dubPtBR",
  "Español": "dubEs",
  "Português": "dubPt",
  "Turkish": "dubTurkish",
  "Deutsch": "dubDeutsch",
  "Italiano": "dubItaliano",
  "Russian": "dubRussian",
  "Indonesian": "dubIndonesian",
  "Malay": "dubMalay",
  "Bengali": "dubBengali"
};
function isDubEnabled(lang) {
  if (DUB_ALWAYS_ON.has(lang)) return true;
  const key = DUB_LANG_KEYS[lang];
  if (!key) return false;
  const val = SCRAPER_SETTINGS[key];
  if (val === undefined || val === null) return key === "dubHindi";
  return val === true || val === "true";
}
function resWeight(qualityNum) {
  const q = parseInt(qualityNum, 10) || 0;
  if (q >= 2160) return 5;
  if (q >= 1440) return 4;
  if (q >= 1080) return 3;
  if (q >= 720) return 2;
  if (q >= 480) return 1;
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
function ensureHttps(url) {
  if (typeof url !== "string") return null;
  if (url.startsWith("http://")) return url.replace("http://", "https://");
  if (!url.startsWith("https://")) return null;
  return url;
}
function decodeJwtExpiry(token) {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return 0;
    let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) base64 += "=";
    const parsed = CryptoJS.enc.Base64.parse(base64).toString(CryptoJS.enc.Utf8);
    const json = JSON.parse(parsed);
    return json.exp || 0;
  } catch (e) {
    return 0;
  }
}
function isTokenValid(token) {
  if (!token) return false;
  return decodeJwtExpiry(token) > Date.now() / 1000 + 3600;
}
function initializeSession() {
  if (!deviceId) {
    const chars = "0123456789abcdef";
    for (let i = 0; i < 32; i++) {
      deviceId += chars[Math.floor(Math.random() * 16)];
    }
    const brands = Object.keys(BRAND_MODELS);
    selectedBrand = brands[Math.floor(Math.random() * brands.length)];
    selectedModel = BRAND_MODELS[selectedBrand][Math.floor(Math.random() * BRAND_MODELS[selectedBrand].length)];
  }
}
function md5(input) {
  return CryptoJS.MD5(input).toString(CryptoJS.enc.Hex);
}
function hmacMd5(key, data) {
  return CryptoJS.HmacMD5(data, key).toString(CryptoJS.enc.Base64);
}
function generateXClientToken(timestamp) {
  const ts = (timestamp || Date.now()).toString();
  const reversed = ts.split("").reverse().join("");
  return `${ts},${md5(reversed)}`;
}
function buildCanonicalString(method, accept, contentType, url, body, timestamp) {
  let path = "";
  let query = "";
  try {
    const urlObj = new URL(url);
    path = urlObj.pathname;
    const params = Array.from(urlObj.searchParams.keys()).sort();
    if (params.length > 0) {
      query = params.map((key) => {
        return urlObj.searchParams.getAll(key).map((val) => `${key}=${val}`).join("&");
      }).join("&");
    }
  } catch (e) {
    if (url.includes("?")) {
      const parts = url.split("?");
      path = parts[0].replace(/https?:\/\/[^\/]+/, "");
      query = parts[1].split("&").sort().join("&");
    } else {
      path = url.replace(/https?:\/\/[^\/]+/, "");
    }
  }
  const canonicalUrl = query ? `${path}?${query}` : path;
  let bodyHash = "";
  let bodyLength = "";
  if (body) {
    const bodyWords = CryptoJS.enc.Utf8.parse(body);
    bodyHash = md5(bodyWords);
    bodyLength = bodyWords.sigBytes.toString();
  }
  return `${method.toUpperCase()}\n${accept || ""}\n${contentType || ""}\n${bodyLength}\n${timestamp}\n${bodyHash}\n${canonicalUrl}`;
}
function getSecretKey(useAlt) {
  const b64 = useAlt ? KEY_B64_ALT : KEY_B64_DEFAULT;
  return CryptoJS.enc.Base64.parse(CryptoJS.enc.Base64.parse(b64).toString(CryptoJS.enc.Utf8));
}
function generateXTrSignature(method, accept, contentType, url, body, useAltKey, customTimestamp) {
  const timestamp = customTimestamp || Date.now();
  const canonical = buildCanonicalString(method, accept, contentType, url, body, timestamp);
  return `${timestamp}|2|${hmacMd5(getSecretKey(useAltKey), canonical)}`;
}
async function getCachedToken() {
  if (isTokenValid(bearerToken)) return bearerToken;
  const url = `${API_BASE}/wefeed-mobile-bff/tab/ranking-list?tabId=0&categoryType=4516404531735022304&page=1&perPage=1`;
  const res = await mavonyxRequest("GET", url, null, {}, true);
  if (res && res.headers) {
    const xUser = res.headers.get("x-user");
    if (xUser) {
      try {
        const parsed = JSON.parse(xUser);
        if (parsed.token && isTokenValid(parsed.token)) {
          bearerToken = parsed.token;
          return bearerToken;
        }
      } catch (e) { }
    }
  }
  return bearerToken || "";
}
async function mavonyxRequest(method, url, body, customHeaders, isTokenFetch) {
  customHeaders = customHeaders || {};
  isTokenFetch = isTokenFetch || false;
  initializeSession();
  const validatedUrl = ensureHttps(url);
  if (!validatedUrl) return null;
  const timestamp = Date.now();
  const headerContentType = customHeaders["Content-Type"] || (body ? "application/json; charset=utf-8" : "application/json");
  const accept = customHeaders["Accept"] || "application/json";
  const xClientInfo = JSON.stringify(Object.assign({}, PACKAGE_INFO, {
    os: "android",
    os_version: "15",
    device_id: deviceId,
    install_store: "ps",
    gaid: "d7578036d13336cc",
    brand: selectedBrand.toLowerCase(),
    model: selectedModel,
    system_language: "en",
    net: "NETWORK_WIFI",
    region: "IN",
    timezone: "Asia/Calcutta",
    sp_code: ""
  }));
  const headers = Object.assign({
    "Accept": accept,
    "Content-Type": headerContentType,
    "x-client-token": generateXClientToken(timestamp),
    "x-tr-signature": generateXTrSignature(method, accept, headerContentType, validatedUrl, body, false, timestamp),
    "User-Agent": `${PACKAGE_INFO.package_name}/${PACKAGE_INFO.version_code} (Linux; U; Android 15; en_IN; ${selectedModel}; Build/AP3A.240905.015; Cronet/133.0.6876.3)`,
    "x-client-info": xClientInfo,
    "x-client-status": "1"
  }, customHeaders);
  if (!isTokenFetch) {
    const token = await getCachedToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  const options = { method, headers };
  if (body) options.body = body;
  let retries = 2;
  while (retries > 0) {
    try {
      const res = await fetch(validatedUrl, options);
      if (!res.ok) {
        if (res.status === 403 || res.status === 429) {
          retries--;
          continue;
        }
        return null;
      }
      const text = await res.text();
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        parsed = text;
      }
      if (res.headers) {
        const xUser = res.headers.get("x-user");
        if (xUser) {
          try {
            const xUserJson = JSON.parse(xUser);
            if (xUserJson.token && isTokenValid(xUserJson.token)) {
              bearerToken = xUserJson.token;
            }
          } catch (e) { }
        }
      }
      return { data: parsed, headers: res.headers };
    } catch (err) {
      retries--;
      if (retries === 0) return null;
    }
  }
  return null;
}
async function fetchTmdbDetails(tmdbId, mediaType) {
  try {
    const endpoint = mediaType === "movie" ? "movie" : "tv";
    const url = ensureHttps(`${TMDB_BASE_URL}/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`);
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
        "Accept": "application/json"
      }
    });
    const data = await res.json();
    if (!data) return null;
    return {
      title: mediaType === "movie" ? (data.title || data.original_title) : (data.name || data.original_name),
      year: (data.release_date || data.first_air_date || "").substring(0, 4),
      originalTitle: data.original_title || data.original_name || null
    };
  } catch (e) {
    return null;
  }
}
function normalizeTitle(s) {
  if (!s) return "";
  return s
    .replace(/\[.*?\]/g, " ")
    .replace(/\(.*?|\)/g, " ")
    .replace(/\b(dub|dubbed|hd|4k|hindi|tamil|telugu|dual audio)\b/gi, " ")
    .trim()
    .toLowerCase()
    .replace(/:/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ");
}
function parseQualityNumber(value) {
  const match = String(value || "").match(/(\d{3,4})/);
  return match ? parseInt(match[1], 10) : 0;
}
function getFormatType(url) {
  const u = String(url || "").toLowerCase();
  if (u.includes(".mpd")) return "DASH";
  if (u.includes(".m3u8")) return "HLS";
  if (u.includes(".mp4")) return "MP4";
  if (u.includes(".mkv")) return "MKV";
  return "VIDEO";
}
function isUpdateVideo(url) {
  if (!url) return false;
  const u = url.toLowerCase();
  return (
    u.includes("update") ||
    u.includes("upgrade") ||
    u.includes("notice") ||
    u.includes("force_up") ||
    u.includes("forceup") ||
    u.includes("version_limit") ||
    u.includes("ver_limit") ||
    u.includes("low_version") ||
    u.includes("lowversion") ||
    u.includes("outdated") ||
    u.includes("please_update") ||
    u.includes("pleaseupdae") ||
    u.includes("app_update") ||
    u.includes("newversion") ||
    u.includes("new_version") ||
    u.includes("version_check") ||
    u.includes("vercheck") ||
    u.includes("updateapp") ||
    u.includes("update_app") ||
    u.includes("versiongate") ||
    u.includes("ver_gate") ||
    u.includes("ver-gate") ||
    u.includes("upgrade_notice") ||
    u.includes("needupgrade") ||
    u.includes("need_upgrade") ||
    u.includes("needupdate") ||
    u.includes("need_update")
  );
}
function isVersionGatedResponse(responseData) {
  if (!responseData || typeof responseData !== "object") return false;
  const UPDATE_CODES = new Set([
    "VERSION_TOO_LOW", "NEED_UPDATE", "FORCE_UPDATE",
    "LOW_VERSION", "APP_UPDATE_REQUIRED", "CLIENT_OUTDATED",
    "UPGRADE_REQUIRED", "VERSION_EXPIRED", "OUTDATED_VERSION"
  ]);
  const UPDATE_MSG_PATTERNS = /update|upgrade|version.*low|outdated|force.*update|please.*update/i;
  const code = responseData.code;
  if (code !== undefined) {
    if (UPDATE_CODES.has(String(code).toUpperCase())) return true;
    if (typeof code === "number" && (code === 4031 || code === 4032 || code === 4033)) return true;
  }
  for (const key of ["message", "msg", "reason", "error", "err", "errorMsg", "errMsg"]) {
    const val = responseData[key];
    if (typeof val === "string" && UPDATE_MSG_PATTERNS.test(val)) return true;
  }
  return false;
}
async function searchMavonyx(query) {
  try {
    const url = `${API_BASE}/wefeed-mobile-bff/subject-api/search/v2`;
    const body = JSON.stringify({ page: 1, perPage: 20, keyword: query });
    const response = await mavonyxRequest("POST", url, body);
    if (response && response.data && response.data.data && response.data.data.results) {
      let allSubjects = [];
      response.data.data.results.forEach((group) => {
        if (group.subjects) allSubjects = allSubjects.concat(group.subjects);
      });
      return allSubjects;
    }
  } catch (e) { }
  return [];
}
function findBestMatch(subjects, tmdbTitle, tmdbYear, mediaType) {
  const normTmdbTitle = normalizeTitle(tmdbTitle);
  const targetType = mediaType === "movie" ? 1 : 2;
  let bestMatch = null;
  let bestScore = 0;
  for (const subject of subjects) {
    if (subject.subjectType !== targetType) continue;
    const normTitle = normalizeTitle(subject.title);
    const year = subject.year || (subject.releaseDate ? subject.releaseDate.substring(0, 4) : null);
    let score = 0;
    if (normTitle === normTmdbTitle) score += 50;
    else if (normTitle.includes(normTmdbTitle) || normTmdbTitle.includes(normTitle)) score += 15;
    if (tmdbYear && year && tmdbYear == year) score += 35;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = subject;
    }
  }
  return bestScore >= 40 ? bestMatch : null;
}
async function fetchSubtitles(subjectId, streamId, langLabel) {
  const subtitles = [];
  try {
    const capUrl = `${API_BASE}/wefeed-mobile-bff/subject-api/get-stream-captions?subjectId=${subjectId}&streamId=${streamId}`;
    const capRes = await mavonyxRequest("GET", capUrl, null);
    if (capRes && capRes.data && capRes.data.data && Array.isArray(capRes.data.data.extCaptions)) {
      capRes.data.data.extCaptions.forEach((cap) => {
        if (!cap.url) return;
        const secureUrl = ensureHttps(cap.url);
        if (!secureUrl) return;
        subtitles.push({
          url: secureUrl,
          language: cap.language || cap.lanName || cap.lan || "en",
          name: `${cap.lanName || cap.language || "Subtitle"} (${langLabel})`,
          headers: { "Referer": API_BASE }
        });
      });
    }
  } catch (e) { }
  try {
    const extUrl = `${API_BASE}/wefeed-mobile-bff/subject-api/get-ext-captions?subjectId=${subjectId}&resourceId=${streamId}&episode=0`;
    const extRes = await mavonyxRequest("GET", extUrl, null);
    if (extRes && extRes.data && extRes.data.data && Array.isArray(extRes.data.data.extCaptions)) {
      extRes.data.data.extCaptions.forEach((cap) => {
        if (!cap.url) return;
        const secureUrl = ensureHttps(cap.url);
        if (!secureUrl) return;
        subtitles.push({
          url: secureUrl,
          language: cap.lan || cap.lanName || cap.language || "en",
          name: `${cap.lanName || cap.lan || "Subtitle"} (${langLabel})`,
          headers: { "Referer": API_BASE }
        });
      });
    }
  } catch (e) { }
  return subtitles;
}
function normalizeLang(raw) {
  const s = String(raw || "").trim();
  const key = s.toLowerCase().replace(/\b(dub|dubbed)\b/g, "").replace(/[\s_\-]+/g, "");
  const map = { "esla": "Español [Latino]", "espanollatin": "Español [Latino]", "es-la": "Español [Latino]", "ptbr": "Português [Brasil]", "portuguesbrasil": "Português [Brasil]", "pt-br": "Português [Brasil]", "original": "Original Audio", "en": "English", "english": "English", "hindi": "Hindi", "hi": "Hindi", "tamil": "Tamil", "ta": "Tamil", "telugu": "Telugu", "te": "Telugu", "arabic": "Arabic", "ar": "Arabic", "french": "French", "fr": "French", "spanish": "Español", "es": "Español", "portuguese": "Português", "pt": "Português", "turkish": "Turkish", "tr": "Turkish", "german": "Deutsch", "de": "Deutsch", "italian": "Italiano", "it": "Italiano", "russian": "Russian", "ru": "Russian", "indonesian": "Indonesian", "id": "Indonesian", "malay": "Malay", "ms": "Malay", "bengali": "Bengali", "bn": "Bengali" };
  return map[key] || s;
}
async function getStreamLinks(subjectId, season, episode) {
  try {
    const subjectUrl = `${API_BASE}/wefeed-mobile-bff/subject-api/get?subjectId=${subjectId}`;
    const detailRes = await mavonyxRequest("GET", subjectUrl);
    if (!detailRes || !detailRes.data || !detailRes.data.data) return [];
    const subjectIds = [];
    let originalLang = "Original";
    const dubs = detailRes.data.data.dubs;
    if (Array.isArray(dubs)) {
      dubs.forEach((dub) => {
        if (dub.subjectId == subjectId) {
          originalLang = dub.lanName || "Original";
        } else {
          subjectIds.push({ id: dub.subjectId, lang: normalizeLang(dub.lanName || "Unknown") });
        }
      });
    }
    subjectIds.unshift({ id: subjectId, lang: normalizeLang(originalLang) });
    const filteredSubjectIds = subjectIds.filter((item) =>
      !String(item.lang || "").toLowerCase().includes("sub") &&
      isDubEnabled(item.lang)
    );
    let allStreams = [];
    for (const item of filteredSubjectIds) {
      try {
        const playUrl = `${API_BASE}/wefeed-mobile-bff/subject-api/play-info?subjectId=${item.id}&se=${season}&ep=${episode}`;
        const playRes = await mavonyxRequest("GET", playUrl, null);
        if (!playRes || !playRes.data) continue;
        if (isVersionGatedResponse(playRes.data)) continue;
        if (!playRes.data.data) continue;
        const playData = playRes.data.data;
        if (
          playData.needUpdate === true ||
          playData.forceUpdate === true ||
          playData.code === "VERSION_TOO_LOW" ||
          playData.code === "NEED_UPDATE" ||
          isVersionGatedResponse(playData)
        ) {
          continue;
        }
        const streamsList = playData.streams;
        if (Array.isArray(streamsList) && streamsList.length > 0) {
          for (const stream of streamsList) {
            if (!stream.url) continue;
            const secureUrl = ensureHttps(stream.url);
            if (!secureUrl) continue;
            if (isUpdateVideo(secureUrl)) continue;
            const formatType = getFormatType(secureUrl);
            const qualNum = parseQualityNumber(stream.resolutions || stream.quality || "");
            if (qualNum > 0 && qualNum < 720) continue;
            const quality = qualNum ? `${qualNum}p • ${formatType}` : `Auto • ${formatType}`;
            const streamId = stream.id || `${item.id}|${season}|${episode}`;
            const subtitles = await fetchSubtitles(item.id, streamId, item.lang);
            const streamTitle = `MovieBox • ${item.lang}`;
            allStreams.push({
              name: streamTitle,
              title: streamTitle,
              url: secureUrl,
              quality,
              qualityNum: qualNum,
              headers: formatType === "MP4"
                ? (stream.signCookie ? { "Cookie": stream.signCookie } : {})
                : Object.assign(
                  {
                    "Referer": API_BASE,
                    "User-Agent": `com.community.mbox.in/${PACKAGE_INFO.version_code} (Linux; U; Android 15; en_IN; MovieBox; Build/AP3A.240905.015; Cronet/133.0.6876.3)`
                  },
                  stream.signCookie ? { "Cookie": stream.signCookie } : {}
                ),
              subtitles,
              provider: "mavonyx"
            });
          }
        } else if (Array.isArray(playData.resourceDetectors)) {
          for (const detector of playData.resourceDetectors) {
            if (!Array.isArray(detector.resolutionList)) continue;
            for (const video of detector.resolutionList) {
              if (!video.resourceLink) continue;
              const secureUrl = ensureHttps(video.resourceLink);
              if (!secureUrl) continue;
              if (isUpdateVideo(secureUrl)) continue;
              const formatType = getFormatType(secureUrl);
              const qualNum = parseQualityNumber(video.resolution);
              if (qualNum > 0 && qualNum < 720) continue;
              const quality = qualNum ? `${qualNum}p • ${formatType}` : `Auto • ${formatType}`;
              const fallbackTitle = `MovieBox • ${item.lang}`;
              allStreams.push({
                name: fallbackTitle,
                title: fallbackTitle,
                url: secureUrl,
                quality,
                qualityNum: qualNum,
                headers: formatType === "MP4"
                  ? {}
                  : {
                    "Referer": API_BASE,
                    "User-Agent": `com.community.mbox.in/${PACKAGE_INFO.version_code} (Linux; U; Android 15; en_IN; MovieBox; Build/AP3A.240905.015; Cronet/133.0.6876.3)`
                  },
                provider: "moviebox"
              });
            }
          }
        }
      } catch (err) { }
    }
    const seen = new Set();
    allStreams = allStreams.filter((s) => s.url && !seen.has(s.url) && seen.add(s.url));
    allStreams.sort((a, b) => resWeight(b.qualityNum) - resWeight(a.qualityNum));
    const total = allStreams.length;
    allStreams = allStreams.map((s, i) => {
      const tag = getInvertedSortTag(total - i, total + 1);
      return Object.assign({}, s, { name: tag + s.name, title: tag + s.title });
    });
    return allStreams.map(({ qualityNum, ...rest }) => rest);
  } catch (e) {
    return [];
  }
}
async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    if (mediaType === "tv" && (season == null || episode == null)) return [];
    const details = await fetchTmdbDetails(tmdbId, mediaType);
    if (!details) return [];
    const s = mediaType === "tv" ? season : 0;
    const e = mediaType === "tv" ? episode : 0;
    let subjects = await searchMavonyx(details.title);
    let bestMatch = findBestMatch(subjects, details.title, details.year, mediaType);
    if (!bestMatch && details.originalTitle && details.originalTitle !== details.title) {
      subjects = await searchMavonyx(details.originalTitle);
      bestMatch = findBestMatch(subjects, details.originalTitle, details.year, mediaType);
    }
    if (bestMatch) {
      return await getStreamLinks(bestMatch.subjectId, s, e);
    }
    return [];
  } catch (e) {
    return [];
  }
}
async function onSettings() {
  return [
    { type: "header", label: "Dub Languages" },
    { type: "info", label: "Original and English are always included." },
    { type: "toggle", key: "dubBengali", label: "Bengali", defaultValue: false },
    { type: "toggle", key: "dubHindi", label: "Hindi", defaultValue: true },
    { type: "toggle", key: "dubTamil", label: "Tamil", defaultValue: false },
    { type: "toggle", key: "dubTelugu", label: "Telugu", defaultValue: false },
    { type: "toggle", key: "dubArabic", label: "Arabic", defaultValue: false },
    { type: "toggle", key: "dubFrench", label: "French", defaultValue: false },
    { type: "toggle", key: "dubEsLA", label: "Español [Latino]", defaultValue: false },
    { type: "toggle", key: "dubPtBR", label: "Português [Brasil]", defaultValue: false },
    { type: "toggle", key: "dubEs", label: "Español", defaultValue: false },
    { type: "toggle", key: "dubPt", label: "Português", defaultValue: false },
    { type: "toggle", key: "dubTurkish", label: "Turkish", defaultValue: false },
    { type: "toggle", key: "dubDeutsch", label: "Deutsch", defaultValue: false },
    { type: "toggle", key: "dubItaliano", label: "Italiano", defaultValue: false },
    { type: "toggle", key: "dubRussian", label: "Russian", defaultValue: false },
    { type: "toggle", key: "dubIndonesian", label: "Indonesian", defaultValue: false },
    { type: "toggle", key: "dubMalay", label: "Malay", defaultValue: false }
  ];
}
module.exports = { getStreams, onSettings };