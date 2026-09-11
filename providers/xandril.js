"use strict";

const BASE_URL = "https://api.bingr.one";
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_KEY = "307b7b8ef035c6aa336900aef4e203bd";
const ALLOWED_QUALITIES = new Set(["1080p", "2160p"]);
const SERVERS = [
    { id: "s11", name: "Sirius" },
    { id: "s12", name: "Quasar" },
    { id: "s40", name: "DarkMatter" },
];

async function fetchJson(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

async function fetchTmdbDetails(tmdbId, mediaType) {
    try {
        const endpoint = mediaType === "tv" ? "tv" : "movie";
        const res = await fetch(`${TMDB_BASE}/${endpoint}/${tmdbId}?api_key=${TMDB_KEY}`);
        if (!res.ok) return null;
        const data = await res.json();
        return {
            title: mediaType === "tv" ? data.name : data.title,
            year: (data.release_date || data.first_air_date || "").slice(0, 4) || undefined
        };
    } catch {
        return null;
    }
}

function normalizeQuality(source) {
    const quality = String(source.quality || source.label || "").trim();
    if (!quality || quality.toLowerCase() === "unknown") return "1080p";
    return quality;
}

function normalizeSubtitles(subtitles) {
    if (!Array.isArray(subtitles)) return [];
    return subtitles.filter(s => s && s.url).map(s => ({
        url: s.url,
        lang: s.lang || s.language || "und",
        label: s.label || s.name || s.lang || s.language || "Subtitle"
    }));
}

async function fetchServer(server, mediaType, tmdbId, query) {
    try {
        const data = await fetchJson(`${BASE_URL}/api/stream`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                srv: server.id,
                t: mediaType,
                id: String(tmdbId),
                query
            })
        });
        if (!data || !Array.isArray(data.sources)) return [];

        const subtitles = normalizeSubtitles(data.subtitles);
        return data.sources
            .filter(source => source && source.url)
            .map((source, index) => {
                const quality = normalizeQuality(source);
                const sourceLabel =
                    source.name && source.name !== "Unknown" && source.name !== "Auto" ? source.name :
                    source.label && source.label !== "Auto" ? source.label :
                    `Source ${index + 1}`;
                return {
                    name: `Bingr • ${server.name}`,
                    title: `Bingr • ${server.name}`,
                    url: source.url,
                    quality,
                    type: source.type,
                    headers: source.headers || {},
                    subtitles: normalizeSubtitles(source.subtitles).concat(subtitles)
                };
            })
            .filter(stream => ALLOWED_QUALITIES.has(stream.quality.toLowerCase()));
    } catch {
        return [];
    }
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        if (!tmdbId) return [];
        if (mediaType !== "movie" && mediaType !== "tv") return [];
        if (mediaType === "tv" && (season == null || episode == null)) return [];

        const details = await fetchTmdbDetails(tmdbId, mediaType);
        if (!details || !details.title) return [];

        const query = {
            title: details.title,
            year: details.year ? String(details.year) : undefined
        };
        if (mediaType === "tv") {
            query.season = Number(season);
            query.episode = Number(episode);
        }

        const results = await Promise.all(
            SERVERS.map(server => fetchServer(server, mediaType, tmdbId, query))
        );

        const seen = new Set();
        return results.flat().filter(stream => {
            if (!stream.url || seen.has(stream.url)) return false;
            seen.add(stream.url);
            return true;
        });
    } catch (e) {
        return [];
    }
}

module.exports = { getStreams };