"use strict";

const TMDB_API_KEY = "307b7b8ef035c6aa336900aef4e203bd";
const PLATFORM_MAP = {
  netflix: {
    ott: "nf",
    search: "/mobile/search.php",
    post: "/mobile/post.php",
    episodes: "/mobile/episodes.php",
    playlist: "/mobile/playlist.php",
    img: "poster/v",
    epImg: "epimg/150",
  },
  primevideo: {
    ott: "pv",
    search: "/mobile/pv/search.php",
    post: "/mobile/pv/post.php",
    episodes: "/mobile/pv/episodes.php",
    playlist: "/mobile/pv/playlist.php",
    img: "pv/v",
    epImg: "pvepimg",
  },
  hotstar: {
    ott: "hs",
    search: "/mobile/hs/search.php",
    post: "/mobile/hs/post.php",
    episodes: "/mobile/hs/episodes.php",
    playlist: "/mobile/hs/playlist.php",
    img: "hs/v",
    epImg: "hsepimg",
  },
  disney: {
    ott: "hs",
    search: "/mobile/hs/search.php",
    post: "/mobile/hs/post.php",
    episodes: "/mobile/hs/episodes.php",
    playlist: "/mobile/hs/playlist.php",
    img: "hs/v",
    epImg: "hsepimg",
  },
};

const NEW_TV_BASE_HEADERS = {
  "Cache-Control": "no-cache, no-store, must-revalidate",
  "Pragma": "no-cache",
  "Expires": "0",
  "X-Requested-With": "NetmirrorNewTV v1.0",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:136.0) Gecko/20100101 Firefox/136.0 /OS.GatuNewTV v1.0",
  "Accept": "application/json, text/plain, */*",
};

const NEW_TV_DOMAINS = [
  "aHR0cHM6Ly9tb2JpbGVkZXRlY3RzLmNvbQ==",
  "aHR0cHM6Ly9tb2JpbGVkZXR0LmFwcA==",
  "aHR0cHM6Ly9tb2JpZGV0ZWN0LmFydA==",
  "aHR0cHM6Ly9tb2JpZGV0ZWN0LmNj",
  "aHR0cHM6Ly9tb2JpZGV0ZWN0LmNsaWNr",
  "aHR0cHM6Ly9tb2JpZGV0ZWN0Lmluaw==",
  "aHR0cHM6Ly9tb2JpZGV0ZWN0LmxpdmU=",
  "aHR0cHM6Ly9tb2JpZGV0ZWN0LnBybw==",
  "aHR0cHM6Ly9tb2JpZGV0ZWN0LnNob3A=",
  "aHR0cHM6Ly9tb2JpZGV0ZWN0LnNpdGU=",
  "aHR0cHM6Ly9tb2JpZGV0ZWN0LnNwYWNl",
  "aHR0cHM6Ly9tb2JpZGV0ZWN0LnN0b3Jl",
  "aHR0cHM6Ly9tb2JpZGV0ZWN0LnZpcA==",
  "aHR0cHM6Ly9tb2JpZGV0ZWN0Lndpa2k=",
  "aHR0cHM6Ly9tb2JpZGV0ZWN0Lnh5eg==",
  "aHR0cHM6Ly9tb2JpZGV0ZWN0cy5hcnQ=",
  "aHR0cHM6Ly9tb2JpZGV0ZWN0cy5jYw==",
  "aHR0cHM6Ly9tb2JpZGV0ZWN0cy5pbmZv",
  "aHR0cHM6Ly9tb2JpZGV0ZWN0cy5pbks=",
  "aHR0cHM6Ly9tb2JpZGV0ZWN0cy5saXZl",
  "aHR0cHM6Ly9tb2JpZGV0ZWN0cy5wcm8=",
  "aHR0cHM6Ly9tb2JpZGV0ZWN0cy5zdG9yZQ==",
  "aHR0cHM6Ly9tb2JpZGV0ZWN0cy50b3A=",
  "aHR0cHM6Ly9tb2JpZGV0ZWN0cy54eXo=",
];

let resolvedApiUrl = "";

function buildNewTvHeaders(ott, extra = {}) {
  return { ...NEW_TV_BASE_HEADERS, Ott: ott, ...extra };
}

