"use strict";

const BASE_URL = 'https://anineko.to';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36';
const HEADERS = { 'User-Agent': USER_AGENT, 'Referer': BASE_URL + '/', 'X-Requested-With': 'XMLHttpRequest' };
const TMDB_API_URL = 'https://api.themoviedb.org/3'
const TMDB_API_KEY = '307b7b8ef035c6aa336900aef4e203bd';

async function request(url, extra) {
    try {
        const res = await fetch(url, { headers: Object.assign({ 'User-Agent': USER_AGENT }, extra || {}) });
        if (!res.ok) return null;
        return await res.text();
    } catch {
        return null;
    }
}

function normalize(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function similarity(a, b) {
    a = normalize(a); b = normalize(b);
    if (!a || !b) return 0;
    const wa = a.split(' '), wb = b.split(' ');
    const index = Object.create(null);
    for (const w of wb) index[w] = true;
    let shared = 0;
    for (const w of wa) if (index[w]) shared++;
    return (2 * shared) / (wa.length + wb.length);
}

function searchQueries(title) {
    const tokens = title.split(/\s+/).filter(Boolean);
    const seen = Object.create(null);
    return [title, tokens.slice(0, 2).join(' '), tokens[0]]
        .filter(q => q && !seen[q] && (seen[q] = true));
}

async function search(queries) {
    for (const q of queries) {
        const text = await request(BASE_URL + '/ajax/search?q=' + encodeURIComponent(q), HEADERS);
        if (!text) continue;
        try {
            const parsed = JSON.parse(text);
            const results = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.results) ? parsed.results : []);
            if (results.length) return results;
        } catch { }
    }
    return null;
}

function bestMatch(results, title) {
    const norm = normalize(title);
    let topSlug = null, topScore = 0;
    for (const item of results) {
        const slug = String(item.url || '').replace(/\\\//g, '/');
        if (normalize(item.title || '') === norm) return slug;
        const score = similarity(item.title || '', title);
        if (score > topScore) { topScore = score; topSlug = slug; }
    }
    return topScore >= 0.5 ? topSlug : null;
}

function extractStreams(html) {
    const $ = require('cheerio').load(html);
    const seen = new Set();
    const streams = [];
    const TYPE = { hsub: 'Japanese [Hard Sub]', sub: 'Japanese', dub: 'English' };

    $('.lang-group').each((_, panel) => {
        const type = TYPE[$(panel).attr('data-id')] || 'SUB';

        $(panel).find('[data-video]').each((_, el) => {
            const src = $(el).attr('data-video') || '';
            const m = src.match(/^https?:\/\/([^/]+)\/([^?&#]+)/);
            if (!m || !m[1].includes('vivibebe')) return;

            const url = `https://vivibebe.site/public/stream/${m[2]}/master.m3u8`;
            if (seen.has(url)) return;
            seen.add(url);

            const entry = {
                name: `AniNeko \u2022 ${type}`,
                title: `AniNeko \u2022 ${type}`,
                url,
                quality: '1080p',
                headers: { 'User-Agent': USER_AGENT },
            };

            const subParam = src.match(/[?&]sub=([^&]+)/);
            if (subParam) entry.subtitles = [{ url: decodeURIComponent(subParam[1]), language: 'English' }];

            streams.push(entry);
        });
    });

    return streams;
}

async function getStreams(tmdbId, mediaType, season, episode) {
    if (mediaType !== 'tv' || episode == null) return [];
    try {
        const tmdb = await fetch(
            `${TMDB_API_URL}/tv/${tmdbId}?api_key=${TMDB_API_KEY}`,
            { headers: { Accept: 'application/json' } }
        );
        if (!tmdb.ok) return [];
        const data = await tmdb.json();
        const title = data.name || data.original_name || '';
        if (!title) return [];

        const results = await search(searchQueries(title));
        if (!results) return [];

        const slug = bestMatch(results, title);
        if (!slug) return [];

        const base = slug.startsWith('http') ? slug : BASE_URL + slug;
        const html = await request(base.replace(/\/+$/, '') + '/ep-' + episode, { Referer: BASE_URL + '/' });
        return html ? extractStreams(html) : [];
    } catch {
        return [];
    }
}

module.exports = { getStreams };