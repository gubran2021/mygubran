"use strict";

const TMDB_API_URL = "https://api.themoviedb.org/3";
const TMDB_API_KEY = "307b7b8ef035c6aa336900aef4e203bd";
const BASE_URL = "https://tioplus.app";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";
const HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Referer": `${BASE_URL}/`
};

function normalizeText(str) {
    if (!str) return "";
    return str
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function scoreSlugMatch(slug, titlePool, year) {
    if (!slug) return 0;
    const normalized = normalizeText(slug);
    let score = 0;

    for (const rawTitle of titlePool) {
        const t = normalizeText(rawTitle);
        if (!t) continue;

        if (normalized === t) { score = Math.max(score, 100); continue; }

        const words = t.split(/\s+/).filter(w => w.length > 2);
        const matches = words.filter(w => normalized.includes(w)).length;
        if (words.length > 0) score = Math.max(score, (matches / words.length) * 75);
    }

    if (year && normalized.includes(String(year))) score += 20;
    return score;
}

function deobfuscatePacked(p, a, c, k) {
    const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const decodeBase = (val, radix) => {
        let n = 0;
        for (const ch of val) {
            const idx = ALPHABET.indexOf(ch);
            if (idx === -1) return NaN;
            n = n * radix + idx;
        }
        return n;
    };
    return p.replace(/\b([0-9a-zA-Z]+)\b/g, token => {
        const idx = decodeBase(token, a);
        if (isNaN(idx) || idx >= k.length) return token;
        return (k[idx] && k[idx] !== "") ? k[idx] : token;
    });
}

async function probeM3u8Resolution(m3u8Url, headers) {
    if (!m3u8Url || !m3u8Url.includes(".m3u8")) return "720p";

    try {
        const res = await fetch(m3u8Url, { headers: headers || { "User-Agent": USER_AGENT }, redirect: "follow" });
        if (!res.ok) return "720p";
        const text = await res.text();

        if (!text.includes("#EXT-X-STREAM-INF")) {
            if (/1080p?/i.test(m3u8Url)) return "1080p";
            if (/720p?/i.test(m3u8Url)) return "720p";
            if (/480p?/i.test(m3u8Url)) return "480p";
            return "720p";
        }

        let maxH = 0;
        const rx = /RESOLUTION=\d+x(\d+)/gi;
        let m;
        while ((m = rx.exec(text)) !== null) {
            const h = parseInt(m[1], 10);
            if (h > maxH) maxH = h;
        }

        if (maxH >= 1080) return "1080p";
        if (maxH >= 720) return "720p";
        if (maxH >= 480) return "480p";
        return "720p";
    } catch {
        return "720p";
    }
}

function inferServerName(url) {
    if (!url) return "Online";
    const u = url.toLowerCase();
    if (u.includes("vidhide") || u.includes("callistanise") || u.includes("minochinos")) return "VidHide";
    if (u.includes("turbovid") || u.includes("emturbovid") || u.includes("turboviplay") || u.includes("turbovidhls")) return "Turbovid";
    if (u.includes("goodstream")) return "GoodStream";
    if (u.includes("vimeos")) return "Vimeos";
    if (u.includes("streamwish") || u.includes("hlswish") || u.includes("flaswish")) return "StreamWish";
    return "Online";
}

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

async function fetchVidHideStream(url) {
    try {
        let targetUrl = url;
        if (targetUrl.includes("callistanise.com/") && !targetUrl.includes("/v/") && !targetUrl.includes("/e/")) {
            targetUrl = targetUrl.replace("callistanise.com/", "callistanise.com/v/");
        } else if (targetUrl.includes("vidhideplus.com/") && !targetUrl.includes("/v/") && !targetUrl.includes("/e/")) {
            targetUrl = targetUrl.replace("vidhideplus.com/", "vidhideplus.com/v/");
        }

        let hostOrigin = (targetUrl.match(/^(https?:\/\/[^/]+)/i) || [])[1] || "https://callistanise.com";

        const res = await fetch(targetUrl, {
            headers: { "User-Agent": USER_AGENT, "Referer": `${BASE_URL}/` },
            redirect: "follow"
        });
        const finalHost = (res.url || "").match(/^(https?:\/\/[^/]+)/i);
        if (finalHost) hostOrigin = finalHost[1];

        const html = await res.text();
        let streamUrl = null;

        const packMatch = html.match(/eval\(function\(p,a,c,k,e,[a-zA-Z0-9_]\)\{[\s\S]+?\}\('([\s\S]+?)',(\d+),(\d+),'([\s\S]+?)'\.split\('\|'\)/);
        if (packMatch) {
            const unpacked = deobfuscatePacked(packMatch[1], parseInt(packMatch[2], 10), parseInt(packMatch[3], 10), packMatch[4].split("|"));
            const m3u8Match = unpacked.match(/["']([^"']+\.m3u8[^"']*)['"]/i);
            if (m3u8Match) streamUrl = m3u8Match[1];
        }

        if (!streamUrl) {
            const direct = html.match(/https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*/i);
            if (direct) streamUrl = direct[0];
        }

        if (!streamUrl) return null;
        if (streamUrl.startsWith("/")) streamUrl = hostOrigin + streamUrl;

        const streamHeaders = { "User-Agent": USER_AGENT, "Referer": targetUrl };
        const quality = await probeM3u8Resolution(streamUrl, streamHeaders);
        return { url: streamUrl, serverName: "VidHide", quality, headers: streamHeaders };
    } catch {
        return null;
    }
}

async function fetchTurbovidStream(url) {
    try {
        const res = await fetch(url, {
            headers: { "User-Agent": USER_AGENT, "Referer": `${BASE_URL}/` },
            redirect: "follow"
        });
        const html = await res.text();
        let streamUrl = null;

        const packMatch = html.match(/eval\(function\(p,a,c,k,e,[a-zA-Z0-9_]\)\{[\s\S]+?\}\('([\s\S]+?)',(\d+),(\d+),'([\s\S]+?)'\.split\('\|'\)/);
        if (packMatch) {
            const unpacked = deobfuscatePacked(packMatch[1], parseInt(packMatch[2], 10), parseInt(packMatch[3], 10), packMatch[4].split("|"));
            const m3u8Match = unpacked.match(/["']([^"']+\.m3u8[^"']*)['"]/i);
            if (m3u8Match) streamUrl = m3u8Match[1];
        }

        if (!streamUrl) {
            const direct = html.match(/https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*/i);
            if (direct) streamUrl = direct[0];
        }

        if (!streamUrl) return null;

        const streamHeaders = { "User-Agent": USER_AGENT, "Referer": url };
        const quality = await probeM3u8Resolution(streamUrl, streamHeaders);
        return { url: streamUrl, serverName: "Turbovid", quality, headers: streamHeaders };
    } catch {
        return null;
    }
}

async function fetchStreamWishStream(url) {
    try {
        const id = url.replace(/\/$/, "").split("/").pop();
        const targetUrl = `https://hlswish.com/e/${id}`;

        const res = await fetch(targetUrl, { headers: { "User-Agent": USER_AGENT, "Referer": targetUrl } });
        const html = await res.text();

        const directMatch = html.match(/(?:file|sources|src)\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i);
        if (directMatch) {
            const quality = await probeM3u8Resolution(directMatch[1], { "User-Agent": USER_AGENT, "Referer": targetUrl });
            return { url: directMatch[1], serverName: "StreamWish", quality, headers: { "User-Agent": USER_AGENT, "Referer": targetUrl } };
        }

        const packMatch = html.match(/eval\(function\(p,a,c,k,e,[a-zA-Z0-9_]\)\{[\s\S]+?\}\('([\s\S]+?)',(\d+),(\d+),'([\s\S]+?)'\.split\('\|'\)/);
        if (packMatch) {
            const unpacked = deobfuscatePacked(packMatch[1], parseInt(packMatch[2], 10), parseInt(packMatch[3], 10), packMatch[4].split("|"));
            const m3u8Match = unpacked.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>]*/i);
            if (m3u8Match) {
                const quality = await probeM3u8Resolution(m3u8Match[0], { "User-Agent": USER_AGENT, "Referer": targetUrl });
                return { url: m3u8Match[0], serverName: "StreamWish", quality, headers: { "User-Agent": USER_AGENT, "Referer": targetUrl } };
            }
        }

        const rawM3u8 = html.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>]*/i);
        if (rawM3u8) {
            const quality = await probeM3u8Resolution(rawM3u8[0], { "User-Agent": USER_AGENT, "Referer": targetUrl });
            return { url: rawM3u8[0], serverName: "StreamWish", quality, headers: { "User-Agent": USER_AGENT, "Referer": targetUrl } };
        }

        return null;
    } catch {
        return null;
    }
}

function routeToResolver(url) {
    if (!url) return Promise.resolve(null);
    const u = url.toLowerCase();
    if (u.includes("vidhide") || u.includes("callistanise") || u.includes("minochinos")) return fetchVidHideStream(url);
    if (u.includes("turbovid") || u.includes("emturbovid") || u.includes("turbovidhls") || u.includes("turboviplay")) return fetchTurbovidStream(url);
    if (u.includes("streamwish") || u.includes("hlswish") || u.includes("flaswish")) return fetchStreamWishStream(url);
    return Promise.resolve(null);
}

async function resolvePlayerUrl(playerUrl) {
    try {
        const res = await fetch(playerUrl, { headers: HEADERS, redirect: "follow" });
        const resolvedUrl = res.url || "";

        if (resolvedUrl && !resolvedUrl.includes("tioplus.app/player/")) {
            return routeToResolver(resolvedUrl);
        }

        const html = await res.text();

        const iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
        if (iframeMatch) {
            const innerUrl = iframeMatch[1].startsWith("/") ? BASE_URL + iframeMatch[1] : iframeMatch[1];
            return routeToResolver(innerUrl);
        }

        const redirectMatch = html.match(/window\.location\.href\s*=\s*["']([^"']+)["']/i) ||
            html.match(/location\.replace\(["']([^"']+)["']\)/i);
        if (redirectMatch) return routeToResolver(redirectMatch[1]);

        return null;
    } catch {
        return null;
    }
}

async function fetchSlugsByQuery(query, isMovie) {
    try {
        const res = await fetch(`${BASE_URL}/api/search/${encodeURIComponent(query)}`, {
            headers: {
                "User-Agent": USER_AGENT,
                "Accept": "*/*",
                "X-Requested-With": "XMLHttpRequest",
                "Referer": `${BASE_URL}/search`
            }
        });
        if (!res.ok) return [];
        const html = await res.text();

        const pattern = isMovie
            ? /href=["']((?:https?:\/\/[^"']*)?\/pelicula\/[^"']+)["']/gi
            : /href=["']((?:https?:\/\/[^"']*)?\/serie\/[^"']+)["']/gi;

        const slugs = [];
        let m;
        while ((m = pattern.exec(html)) !== null) {
            const slug = m[1].split(isMovie ? "/pelicula/" : "/serie/").pop().replace(/\/$/, "");
            if (slug && !slugs.includes(slug)) slugs.push(slug);
        }
        return slugs;
    } catch {
        return [];
    }
}

async function resolveSlugPool(queries, isMovie) {
    for (const query of queries) {
        const slugs = await fetchSlugsByQuery(query, isMovie);
        if (slugs.length > 0) return slugs;
    }
    return [];
}

async function harvestStreamsFromPage(pageUrl) {
    try {
        const res = await fetch(pageUrl, { headers: HEADERS });
        if (!res.ok) return [];
        const html = await res.text();

        const tokens = [];
        const serverRx = /data-server=["']([^"']+)["']/gi;
        const trRx = /data-tr=["']([^"']+)["']/gi;
        let m;

        while ((m = serverRx.exec(html)) !== null) tokens.push(m[1]);
        while ((m = trRx.exec(html)) !== null) tokens.push(m[1]);

        const uniqueTokens = tokens.filter((item, idx, self) => item && self.indexOf(item) === idx);
        if (uniqueTokens.length === 0) return [];

        const settled = await Promise.allSettled(
            uniqueTokens.map(tok => resolvePlayerUrl(`${BASE_URL}/player/${btoa(tok)}`))
        );

        const streams = [];
        for (const result of settled) {
            if (result.status !== "fulfilled" || !result.value || !result.value.url) continue;
            const { url, serverName, quality, headers } = result.value;
            const server = serverName || inferServerName(url);
            const q = quality || "720p";
            streams.push({
                name: "PlusHD",
                title: "PlusHD",
                quality: q,
                url,
                headers: headers || {}
            });
        }
        return streams;
    } catch {
        return [];
    }
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        if (mediaType === "tv" && (season == null || episode == null)) return [];

        const isMovie = mediaType === "movie";
        const sNum = parseInt(season, 10) || 1;
        const eNum = parseInt(episode, 10) || 1;

        const metaRes = await fetch(`${TMDB_API_URL}/${isMovie ? "movie" : "tv"}/${tmdbId}?api_key=${TMDB_API_KEY}&language=es-MX&append_to_response=alternative_titles`);
        if (!metaRes.ok) return [];
        const meta = await metaRes.json();

        const primaryTitle = isMovie ? (meta.title || meta.original_title) : (meta.name || meta.original_name);
        const originalTitle = isMovie ? meta.original_title : meta.original_name;
        const year = (meta.release_date || meta.first_air_date || "").substring(0, 4);

        const rawTitles = [primaryTitle, originalTitle !== primaryTitle ? originalTitle : null];
        const altArr = (meta.alternative_titles && (meta.alternative_titles.results || meta.alternative_titles.titles)) || [];
        for (const entry of altArr) { if (entry.title) rawTitles.push(entry.title); }

        const titlePool = rawTitles.filter((t, i, self) => t && self.indexOf(t) === i);

        const searchQueries = [];
        for (const t of titlePool) {
            if (!t) continue;
            if (!searchQueries.includes(t)) searchQueries.push(t);
            if (t.includes("&")) {
                const withY = t.replace(/&/g, "y").replace(/\s+/g, " ").trim();
                if (!searchQueries.includes(withY)) searchQueries.push(withY);
                const withAnd = t.replace(/&/g, "and").replace(/\s+/g, " ").trim();
                if (!searchQueries.includes(withAnd)) searchQueries.push(withAnd);
            }
            const shortForm = t.split(/[:\-\(]/)[0].trim();
            if (shortForm && !searchQueries.includes(shortForm)) searchQueries.push(shortForm);
        }

        const slugs = await resolveSlugPool(searchQueries, isMovie);
        if (slugs.length === 0) return [];

        slugs.sort((a, b) => scoreSlugMatch(b, titlePool, year) - scoreSlugMatch(a, titlePool, year));

        const pageUrlVariants = slug => isMovie
            ? [`${BASE_URL}/pelicula/${slug}`]
            : [
                `${BASE_URL}/serie/${slug}/season/${sNum}/episode/${eNum}`,
                `${BASE_URL}/episodio/${slug}-${sNum}x${eNum}`,
                `${BASE_URL}/ver/${slug}-temporada-${sNum}-capitulo-${eNum}`
            ];

        let streams = [];
        outer: for (const slug of slugs) {
            for (const pageUrl of pageUrlVariants(slug)) {
                const found = await harvestStreamsFromPage(pageUrl);
                if (found.length > 0) { streams = found; break outer; }
            }
        }

        const seen = new Set();
        streams = streams.filter(s => s.url && !seen.has(s.url) && seen.add(s.url));

        streams.sort((a, b) => resWeight(b.quality) - resWeight(a.quality));
        const total = streams.length;
        streams = streams.map((s, i) => {
            const tag = getInvertedSortTag(total - i, total + 1);
            return Object.assign({}, s, { name: tag + s.name });
        });

        return streams;
    } catch {
        return [];
    }
}

module.exports = { getStreams };