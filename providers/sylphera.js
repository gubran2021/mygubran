"use strict";

const BASE_URL = 'https://fmftp.net';
const API_BASE = 'https://fmftp.net/api';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36';
const HEADERS = { 'User-Agent': USER_AGENT, Referer: BASE_URL + '/' };
const TMDB_KEY = '307b7b8ef035c6aa336900aef4e203bd';
const EXTENSIONS = new Set(['.mp4', '.mkv', '.avi', '.m4v', '.mov', '.webm', '.ts']);
const QUALITY = /(2160p|1440p|1080p|720p|576p|540p|480p|360p|4k|uhd)/i;
const ANCHOR = /<a[^>]+href="([^"]+)"[^>]*>/gi;

async function request(url, opts) {
    try {
        opts = opts || {};
        const res = await fetch(url, {
            method: opts.method || 'GET',
            headers: Object.assign({}, HEADERS, opts.headers || {}),
            body: opts.body,
        });
        const text = await res.text();
        return { ok: res.status >= 200 && res.status < 300, status: res.status, text };
    } catch (_) {
        return null;
    }
}

function parseJson(res) {
    if (!res || !res.ok) return null;
    try { return JSON.parse(res.text); } catch (_) { return null; }
}

function encodePath(s) {
    return encodeURIComponent(String(s)).replace(/%2F/gi, '/');
}

function isVideoFile(name) {
    const clean = String(name).split('?')[0].toLowerCase();
    const dot = clean.lastIndexOf('.');
    return dot !== -1 && EXTENSIONS.has(clean.slice(dot));
}

function resolveQuality(text) {
    const m = QUALITY.exec(String(text));
    if (!m) return 'Auto';
    const v = m[1].toLowerCase();
    return (v === '4k' || v === 'uhd') ? '2160p' : v;
}

function buildStream(url, qualitySource) {
    const quality = resolveQuality(qualitySource);
    return {
        name: 'FM FTP',
        title: 'FM FTP',
        url,
        quality,
        headers: HEADERS,
    };
}

function deduplicateByUrl(streams) {
    const seen = new Set();
    return streams.filter(s => s.url && !seen.has(s.url) && seen.add(s.url));
}

function parseIndexLinks(html) {
    const links = [];
    RE_ANCHOR.lastIndex = 0;
    let m;
    while ((m = RE_ANCHOR.exec(html)) !== null) {
        const href = m[1];
        if (!href || href === '../' || href === '/' || href.startsWith('../')) continue;
        links.push({ href, name: decodeURIComponent(href) });
    }
    return links;
}

async function searchTitle(title) {
    try {
        const res = await request(API_BASE + '/search?search=' + encodeURIComponent(title));
        const data = parseJson(res);
        if (!Array.isArray(data)) return [];
        return data
            .filter(o => o && (o.title || o.name))
            .map(o => ({
                id: o.id,
                title: o.title || o.name || '',
                year: o.year ? parseInt(o.year, 10) : null,
                isShow: !o.file_path && !!o.path,
            }));
    } catch (_) {
        return [];
    }
}

async function resolveMovieStream(id) {
    try {
        const res = await request(API_BASE + '/movies/' + id);
        const d = parseJson(res);
        const rel = d && d.url ? String(d.url).trim() : '';
        if (!rel) return null;
        return buildStream(BASE_URL + encodePath(rel), rel);
    } catch (_) {
        return null;
    }
}

async function resolveShowStreams(id, season, episode) {
    try {
        const res = await request(API_BASE + '/tv-shows/' + id);
        const d = parseJson(res);
        const dir = d && d.url ? String(d.url).trim() : '';
        if (!dir) return [];
        return walkEpisodeDirectory(dir, season, episode);
    } catch (_) {
        return [];
    }
}

async function walkEpisodeDirectory(dir, season, episode) {
    const sNum = String(season || 1);
    const eNum = String(episode || 1);
    const baseUrl = BASE_URL + encodePath(dir.replace(/\/+$/, '')) + '/';
    const reSeason = new RegExp('(?:^|[\\s._-])(?:season[\\s._-]*|s)0*' + sNum + '(?=\\D|$)', 'i');
    const reEpisode = new RegExp('S0*' + sNum + '[\\s._-]*E0*' + eNum + '(\\D|$)', 'i');

    try {
        const index = await request(baseUrl);
        if (!index || !index.ok) return [];

        const seasonDirs = parseIndexLinks(index.text).filter(
            l => l.href.slice(-1) === '/' && reSeason.test(l.name)
        );
        if (!seasonDirs.length) return [];

        const results = await Promise.all(seasonDirs.map(async dir => {
            try {
                const listing = await request(baseUrl + dir.href);
                if (!listing || !listing.ok) return [];
                const folder = dir.name.replace(/\/$/, '');
                return parseIndexLinks(listing.text)
                    .filter(f => f.href.slice(-1) !== '/' && reEpisode.test(f.name) && isVideoFile(f.name))
                    .map(f => buildStream(baseUrl + dir.href + f.href, folder + ' ' + f.name));
            } catch (_) {
                return [];
            }
        }));

        return deduplicateByUrl(results.flat());
    } catch (_) {
        return [];
    }
}

async function fetchTmdbMeta(tmdbId, mediaType) {
    try {
        const endpoint = mediaType === 'tv' ? 'tv' : 'movie';
        const res = await fetch(
            'https://api.themoviedb.org/3/' + endpoint + '/' + tmdbId + '?api_key=' + TMDB_KEY,
            { headers: { Accept: 'application/json' } }
        );
        if (!res.ok) return null;
        const d = await res.json();
        const dateStr = (mediaType === 'tv' ? d.first_air_date : d.release_date) || '';
        return {
            title: (mediaType === 'tv' ? d.name : d.title) || '',
            year: parseInt(dateStr.slice(0, 4), 10) || null,
        };
    } catch (_) {
        return null;
    }
}

function pickBestMatch(candidates, isTv, year) {
    let best = null, bestScore = -1;
    for (const c of candidates) {
        let score = 0;
        if (c.isShow === isTv) score += 2;
        if (year && c.year === year) score += 1;
        if (score > bestScore) { bestScore = score; best = c; }
    }
    return best;
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        if (mediaType === 'tv' && (season == null || episode == null)) return [];

        const meta = await fetchTmdbMeta(tmdbId, mediaType);
        if (!meta || !meta.title) return [];

        const candidates = await searchTitle(meta.title);
        if (!candidates.length) return [];

        const isTv = mediaType === 'tv';
        const match = pickBestMatch(candidates, isTv, meta.year);
        if (!match) return [];

        if (!isTv) {
            const stream = await resolveMovieStream(match.id);
            return stream ? [stream] : [];
        }
        return resolveShowStreams(match.id, season, episode);
    } catch (_) {
        return [];
    }
}

module.exports = { getStreams };