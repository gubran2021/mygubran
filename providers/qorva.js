"use strict";

const QORVA_API = "https://vidup.to";
const DECRYPT_API = "https://enc-dec.app/api";
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_KEY = "307b7b8ef035c6aa336900aef4e203bd";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";

const BASE_HEADERS = {
  "User-Agent": USER_AGENT,
  "Referer": `${QORVA_API}/`,
  "X-Requested-With": "XMLHttpRequest"
};

function getLangCode(langName) {
  if (!langName) return "en";
  const mapping = {
    "english": "en", "hindi": "hi", "russian": "ru"
  };
  return mapping[langName.toLowerCase().trim()] || "en";
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    // Guard: TV needs both season and episode
    if (mediaType === "tv" && (season == null || episode == null)) return [];

    const pageUrl = mediaType === "tv"
      ? `${QORVA_API}/tv/${tmdbId}/${season}/${episode}`
      : `${QORVA_API}/movie/${tmdbId}`;

    const pageRes = await fetch(pageUrl, { headers: BASE_HEADERS });
    if (!pageRes.ok) return [];
    const pageText = await pageRes.text();

    const encMatch = pageText.match(/\\"en\\":\\"(.*?)\\"/);
    const enc = encMatch ? encMatch[1] : null;
    if (!enc) return [];

    const encRes = await fetch(
      `${DECRYPT_API}/enc-vidup?text=${encodeURIComponent(enc)}`,
      { headers: BASE_HEADERS }
    );
    if (!encRes.ok) return [];
    const encData = await encRes.json();

    if (encData.status !== 200 || !encData.result) return [];
    const { servers: serversUrl, stream: streamUrl, token } = encData.result;
    if (!serversUrl || !streamUrl || !token) return [];

    const postHeaders = { ...BASE_HEADERS, "X-CSRF-Token": token };

    const serversEncRes = await fetch(serversUrl, { method: "POST", headers: postHeaders });
    if (!serversEncRes.ok) return [];
    const serversEncText = await serversEncRes.text();

    const decServersRes = await fetch(`${DECRYPT_API}/dec-vidup`, {
      method: "POST",
      headers: { ...postHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ text: serversEncText })
    });
    if (!decServersRes.ok) return [];
    const decServersData = await decServersRes.json();

    if (decServersData.status !== 200 || !decServersData.result) return [];
    const serverList = decServersData.result;

    const allStreams = [];

    await Promise.all(serverList.map(async (server) => {
      try {
        const { data: serverData, name: serverName = "Vidup" } = server;
        if (!serverData) return;

        const streamEncRes = await fetch(`${streamUrl}/${serverData}`, {
          method: "POST",
          headers: postHeaders
        });
        if (!streamEncRes.ok) return;
        const streamEncText = await streamEncRes.text();

        const finalDecRes = await fetch(`${DECRYPT_API}/dec-vidup`, {
          method: "POST",
          headers: { ...postHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({ text: streamEncText })
        });
        if (!finalDecRes.ok) return;
        const finalData = await finalDecRes.json();

        if (finalData.status !== 200 || !finalData.result) return;
        const { url: finalUrl, tracks = [] } = finalData.result;
        if (!finalUrl) return;

        const subtitles = tracks
          .filter(t => t.file?.startsWith("https://"))
          .map(t => ({
            url: t.file,
            language: getLangCode(t.label),
            name: t.label || "Unknown",
            headers: { "Referer": `${QORVA_API}/` }
          }));

        allStreams.push({
          name: `VidUp • ${serverName}`,
          title: `VidUp • ${serverName}`,
          url: finalUrl,
          quality: "1080p",
          headers: {
            "Referer": `${QORVA_API}/`,
            "Origin": QORVA_API,
            "User-Agent": USER_AGENT
          },
          subtitles
        });
      } catch { }
    }));

    const seen = new Set();
    return allStreams.filter(s => s.url && !seen.has(s.url) && seen.add(s.url));

  } catch (e) {
    console.error("qorva error:", e && e.message ? e.message : String(e));
    return [];
  }
}

module.exports = { getStreams };
