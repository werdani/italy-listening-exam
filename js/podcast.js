/**
 * Podcast — shows with YouTube playlist + selectable episodes (video + text).
 * Schema: content.podcast.items[] { playlistUrl, episodes[{ videoUrl, text, ... }] }
 */
(function (global) {
  "use strict";

  const DEFAULT_COVER = "assets/images/reham.jpeg";

  function nextId(items) {
    if (!items || !items.length) return 1;
    return Math.max(...items.map((item) => Number(item.id) || 0)) + 1;
  }

  function normalizeImage(src) {
    const raw = String(src || "").trim() || DEFAULT_COVER;
    if (global.AscoltoContent && typeof global.AscoltoContent.normalizeImageUrl === "function") {
      return global.AscoltoContent.normalizeImageUrl(raw) || DEFAULT_COVER;
    }
    return raw;
  }

  function normalizeAudio(src) {
    if (global.AscoltoContent && typeof global.AscoltoContent.normalizeAudioUrl === "function") {
      return global.AscoltoContent.normalizeAudioUrl(src || "");
    }
    return String(src || "").trim();
  }

  function extractYouTubePlaylistId(input) {
    const s = String(input || "").trim();
    if (!s) return null;

    let match = s.match(/[?&]list=([a-zA-Z0-9_-]+)/i);
    if (match) return match[1];

    match = s.match(/youtube\.com\/playlist\/([a-zA-Z0-9_-]+)/i);
    if (match) return match[1];

    match = s.match(/^(PL|UU|LL|FL|OLAK5uy_|RD)[a-zA-Z0-9_-]+$/i);
    if (match) return match[0];

    return null;
  }

  function extractYouTubeVideoId(input) {
    if (global.AscoltoCourses && typeof global.AscoltoCourses.extractYouTubeId === "function") {
      return global.AscoltoCourses.extractYouTubeId(input);
    }
    const s = String(input || "").trim();
    if (!s) return null;
    let match = s.match(/[?&]v=([a-zA-Z0-9_-]{6,})/i);
    if (match) return match[1];
    match = s.match(/youtu\.be\/([a-zA-Z0-9_-]{6,})/i);
    if (match) return match[1];
    match = s.match(/youtube\.com\/(?:embed|shorts|live)\/([a-zA-Z0-9_-]{6,})/i);
    if (match) return match[1];
    match = s.match(/^[a-zA-Z0-9_-]{11}$/);
    if (match) return match[0];
    return null;
  }

  function normalizePlaylistUrl(input) {
    const raw = String(input || "").trim();
    if (!raw) return "";
    const id = extractYouTubePlaylistId(raw);
    if (id) return `https://www.youtube.com/playlist?list=${encodeURIComponent(id)}`;
    return raw;
  }

  function normalizeVideoUrl(input) {
    const raw = String(input || "").trim();
    if (!raw) return "";
    const id = extractYouTubeVideoId(raw);
    if (id) return `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
    return raw;
  }

  function getPlaylistEmbedUrl(input) {
    const id = extractYouTubePlaylistId(input);
    if (!id) return "";
    return `https://www.youtube.com/embed/videoseries?list=${encodeURIComponent(id)}`;
  }

  function getPlaylistWatchUrl(input) {
    const id = extractYouTubePlaylistId(input);
    if (!id) return String(input || "").trim();
    return `https://www.youtube.com/playlist?list=${encodeURIComponent(id)}`;
  }

  function getVideoEmbedUrl(input, playlistUrl) {
    const videoId = extractYouTubeVideoId(input);
    if (!videoId) return "";
    const listId = extractYouTubePlaylistId(playlistUrl);
    let url = `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?rel=0`;
    if (listId) url += `&list=${encodeURIComponent(listId)}`;
    return url;
  }

  function normalizeEpisode(episode, index) {
    const videoUrl = normalizeVideoUrl(
      episode.videoUrl || episode.youtubeUrl || episode.youtube || ""
    );
    const videoId =
      String(episode.videoId || "").trim() || extractYouTubeVideoId(videoUrl) || "";
    return {
      id: episode.id != null ? Number(episode.id) : index + 1,
      title:
        String(episode.title || episode.name || `Episodio ${index + 1}`).trim() ||
        `Episodio ${index + 1}`,
      description: String(episode.description || "").trim(),
      text: String(episode.text || episode.body || episode.content || "").trim(),
      videoUrl: videoId ? normalizeVideoUrl(videoId) : videoUrl,
      videoId,
      audio: normalizeAudio(episode.audio || episode.url || episode.src || ""),
      date: String(episode.date || "").trim(),
      duration: String(episode.duration || "").trim(),
      order: episode.order != null && episode.order !== "" ? Number(episode.order) : index,
    };
  }

  function sortEpisodes(episodes) {
    episodes.sort((a, b) => {
      const oa = Number.isFinite(Number(a.order)) ? Number(a.order) : null;
      const ob = Number.isFinite(Number(b.order)) ? Number(b.order) : null;
      if (oa != null && ob != null && oa !== ob) return oa - ob;
      const da = a.date || "";
      const db = b.date || "";
      if (da && db && da !== db) return da.localeCompare(db);
      return Number(a.id) - Number(b.id);
    });
    return episodes;
  }

  function normalizeShow(show, index) {
    const episodes = Array.isArray(show.episodes)
      ? sortEpisodes(show.episodes.map((ep, ei) => normalizeEpisode(ep, ei)))
      : [];
    return {
      id: show.id != null ? Number(show.id) : index + 1,
      title: String(show.title || show.name || `Podcast ${index + 1}`).trim() || `Podcast ${index + 1}`,
      author: String(show.author || "").trim(),
      description: String(show.description || "").trim(),
      cover: normalizeImage(show.cover || show.artwork || DEFAULT_COVER),
      playlistUrl: normalizePlaylistUrl(
        show.playlistUrl || show.youtubePlaylist || show.playlist || ""
      ),
      episodes,
    };
  }

  function normalizePodcast(data) {
    const podcastIn = data.podcast || {};
    let items = [];

    if (Array.isArray(podcastIn.items)) {
      items = podcastIn.items.map((show, index) => normalizeShow(show, index));
    } else if (
      Array.isArray(podcastIn.episodes) ||
      podcastIn.title ||
      podcastIn.cover ||
      podcastIn.author
    ) {
      items = [
        normalizeShow(
          {
            id: 1,
            title: podcastIn.title || "Podcast in Italiano",
            author: podcastIn.author || data.site?.ownerName || "Signora Reham Ramadan",
            description: podcastIn.description || "",
            cover: podcastIn.cover || podcastIn.artwork || DEFAULT_COVER,
            playlistUrl: podcastIn.playlistUrl || "",
            episodes: podcastIn.episodes || [],
          },
          0
        ),
      ];
    }

    items.sort((a, b) => a.id - b.id);

    data.podcast = {
      title: String(podcastIn.title || "Podcast").trim() || "Podcast",
      description:
        String(
          podcastIn.description || "Scegli un podcast, apri un episodio e leggi il testo."
        ).trim() || "Scegli un podcast, apri un episodio e leggi il testo.",
      items,
    };
    return data;
  }

  function ensurePodcast(data) {
    if (!data.podcast || !Array.isArray(data.podcast.items)) normalizePodcast(data);
    if (!Array.isArray(data.podcast.items)) data.podcast.items = [];
    return data.podcast;
  }

  function getShow(data, showId) {
    return ensurePodcast(data).items.find((s) => Number(s.id) === Number(showId)) || null;
  }

  function createShow(data, { title, author, description, cover, playlistUrl } = {}) {
    const podcast = ensurePodcast(data);
    const id = nextId(podcast.items);
    const show = normalizeShow(
      {
        id,
        title: title || `Podcast ${id}`,
        author: author || data.site?.ownerName || "Signora Reham Ramadan",
        description: description || "",
        cover: cover || DEFAULT_COVER,
        playlistUrl: playlistUrl || "",
        episodes: [],
      },
      podcast.items.length
    );
    podcast.items.push(show);
    podcast.items.sort((a, b) => a.id - b.id);
    return show;
  }

  function updateShow(data, showId, patch) {
    const show = getShow(data, showId);
    if (!show) return null;
    if (patch.title != null) show.title = String(patch.title).trim() || show.title;
    if (patch.author != null) show.author = String(patch.author).trim();
    if (patch.description != null) show.description = String(patch.description).trim();
    if (patch.cover != null) show.cover = normalizeImage(patch.cover);
    if (patch.playlistUrl != null) show.playlistUrl = normalizePlaylistUrl(patch.playlistUrl);
    return show;
  }

  function deleteShow(data, showId) {
    const podcast = ensurePodcast(data);
    const sid = Number(showId);
    const before = podcast.items.length;
    podcast.items = podcast.items.filter((s) => Number(s.id) !== sid);
    return podcast.items.length < before;
  }

  function getEpisode(data, showId, episodeId) {
    const show = getShow(data, showId);
    if (!show) return null;
    return show.episodes.find((ep) => Number(ep.id) === Number(episodeId)) || null;
  }

  function createEpisode(
    data,
    showId,
    { title, description, text, videoUrl, audio, date, duration, order } = {}
  ) {
    const show = getShow(data, showId);
    if (!show) return null;
    const id = nextId(show.episodes);
    const episode = normalizeEpisode(
      {
        id,
        title: title || `Episodio ${id}`,
        description: description || "",
        text: text || "",
        videoUrl: videoUrl || "",
        audio: audio || "",
        date: date || "",
        duration: duration || "",
        order: order != null ? order : show.episodes.length,
      },
      show.episodes.length
    );
    show.episodes.push(episode);
    sortEpisodes(show.episodes);
    return episode;
  }

  function updateEpisode(data, showId, episodeId, patch) {
    const episode = getEpisode(data, showId, episodeId);
    if (!episode) return null;
    if (patch.title != null) episode.title = String(patch.title).trim() || episode.title;
    if (patch.description != null) episode.description = String(patch.description).trim();
    if (patch.text != null) episode.text = String(patch.text).trim();
    if (patch.videoUrl != null) {
      episode.videoUrl = normalizeVideoUrl(patch.videoUrl);
      episode.videoId = extractYouTubeVideoId(episode.videoUrl) || "";
    }
    if (patch.audio != null) episode.audio = normalizeAudio(patch.audio);
    if (patch.date != null) episode.date = String(patch.date).trim();
    if (patch.duration != null) episode.duration = String(patch.duration).trim();
    if (patch.order != null && patch.order !== "") episode.order = Number(patch.order);
    return episode;
  }

  function deleteEpisode(data, showId, episodeId) {
    const show = getShow(data, showId);
    if (!show) return false;
    const eid = Number(episodeId);
    const before = show.episodes.length;
    show.episodes = show.episodes.filter((ep) => Number(ep.id) !== eid);
    return show.episodes.length < before;
  }

  /**
   * Merge YouTube playlist videos into show.episodes.
   * Preserves existing text/description for matching videoId.
   * videos: [{ videoId, title, date, videoUrl? }]
   */
  function syncEpisodesFromPlaylist(data, showId, videos) {
    const show = getShow(data, showId);
    if (!show) return null;
    const incoming = Array.isArray(videos) ? videos : [];
    const byVideoId = new Map();
    show.episodes.forEach((ep) => {
      const vid = ep.videoId || extractYouTubeVideoId(ep.videoUrl);
      if (vid) byVideoId.set(vid, ep);
    });

    const next = incoming
      .map((item, index) => {
        const videoId = String(item.videoId || extractYouTubeVideoId(item.videoUrl) || "").trim();
        if (!videoId) return null;
        const prev = byVideoId.get(videoId);
        return normalizeEpisode(
          {
            id: prev?.id != null ? prev.id : undefined,
            title: item.title || prev?.title || `Episodio ${index + 1}`,
            description: prev?.description || item.description || "",
            text: prev?.text || "",
            videoUrl: item.videoUrl || videoId,
            videoId,
            date: item.date || prev?.date || "",
            duration: prev?.duration || "",
            audio: prev?.audio || "",
            order: index,
          },
          index
        );
      })
      .filter(Boolean);

    // Keep orphan non-YouTube legacy audio episodes at the end
    const syncedIds = new Set(next.map((ep) => ep.videoId).filter(Boolean));
    show.episodes.forEach((ep, index) => {
      const vid = ep.videoId || extractYouTubeVideoId(ep.videoUrl);
      if (vid && syncedIds.has(vid)) return;
      if (!vid && ep.audio) {
        next.push(
          normalizeEpisode(
            { ...ep, order: next.length + index },
            next.length
          )
        );
      }
    });

    // Assign stable ids for new episodes
    let maxId = next.reduce((m, ep) => Math.max(m, Number(ep.id) || 0), 0);
    next.forEach((ep) => {
      if (!ep.id) {
        maxId += 1;
        ep.id = maxId;
      }
    });

    show.episodes = sortEpisodes(next);
    return show.episodes;
  }

  function formatDate(iso) {
    if (!iso) return "";
    const parts = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!parts) return String(iso);
    const d = new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
    if (Number.isNaN(d.getTime())) return String(iso);
    try {
      return d.toLocaleDateString("it-IT", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    } catch {
      return `${parts[3]}/${parts[2]}/${parts[1]}`;
    }
  }

  function formatDuration(seconds) {
    const n = Number(seconds);
    if (!Number.isFinite(n) || n <= 0) return "";
    const total = Math.round(n);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return `${h} h ${m} min`;
    if (m > 0) return `${m} min`;
    return `${s} s`;
  }

  function formatDurationLabel(duration) {
    if (!duration) return "";
    if (/^\d+(\.\d+)?$/.test(String(duration).trim())) {
      return formatDuration(Number(duration));
    }
    return String(duration).trim();
  }

  if (global.AscoltoContent && typeof global.AscoltoContent.normalizeContent === "function") {
    const original = global.AscoltoContent.normalizeContent;
    global.AscoltoContent.normalizeContent = function (raw) {
      return normalizePodcast(original(raw));
    };
  }

  global.AscoltoPodcast = {
    DEFAULT_COVER,
    normalizePodcast,
    ensurePodcast,
    getShow,
    createShow,
    updateShow,
    deleteShow,
    getEpisode,
    createEpisode,
    updateEpisode,
    deleteEpisode,
    syncEpisodesFromPlaylist,
    extractYouTubePlaylistId,
    extractYouTubeVideoId,
    normalizePlaylistUrl,
    normalizeVideoUrl,
    getPlaylistEmbedUrl,
    getPlaylistWatchUrl,
    getVideoEmbedUrl,
    formatDate,
    formatDuration,
    formatDurationLabel,
  };
})(window);
