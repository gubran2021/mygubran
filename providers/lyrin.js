"use strict";

const cheerio = require("cheerio");
const TMDB_API_KEY = "307b7b8ef035c6aa336900aef4e203bd";
const BASE_URL = "https://banglaplex.lat";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
};

function extractQuality(str) {
  const u = (str || "").toLowerCase();
  if (u.includes("2160p") || u.includes("4k")) return "4K";
  if (u.includes("1080p")) return "1080p";
  if (u.includes("720p")) return "720p";
  if (u.includes("480p")) return "480p";
  if (u.includes("360p")) return "360p";
  return "Unknown";
}

function unpackJs(packed) {
  const m = packed.match(/}\('(.*)',\s*(\d+|\[\]),\s*(\d+),\s*'(.*)'\.split\('\|'\)/);
  if (!m) return null;
  const [, payload, radixStr, countStr, wordsStr] = m;
  const radix = parseInt(radixStr) || 36;
  const count = parseInt(countStr);
  const words = wordsStr.split("|");
  const dict = {};
  for (let i = 0; i < count; i++) {
    const key = i.toString(radix);
    dict[key] = words[i] || key;
  }
  return payload.replace(/\b\w+\b/g, (w) => dict[w] || w);
}

async function extractStreamwishHG(url, referer) {
  try {
    const res = await fetch(url, { headers: { ...HEADERS, Referer: referer || url } });
    const html = await res.text();
    const packedMatch = html.match(/eval\(function\(p,a,c,k,e,d\)[\s\S]*?\)\)\)/);
    const unpacked = packedMatch ? unpackJs(packedMatch[0]) : html;
    if (!unpacked) return [];
    const fileMatch = unpacked.match(/file:"(.*?)"/) || unpacked.match(/sources:\s*\[\{\s*file:\s*"([^"]+)"/);
    if (!fileMatch) return [];
    const fileUrl = fileMatch[1];
    return [{
      url: (fileUrl.startsWith("//") ? "https:" + fileUrl : fileUrl).trim(),
      quality: extractQuality(fileUrl),
      name: "Streamwish",
      headers: { Referer: url },
      subtitles: [],
    }];
  } catch {
    return [];
  }
}

async function extractIplayerhls(url, referer) {
  try {
    const res = await fetch(url, { headers: { ...HEADERS, Referer: referer || url } });
    const html = await res.text();
    const packedMatch = html.match(/eval\(function\(p,a,c,k,e,d\)[\s\S]*?\)\)\)/);
    const unpacked = packedMatch ? unpackJs(packedMatch[0]) : html;
    if (!unpacked) return [];
    const fileMatch = unpacked.match(/sources:\[\{file:"(.*?)"/) || unpacked.match(/file:"(.*?)"/);
    if (!fileMatch) return [];
    const fileUrl = fileMatch[1];
    return [{
      url: (fileUrl.startsWith("//") ? "https:" + fileUrl : fileUrl).trim(),
      quality: extractQuality(fileUrl),
      name: "Iplayerhls",
      headers: { Referer: url },
      subtitles: [],
    }];
  } catch {
    return [];
  }
}

