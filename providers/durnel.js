"use strict";

const TMDB_API_URL = 'https://api.themoviedb.org/3';
const TMDB_API_KEY = '307b7b8ef035c6aa336900aef4e203bd';
const BASE_URL = 'https://ctgmovies.com';
const API_BASE_URL = 'https://cockpit.103.109.92.178.nip.io/api/v1';
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";
const AUTH_CONFIG = {
    token: '',
    cookie: '',
};
const WEB_HEADERS = {
    'User-Agent': USER_AGENT,
    'Accept': 'application/json',
    'Accept-Language': 'en',
    'Referer': BASE_URL + '/',
    'Origin': BASE_URL
};
const STREAM_HEADERS = {
    'User-Agent': USER_AGENT,
    'Accept': 'video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'identity',
    'Referer': BASE_URL + '/'
};

function encodeUrl(s) {
    return encodeURIComponent(s || '');
}

function yearFromDate(date) {
    if (!date) return null;
    const m = date.match(/\d{4}/);
    return m ? parseInt(m[0], 10) : null;
}

function cleanDisplayTitle(title) {
    if (!title) return '';
    return title
        .replace(/\b(1080p|720p|480p|2160p|4k|web[- ]?dl|webrip|bluray|hdrip|x264|x265|hevc|10bit|dual[- ]?audio|hindi[- ]?dubbed|dubbed|esub)\b/gi, ' ')
        .replace(/\[[^\]]*\]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizedTitle(title) {
    return cleanDisplayTitle(title)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function optString(obj, key) {
    if (!obj || obj[key] == null) return null;
    let v = obj[key];
    if (typeof v !== 'string') v = String(v);
    v = v.trim();
    if (!v || v === 'null') return null;
    return v;
}

function optInt(obj, key) {
    if (!obj || obj[key] == null) return null;
    const v = obj[key];
    if (typeof v === 'number') return v;
    const parsed = parseInt(String(v), 10);
    return isNaN(parsed) ? null : parsed;
}

function optDouble(obj, key) {
    if (!obj || obj[key] == null) return null;
    const v = obj[key];
    if (typeof v === 'number') return v;
    const parsed = parseFloat(String(v));
    return isNaN(parsed) ? null : parsed;
}

function splitCsv(s) {
    if (!s) return [];
    return s.split(/[,\s]+/).map(x => x.trim()).filter(Boolean);
}

function resolveMediaUrl(url) {
    if (!url) return '';
    if (url.startsWith('//')) return 'https:' + url;
    if (/^https?:\/\//i.test(url)) return url;
    if (url.startsWith('/')) return BASE_URL + url;
    return url;
}

function isDirectVideo(url) {
    if (!url) return false;
    const lower = url.split('?')[0].toLowerCase();
    return lower.endsWith('.mp4') || lower.endsWith('.mkv') ||
        lower.endsWith('.webm') || lower.endsWith('.avi') ||
        lower.endsWith('.mov') || lower.endsWith('.ts') || lower.endsWith('.m4v');
}

function qualityFromUrl(url) {
    if (!url) return 'Unknown';
    const m = url.match(/(2160p|1440p|1080p|720p|480p|360p|4k|uhd)/i);
    if (m) {
        const v = m[1].toLowerCase();
        if (v === '4k' || v === 'uhd') return '2160p';
        return v;
    }
    return 'Unknown';
}

function resWeight(quality) {
    const q = (quality || '').toLowerCase();
    if (q === '2160p') return 5;
    if (q === '1440p') return 4;
    if (q === '1080p') return 3;
    if (q === '720p') return 2;
    if (q === '480p') return 1;
    if (q === '360p') return 0;
    return -1;
}

function isValidLanguage(lang) {
    if (!lang) return false;
    const lower = lang.toLowerCase().trim();
    if (lower === '' || lower === 'unknown' || lower === 'null' || lower === 'none') return false;
    return true;
}

function buildShortSourceName(link, finalUrl, index) {
    const langs = new Set();

    function addLang(value) {
        if (!value) return;
        const parts = splitCsv(value);
        for (const part of parts) {
            if (isValidLanguage(part)) {
                langs.add(part);
            }
        }
    }

    if (Array.isArray(link.languages)) {
        for (const lang of link.languages) {
            addLang(optString({ val: lang }, 'val') || String(lang).trim());
        }
    }

    const langField = optString(link, 'language') || optString(link, 'lang');
    addLang(langField);

    const subKeys = ['subtitle_tracks', 'subtitles', 'captions', 'tracks'];
    for (const key of subKeys) {
        const subs = link[key];
        if (Array.isArray(subs)) {
            for (const sub of subs) {
                const label = optString(sub, 'label')
                    || optString(sub, 'language')
                    || optString(sub, 'srclang');
                addLang(label);
            }
        }
    }

    if (langs.size === 0) {
        langs.add('English');
    }

    const langString = Array.from(langs).join(' • ');
    return `CTGMovies`;
}

function buildQualityInitials() {
    const hints = Array.prototype.slice.call(arguments).filter(Boolean);
    const raw = hints.join(' ').replace(/%20/g, ' ').replace(/_/g, ' ').replace(/-/g, ' ');
    if (!raw.trim()) return null;

    function has(pattern) {
        return new RegExp(pattern, 'i').test(raw);
    }

    const parts = [];
    if (has('\\b3d\\b')) parts.push('3D');

    if (has('\\b(?:4k|2160p|uhd)\\b')) {
        parts.push('4K');
    } else {
        const re = /\b(1080|720|480|360)p\b/gi;
        let m;
        const nums = [];
        while ((m = re.exec(raw)) !== null) nums.push(parseInt(m[1], 10));
        const max = Math.max.apply(null, nums.length ? nums : [-Infinity]);
        if (max !== -Infinity) parts.push(max + 'p');
    }

    if (!parts.length && has('\\bHD\\b')) parts.push('HD');

    if (!parts.length) {
        const map = [
            ['WEB-DL', '\\bweb[- ]?dl\\b'],
            ['WEBRip', '\\bwebrip\\b'],
            ['BluRay', '\\b(?:bluray|blu ray|brrip)\\b'],
            ['HDRip', '\\bhdrip\\b'],
            ['HEVC', '\\b(?:hevc|x265|h265)\\b'],
            ['10bit', '\\b10[- ]?bit\\b'],
        ];
        for (const [label, pattern] of map) {
            if (has(pattern)) { parts.push(label); break; }
        }
    }
    return parts.length ? parts.join(' ') : null;
}

function cleanSourceName(s) {
    if (!s) return '';
    return s.replace('auto:', '')
        .replace(/:/g, ' ')
        .replace(/-/g, ' ')
        .trim()
        || s;
}

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return 'Unknown';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getTMDBDetails(tmdbId, mediaType) {
    const endpoint = mediaType === 'tv' ? 'tv' : 'movie';
    const url = `${TMDB_API_URL}/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`;

    return fetch(url, { headers: { 'Accept': 'application/json' }, skipSizeCheck: true })
        .then(r => {
            if (!r.ok) throw new Error('TMDB HTTP ' + r.status);
            return r.json();
        })
        .then(data => {
            const title = mediaType === 'tv' ? data.name : data.title;
            const releaseDate = mediaType === 'tv' ? data.first_air_date : data.release_date;
            return {
                title: title,
                year: releaseDate ? parseInt(releaseDate.split('-')[0], 10) : null,
                imdbId: (data.external_ids && data.external_ids.imdb_id) || null,
            };
        })
        .catch(() => null);
}

function queryString(query) {
    query = query || {};
    const params = Object.keys(query)
        .filter(k => query[k] != null)
        .map(k => `${encodeUrl(k)}=${encodeUrl(String(query[k]))}`);
    return params.length ? '?' + params.join('&') : '';
}

function buildApiUrl(path, query) {
    const p = path.startsWith('/') ? path : '/' + path;
    return API_BASE_URL + p + queryString(query);
}

function buildSameOriginUrl(path, query) {
    const p = path.startsWith('/') ? path : '/' + path;
    return BASE_URL + '/api/v1' + p + queryString(query);
}

function apiHeaders() {
    const h = Object.assign({}, WEB_HEADERS);
    if (AUTH_CONFIG.token && AUTH_CONFIG.token.trim()) {
        const token = AUTH_CONFIG.token.trim()
            .replace(/^Bearer\s+/i, '');
        h['Authorization'] = 'Bearer ' + token;
        h['x-auth-token'] = token;
    }
    if (AUTH_CONFIG.cookie && AUTH_CONFIG.cookie.trim()) {
        h['Cookie'] = AUTH_CONFIG.cookie.trim();
    }
    return h;
}

function apiGet(path, query) {
    const primaryUrl = buildApiUrl(path, query);
    const fallbackUrl = buildSameOriginUrl(path, query);
    const headers = apiHeaders();

    function tryFetch(url, attempt) {
        attempt = attempt || 0;
        return fetch(url, { headers: headers, skipSizeCheck: true })
            .then(r => {
                if (r.status >= 500 && r.status < 600 && attempt < 1) {
                    return new Promise(resolve => setTimeout(resolve, 300))
                        .then(() => tryFetch(url, attempt + 1));
                }
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.text();
            });
    }

    return tryFetch(primaryUrl)
        .catch(() => tryFetch(fallbackUrl))
        .catch(() => null);
}

function toSearchItem(obj, kind) {
    const isMovie = kind === 'movies';
    const isAnime = kind === 'anime' || (obj.is_anime === true && kind !== 'tv');

    const title = optString(obj, 'title')
        || optString(obj, 'name')
        || optString(obj, 'english_title');
    if (!title) return null;

    const id = optString(obj, 'slug') || optString(obj, 'id') || optString(obj, '_id');
    if (!id) return null;

    const poster = optString(obj, 'poster_url') || optString(obj, 'cover_url');
    const year = optInt(obj, 'year')
        || yearFromDate(optString(obj, 'release_date'))
        || yearFromDate(optString(obj, 'first_air_date'));

    let type;
    if (isMovie) type = 'movie';
    else if (isAnime) type = 'anime';
    else type = 'tv';

    let url;
    if (isMovie) url = `${BASE_URL}/movies/${id}`;
    else if (isAnime) url = `${BASE_URL}/anime/${id}`;
    else url = `${BASE_URL}/tv/${id}`;

    return {
        title: cleanDisplayTitle(title),
        url: url,
        kind: kind,
        id: id,
        type: type,
        poster: poster,
        year: year,
        sourceLabel: buildQualityInitials(
            optString(obj, 'quality'),
            optString(obj, 'source'),
            optString(obj, 'source_display'),
            title
        ),
    };
}

function parseSearchItems(raw, kind) {
    if (!raw) return [];
    let trimmed = raw.trim();
    let arr;
    try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
            arr = parsed;
        } else if (parsed && typeof parsed === 'object') {
            arr = parsed.movies || parsed.results || parsed.data || [];
        } else {
            arr = [];
        }
    } catch (e) {
        return [];
    }

    const items = [];
    for (const obj of arr) {
        const item = toSearchItem(obj, kind);
        if (item) items.push(item);
    }
    return items;
}

function searchCtg(query) {
    const params = { search: query };

    const moviesP = apiGet('/movies', params).then(raw => parseSearchItems(raw, 'movies')).catch(() => []);
    const tvP = apiGet('/tv', params).then(raw => parseSearchItems(raw, 'tv')).catch(() => []);
    const animeP = apiGet('/anime', params).then(raw => parseSearchItems(raw, 'anime')).catch(() => []);

    return Promise.all([moviesP, tvP, animeP]).then(([m, t, a]) => m.concat(t).concat(a));
}

function findBestMatch(mediaInfo, items, mediaType) {
    if (!items.length) return null;

    const targetNorm = normalizedTitle(mediaInfo.title);
    const targetYear = mediaInfo.year;
    let best = null;
    let bestScore = -1;

    for (const item of items) {
        const itemNorm = normalizedTitle(item.title);
        let score = -1;

        if (itemNorm === targetNorm) {
            score = 100;
            if (targetYear && item.year === targetYear) score += 50;
        } else if (itemNorm.includes(targetNorm) && targetNorm.length >= 4) {
            score = 60;
            if (targetYear && item.year === targetYear) score += 30;
        } else if (targetNorm.includes(itemNorm) && itemNorm.length >= 4) {
            score = 40;
        }

        if (mediaType === 'tv' && (item.type === 'tv' || item.type === 'anime')) score += 10;
        if (mediaType === 'movie' && (item.type === 'movie' || item.type === 'anime')) score += 10;

        if (score > bestScore) {
            bestScore = score;
            best = item;
        }
    }

    return bestScore >= 30 ? best : null;
}

function getDetail(item) {
    return apiGet(`/${item.kind}/${encodeUrl(item.id)}`)
        .then(raw => {
            if (!raw) return null;
            try { return JSON.parse(raw); } catch (e) { return null; }
        });
}

function buildStreams(links, mediaTitle) {
    const seen = new Set();
    const out = [];

    links.forEach((link, i) => {
        if (!link || link.broken === true) return;

        const rawUrl = optString(link, 'url')
            || optString(link, 'file')
            || optString(link, 'src')
            || optString(link, 'link');
        if (!rawUrl) return;

        const finalUrl = resolveMediaUrl(rawUrl);
        if (!finalUrl || seen.has(finalUrl)) return;
        seen.add(finalUrl);

        const sourceName = buildShortSourceName(link, finalUrl, i + 1);

        let quality = qualityFromUrl(finalUrl);
        if (quality === 'Unknown') {
            const qHint = optString(link, 'quality') || '';
            const qMatch = qHint.match(/(2160|1440|1080|720|480|360)p?/i);
            if (qMatch) {
                const v = parseInt(qMatch[1], 10);
                quality = v >= 2160 ? '2160p' : v >= 1440 ? '1440p' : v >= 1080 ? '1080p' :
                    v >= 720 ? '720p' : v >= 480 ? '480p' : v >= 360 ? '360p' : 'Unknown';
            }
        }

        const langs = new Set();

        function addLang(value) {
            if (!value) return;
            const parts = splitCsv(value);
            for (const part of parts) {
                if (isValidLanguage(part)) {
                    langs.add(part);
                }
            }
        }

        if (Array.isArray(link.languages)) {
            for (const lang of link.languages) {
                addLang(optString({ val: lang }, 'val') || String(lang).trim());
            }
        }

        const langField = optString(link, 'language') || optString(link, 'lang');
        addLang(langField);

        const subKeys = ['subtitle_tracks', 'subtitles', 'captions', 'tracks'];
        for (const key of subKeys) {
            const subs = link[key];
            if (Array.isArray(subs)) {
                for (const sub of subs) {
                    const label = optString(sub, 'label')
                        || optString(sub, 'language')
                        || optString(sub, 'srclang');
                    addLang(label);
                }
            }
        }

        const languageStr = langs.size > 0 ? Array.from(langs).join(' • ') : 'English';

        out.push({
            name: sourceName,
            title: sourceName,
            url: finalUrl,
            quality: quality,
            language: languageStr,
            headers: STREAM_HEADERS
        });
    });

    return out.sort((a, b) => resWeight(b.quality) - resWeight(a.quality));
}

function getMovieStreams(item, mediaInfo) {
    return getDetail(item)
        .then(obj => {
            if (!obj) return [];
            const links = obj.links || [];
            if (!links.length) return [];
            const title = mediaInfo.year
                ? `${mediaInfo.title} (${mediaInfo.year})`
                : mediaInfo.title;
            return buildStreams(links, title);
        })
        .catch(() => []);
}

function getEpisodeStreams(item, mediaInfo, season, episode) {
    return getDetail(item)
        .then(obj => {
            if (!obj) return [];
            const episodes = obj.episodes || [];
            if (!episodes.length) return [];

            const mergedLinks = [];
            for (const ep of episodes) {
                const epNum = optInt(ep, 'episode_number') || optInt(ep, 'absolute_number');
                const seasonNum = optInt(ep, 'season_number') || 1;
                if (seasonNum !== season || epNum !== episode) continue;

                const links = ep.links || [];
                for (const link of links) {
                    if (link && link.broken !== true) mergedLinks.push(link);
                }
            }

            if (!mergedLinks.length) return [];

            const mediaTitle = `${mediaInfo.title} S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
            return buildStreams(mergedLinks, mediaTitle);
        })
        .catch(() => []);
}

function scrape(metadata) {
    const title = metadata && metadata.title;
    const type = (metadata && metadata.type) || 'movie';
    const season = metadata && metadata.season;
    const episode = metadata && metadata.episode;
    const year = metadata && metadata.year;

    if (!title) {
        return Promise.resolve([]);
    }

    const mediaInfo = { title: title, year: year || null, imdbId: (metadata && metadata.imdbId) || null };

    return searchCtg(title)
        .then(items => {
            if (!items.length) return [];

            const match = findBestMatch(mediaInfo, items, type);
            if (!match) return [];

            if (type === 'tv' && season && episode) {
                return getEpisodeStreams(match, mediaInfo, season, episode);
            }
            return getMovieStreams(match, mediaInfo);
        })
        .catch(() => []);
}

function getStreams(tmdbId, mediaType = 'movie', season = null, episode = null) {
    return getTMDBDetails(tmdbId, mediaType)
        .then(mediaInfo => {
            if (!mediaInfo || !mediaInfo.title) return [];

            return scrape({
                title: mediaInfo.title,
                year: mediaInfo.year,
                type: mediaType,
                season: season,
                episode: episode,
                imdbId: mediaInfo.imdbId,
            });
        })
        .catch(() => []);
}

module.exports = { getStreams };