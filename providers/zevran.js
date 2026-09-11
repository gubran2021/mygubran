"use strict";

const TMDB_API_KEY = "307b7b8ef035c6aa336900aef4e203bd";
const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const VAPLAYER_API = "https://streamdata.vaplayer.ru";
const REFERER = "https://nextgencloudfabric.com/";

const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
    "Referer": REFERER,
    "Origin": REFERER
};

async function fetchImdbId(tmdbId, mediaType) {
    try {
        const endpoint = mediaType === "tv" ? "tv" : "movie";
        const url = `${TMDB_BASE_URL}/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`;
        const res = await fetch(url, { headers: { "User-Agent": HEADERS["User-Agent"], "Accept": "application/json" } });
        if (!res.ok) return null;
        const data = await res.json();
        return data?.external_ids?.imdb_id || null;
    } catch {
        return null;
    }
}

function getQuality(streamObj, topLevelData, fallbackUrl = "") {
    const fields = [
        streamObj.quality, streamObj.label, streamObj.res,
        streamObj.bitrate, streamObj.type, streamObj.resolution,
        topLevelData.quality, topLevelData.label, topLevelData.res,
        topLevelData.bitrate, topLevelData.type,
        streamObj.url, fallbackUrl
    ].filter(Boolean).join(" ").toLowerCase();

    if (fields.includes("2160") || fields.includes("4k") || fields.includes("uhd")) return "2160p";
    if (fields.includes("1440")) return "1440p";
    if (fields.includes("1080")) return "1080p";
    if (fields.includes("720")) return "720p";
    if (fields.includes("480")) return "480p";
    if (fields.includes("360")) return "360p";
    return "1080p";
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        if (mediaType === "tv" && (season == null || episode == null)) return [];

        const imdbId = await fetchImdbId(tmdbId, mediaType);
        if (!imdbId) return [];

        const url = (season != null && episode != null)
            ? `${VAPLAYER_API}/api.php?imdb=${imdbId}&type=tv&season=${season}&episode=${episode}`
            : `${VAPLAYER_API}/api.php?imdb=${imdbId}&type=movie`;

        const res = await fetch(url, { headers: { ...HEADERS, "Accept": "application/json" } });
        if (!res.ok) return [];

        const json = await res.text();
        let data;
        try { data = JSON.parse(json); } catch { return []; }

        if (!data || data.status_code === "error" || !data.data) return [];

        let rawItems = [];
        if (Array.isArray(data.data.stream_urls)) {
            rawItems = data.data.stream_urls;
        } else if (typeof data.data.stream_urls === "object" && data.data.stream_urls !== null) {
            rawItems = Object.values(data.data.stream_urls);
        } else if (data.data.stream_url) {
            rawItems = [data.data.stream_url];
        }

        const streamMap = new Map();

        for (const item of rawItems) {
            let streamUrl = "";
            let streamObj = {};

            if (typeof item === "string") {
                streamUrl = item;
            } else if (item && typeof item === "object") {
                streamUrl = item.url || item.file || item.src || "";
                streamObj = item;
            } else {
                continue;
            }

            if (!streamUrl) continue;

            const cleanUrl = streamUrl.trim().replace(/\/+$/, "");

            if (!streamMap.has(cleanUrl)) {
                streamMap.set(cleanUrl, {
                    url: cleanUrl,
                    quality: getQuality(streamObj, data.data, cleanUrl)
                });
            }
        }

        if (streamMap.size === 0) return [];

        const subs = data.data.default_subs || data.default_subs || [];
        const subtitles = (Array.isArray(subs) ? subs : [])
            .filter(s => s.url)
            .map(s => ({
                url: s.url,
                language: s.code || s.lang || "unknown",
                name: s.lang || s.code || "Unknown"
            }));

        return [...streamMap.values()].map((stream, i) => ({
            name: "VAplayer",
            title: "VAplayer",
            url: stream.url,
            quality: stream.quality,
            headers: HEADERS,
            subtitles
        }));
    } catch (e) {
        return [];
    }
}

module.exports = { getStreams };