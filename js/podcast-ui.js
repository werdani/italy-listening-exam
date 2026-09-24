/**
 * Public UI — Podcast library + Apple Podcasts–style show page
 */
(function (global) {
  "use strict";

  /** @type {object|null} */
  let content = null;
  /** @type {number|null} */
  let activeShowId = null;
  /** @type {number|null} */
  let activeEpisodeId = null;
  /** @type {HTMLAudioElement|null} */
  let audioEl = null;
  /** @type {string[]} */
  let audioCandidates = [];
  let audioCandidateIndex = 0;
  let audioSourceKey = "";
  /** @type {string|null} */
  let audioBlobUrl = null;
  /** @type {string|null} */
  let driveFallbackFileId = null;
  let usingDriveEmbed = false;
  let toastTimer = null;

  const $ = (sel, root = document) => root.querySelector(sel);

  const ICON_PLAY = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14z"/></svg>`;
  const ICON_PAUSE = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h3a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm7 0h3a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/></svg>`;

  const els = {
    btnPodcast: $("#btnPodcast"),
    screenPodcastList: $("#screenPodcastList"),
    screenPodcast: $("#screenPodcast"),
    btnBackFromPodcastList: $("#btnBackFromPodcastList"),
    btnBackFromPodcast: $("#btnBackFromPodcast"),
    podcastListTitle: $("#podcastListTitle"),
    podcastListDescription: $("#podcastListDescription"),
    podcastShowsGrid: $("#podcastShowsGrid"),
    podcastShowsEmpty: $("#podcastShowsEmpty"),
    podcastCover: $("#podcastCover"),
    podcastShowTitle: $("#podcastShowTitle"),
    podcastShowAuthor: $("#podcastShowAuthor"),
    podcastShowDesc: $("#podcastShowDesc"),
    btnPlayLatest: $("#btnPlayLatest"),
    podcastEpisodesCount: $("#podcastEpisodesCount"),
    podcastEpisodeList: $("#podcastEpisodeList"),
    podcastEmpty: $("#podcastEmpty"),
    podcastNowPlaying: $("#podcastNowPlaying"),
    podcastNpCover: $("#podcastNpCover"),
    podcastNpTitle: $("#podcastNpTitle"),
    podcastNpProgress: $("#podcastNpProgress"),
    podcastNpDriveLabel: $("#podcastNpDriveLabel"),
    btnNpPlay: $("#btnNpPlay"),
    btnNpClose: $("#btnNpClose"),
    podcastDriveWrap: $("#podcastDriveWrap"),
    podcastDriveFrame: $("#podcastDriveFrame"),
    toast: $("#toast"),
  };

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function hideOtherFeatureScreens() {
    ["screenLibrary", "screenLibraryLevel", "screenCourses", "screenCourse"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.hidden = true;
        el.classList.remove("screen-active");
      }
    });
  }

  function showScreen(name) {
    hideOtherFeatureScreens();
    const screens = {
      loading: $("#screenLoading"),
      home: $("#screenHome"),
      podcastList: els.screenPodcastList,
      podcast: els.screenPodcast,
      exam: $("#screenExam"),
      results: $("#screenResults"),
    };
    Object.entries(screens).forEach(([key, el]) => {
      if (!el) return;
      const active = key === name;
      el.hidden = !active;
      el.classList.toggle("screen-active", active);
    });
    const timerChip = $("#timerChip");
    if (timerChip) timerChip.hidden = name !== "exam";
  }

  function resolveSrc(src) {
    if (!src) return "";
    if (global.AscoltoContent?.resolveAudioSrc) return global.AscoltoContent.resolveAudioSrc(src);
    return src;
  }

  function resolveCover(src) {
    const fallback = global.AscoltoPodcast?.DEFAULT_COVER || "assets/images/reham.jpeg";
    if (!src) return fallback;
    if (global.AscoltoContent?.resolveImageSrc) return global.AscoltoContent.resolveImageSrc(src);
    return src;
  }

  function showToast(message, ms = 2600) {
    if (!els.toast) return;
    els.toast.textContent = message;
    els.toast.hidden = false;
    requestAnimationFrame(() => els.toast.classList.add("show"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      els.toast.classList.remove("show");
      setTimeout(() => {
        if (els.toast) els.toast.hidden = true;
      }, 300);
    }, ms);
  }

  function revokeAudioBlob() {
    if (audioBlobUrl) {
      try {
        URL.revokeObjectURL(audioBlobUrl);
      } catch {
        /* ignore */
      }
      audioBlobUrl = null;
    }
  }

  function hideDriveFallback() {
    driveFallbackFileId = null;
    usingDriveEmbed = false;
    if (els.podcastNpDriveLabel) els.podcastNpDriveLabel.hidden = true;
    if (els.podcastDriveWrap) els.podcastDriveWrap.hidden = true;
    if (els.podcastDriveFrame) els.podcastDriveFrame.removeAttribute("src");
    if (els.podcastNpProgress) els.podcastNpProgress.hidden = false;
    if (els.podcastNowPlaying) {
      els.podcastNowPlaying.classList.remove("is-drive-fallback");
      els.podcastNowPlaying.classList.remove("is-drive-embed");
    }
  }

  function showDriveEmbed(fileId) {
    hideDriveFallback();
    if (!fileId || !els.podcastDriveWrap || !els.podcastDriveFrame) {
      showToast("Impossibile riprodurre l’audio.");
      updatePlayingUi(false);
      return false;
    }
    if (!global.AscoltoContent?.toGoogleDrivePreviewUrl) return false;

    if (audioEl) {
      audioEl.onerror = null;
      try {
        audioEl.pause();
      } catch {
        /* ignore */
      }
      audioEl.removeAttribute("src");
      try {
        audioEl.load();
      } catch {
        /* ignore */
      }
    }
    revokeAudioBlob();

    driveFallbackFileId = fileId;
    usingDriveEmbed = true;
    els.podcastDriveWrap.hidden = false;
    els.podcastDriveFrame.src = global.AscoltoContent.toGoogleDrivePreviewUrl(fileId);
    if (els.podcastNpProgress) els.podcastNpProgress.hidden = true;
    if (els.podcastNpDriveLabel) {
      els.podcastNpDriveLabel.hidden = false;
      els.podcastNpDriveLabel.textContent = "Tocca ▶ sul player per ascoltare";
    }
    if (els.podcastNowPlaying) els.podcastNowPlaying.classList.add("is-drive-embed");
    updatePlayingUi(true);
    return true;
  }

  function showDriveFallback(fileId) {
    // On static hosts (GitHub Pages) use Drive embed — plays without saving files
    return showDriveEmbed(fileId);
  }

  function ensureAudio() {
    if (audioEl) return audioEl;
    audioEl = document.createElement("audio");
    audioEl.preload = "metadata";
    audioEl.addEventListener("timeupdate", syncProgress);
    audioEl.addEventListener("ended", () => updatePlayingUi(false));
    audioEl.addEventListener("play", () => updatePlayingUi(true));
    audioEl.addEventListener("pause", () => updatePlayingUi(false));
    audioEl.addEventListener("loadedmetadata", () => {
      if (!audioEl || !Number.isFinite(audioEl.duration)) return;
      const ep = global.AscoltoPodcast.getEpisode(content, activeShowId, activeEpisodeId);
      if (ep && !ep.duration) {
        ep.duration = String(Math.round(audioEl.duration));
        refreshEpisodeDuration(ep);
      }
    });
    document.body.appendChild(audioEl);
    return audioEl;
  }

  function syncProgress() {
    if (!audioEl || !els.podcastNpProgress) return;
    const dur = audioEl.duration;
    if (!Number.isFinite(dur) || dur <= 0) {
      els.podcastNpProgress.value = "0";
      return;
    }
    els.podcastNpProgress.value = String((audioEl.currentTime / dur) * 100);
  }

  function updatePlayingUi(isPlaying) {
    const playingNow = usingDriveEmbed ? true : isPlaying;
    if (els.btnNpPlay) {
      els.btnNpPlay.innerHTML = playingNow ? ICON_PAUSE : ICON_PLAY;
      els.btnNpPlay.setAttribute("aria-label", playingNow ? "Pausa" : "Riproduci");
    }
    if (els.podcastEpisodeList) {
      els.podcastEpisodeList.querySelectorAll(".podcast-episode").forEach((row) => {
        const id = Number(row.getAttribute("data-episode-id"));
        const playing = id === activeEpisodeId && playingNow;
        row.classList.toggle("is-playing", id === activeEpisodeId);
        const btn = row.querySelector(".podcast-episode-play");
        if (btn) {
          btn.innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
          btn.setAttribute("aria-label", playing ? "Pausa" : "Riproduci episodio");
        }
      });
    }
  }

  function currentShow() {
    return global.AscoltoPodcast.getShow(content, activeShowId);
  }

  function showNowPlaying(episode, show) {
    if (!els.podcastNowPlaying) return;
    const cover = resolveCover(show.cover);
    if (els.podcastNpCover) {
      els.podcastNpCover.src = cover;
      els.podcastNpCover.alt = "";
    }
    if (els.podcastNpTitle) els.podcastNpTitle.textContent = episode.title;
    els.podcastNowPlaying.classList.add("is-visible");
    els.podcastNowPlaying.hidden = false;
    document.body.classList.add("has-podcast-player");
  }

  function hideNowPlaying() {
    if (els.podcastNowPlaying) {
      els.podcastNowPlaying.classList.remove("is-visible");
      els.podcastNowPlaying.hidden = true;
    }
    document.body.classList.remove("has-podcast-player");
  }

  async function loadEpisodeAudio(src) {
    const audio = ensureAudio();
    audioSourceKey = String(src || "");
    audioCandidates = [];
    audioCandidateIndex = 0;
    audio.onerror = null;
    revokeAudioBlob();
    hideDriveFallback();

    try {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    } catch {
      /* ignore */
    }

    const AC = global.AscoltoContent;
    let proxyOk = false;
    if (AC?.detectDriveProxy) {
      try {
        proxyOk = !!(await AC.detectDriveProxy());
      } catch {
        proxyOk = false;
      }
    }

    const apiKey = content?.site?.googleApiKey || "";
    const fileId = AC?.extractGoogleDriveFileId?.(src) || null;
    const isDrive = !!(fileId && AC?.isGoogleDriveUrl?.(src));

    // Progressive stream via local proxy (no disk save) — native mini-player UI
    if (isDrive && proxyOk && AC.toDriveProxyUrl) {
      const proxyUrl = AC.toDriveProxyUrl(fileId);
      audio.onerror = () => {
        if (String(src || "") !== audioSourceKey) return;
        audio.onerror = null;
        startCandidatePlayback();
      };
      audio.src = proxyUrl;
      audio.load();
      audio.play().catch(() => {});
      updatePlayingUi(true);
      audio.addEventListener(
        "loadeddata",
        () => {
          if (String(src || "") === audioSourceKey) {
            audio.onerror = () => {
              if (String(src || "") !== audioSourceKey) return;
              startCandidatePlayback();
            };
          }
        },
        { once: true }
      );
      return;
    }

    // GitHub Pages / no proxy: try Drive API blob, else embed player (no disk save)
    if (isDrive && !proxyOk) {
      if (AC.fetchDriveAudioBlobUrl && apiKey) {
        try {
          const blobUrl = await AC.fetchDriveAudioBlobUrl(src, { apiKey });
          if (blobUrl && String(src || "") === audioSourceKey) {
            audioBlobUrl = blobUrl;
            audio.src = blobUrl;
            audio.load();
            await audio.play().catch(() => {});
            updatePlayingUi(true);
            return;
          }
        } catch (err) {
          console.warn("Podcast Drive API blob failed", err);
        }
      }
      showDriveEmbed(fileId);
      return;
    }

    startCandidatePlayback();

    function startCandidatePlayback() {
      if (String(src || "") !== audioSourceKey) return;
      audioCandidates = AC?.getAudioPlaybackCandidates
        ? AC.getAudioPlaybackCandidates(src, { apiKey })
        : [resolveSrc(src)];
      audioCandidates = audioCandidates.filter((u) => !/\/api\/drive\//.test(u));
      audioCandidateIndex = 0;

      const failGracefully = () => {
        if (isDrive) {
          showDriveEmbed(fileId);
          return;
        }
        showToast("Impossibile riprodurre l’audio.");
        updatePlayingUi(false);
      };

      const tryNext = () => {
        if (String(src || "") !== audioSourceKey) return;
        if (audioCandidateIndex >= audioCandidates.length) {
          failGracefully();
          return;
        }
        const url = audioCandidates[audioCandidateIndex];
        audioCandidateIndex += 1;
        try {
          audio.pause();
        } catch {
          /* ignore */
        }
        audio.src = url;
        audio.load();
        audio.play().catch(() => {});
        updatePlayingUi(true);
      };

      audio.onerror = () => {
        if (String(src || "") !== audioSourceKey) return;
        tryNext();
      };

      tryNext();
    }
  }

  function playEpisode(episode) {
    if (!episode || !episode.audio) return;
    const show = currentShow();
    if (!show) return;
    const audio = ensureAudio();
    const same =
      activeEpisodeId === Number(episode.id) &&
      (usingDriveEmbed || (audio.src && !audio.ended));

    activeEpisodeId = Number(episode.id);
    showNowPlaying(episode, show);

    if (same && usingDriveEmbed) return;

    if (same && !audio.paused) {
      audio.pause();
      return;
    }
    if (same && audio.paused && audio.currentTime > 0) {
      audio.play().catch(() => {});
      return;
    }

    loadEpisodeAudio(episode.audio);
  }

  function toggleNpPlay() {
    if (usingDriveEmbed) return;
    const audio = ensureAudio();
    if (!activeEpisodeId) {
      const first = currentShow()?.episodes?.[0];
      if (first) playEpisode(first);
      return;
    }
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  }

  function stopPlayer() {
    audioSourceKey = "";
    audioCandidates = [];
    audioCandidateIndex = 0;
    if (audioEl) {
      audioEl.onerror = null;
      try {
        audioEl.pause();
      } catch {
        /* ignore */
      }
      audioEl.removeAttribute("src");
      try {
        audioEl.load();
      } catch {
        /* ignore */
      }
    }
    revokeAudioBlob();
    hideDriveFallback();
    activeEpisodeId = null;
    updatePlayingUi(false);
    hideNowPlaying();
  }

  function refreshEpisodeDuration(episode) {
    if (!els.podcastEpisodeList) return;
    const row = els.podcastEpisodeList.querySelector(
      `[data-episode-id="${episode.id}"] .podcast-episode-duration`
    );
    if (!row) return;
    const label = global.AscoltoPodcast.formatDurationLabel(episode.duration);
    if (label) {
      row.hidden = false;
      row.textContent = label;
    }
  }

  function renderList() {
    if (!content?.podcast) return;
    const podcast = content.podcast;
    activeShowId = null;

    if (els.podcastListTitle) els.podcastListTitle.textContent = podcast.title || "Podcast";
    if (els.podcastListDescription) {
      els.podcastListDescription.textContent =
        podcast.description || "Scegli un podcast e ascolta gli episodi.";
    }

    const items = podcast.items || [];
    if (els.podcastShowsGrid) els.podcastShowsGrid.innerHTML = "";
    if (els.podcastShowsEmpty) els.podcastShowsEmpty.hidden = items.length > 0;

    items.forEach((show) => {
      const count = (show.episodes || []).length;
      const cover = resolveCover(show.cover);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "podcast-show-card";
      btn.innerHTML = `
        <span class="podcast-show-card-cover-wrap">
          <img class="podcast-show-card-cover" src="${escapeHtml(cover)}" alt="" width="120" height="120" loading="lazy" />
        </span>
        <span class="podcast-show-card-body">
          <strong class="podcast-show-card-title">${escapeHtml(show.title)}</strong>
          ${show.author ? `<span class="podcast-show-card-author">${escapeHtml(show.author)}</span>` : ""}
          <span class="podcast-show-card-meta">${count} episodi</span>
        </span>
      `;
      btn.addEventListener("click", () => renderShow(show.id));
      els.podcastShowsGrid.appendChild(btn);
    });

    showScreen("podcastList");
  }

  function renderShow(showId) {
    const show = global.AscoltoPodcast.getShow(content, showId);
    if (!show) {
      renderList();
      return;
    }

    activeShowId = Number(show.id);
    const cover = resolveCover(show.cover);

    if (els.podcastCover) {
      els.podcastCover.src = cover;
      els.podcastCover.alt = show.title || "Copertina podcast";
    }
    if (els.podcastShowTitle) els.podcastShowTitle.textContent = show.title || "Podcast";
    if (els.podcastShowAuthor) els.podcastShowAuthor.textContent = show.author || "";
    if (els.podcastShowDesc) {
      els.podcastShowDesc.textContent = show.description || "";
      els.podcastShowDesc.hidden = !show.description;
    }

    const episodes = show.episodes || [];
    if (els.podcastEpisodesCount) {
      els.podcastEpisodesCount.textContent =
        episodes.length === 1 ? "1 episodio" : `${episodes.length} episodi`;
    }
    if (els.btnPlayLatest) {
      els.btnPlayLatest.disabled = episodes.length === 0 || !episodes[0]?.audio;
    }

    if (els.podcastEpisodeList) els.podcastEpisodeList.innerHTML = "";
    if (els.podcastEmpty) els.podcastEmpty.hidden = episodes.length > 0;

    episodes.forEach((ep, index) => {
      const li = document.createElement("li");
      li.className = "podcast-episode";
      li.setAttribute("data-episode-id", String(ep.id));
      li.style.animationDelay = `${Math.min(index, 12) * 40}ms`;

      const dateLabel = global.AscoltoPodcast.formatDate(ep.date);
      const durationLabel = global.AscoltoPodcast.formatDurationLabel(ep.duration);
      const isActive = Number(ep.id) === activeEpisodeId && activeShowId === Number(show.id);
      const isPlaying = isActive && (usingDriveEmbed || (audioEl && !audioEl.paused));

      li.innerHTML = `
        <div class="podcast-episode-body">
          <div class="podcast-episode-meta">
            ${dateLabel ? `<span class="podcast-episode-date">${escapeHtml(dateLabel)}</span>` : ""}
            <span class="podcast-episode-duration"${durationLabel ? "" : " hidden"}>${escapeHtml(
              durationLabel || ""
            )}</span>
          </div>
          <h3 class="podcast-episode-title">${escapeHtml(ep.title)}</h3>
          ${
            ep.description
              ? `<p class="podcast-episode-desc">${escapeHtml(ep.description)}</p>`
              : ""
          }
        </div>
        <button type="button" class="podcast-episode-play" data-play-episode="${ep.id}" aria-label="Riproduci episodio">
          ${isPlaying ? ICON_PAUSE : ICON_PLAY}
        </button>
      `;
      if (isActive) li.classList.add("is-playing");
      els.podcastEpisodeList.appendChild(li);
    });

    showScreen("podcast");
  }

  function bindEvents() {
    if (els.btnPodcast) els.btnPodcast.addEventListener("click", renderList);
    if (els.btnBackFromPodcastList) {
      els.btnBackFromPodcastList.addEventListener("click", () => showScreen("home"));
    }
    if (els.btnBackFromPodcast) {
      els.btnBackFromPodcast.addEventListener("click", renderList);
    }
    if (els.btnPlayLatest) {
      els.btnPlayLatest.addEventListener("click", () => {
        const first = currentShow()?.episodes?.[0];
        if (first) playEpisode(first);
      });
    }
    if (els.podcastEpisodeList) {
      els.podcastEpisodeList.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-play-episode]");
        if (!btn) return;
        const ep = global.AscoltoPodcast.getEpisode(
          content,
          activeShowId,
          btn.getAttribute("data-play-episode")
        );
        if (ep) playEpisode(ep);
      });
    }
    if (els.btnNpPlay) els.btnNpPlay.addEventListener("click", toggleNpPlay);
    if (els.btnNpClose) els.btnNpClose.addEventListener("click", stopPlayer);
    if (els.podcastNpProgress) {
      els.podcastNpProgress.addEventListener("input", () => {
        const audio = ensureAudio();
        const dur = audio.duration;
        if (!Number.isFinite(dur) || dur <= 0) return;
        audio.currentTime = (Number(els.podcastNpProgress.value) / 100) * dur;
      });
    }
  }

  global.AscoltoPodcastUI = {
    init(data) {
      content = data;
      bindEvents();
    },
    setContent(data) {
      content = data;
    },
    renderHome: renderList,
    renderList,
    renderShow,
    showScreen,
    stopPlayer,
  };
})(window);