async function extractRpmvid(url, referer) {
  try {
    const res = await fetch(url, { headers: { ...HEADERS, Referer: referer || url } });
    const html = await res.text();
    const m3u8Match =
      html.match(/file\s*:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/) ||
      html.match(/source\s+src=["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/) ||
      html.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/);
    if (!m3u8Match) return [];
    return [{
      url: m3u8Match[1].trim(),
      quality: extractQuality(m3u8Match[1]),
      name: "Rpmvid",
      headers: { Referer: url },
      subtitles: [],
    }];
  } catch {
    return [];
  }
}

async function extractBanglaPlex(url, referer) {
  try {
    const res = await fetch(url, { headers: { ...HEADERS, Referer: referer || url } });
    const html = await res.text();
    const $ = cheerio.load(html);
    let directHref = null;
    $("div.vd a.btn-primary").each((i, el) => {
      if (directHref) return;
      if (/Generate Direct/i.test($(el).text())) directHref = $(el).attr("href");
    });
    if (!directHref) return [];

    const directUrl = directHref.startsWith("http") ? directHref : new URL(directHref, url).toString();
    const linksRes = await fetch(directUrl, { headers: { ...HEADERS, Referer: url } });
    const linksHtml = await linksRes.text();
    const $links = cheerio.load(linksHtml);
    const streams = [];

    const iframeSrc = $links("iframe").attr("src");
    if (iframeSrc) {
      streams.push({ url: iframeSrc, quality: extractQuality(iframeSrc), name: "BanglaPlex", headers: { Referer: directUrl }, subtitles: [] });
    }
    $links("h2 a.btn").each((i, el) => {
      const href = $links(el).attr("href");
      if (href) {
        streams.push({
          name: "BanglaPlex",
          quality: "1080p",
          url: href.startsWith("http") ? href : new URL(href, directUrl).toString(),
          headers: { Referer: directUrl },
          subtitles: [],
        });
      }
    });
    return streams;
  } catch {
    return [];
  }
}

async function extractGenericVidStack(url, referer) {
  try {
    const res = await fetch(url, { headers: { ...HEADERS, Referer: referer || url } });
    const html = await res.text();
    const m3u8Match =
      html.match(/file\s*:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/) ||
      html.match(/<source[^>]+src=["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/) ||
      html.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/);
    if (!m3u8Match) return [];
    return [{
      url: m3u8Match[1].trim(),
      quality: extractQuality(m3u8Match[1]),
      name: "VidStack",
      headers: { Referer: url },
      subtitles: [],
    }];
  } catch {
    return [];
  }
}

async function extractPlextream(url, referer) {
  try {
    const res = await fetch(url, { headers: { ...HEADERS, Referer: referer || url } });
    const html = await res.text();
    const $ = cheerio.load(html);
    const buttons = $(".menu-card button").toArray();
    const results = await Promise.all(
      buttons.map(async (btn) => {
        const onclick = $(btn).attr("onclick") || "";
        const m = onclick.match(/changeServer\('([^']*)'/);
        if (!m || !m[1]?.trim()) return [];
        const videoUrl = m[1];
        return /rpmvid|rpmshare|strp2p/i.test(videoUrl)
          ? extractGenericVidStack(videoUrl, referer)
          : dispatchExtractor(videoUrl, referer);
      })
    );
    return results.flat();
  } catch {
    return [];
  }
}

async function dispatchExtractor(url, referer) {
  try {
    const host = new URL(url).hostname;
    if (host.includes("xcloud")) return extractBanglaPlex(url, referer);
    if (host.includes("hglink")) return extractStreamwishHG(url, referer);
    if (host.includes("iplayerhls")) return extractIplayerhls(url, referer);
    if (host.includes("rpmvid")) return extractRpmvid(url, referer);
    if (host.includes("plextream")) return extractPlextream(url, referer);
    return extractGenericVidStack(url, referer);
  } catch {
    return [];
  }
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    if (mediaType !== "movie") return [];

    const tmdbUrl = `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${TMDB_API_KEY}`;
    const mediaInfo = await (await fetch(tmdbUrl, { headers: HEADERS })).json();
    const title = mediaInfo.title || mediaInfo.name;
    if (!title) return [];

    const searchUrl = `${BASE_URL}/search?q=${encodeURIComponent(title)}`;
    const searchHtml = await (await fetch(searchUrl, { headers: HEADERS })).text();
    const $ = cheerio.load(searchHtml);
    const results = [];
    $("div.movie-container > div.col-md-2").each((i, el) => {
      const a = $(el).find("div.movie-img > div.movie-title > h3 > a");
      const href = a.attr("href");
      const t = a.text().trim();
      if (href) results.push({ title: t, url: href });
    });
    if (!results.length) return [];

    const lcTitle = title.toLowerCase();
    const match = results.find((r) => r.title.toLowerCase().includes(lcTitle)) || results[0];
    const movieUrl = match.url.startsWith("http")
      ? match.url
      : `${BASE_URL}${match.url.startsWith("/") ? "" : "/"}${match.url}`;

    const movieHtml = await (await fetch(movieUrl, { headers: HEADERS })).text();
    const $movie = cheerio.load(movieHtml);
    const dispatchedUrls = new Set();

    function makeDispatcher(referer) {
      return async function safeDispatch(href, serverLabel) {
        if (!href || dispatchedUrls.has(href)) return [];
        dispatchedUrls.add(href);
        let extracted = href.toLowerCase().includes("xcloud")
          ? await extractBanglaPlex(href, referer)
          : await dispatchExtractor(href, referer);
        if (serverLabel) extracted = extracted.map((s) => ({ ...s, quality: serverLabel }));
        return extracted;
      };
    }

    const iframeSrc = $movie("div.video-embed-container > iframe").attr("src");
    const downloadHref = $movie("#download a").attr("href");

    const [iframeStreams, downloadStreams] = await Promise.all([
      iframeSrc ? makeDispatcher(BASE_URL)(iframeSrc, null) : Promise.resolve([]),
      (async () => {
        if (!downloadHref) return [];
        try {
          const dlUrl = downloadHref.startsWith("http")
            ? downloadHref
            : `${BASE_URL}${downloadHref.startsWith("/") ? "" : "/"}${downloadHref}`;
          const tokenRes = await fetch(dlUrl, { headers: HEADERS });
          const tokenHtml = await tokenRes.text();
          const $token = cheerio.load(tokenHtml);
          const input = $token("form input").first();
          const csrfName = input.attr("name");
          const csrfValue = input.attr("value");
          const postBody = new URLSearchParams();
          if (csrfName) postBody.set(csrfName, csrfValue || "");
          const postRes = await fetch(dlUrl, {
            method: "POST",
            headers: { ...HEADERS, "Content-Type": "application/x-www-form-urlencoded" },
            body: postBody.toString(),
          });
          const postHtml = await postRes.text();
          const $post = cheerio.load(postHtml);
          const links = $post("div.row > div.col-sm-8 > a")
            .toArray()
            .map((el) => ({ href: $post(el).attr("href"), label: $post(el).text().trim() }))
            .filter((l) => l.href);
          const safeDispatch = makeDispatcher(dlUrl);
          const settled = await Promise.all(links.map(({ href, label }) => safeDispatch(href, label)));
          return settled.flat();
        } catch {
          return [];
        }
      })(),
    ]);

    const streams = [...iframeStreams, ...downloadStreams];
    const seen = new Set();
    const unique = [];
    for (const s of streams) {
      try {
        const key = new URL(s.url.trim()).pathname;
        if (!seen.has(key)) { seen.add(key); unique.push(s); }
      } catch {
        unique.push(s);
      }
    }

    return unique.slice(1, 2).map((s) => ({
      ...s,
      title,
      name: "BanglaPlex",
      quality: "1080p",
    }));
  } catch {
    return [];
  }
}

module.exports = { getStreams };