"use strict";

const cheerio = require("cheerio");
const TMDB_API_URL = "https://api.themoviedb.org/3";
const TMDB_API_KEY = "307b7b8ef035c6aa336900aef4e203bd";
const BASE_URL = "https://dizipal2126.com";
const CDN_BASE = "https://s7.superadjacentsoddenly.xyz";
const HEADER = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36"
};

function resolveUrl(url, base = BASE_URL) {
    if (!url) return "";
    if (url.startsWith("http://") || url.startsWith("https://")) return url;
    if (url.startsWith("//")) return `https:${url}`;
    try {
        return new URL(url, base).toString();
    } catch (_) {
        return url;
    }
}

async function request(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: { ...HEADER, ...(options.headers || {}) }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
}

async function resolveMediaMetadata(tmdbId, mediaType) {
    const endpoint = mediaType === "movie" ? "movie" : "tv";
    try {
        const response = await fetch(
            `${TMDB_API_URL}/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}&language=tr-TR`
        );
        if (response.ok) {
            const data = await response.json();
            if (data) {
                const localizedTitle = data.title || data.name || "";
                const originalTitle = data.original_title || data.original_name || localizedTitle;
                const abbreviatedTitle = localizedTitle.split(" ").slice(0, 2).join(" ");
                const releaseDate = data.release_date || data.first_air_date || "";
                const year = releaseDate ? parseInt(releaseDate.substring(0, 4)) : null;
                if (localizedTitle) return { localizedTitle, originalTitle, abbreviatedTitle, year };
            }
        }
    } catch (_) { }
    return { localizedTitle: "", originalTitle: "", abbreviatedTitle: "", year: null };
}

