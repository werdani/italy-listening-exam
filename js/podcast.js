/**
 * Podcast — multiple shows, each with cover + episodes.
 * Schema: content.podcast.items[].episodes[]
 * Migrates legacy flat podcast { title, cover, episodes } → items[0].
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

  function normalizeEpisode(episode, index) {
    return {
      id: episode.id != null ? Number(episode.id) : index + 1,
      title:
        String(episode.title || episode.name || `Episodio ${index + 1}`).trim() ||
        `Episodio ${index + 1}`,
      description: String(episode.description || "").trim(),
      audio: normalizeAudio(episode.audio || episode.url || episode.src || ""),
      date: String(episode.date || "").trim(),
      duration: String(episode.duration || "").trim(),
    };
  }

  function sortEpisodes(episodes) {
    episodes.sort((a, b) => {
      const da = a.date || "";
      const db = b.date || "";
      if (da && db && da !== db) return db.localeCompare(da);
      return Number(b.id) - Number(a.id);
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
      // Legacy single-show shape → one item
      items = [
        normalizeShow(
          {
            id: 1,
            title: podcastIn.title || "Podcast in Italiano",
            author: podcastIn.author || data.site?.ownerName || "Signora Reham Ramadan",
            description: podcastIn.description || "",
            cover: podcastIn.cover || podcastIn.artwork || DEFAULT_COVER,
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
          podcastIn.description ||
            "Scegli un podcast e ascolta gli episodi in italiano."
        ).trim() || "Scegli un podcast e ascolta gli episodi in italiano.",
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

  function createShow(data, { title, author, description, cover } = {}) {
    const podcast = ensurePodcast(data);
    const id = nextId(podcast.items);
    const show = normalizeShow(
      {
        id,
        title: title || `Podcast ${id}`,
        author: author || data.site?.ownerName || "Signora Reham Ramadan",
        description: description || "",
        cover: cover || DEFAULT_COVER,
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

  function createEpisode(data, showId, { title, description, audio, date, duration } = {}) {
    const show = getShow(data, showId);
    if (!show) return null;
    const id = nextId(show.episodes);
    const episode = normalizeEpisode(
      {
        id,
        title: title || `Episodio ${id}`,
        description: description || "",
        audio: audio || "",
        date: date || new Date().toISOString().slice(0, 10),
        duration: duration || "",
      },
      show.episodes.length
    );
    show.episodes.unshift(episode);
    return episode;
  }

  function updateEpisode(data, showId, episodeId, patch) {
    const episode = getEpisode(data, showId, episodeId);
    if (!episode) return null;
    if (patch.title != null) episode.title = String(patch.title).trim() || episode.title;
    if (patch.description != null) episode.description = String(patch.description).trim();
    if (patch.audio != null) episode.audio = normalizeAudio(patch.audio);
    if (patch.date != null) episode.date = String(patch.date).trim();
    if (patch.duration != null) episode.duration = String(patch.duration).trim();
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
    formatDate,
    formatDuration,
    formatDurationLabel,
  };
})(window);
