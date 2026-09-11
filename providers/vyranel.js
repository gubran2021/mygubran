"use strict";

const PROVIDER_NAME = 'HindMovie';
const BASE_URL = 'https://hindmovie.icu';
const TMDB_KEY = '307b7b8ef035c6aa336900aef4e203bd';
const MAX_1080P_STREAMS = 3;

const MOBILE_UAS = [
    'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
];

function getHeaders(extra) {
    const ua = MOBILE_UAS[Math.floor(Math.random() * MOBILE_UAS.length)];
    const headers = {
        'User-Agent': ua,
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
    };
    if (extra)
        for (var key in extra) headers[key] = extra[key];
    return headers;
}

async function fetchText(url, options, timeout) {
    timeout = timeout || 12000;
    try {
        let signal = null;
        if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout)
            signal = AbortSignal.timeout(timeout);

        const headers = getHeaders(null);
        if (options && options.headers)
            for (var key in options.headers) headers[key] = options.headers[key];

        const fetchOptions = { ...(options || {}), headers };
        if (signal) fetchOptions.signal = signal;

        const fetchPromise = fetch(url, fetchOptions);
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout ' + timeout + 'ms')), timeout)
        );

        const res = await Promise.race([fetchPromise, timeoutPromise]);
        if (res.ok) return await res.text();
        return null;
    } catch (e) {
        return null;
    }
}

async function fetchJson(url, options, timeout) {
    const text = await fetchText(url, options, timeout);
    if (!text) return null;
    try { return JSON.parse(text); } catch (e) { return null; }
}

async function getMedia(id, type) {
    const idStr = String(id || '').trim();
    const isImdb = idStr.indexOf('tt') === 0;
    const mediaType = type === 'tv' || type === 'series' ? 'tv' : 'movie';

    try {
        if (isImdb) {
            const data = await fetchJson(
                'https://api.themoviedb.org/3/find/' + idStr +
                '?api_key=' + TMDB_KEY + '&external_source=imdb_id',
                {}, 10000
            );
            const results = data ? (mediaType === 'tv' ? data.tv_results : data.movie_results) : null;
            if (results && results.length > 0) {
                const item = results[0];
                return {
                    title: mediaType === 'tv' ? item.name : item.title,
                    year: (item.first_air_date || item.release_date || '').split('-')[0],
                    imdb: idStr
                };
            }
        } else {
            const data = await fetchJson(
                'https://api.themoviedb.org/3/' + mediaType + '/' + idStr +
                '?api_key=' + TMDB_KEY + '&append_to_response=external_ids',
                {}, 10000
            );
            if (data) return {
                title: mediaType === 'tv' ? data.name : data.title,
                year: (data.first_air_date || data.release_date || '').split('-')[0],
                imdb: data.imdb_id || (data.external_ids && data.external_ids.imdb_id) || null
            };
        }
    } catch (e) {
    }
    return { title: idStr, year: null, imdb: null };
}

function parseQuality(str) {
    const s = String(str || '');
    const m = s.match(/(2160|1080|720|480)\s*P/i);
    if (m) return m[1] + 'p';
    if (/4K|UHD/i.test(s)) return '2160p';
    if (/1440|2K/i.test(s)) return '1440p';
    return 'HD';
}

const ALLOWED_QUALITIES = ['2160p', '1080p'];

const QUALITY_WEIGHTS = {
    '2160p': 2,
    '1080p': 1
};

