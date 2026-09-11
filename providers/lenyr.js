"use strict"

const MAIN_URL = "https://vidcore.org";
const API_BASE = "https://hahaevilcraft.site";
const TMDB_API_BASE = "https://api.themoviedb.org/3";
const TMDB_API_KEY = "307b7b8ef035c6aa336900aef4e203bd";
const PROVIDER_NAME = "VidCore";
const MIN_STREAM_SIZE_MB = 768;
const SERVER_POOL = [
    { id: "hera", label: "Hera" },
    { id: "vidsuper-vidnest", label: "VidNest" },
    { id: "multivid", label: "MultiVid" },
];

function formatFileSize(bytes) {
    if (!bytes) return "Unknown";
    const k = 1024;
    const units = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${units[i]}`;
}

function exceedsMinimumSize(sizeStr) {
    const match = String(sizeStr || "").match(/^([\d.]+)\s*(Bytes|KB|MB|GB|TB)$/i);
    if (!match) return true;
    const toMb = { BYTES: 1 / 1048576, KB: 1 / 1024, MB: 1, GB: 1024, TB: 1048576 };
    return parseFloat(match[1]) * (toMb[match[2].toUpperCase()] || 0) >= MIN_STREAM_SIZE_MB;
}

function resolveQualityLabel(width, height) {
    if (width >= 3200 || height >= 2000) return "4K";
    if (width >= 2400 || height >= 1400) return "1440p";
    if (width >= 1800 || height >= 1000) return "1080p";
    if (width >= 1200 || height >= 700) return "720p";
    if (width >= 800 || height >= 460) return "480p";
    if (width >= 600 || height >= 340) return "360p";
    if (width > 0 || height > 0) return "240p";
    return "Unknown";
}

function resolveAbsoluteUrl(rawUrl, baseUrl) {
    try {
        return new URL(rawUrl, baseUrl).toString();
    } catch {
        return rawUrl;
    }
}

function extractHighestBandwidthVariant(m3u8Text, playlistUrl) {
    const lines = m3u8Text.split("\n").map((l) => l.trim());
    let best = null;
    for (let i = 0; i < lines.length; i++) {
        if (!lines[i].startsWith("#EXT-X-STREAM-INF")) continue;
        const variantUrl = lines[i + 1];
        if (!variantUrl || variantUrl.startsWith("#")) continue;
        const bwMatch = lines[i].match(/BANDWIDTH=(\d+)/);
        const resMatch = lines[i].match(/RESOLUTION=(\d+)x(\d+)/);
        const bandwidth = bwMatch ? parseInt(bwMatch[1], 10) : 0;
        const width = resMatch ? parseInt(resMatch[1], 10) : 0;
        const height = resMatch ? parseInt(resMatch[2], 10) : 0;
        if (!best || bandwidth > best.bandwidth) {
            best = { url: resolveAbsoluteUrl(variantUrl, playlistUrl), bandwidth, width, height };
        }
    }
    return best;
}

function extractSseCompletedPayload(rawText) {
    const lines = rawText.split("\n");
    let currentEvent = null;
    for (const line of lines) {
        if (line.startsWith("event:")) {
            currentEvent = line.slice(6).trim();
        } else if (line.startsWith("data:") && currentEvent === "completed") {
            try {
                return JSON.parse(line.slice(5).trim());
            } catch {
                return null;
            }
        }
    }
    return null;
}

async function fetchTmdbMetadata(tmdbId, mediaType, season, episode) {
    try {
        const endpoint = mediaType === "tv" ? "tv" : "movie";
        const detailUrl = `${TMDB_API_BASE}/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}`;
        const episodeUrl = mediaType === "tv"
            ? `${TMDB_API_BASE}/tv/${tmdbId}/season/${season}/episode/${episode}?api_key=${TMDB_API_KEY}`
            : null;

        const requests = [fetch(detailUrl, { redirect: "follow" })];
        if (episodeUrl) requests.push(fetch(episodeUrl, { redirect: "follow" }));

        const responses = await Promise.all(requests);
        const detail = responses[0].ok ? await responses[0].json() : null;
        const episode_ = (episodeUrl && responses[1].ok) ? await responses[1].json() : null;

        const title = detail ? (detail.title || detail.name || "") : "";
        const runtimeMinutes = episode_ ? episode_.runtime : (detail ? detail.runtime : null);

        return { title, runtimeSeconds: runtimeMinutes ? runtimeMinutes * 60 : null };
    } catch {
        return { title: "", runtimeSeconds: null };
    }
}

async function fetchMirrorStreams(mirrorId, referer, tmdbId, mediaType, title) {
    try {
        const params = new URLSearchParams({
            id: mirrorId,
            tmdbId: String(tmdbId),
            type: mediaType,
            starred: "1",
            fallback: "false",
            title: title || "",
            _cb: String(Date.now())
        });
        const resp = await fetch(`${API_BASE}/scrape/source?${params.toString()}`, {
            headers: { Referer: referer, Accept: "text/event-stream" },
            redirect: "follow"
        });
        if (!resp.ok) return [];
        const payload = extractSseCompletedPayload(await resp.text());
        if (!payload || !Array.isArray(payload.stream) || !payload.stream.length) return [];
        return payload.stream;
    } catch {
        return [];
    }
}

async function resolveStreamFromEntry(mirrorId, mirrorLabel, entry, runtimeSeconds, referer) {
    try {
        if (entry.type !== "hls" || !entry.playlist || !/^https?:\/\//i.test(entry.playlist)) return null;
        const playbackHeaders = { Referer: referer };
        const resp = await fetch(entry.playlist, { headers: playbackHeaders, redirect: "follow" });
        if (!resp.ok) return null;
        const topVariant = extractHighestBandwidthVariant(await resp.text(), entry.playlist);
        if (!topVariant) return null;
        const qualityLabel = resolveQualityLabel(topVariant.width, topVariant.height);
        const estimatedSize = runtimeSeconds && topVariant.bandwidth
            ? formatFileSize(topVariant.bandwidth * runtimeSeconds / 8)
            : "Unknown";
        if (!exceedsMinimumSize(estimatedSize)) return null;
        return {
            name: `${PROVIDER_NAME} \u2022 ${mirrorLabel}`,
            title: `${PROVIDER_NAME} \u2022 ${mirrorLabel}`,
            quality: qualityLabel,
            size: estimatedSize,
            url: entry.playlist,
            headers: playbackHeaders,
            subtitles: []
        };
    } catch {
        return null;
    }
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        if (mediaType === "tv" && (season == null || episode == null)) return [];

        const numericId = parseInt(tmdbId, 10);
        if (!numericId) return [];

        const isTv = mediaType === "tv";
        const referer = isTv
            ? `${MAIN_URL}/embed/tv/${numericId}/${season}/${episode}`
            : `${MAIN_URL}/embed/movie/${numericId}`;

        const { title, runtimeSeconds } = await fetchTmdbMetadata(numericId, mediaType, season, episode);

        const mirrorResults = await Promise.all(
            SERVER_POOL.map(({ id }) => fetchMirrorStreams(id, referer, numericId, mediaType, title))
        );

        const seenPlaylists = new Set();
        const uniqueEntries = [];
        for (let i = 0; i < mirrorResults.length; i++) {
            for (const entry of mirrorResults[i]) {
                if (!entry.playlist || seenPlaylists.has(entry.playlist)) continue;
                seenPlaylists.add(entry.playlist);
                uniqueEntries.push({ mirror: SERVER_POOL[i], entry });
            }
        }
        if (!uniqueEntries.length) return [];

        const resolved = await Promise.all(
            uniqueEntries.map(({ mirror, entry }) => resolveStreamFromEntry(mirror.id, mirror.label, entry, runtimeSeconds, referer))
        );

        return resolved.filter((s) => s != null);
    } catch {
        return [];
    }
}

module.exports = { getStreams };