async function extractStreamSource(targetUrl, siteOrigin) {
    try {
        const html = await request(targetUrl, {
            headers: { "Cache-Control": "no-cache", "Pragma": "no-cache" }
        });

        const $ = cheerio.load(html);
        const encodedConfig = $("#videoContainer").attr("data-cfg");
        if (!encodedConfig) return null;

        let paddedConfig = encodedConfig;
        const paddingLength = (4 - encodedConfig.length % 4) % 4;
        for (let i = 0; i < paddingLength; i++) paddedConfig += "=";

        const decodedConfig = atob(paddedConfig);
        const embedUrlMatch = decodedConfig.match(/"v"\s*:\s*"([^"]+)"/);
        if (!embedUrlMatch) return null;

        const embedUrl = resolveUrl(embedUrlMatch[1].replace(/\\\//g, "/"), siteOrigin);

        const embedResponse = await fetch(embedUrl, {
            headers: { "User-Agent": HEADER["User-Agent"], "Referer": targetUrl }
        });
        if (!embedResponse.ok) return null;
        const embedHtml = await embedResponse.text();

        let streamUrl = null;
        const m3u8Match = embedHtml.match(/sources\s*:\s*\[\s*\{\s*file\s*:\s*["']([^"']+\.m3u8.*?)["']/i);
        if (m3u8Match) {
            streamUrl = m3u8Match[1];
        }

        if (!streamUrl) {
            const embedIdMatch = embedUrl.match(/embed-([^.]+)\.html/);
            const folderMatch = embedHtml.match(/\/(?:hls2|vtt)\/(\d+\/\d+)\//);
            if (embedIdMatch && folderMatch) {
                streamUrl = `${CDN_BASE}/hls2/${folderMatch[1]}/${embedIdMatch[1]}_,n,h,.urlset/master.m3u8`;
            }
        }

        if (!streamUrl) return null;

        const subtitleTracks = [];
        const tracksBlockMatch = embedHtml.match(/tracks\s*:\s*\[(.*?)\]/is);
        if (tracksBlockMatch) {
            const trackPattern = /\{(.*?)\}/gs;
            let trackMatch;
            while ((trackMatch = trackPattern.exec(tracksBlockMatch[1])) !== null) {
                const trackFileMatch = trackMatch[1].match(/file\s*:\s*["']([^"']+)["']/);
                const trackLabelMatch = trackMatch[1].match(/label\s*:\s*["']([^"']+)["']/);
                if (trackFileMatch) {
                    const trackFile = trackFileMatch[1];
                    if (trackFile.endsWith(".vtt") || trackFile.endsWith(".srt")) {
                        subtitleTracks.push({
                            label: trackLabelMatch ? trackLabelMatch[1] : "Unknown",
                            file: resolveUrl(trackFile, siteOrigin)
                        });
                    }
                }
            }
        }

        if (subtitleTracks.length === 0) {
            const vttPathMatch = streamUrl.match(/\/hls2\/(\d+\/\d+)\/([^_]+)/);
            if (vttPathMatch) {
                subtitleTracks.push({
                    label: "English",
                    file: `${CDN_BASE}/vtt/${vttPathMatch[1]}/${vttPathMatch[2]}_eng.vtt`
                });
            }
        }

        return {
            url: streamUrl,
            quality: "1080p",
            headers: { "Referer": embedUrl },
            subtitles: subtitleTracks.length > 0 ? subtitleTracks : undefined
        };
    } catch (_) {
        return null;
    }
}

async function resolveEpisodeUrl(seriesPageUrl, season, episode, siteOrigin) {
    try {
        const html = await request(seriesPageUrl);
        const $ = cheerio.load(html);

        const seasonLabel = String(season);
        const episodeLabel = String(episode);
        const episodeTitlePattern = new RegExp(
            `${seasonLabel}[^\\d]*[Ss]ezon[^\\d]*${episodeLabel}[^\\d]*[Bb][o\xF6]l[u\xFC]m`, "i"
        );
        const episodeSlugPattern = new RegExp(
            `\\b${seasonLabel}[.\\s]*[Ss]ezon[\\s.]*${episodeLabel}[.\\s]*[Bb][o\xF6]l[u\xFC]m\\b`, "i"
        );

        let episodeUrl = null;

        $("a.detail-episode-item").each((_, el) => {
            const href = $(el).attr("href");
            const text = $(el).text();
            if (href && (episodeTitlePattern.test(text) || episodeTitlePattern.test(href))) {
                episodeUrl = resolveUrl(href, siteOrigin);
                return false;
            }
        });
        if (episodeUrl) return episodeUrl;

        $("a[data-dizipal-pageloader]").each((_, el) => {
            const href = $(el).attr("href");
            const text = $(el).text();
            if (href && (episodeSlugPattern.test(text) || episodeSlugPattern.test(href))) {
                episodeUrl = resolveUrl(href, siteOrigin);
                return false;
            }
        });
        if (episodeUrl) return episodeUrl;

        const slugMatch = html.match(
            new RegExp(`href=["']([^"']*-${season}-sezon-${episode}-bolum[^"']*)["']`, "i")
        );
        if (slugMatch) return resolveUrl(slugMatch[1], siteOrigin);

        const seriesSlug = seriesPageUrl.split("/").filter(Boolean).pop();
        if (seriesSlug) {
            const candidateUrl = `${siteOrigin}/bolum/${seriesSlug}-${season}-sezon-${episode}-bolum`;
            try {
                const probeResponse = await fetch(candidateUrl, { method: "HEAD", headers: HEADER });
                if (probeResponse.ok) return candidateUrl;
            } catch (_) { }
        }

        return null;
    } catch (_) {
        return null;
    }
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        if (mediaType === "tv" && (season == null || episode == null)) return [];

        const metadata = await resolveMediaMetadata(tmdbId, mediaType);
        const { localizedTitle, originalTitle, abbreviatedTitle } = metadata;
        if (!localizedTitle && !originalTitle) return [];

        const searchTerms = [...new Set([localizedTitle, originalTitle, abbreviatedTitle].filter(t => t && t.length > 1))];

        const sanitize = str => (str || "").toLowerCase().replace(/[^a-z0-9\u011f\xfc\u015f\u0131\xf6\xe7]/g, "");
        const normalizedLocal = sanitize(localizedTitle);
        const normalizedOriginal = sanitize(originalTitle);
        const normalizedAbbreviated = sanitize(abbreviatedTitle);

        let searchResult = null;

        for (const term of searchTerms) {
            try {
                const searchResponse = await fetch(
                    `${BASE_URL}/ajax-search?q=${encodeURIComponent(term)}`,
                    {
                        headers: {
                            "Accept": "application/json, text/javascript, */*; q=0.01",
                            "X-Requested-With": "XMLHttpRequest",
                            "Referer": `${BASE_URL}/`,
                            "User-Agent": HEADER["User-Agent"]
                        }
                    }
                );
                if (!searchResponse.ok) continue;

                const data = await searchResponse.json();
                const candidates = (data && data.results) || [];
                if (!candidates.length) continue;

                const normalizedTerm = sanitize(term);

                for (const candidate of candidates) {
                    if (!candidate.title || !candidate.url) continue;
                    const candidateTitle = sanitize(candidate.title);
                    const isTitleMatch =
                        candidateTitle === normalizedLocal ||
                        candidateTitle === normalizedOriginal ||
                        candidateTitle === normalizedAbbreviated ||
                        candidateTitle === normalizedTerm ||
                        candidateTitle.includes(normalizedTerm) ||
                        normalizedTerm.includes(candidateTitle);
                    const isTypeMatch =
                        (mediaType === "movie" && candidate.type === "Film") ||
                        (mediaType === "tv" && candidate.type === "Dizi");
                    if (isTitleMatch && isTypeMatch) {
                        searchResult = { title: candidate.title, url: candidate.url };
                        break;
                    }
                }
                if (searchResult) break;
            } catch (_) { }
        }

        if (!searchResult) return [];

        let contentUrl = resolveUrl(searchResult.url, BASE_URL);
        if (mediaType === "tv") {
            contentUrl = await resolveEpisodeUrl(contentUrl, season, episode, BASE_URL);
            if (!contentUrl) return [];
        }

        const streamSource = await extractStreamSource(contentUrl, BASE_URL);
        if (!streamSource) return [];

        return [{
            name: "Dizipal",
            title: "Dizipal",
            url: streamSource.url,
            quality: streamSource.quality || "1080p",
            headers: streamSource.headers || {},
            subtitles: streamSource.subtitles
        }];
    } catch (_) {
        return [];
    }
}

module.exports = { getStreams };