function meetsQualityFilter(quality) {
  if (quality === "Auto") return true;
  const num = parseInt(quality, 10);
  return !isNaN(num) && num >= 720;
}

async function resolveApiUrl() {
  if (resolvedApiUrl) return resolvedApiUrl;
  for (const encoded of NEW_TV_DOMAINS) {
    const base = atob(encoded).replace(/\/$/, "");
    try {
      const response = await fetch(`${base}/checknewtv.php`, {
        headers: { ...NEW_TV_BASE_HEADERS, "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      });
      const data = await response.json();
      const tokenHash = data.token_hash;
      if (tokenHash) {
        resolvedApiUrl = atob(tokenHash).replace(/\/$/, "");
        return resolvedApiUrl;
      }
    } catch (_) { }
  }
  throw new Error("Failed to resolve NewTV API base URL");
}

async function fetchFromNetflixDirect(tmdbId, mediaType, season, episode, title) {
  try {
    const apiUrl = mediaType === "tv"
      ? `https://net27.cc/api/embed-tmdb/${tmdbId}?type=tv&s=${season}&e=${episode}`
      : `https://net27.cc/api/embed-tmdb/${tmdbId}`;

    const response = await fetch(apiUrl, {
      headers: {
        "Accept": "application/json, text/plain, */*",
        "Referer": "https://net27.cc/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
      },
    });
    if (!response.ok) return null;

    const data = await response.json();
    if (data.ok !== true) return null;

    const playbackHeaders = {
      "Referer": "https://videodownloader.site/",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
    };

    const formattedSubtitles = (data.captions || []).map((caption) => {
      let url = caption.url;
      if (url.startsWith("/")) url = `https://net27.cc${url}`;
      return { url, language: caption.lang || "en", name: caption.name || "English", headers: playbackHeaders };
    });

    const streams = [];
    if (data.streams && data.streams.length > 0) {
      data.streams.forEach((stream) => {
        if (meetsQualityFilter(`${stream.resolution}p`)) {
          streams.push({
            name: `Netmirror • ${stream.resolution}p`,
            title: `Netmirror • ${stream.resolution}p`,
            url: stream.url,
            quality: `${stream.resolution}p`,
            headers: playbackHeaders,
            subtitles: formattedSubtitles,
          });
        }
      });
    } else if (data.mp4) {
      streams.push({
        name: "Netmirror • Auto",
        title: "Netmirror • Auto",
        url: data.mp4,
        quality: "Auto",
        headers: playbackHeaders,
        subtitles: formattedSubtitles,
      });
    }
    return streams;
  } catch (_) {
    return null;
  }
}

async function fetchEpisodesPage(contentId, seasonId, page, seasonNumber, platform, apiBase) {
  const episodes = [];
  let pg = page;
  while (true) {
    const url = `${apiBase}/newtv/episodes.php?id=${seasonId}&page=${pg}`;
    const resp = await fetch(url, { headers: buildNewTvHeaders(platform.ott) });
    const data = await resp.json();
    if (data.episodes) {
      data.episodes.filter((e) => e !== null).forEach((ep) => {
        const epNum = ep.ep
          ? parseInt(ep.ep)
          : ep.epNum ? parseInt(ep.epNum.replace("E", "")) : null;
        const sNum = seasonNumber || (ep.sNum ? parseInt(ep.sNum.replace("S", "")) : null);
        episodes.push({ id: ep.id, s: sNum, ep: epNum });
      });
    }
    if (data.nextPageShow !== 1) break;
    pg++;
  }
  return episodes;
}

async function getAllEpisodes(contentId, postData, platform, apiBase) {
  const episodes = [];
  const selectedSeasonIdx = postData.season
    ? postData.season.findIndex((s) => s.selected === true)
    : -1;
  const selectedSeasonId = selectedSeasonIdx >= 0
    ? postData.season[selectedSeasonIdx].id
    : postData.nextPageSeason;
  const selectedSeasonNumber = selectedSeasonIdx >= 0 ? selectedSeasonIdx + 1 : null;

  if (postData.episodes) {
    postData.episodes.filter((e) => e !== null).forEach((ep) => {
      const epNum = ep.ep
        ? parseInt(ep.ep)
        : ep.epNum ? parseInt(ep.epNum.replace("E", "")) : null;
      const sNum = selectedSeasonNumber || (ep.sNum ? parseInt(ep.sNum.replace("S", "")) : null);
      episodes.push({ id: ep.id, s: sNum, ep: epNum });
    });
  }

  if (postData.nextPageShow === 1 && selectedSeasonId) {
    const more = await fetchEpisodesPage(contentId, selectedSeasonId, 2, selectedSeasonNumber, platform, apiBase);
    episodes.push(...more);
  }

  if (postData.season) {
    for (let index = 0; index < postData.season.length; index++) {
      const season = postData.season[index];
      if (season.id !== selectedSeasonId && season.id) {
        const more = await fetchEpisodesPage(contentId, season.id, 1, index + 1, platform, apiBase);
        episodes.push(...more);
      }
    }
  }

  return episodes;
}

async function fetchFromPlatform(platformKey, title, mediaType, season, episode) {
  const platform = PLATFORM_MAP[platformKey];
  const apiBase = await resolveApiUrl();

  const searchUrl = `${apiBase}/newtv/search.php?s=${encodeURIComponent(title)}`;
  const searchResp = await fetch(searchUrl, { headers: buildNewTvHeaders(platform.ott) });
  const searchData = await searchResp.json();
  if (!searchData.searchResult || searchData.searchResult.length === 0) return null;

  const result = searchData.searchResult[0];
  const contentId = result.id;

  const postUrl = `${apiBase}/newtv/post.php?id=${contentId}`;
  const postResp = await fetch(postUrl, { headers: buildNewTvHeaders(platform.ott, { Lastep: "", Usertoken: "" }) });
  const postData = await postResp.json();

  let targetId = contentId;
  if (mediaType === "tv") {
    const episodes = await getAllEpisodes(contentId, postData, platform, apiBase);
    const targetEp = episodes.find((ep) => ep && ep.s === season && ep.ep === episode);
    if (targetEp) {
      targetId = targetEp.id;
    } else {
      return null;
    }
  } else {
    const isSeries = postData.type === "t" || (postData.episodes && postData.episodes.filter((e) => e !== null).length > 0);
    if (isSeries) return null;
    targetId = postData.main_id || contentId;
  }

  const playerUrl = `${apiBase}/newtv/player.php?id=${targetId}`;
  const playerResp = await fetch(playerUrl, { headers: buildNewTvHeaders(platform.ott, { Usertoken: "" }) });
  const response = await playerResp.json();

  if (response.status === "ok" && response.video_link) {
    return [{
      name: `Netmirror • ${platformKey.charAt(0).toUpperCase() + platformKey.slice(1)}`,
      title: `Netmirror • ${platformKey.charAt(0).toUpperCase() + platformKey.slice(1)}`,
      url: response.video_link,
      quality: "Auto",
      headers: { Referer: response.referer || apiBase },
    }];
  }
  return null;
}

async function getStreams(tmdbId, mediaType, season, episode) {
  if (mediaType === "tv" && (season == null || episode == null)) return [];

  try {
    const tmdbResp = await fetch(
      `https://api.themoviedb.org/3/${mediaType === "tv" ? "tv" : "movie"}/${tmdbId}?api_key=${TMDB_API_KEY}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
          "Accept": "application/json",
        },
      }
    );
    const tmdbData = await tmdbResp.json();
    const title = mediaType === "tv" ? tmdbData.name : tmdbData.title;
    if (!title) return [];

    const platforms = ["netflix", "primevideo", "hotstar", "disney"];
    for (const platformKey of platforms) {
      try {
        let streams = [];
        if (platformKey === "netflix") {
          streams = await fetchFromNetflixDirect(tmdbId, mediaType, season, episode, title);
        }
        if (!streams || streams.length === 0) {
          streams = await fetchFromPlatform(platformKey, title, mediaType, season, episode);
        }
        if (streams && streams.length > 0) {
          return streams.filter((stream) => meetsQualityFilter(stream.quality));
        }
      } catch (_) { }
    }
    return [];
  } catch (_) {
    return [];
  }
}

module.exports = { getStreams };