function getSourceTag(cleanTitle) {
    const lower = cleanTitle.toLowerCase();
    if (/netflix|\bnflx\b|\bnf\b/i.test(lower)) return 'Netflix';
    if (/dsnp|dsnp\+|\bds\b|disney\s*\+|disneyplus|disney\s*plus/i.test(lower)) return 'Disney+';
    if (/amazon\s*prime|prime\s*video|\bamzn\b|\bpmv\b|\bprmd\b/i.test(lower)) return 'Prime Video';
    if (/\bhbo\b|hbo\s*max|\bmax\b/i.test(lower)) return 'Max';
    if (/\bhulu\b|\bhl\b/i.test(lower)) return 'Hulu';
    if (/apple\s*tv|\batvp\b|\bapltv\b|\bappl\b/i.test(lower)) return 'Apple TV+';
    if (/paramount|\bparam\b|\bpmnt\b|\bpmtp\b/i.test(lower)) return 'Paramount+';
    if (/\bpeacock\b|\bpck\b|\bpckk\b/i.test(lower)) return 'Peacock';
    if (/\bmubi\b/i.test(lower)) return 'MUBI';
    if (/sony\s*liv|\bsliv\b|\bsnyl\b|\bsony\b/i.test(lower)) return 'SonyLIV';
    if (/zee\s*5|\bzee5\b|\bz5\b/i.test(lower)) return 'Zee5';
    if (/\bhotstar\b|\bhs\b|\bhot\b/i.test(lower)) return 'Hotstar';
    if (/jio\s*cinema|\bjc\b|\bjio\b/i.test(lower)) return 'JioCinema';
    if (/crunchyroll|\bcr\b|\bcrol\b/i.test(lower)) return 'Crunchyroll';
    if (/discovery\s*\+|\bdscvr\b|\bdscp\b/i.test(lower)) return 'Discovery+';
    if (/\bshowtime\b|\bsho\b|\bshtm\b/i.test(lower)) return 'Showtime';
    if (/\bstarz\b|\bstrz\b|\bstz\b/i.test(lower)) return 'Starz';
    if (/\bamc\b|\bamcp\b/i.test(lower)) return 'AMC+';
    if (/\btubi\b|\btb\b/i.test(lower)) return 'Tubi';
    if (/espn\s*\+|\bespnp\b/i.test(lower)) return 'ESPN+';
    if (/\baha\b|\baha\s*tamil\b/i.test(lower)) return 'Aha';
    if (/\bvoot\b|\bvt\b/i.test(lower)) return 'Voot';
    if (/\bsun\s*nxt\b|\bsnxt\b|\bsun\b/i.test(lower)) return 'Sun NXT';
    return '';
}

function normalizeQuality(quality) {
    if (!quality) return null;
    const q = quality.toLowerCase();
    if (q === '4k' || q === '4kp') return '2160p';
    if (ALLOWED_QUALITIES.includes(q)) return q;
    return null;
}

