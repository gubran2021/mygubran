"use strict";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_API_KEY = "307b7b8ef035c6aa336900aef4e203bd";
const BASE_URL = "https://fsharetv.cc";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";

function resWeight(quality) {
    const q = (quality || "").toUpperCase();
    if (q === "4K" || q === "2160P") return 5;
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

function createSlug(str) {
    if (!str) return null;
    return str
        .split("")
        .filter(c => /[\s\p{L}\p{N}]/u.test(c))
        .join("")
        .trim()
        .replace(/\s+/g, "-")
        .toLowerCase();
}

async function fetchTmdbDetails(tmdbId, mediaType) {
    try {
        const endpoint = mediaType === "tv" ? "tv" : "movie";
        const res = await fetch(
            `${TMDB_BASE_URL}/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`
        );
        if (!res.ok) return null;
        const data = await res.json();
        return {
            title: mediaType === "tv" ? data.name : data.title,
            imdbId: (data.external_ids && data.external_ids.imdb_id) || null
        };
    } catch {
        return null;
    }
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        if (mediaType !== "movie") return [];

        const info = await fetchTmdbDetails(tmdbId, mediaType);
        if (!info || !info.title || !info.imdbId) return [];

        const slug = createSlug(`${info.title} episode 1 ${info.imdbId}`);
        if (!slug) return [];

        const pageUrl = `${BASE_URL}/w/${slug}`;
        const baseHeaders = {
            "User-Agent": USER_AGENT,
            "Referer": pageUrl
        };

        const pageRes = await fetch(pageUrl, { headers: { "User-Agent": USER_AGENT } });
        if (!pageRes.ok) return [];
        const html = await pageRes.text();

        const tokenMatch = html.match(/Movie\.setSource\('([^']+)'/);
        if (!tokenMatch) return [];
        const token = tokenMatch[1];

        const trailerMatch = html.match(/<input[^>]+id=["']trailer["'][^>]*value=["']([^"']*)["']|<input[^>]+value=["']([^"']*)["'][^>]*id=["']trailer["']/);
        if (!trailerMatch) return [];
        const trailer = trailerMatch[1] !== undefined ? trailerMatch[1] : trailerMatch[2];

        const apiRes = await fetch(
            `${BASE_URL}/api/file/${token}/source?trailer=${trailer}&type=watch`,
            { headers: baseHeaders }
        );
        if (!apiRes.ok) return [];

        const json = await apiRes.json();
        if (!json || !json.data || !json.data.file) return [];

        const file = json.data.file;
        const allSources = [
            ...(file.sources || []),
            ...(file.alternatives || []).flat()
        ];

        const seen = new Set();
        let streams = [];

        for (const source of allSources) {
            if (!source.src) continue;
            const url = BASE_URL + source.src;
            if (seen.has(url)) continue;
            seen.add(url);

            const quality = source.quality ? `${source.quality}p` : "Unknown";
            streams.push({
                name: "FshareTV",
                title: `FshareTV \u2022 ${quality}`,
                url,
                quality,
                headers: baseHeaders
            });
        }

        streams.sort((a, b) => resWeight(b.quality) - resWeight(a.quality));

        const total = streams.length;
        streams = streams.map((s, i) => {
            const tag = getInvertedSortTag(total - i, total + 1);
            return Object.assign({}, s, { name: tag + s.name, title: tag + s.title });
        });

        return streams;
    } catch (e) {
        return [];
    }
}

module.exports = { getStreams };