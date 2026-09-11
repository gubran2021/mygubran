"use strict";

const BASE_URL = "https://a2.shows.st";
const REFERER = "https://player.vidlove.cc/";
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_KEY = "307b7b8ef035c6aa336900aef4e203bd";
const MIN_QUALITY = 1080;
const DEFAULT_QUALITY = "1080p";

const PROVIDERS = [
    "moviebox", "cinefreak", "moviebox2", "warden", "tcloud&sw=1",
    "ipcloud&sw=1"
];

const DEFAULT_HEADERS = {
    "accept": "application/json",
    "accept-language": "nl-NL,nl;q=0.9,en-US;q=0.8,en;q=0.7",
    "sec-ch-ua": "\"Not;A=Brand\";v=\"8\", \"Chromium\";v=\"150\", \"Google Chrome\";v=\"150\"",
    "Referer": REFERER
};

const parseQuality = (quality) => {
    const match = quality?.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
};

const normalizeQuality = (quality) => {
    const q = String(quality || "").trim();
    return q ? q : DEFAULT_QUALITY;
};

const isQualityAcceptable = (quality) => {
    return parseQuality(normalizeQuality(quality)) >= MIN_QUALITY;
};

const resolveTitle = ({ name, title, original_title, original_name } = {}) =>
    name ?? title ?? original_title ?? original_name ?? "";

const buildEndpointUrl = (mediaType, tmdbId, provider, season, episode) => {
    const params = new URLSearchParams({ id: tmdbId, mode: "json", sources: provider, hevc: "1" });
    if (season != null) params.set("season", season);
    if (episode != null) params.set("episode", episode);
    return `${BASE_URL}/${mediaType}?${params}`;
};

const mapQualityToStream = (q, label) => ({
    name: `Vidlove • ${label}`,
    title: `Vidlove • ${label}`,
    url: q.url,
    quality: normalizeQuality(q.quality),
    headers: { Referer: REFERER },
});

async function fetchProviderStreams(provider, tmdbId, mediaType, season, episode) {
    try {
        const res = await fetch(buildEndpointUrl(mediaType, tmdbId, provider, season, episode), {
            method: "GET",
            headers: DEFAULT_HEADERS
        });
        if (!res.ok) return [];

        const { source } = await res.json();
        if (!source) return [];

        const qualities = Array.isArray(source.qualities) ? source.qualities : [];
        const label = source.label ?? provider;

        if (qualities.length > 0) {
            return qualities
                .filter(q => q?.url && isQualityAcceptable(q.quality))
                .map(q => mapQualityToStream(q, label));
        }

        if (source.url && isQualityAcceptable(source.quality)) {
            return [{
                name: `Vidlove • ${label}`,
                title: `Vidlove • ${label}`,
                url: source.url,
                quality: normalizeQuality(source.quality),
                headers: { Referer: REFERER },
            }];
        }

        return [];
    } catch {
        return [];
    }
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        if (mediaType === "tv" && (season == null || episode == null)) return [];

        const results = await Promise.all(
            PROVIDERS.map(provider => fetchProviderStreams(provider, tmdbId, mediaType, season, episode))
        );

        const seen = new Set();
        return results.flat().filter(s => s.url && !seen.has(s.url) && seen.add(s.url));
    } catch (e) {
        return [];
    }
}

module.exports = { getStreams };