function makeStream(rawTitle, quality, url, serverNum, referer, streamTracker) {
    if (!url || !url.startsWith('http')) return null;

    const normalizedQuality = normalizeQuality(quality);
    if (!normalizedQuality) return null;

    // Check 1080p limit
    if (normalizedQuality === '1080p') {
        if (!streamTracker['1080p']) streamTracker['1080p'] = 0;
        if (streamTracker['1080p'] >= MAX_1080P_STREAMS) return null;
        streamTracker['1080p']++;
    }

    const cleanTitle = String(rawTitle || '')
        .replace(/&#8211;/g, '-')
        .replace(/&#8212;/g, '-')
        .replace(/&#8216;/g, "'")
        .replace(/&#8217;/g, "'")
        .replace(/&#8220;/g, '"')
        .replace(/&#8221;/g, '"')
        .replace(/&#038;/g, '&')
        .replace(/&amp;/g, '&')
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(code))
        .replace(/[\n\t]+/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();

    const displayQuality = normalizedQuality;

    let filename = '';
    const fileMatch = cleanTitle.match(/\[\s*([^\]]+\.(?:mkv|mp4|avi|zip|rar|ts))\s*\]/i);
    if (fileMatch) filename = fileMatch[1].trim();

    let fileSizeOnly = 'N/A';
    const sizeMatch = cleanTitle.match(/\[\s*(\d+(?:\.\d+)?\s*[MG]B)\s*\]/i);
    if (sizeMatch) fileSizeOnly = sizeMatch[1].trim();

    let sourceTag = 'WEB-DL';
    if (/bluray|blu-?ray|bdrip/i.test(cleanTitle)) sourceTag = 'Blu-ray';
    else if (/hdrip|webrip/i.test(cleanTitle)) sourceTag = 'WEBRip';

    let imaxTag = '';
    if (/imax/i.test(cleanTitle)) imaxTag = ' • IMAX';

    let rangeTag = '';
    if (/dolby\s*vision|dovi/i.test(cleanTitle.toLowerCase())) rangeTag = 'Dolby Vision';
    else if (/hdr10/i.test(cleanTitle)) rangeTag = 'HDR10';
    else if (/hdr/i.test(cleanTitle)) rangeTag = 'HDR';
    else if (/10bit|10-bit/i.test(cleanTitle)) rangeTag = '10-Bit';
    else if (/sdr/i.test(cleanTitle.toLowerCase())) rangeTag = 'SDR';

    let codecTag = 'H.264';
    if (/hevc|x265|h265/i.test(cleanTitle)) codecTag = 'H.265';
    else if (/x264|h264/i.test(cleanTitle)) codecTag = 'H.264';

    const videoRangeBlock = rangeTag ? `${rangeTag} • ${codecTag}` : codecTag;

    let audioChannelTag = 'AAC';
    const audioMatch = cleanTitle.match(/(TrueHD\s*7\.1|DDP\s*7\.1|DDP\s*5\.1|DD\s*5\.1|5\.1|AAC)/i);
    if (audioMatch) {
        let matchedTag = audioMatch[1].toUpperCase().replace(/\s+/g, '');
        if (matchedTag === '5.1') matchedTag = 'DDP5.1';
        if (matchedTag.includes('TRUEHD')) matchedTag = 'TrueHD 7.1';
        audioChannelTag = matchedTag;
    } else if (/dolby\s*digital|dd/i.test(cleanTitle)) {
        audioChannelTag = 'Dolby Digital';
    } else if (/dolby/i.test(cleanTitle)) {
        audioChannelTag = 'Dolby';
    }
    if (/atmos/i.test(cleanTitle)) {
        audioChannelTag = audioChannelTag !== 'AAC'
            ? `${audioChannelTag} • Atmos`
            : 'Atmos';
    }

    const lowerTitle = cleanTitle.toLowerCase();
    const langMap = {
        'hindi': 'Hindi',
        'eng': 'English',
        'english': 'English',
        'tam': 'Tamil',
        'tamil': 'Tamil',
        'tel': 'Telugu',
        'telugu': 'Telugu',
        'ben': 'Bengali',
        'bengali': 'Bengali',
        'mal': 'Malayalam',
        'malayalam': 'Malayalam',
        'kan': 'Kannada',
        'kannada': 'Kannada',
        'guj': 'Gujarati',
        'gujarati': 'Gujarati',
        'mar': 'Marathi',
        'marathi': 'Marathi',
        'pun': 'Punjabi',
        'punjabi': 'Punjabi',
        'odia': 'Odia',
        'asamiya': 'Assamese',
        'nepali': 'Nepali'
    };

    const langFlags = [];
    const isDual = /dual|hindi\-eng|eng\-hin|multi audio|multi-audio/.test(cleanTitle);

    if (isDual) {
        langFlags.push('Dual/Multi Audio');
    } else {
        for (const key in langMap) {
            const pattern = new RegExp('\\b' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
            if (pattern.test(cleanTitle)) {
                const lang = langMap[key];
                if (!langFlags.includes(lang)) langFlags.push(lang);
            }
        }
        if (langFlags.length === 0) langFlags.push('Unknown');
    }
    const displayLanguages = langFlags.join(' • ');

    const platformSource = getSourceTag(cleanTitle);
    const format = url.toLowerCase().includes('.mkv') ? 'mkv' : 'mp4';
    const serverLabel = 'Server ' + serverNum;

    let label = `${PROVIDER_NAME} • ${displayQuality.toUpperCase()}${imaxTag} • ${serverLabel}`;
    if (platformSource) {
        label = `${PROVIDER_NAME} • ${platformSource} • ${displayQuality.toUpperCase()}${imaxTag} • ${serverLabel}`;
    }

    const line1 = `${displayLanguages}${fileSizeOnly !== 'N/A' ? ` • ${fileSizeOnly}` : ''}`.trim();
    const line2 = `${sourceTag}${audioChannelTag !== 'AAC' ? ` • ${audioChannelTag}` : ''} • ${videoRangeBlock}`.trim();

    return {
        name: label,
        title: label,
        size: line1 ? `${line1}\n${line2}` : line2,
        url: url,
        quality: displayQuality,
        format: format,
        _resWeight: QUALITY_WEIGHTS[displayQuality] || 0,
        _quality: displayQuality,
        _serverKey: displayQuality + '_' + serverNum,
        _sizeWeight: sizeMatch
            ? parseFloat(sizeMatch[1]) * (sizeMatch[1].toUpperCase().includes('GB') ? 1024 : 1)
            : 0,
        behaviorHints: {
            notWebReady: true,
            proxyHeaders: {
                request: { 'Referer': referer || BASE_URL + '/' }
            }
        },
        _baseURL: url.split('?')[0]
    };
}

function decodeBase64(str) {
    if (typeof atob === 'function') return atob(str);
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let out = '';
    str = String(str).replace(/=+$/, '');
    for (let i = 0, buf, enc, j = 0;
        enc = str.charAt(j++);
        ~enc && (buf = i % 4 ? buf * 64 + enc : enc, i++ % 4)
            ? out += String.fromCharCode(255 & buf >> (-2 * i & 6))
            : 0) {
        enc = chars.indexOf(enc);
    }
    return out;
}

function encodeBase64(str) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let a, b, c, i1, i2, i3, i4, triplet, out = '', i = 0;
    do {
        a = str.charCodeAt(i++);
        b = str.charCodeAt(i++);
        c = str.charCodeAt(i++);
        triplet = a << 16 | b << 8 | c;
        i1 = triplet >> 18 & 63;
        i2 = triplet >> 12 & 63;
        i3 = triplet >> 6 & 63;
        i4 = triplet & 63;
        out += chars.charAt(i1)
            + chars.charAt(i2)
            + (isNaN(b) ? '=' : chars.charAt(i3))
            + (isNaN(c) ? '=' : chars.charAt(i4));
    } while (i < str.length);
    return out;
}

function urlSafeBase64Encode(str) {
    return encodeBase64(str)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

async function bypassHShareAPI(id, referer) {
    const encoded = urlSafeBase64Encode(id);
    const body = 'action=hindshare_sign&d=' + encodeURIComponent(encoded);

    const data = await fetchJson('https://mvlink.blog/wp-admin/admin-ajax.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Referer': referer,
            'X-Requested-With': 'XMLHttpRequest'
        },
        body
    });

    if (data && data.success && data.data && data.data.url) {
        return data.data.url;
    }
    return null;
}

async function processHShareLink(links, quality, title, referer, filename, serverTracker, streamTracker) {
    const streams = [];

    for (let i = 0; i < (links || []).length; i++) {
        const link = links[i];
        const urlMatch = link.match(/url=([^&]+)/i);
        if (!urlMatch) continue;

        try {
            const decoded = decodeBase64(urlMatch[1]);
            if (!decoded.startsWith('http')) continue;

            const html = await fetchText(decoded, { headers: { 'Referer': referer } });

            if (!serverTracker[quality]) serverTracker[quality] = 1;

            if (html) {
                const re = /href="([^"]+\.workers\.dev[^"]+)"/ig;
                let m;
                while ((m = re.exec(html)) !== null) {
                    const streamUrl = m[1];
                    const cacheBusted = streamUrl.includes('?')
                        ? streamUrl + '&s=' + Date.now()
                        : streamUrl + '?s=' + Date.now();
                    const streamName = filename ? filename.replace(/\.mkv|\.mp4|\.avi/gi, '') : title;
                    const serverNum = serverTracker[quality];
                    serverTracker[quality]++;
                    const stream = makeStream(streamName, quality, cacheBusted, serverNum, referer, streamTracker);
                    if (stream) streams.push(stream);
                }

                if (streams.length === 0) {
                    let streamUrl = null;
                    if (decoded.includes('.workers.dev')) {
                        streamUrl = decoded;
                    } else {
                        const m2 = decoded.match(/url=([^&]+)/i);
                        if (m2) {
                            const inner = decodeBase64(m2[1]);
                            if (inner.includes('.workers.dev')) streamUrl = inner;
                        }
                    }
                    if (streamUrl) {
                        const cacheBusted = streamUrl.includes('?')
                            ? streamUrl + '&s=' + Date.now()
                            : streamUrl + '?s=' + Date.now();
                        const streamName = filename ? filename.replace(/\.mkv|\.mp4|\.avi/gi, '') : title;
                        const serverNum = serverTracker[quality];
                        serverTracker[quality]++;
                        const stream = makeStream(streamName, quality, cacheBusted, serverNum, referer, streamTracker);
                        if (stream) streams.push(stream);
                    }
                }
            }
        } catch (e) {
        }
    }
    return streams;
}

async function processMvlink(mvlinkUrl, referer, title, quality, episode, serverTracker, streamTracker) {
    const streams = [];

    const html = await fetchText(mvlinkUrl, { headers: { 'Referer': referer } });
    if (!html) return streams;

    const re = /href="(?:https:\/\/hshare\.ink\/\?id=([^"]+)|https:\/\/hshare\.ink\/dl\/([^"]+))"/ig;
    let m;
    const hshareIds = [];
    while ((m = re.exec(html)) !== null) {
        if (m[1]) hshareIds.push(decodeURIComponent(m[1]));
    }
    if (hshareIds.length === 0) return streams;

    async function resolveId(id) {
        const fUrl = await bypassHShareAPI(id, mvlinkUrl);
        const fHtml = await fetchText(fUrl, { headers: { 'Referer': mvlinkUrl } });
        if (!fHtml) return [];
        const nameMatch = fHtml.match(/Name:\s*([^<]+)/i);
        const filename = nameMatch ? nameMatch[1].trim() : null;
        const hcloudLinks = [];
        const re2 = /href="([^"]+hcloud\.ink[^"]+)"/ig;
        let m2;
        while ((m2 = re2.exec(fHtml)) !== null) {
            if (m2[1]) hcloudLinks.push(m2[1]);
        }
        return processHShareLink(hcloudLinks, quality, title, fUrl, filename, serverTracker, streamTracker);
    }

    if (episode != null) {
        const epIdx = episode - 1;
        let found = false;

        if (epIdx >= 0 && epIdx < hshareIds.length) {
            const results = await resolveId(hshareIds[epIdx]);
            if (results && results.length > 0) {
                streams.push(...results);
                found = true;
            }
        }

        if (!found) {
            const otherIds = hshareIds.filter((_, idx) => idx !== epIdx);
            for (let i = 0; i < otherIds.length; i += 3) {
                const batch = otherIds.slice(i, i + 3);
                const batchResults = await Promise.all(batch.map(resolveId));
                let anyFound = false;
                batchResults.forEach(r => {
                    if (r && r.length > 0) { streams.push(...r); anyFound = true; }
                });
                if (anyFound) break;
            }
        }
    } else {
        for (let i = 0; i < hshareIds.length; i++) {
            const results = await resolveId(hshareIds[i]);
            if (results) streams.push(...results);
        }
    }

    return streams;
}

function extractSeasonHtml(html, season) {
    if (!html || season == null) return html;

    const re = /(?:Season|Saison|Staffel)\s+0*(\d+)\b/gi;
    let m;
    const markers = [];

    while ((m = re.exec(html)) !== null) {
        let start = html.lastIndexOf('<', m.index);
        if (start < 0 || m.index - start > 500) start = m.index;
        const ctx = html.substring(start, m.index + 50);
        if (ctx.toLowerCase().includes('download') || ctx.toLowerCase().includes('episode')) continue;
        markers.push({ season: parseInt(m[1]), index: start });
    }

    if (markers.length === 0) return html;

    const matched = markers.filter(mk => mk.season === season);
    if (matched.length === 0) return html;

    const startIdx = matched[0].index;
    let endMarker = null;
    for (let i = 0; i < markers.length; i++) {
        if (markers[i].index > startIdx && markers[i].season !== season) {
            endMarker = markers[i];
            break;
        }
    }

    return html.substring(startIdx, endMarker ? endMarker.index : html.length);
}

function dedupe(streams) {
    const seen = {};
    return (streams || []).filter(s => {
        if (!s || !s._baseURL || !s._quality) return false;
        const dedupKey = s._baseURL + '|' + s._quality;
        if (seen[dedupKey]) return false;
        seen[dedupKey] = true;
        return true;
    });
}

function pad2(n) {
    return n != null && n < 10 ? '0' + n : String(n);
}

async function searchWPJson(query) {
    const url = BASE_URL + '/wp-json/wp/v2/posts?search=' + encodeURIComponent(query) + '&per_page=100';
    const data = await fetchJson(url);
    if (!data || !Array.isArray(data)) return [];

    const results = [];
    for (let i = 0; i < data.length; i++) {
        const post = data[i];
        if (post && post.title && post.title.rendered) {
            const title = post.title.rendered.replace(/<[^>]+>/g, '').trim();
            const yearMatch = title.match(/\b(19\d{2}|20\d{2})\b/);
            const year = yearMatch ? yearMatch[1] : null;
            results.push({
                id: post.id,
                title,
                year,
                content: post.content ? post.content.rendered : ''
            });
        }
    }
    return results;
}

function getCleanTitle(title) {
    return String(title)
        .replace(/&#8211;/g, '-')
        .replace(/&#8212;/g, '-')
        .replace(/&#8216;/g, "'")
        .replace(/&#8217;/g, "'")
        .replace(/&#8220;/g, '"')
        .replace(/&#8221;/g, '"')
        .replace(/&#038;/g, '&')
        .replace(/&amp;/g, '&')
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(code))
        .toLowerCase()
        .replace(/download/g, '')
        .replace(/\b(dual audio|multi audio|hindi|english|tamil|telugu|malayalam|korean|japanese|chinese|spanish|french|italian|german)\b/g, '')
        .replace(/\b(480p|720p|1080p|2160p|4k|2k|hd|fhd|uhd)\b/g, '')
        .replace(/\b(web-?dl|web-?rip|brrip|bdrip|bluray|blu-?ray|hdtv|tvrip|dvdrip|camrip|hdrip)\b/g, '')
        .replace(/\b(x264|x265|hevc|10bit|12bit|aac|ac3|dd5\.1|ddp5\.1|atmos|dts)\b/g, '')
        .replace(/\b(esub|esubs|msub|msubs|hcsub|hcsubs)\b/g, '')
        .replace(/\b(season|saison|staffel)\s*\d+(?:\s*(?:-|to)\s*\d+)?\b/g, '')
        .replace(/\bs\d+(?:\s*(?:-|to)\s*\d+)?\b/g, '')
        .replace(/\b(episode|episodes|ep)\s*\d+(?:\s*(?:-|to)\s*\d+)?\s*(added|update|updated)?\b/g, '')
        .replace(/\b(complete|all episodes|pack|batch)\b/g, '')
        .replace(/\b(movie|film|part\s*\d+|vol\s*\d+|volume\s*\d+)\b/g, '')
        .replace(/\b(unrated|extended|directors cut|uncut|18)\b/g, '')
        .replace(/\b(19\d{2}|20\d{2})\b/g, '')
        .replace(/[^a-z0-9]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^(the|a|an)\s+/g, '');
}

function isStrictMatch(title1, year1, title2, year2) {
    if (!title1 || !title2) return false;
    const clean1 = getCleanTitle(title1);
    const clean2 = getCleanTitle(title2);
    if (clean1 === clean2) return true;
    if (year1 && year2) {
        const y1 = parseInt(year1);
        const y2 = parseInt(year2);
        if (!isNaN(y1) && !isNaN(y2) && Math.abs(y1 - y2) > 1) return false;
    }
    return false;
}

async function getStreams(id, type, season, episode) {
    try {
        const serverTracker = {};
        const streamTracker = {};

        const media = await getMedia(id, type);
        if (!media || !media.title) return [];

        const isTv = type === 'tv' || type === 'series';
        const seasonNum = season != null ? Number(season) : null;
        const episodeNum = episode != null ? Number(episode) : null;

        let posts = [];
        if (media.imdb) {
            posts = await searchWPJson(media.imdb);
        }
        if (!posts || posts.length === 0) {
            posts = await searchWPJson(media.title);
        }

        let match = null;
        if (media.imdb) {
            for (let i = 0; i < posts.length; i++) {
                if (posts[i].content && posts[i].content.includes(media.imdb)) {
                    match = posts[i];
                    break;
                }
            }
        }
        if (!match) {
            for (let i = 0; i < posts.length; i++) {
                if (isStrictMatch(media.title, media.year, posts[i].title, posts[i].year)) {
                    match = posts[i];
                    break;
                }
            }
        }

        if (!match) {
            return [];
        }

        let content = match.content;
        if (isTv && seasonNum != null) {
            const seasonHtml = extractSeasonHtml(content, seasonNum);
            if (seasonHtml) content = seasonHtml;
        }

        const mvlinks = [];
        const re = /href="(https?:\/\/mvlink\.blog\/(?:web\/)?\d+)"/ig;
        let m;
        while ((m = re.exec(content)) !== null) {
            const url = m[1];
            const ctxStart = Math.max(0, m.index - 500);
            const ctx = content.substring(ctxStart, m.index);
            const rawQuality = parseQuality(ctx);
            const quality = normalizeQuality(rawQuality);
            if (!quality) continue;
            mvlinks.push({ url, quality });
        }

        if (mvlinks.length === 0) {
            return [];
        }

        const displayTitle = isTv
            ? media.title + ' [S' + pad2(seasonNum) + 'E' + pad2(episodeNum) + ']'
            : match.title;

        let streams = [];
        for (let i = 0; i < mvlinks.length; i++) {
            const link = mvlinks[i];
            const results = await processMvlink(link.url, BASE_URL + '/', displayTitle, link.quality, episodeNum, serverTracker, streamTracker);
            if (results && results.length > 0) streams.push(...results);
        }

        streams = dedupe(streams);

        streams.sort((a, b) => {
            if (b._resWeight !== a._resWeight) return b._resWeight - a._resWeight;
            return (b._sizeWeight || 0) - (a._sizeWeight || 0);
        });

        return streams;
    } catch (e) {
        return [];
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    global.getStreams = getStreams;
}