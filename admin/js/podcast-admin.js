/**
 * Admin UI — multiple podcasts, each with a YouTube playlist (+ legacy episode helpers)
 */
(function (global) {
  "use strict";

  /** @type {object|null} */
  let content = null;
  /** @type {object|null} */
  let api = null;
  /** @type {number|null} */
  let activeShowId = null;
  /** @type {string|null} */
  let pendingAudioDataUrl = null;
  /** @type {File|null} */
  let pendingAudioFile = null;
  /** @type {string|null} */
  let pendingCoverDataUrl = null;
  /** @type {File|null} */
  let pendingCoverFile = null;

  const $ = (sel, root = document) => root.querySelector(sel);

  const els = {
    viewPodcast: $("#viewPodcast"),
    viewPodcastShow: $("#viewPodcastShow"),
    podcastAdminGrid: $("#podcastAdminGrid"),
    podcastAdminEmpty: $("#podcastAdminEmpty"),
    btnAddPodcastShow: $("#btnAddPodcastShow"),
    btnBackPodcastShows: $("#btnBackPodcastShows"),
    adminPodcastShowTitle: $("#adminPodcastShowTitle"),
    adminPodcastShowLead: $("#adminPodcastShowLead"),
    episodesList: $("#podcastEpisodesList"),
    episodesEmpty: $("#podcastEpisodesEmpty"),
    btnEditPodcastShow: $("#btnEditPodcastShow"),
    btnAddEpisode: $("#btnAddEpisode"),
    podcastShowModal: $("#podcastShowModal"),
    podcastShowModalTitle: $("#podcastShowModalTitle"),
    podcastShowForm: $("#podcastShowForm"),
    podcastShowFormId: $("#podcastShowFormId"),
    podcastTitle: $("#podcastTitle"),
    podcastAuthor: $("#podcastAuthor"),
    podcastDesc: $("#podcastDesc"),
    podcastPlaylistUrl: $("#podcastPlaylistUrl"),
    podcastCover: $("#podcastCoverInput"),
    podcastCoverFile: $("#podcastCoverFile"),
    podcastCoverHint: $("#podcastCoverHint"),
    podcastCoverPreview: $("#podcastCoverPreview"),
    podcastShowFormSubmit: $("#podcastShowFormSubmit"),
    btnOpenPodcastPlaylist: $("#btnOpenPodcastPlaylist"),
    btnSyncPodcastPlaylist: $("#btnSyncPodcastPlaylist"),
    podcastPlaylistPreviewCard: $("#podcastPlaylistPreviewCard"),
    podcastPlaylistUrlLabel: $("#podcastPlaylistUrlLabel"),
    episodeModal: $("#episodeModal"),
    episodeModalTitle: $("#episodeModalTitle"),
    episodeForm: $("#episodeForm"),
    episodeFormId: $("#episodeFormId"),
    episodeTitle: $("#episodeTitle"),
    episodeDesc: $("#episodeDesc"),
    episodeText: $("#episodeText"),
    episodeVideoUrl: $("#episodeVideoUrl"),
    episodeDate: $("#episodeDate"),
    episodeAudioPath: $("#episodeAudioPath"),
    episodeAudioFile: $("#episodeAudioFile"),
    episodeAudioHint: $("#episodeAudioHint"),
    episodeAudioPreview: $("#episodeAudioPreview"),
    episodeAudioPreviewWrap: $("#episodeAudioPreviewWrap"),
    episodeDrivePreviewWrap: $("#episodeDrivePreviewWrap"),
    episodeDrivePreviewFrame: $("#episodeDrivePreviewFrame"),
    episodeFormError: $("#episodeFormError"),
    episodeFormSubmit: $("#episodeFormSubmit"),
  };

  /** @type {string|null} */
  let previewBlobUrl = null;
  let previewSourceKey = "";
  let previewCandidateIndex = 0;
  /** @type {string[]} */
  let previewCandidates = [];

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setButtonLoading(btn, isLoading, loadingLabel = "Salvataggio…") {
    if (!btn) return;
    if (isLoading) {
      if (!btn.dataset.defaultLabel) btn.dataset.defaultLabel = btn.textContent.trim();
      btn.classList.add("is-loading");
      btn.setAttribute("aria-busy", "true");
      btn.textContent = loadingLabel;
    } else {
      btn.classList.remove("is-loading");
      btn.removeAttribute("aria-busy");
      btn.textContent = btn.dataset.defaultLabel || "Salva";
    }
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Lettura file fallita."));
      reader.readAsDataURL(file);
    });
  }

  function resolveCover(src) {
    if (global.AscoltoContent?.resolveImageSrc) {
      return global.AscoltoContent.resolveImageSrc(src || global.AscoltoPodcast.DEFAULT_COVER);
    }
    return src || global.AscoltoPodcast.DEFAULT_COVER;
  }

  function shows() {
    return content?.podcast?.items || [];
  }

  function clearAdminPlaylistPreview() {
    if (els.btnOpenPodcastPlaylist) {
      els.btnOpenPodcastPlaylist.hidden = true;
      els.btnOpenPodcastPlaylist.removeAttribute("href");
    }
  }

  function renderList() {
    if (!api || !content) return;
    activeShowId = null;
    clearAdminPlaylistPreview();
    api.showView("podcast");

    const list = shows();
    if (els.podcastAdminGrid) els.podcastAdminGrid.innerHTML = "";
    if (els.podcastAdminEmpty) els.podcastAdminEmpty.hidden = list.length > 0;

    list.forEach((show) => {
      const count = (show.episodes || []).length;
      const cover = resolveCover(show.cover);
      const card = document.createElement("article");
      card.className = "level-card";
      card.innerHTML = `
        <div class="level-card-top" style="display:flex;gap:0.85rem;align-items:center">
          <img src="${escapeHtml(cover)}" alt="" width="56" height="56" style="border-radius:12px;object-fit:cover;flex-shrink:0" />
          <div>
            <span class="level-badge">Podcast</span>
            <h2>${escapeHtml(show.title)}</h2>
          </div>
        </div>
        <p class="level-card-desc">${escapeHtml(show.author || show.description || "—")}</p>
        <p class="level-card-meta">${count} ${count === 1 ? "episodio" : "episodi"}</p>
        <div class="level-card-actions">
          <button type="button" class="btn btn-primary btn-sm" data-open-show="${show.id}">Gestisci episodi</button>
          <button type="button" class="btn btn-secondary btn-sm" data-edit-show="${show.id}">Modifica</button>
          <button type="button" class="btn btn-danger-outline btn-sm" data-delete-show="${show.id}">Elimina</button>
        </div>
      `;
      els.podcastAdminGrid.appendChild(card);
    });
  }

  function renderShow(showId) {
    const show = global.AscoltoPodcast.getShow(content, showId);
    if (!show) {
      renderList();
      return;
    }
    activeShowId = Number(show.id);
    api.showView("podcastShow");

    const playlistUrl = show.playlistUrl || "";
    const watchUrl = global.AscoltoPodcast.getPlaylistWatchUrl(playlistUrl);
    const episodes = show.episodes || [];

    if (els.adminPodcastShowTitle) els.adminPodcastShowTitle.textContent = show.title;
    if (els.adminPodcastShowLead) {
      els.adminPodcastShowLead.textContent =
        (show.author ? `${show.author} · ` : "") +
        `${episodes.length} ${episodes.length === 1 ? "episodio" : "episodi"}`;
    }

    if (els.podcastPlaylistPreviewCard) els.podcastPlaylistPreviewCard.hidden = false;
    if (els.podcastPlaylistUrlLabel) {
      els.podcastPlaylistUrlLabel.textContent = playlistUrl || "Nessuna playlist collegata";
    }
    if (els.btnOpenPodcastPlaylist) {
      if (watchUrl && global.AscoltoPodcast.extractYouTubePlaylistId(playlistUrl)) {
        els.btnOpenPodcastPlaylist.hidden = false;
        els.btnOpenPodcastPlaylist.href = watchUrl;
      } else {
        els.btnOpenPodcastPlaylist.hidden = true;
        els.btnOpenPodcastPlaylist.removeAttribute("href");
      }
    }
    if (els.btnSyncPodcastPlaylist) {
      els.btnSyncPodcastPlaylist.disabled = !global.AscoltoPodcast.extractYouTubePlaylistId(
        playlistUrl
      );
    }

    if (els.episodesList) els.episodesList.innerHTML = "";
    if (els.episodesEmpty) els.episodesEmpty.hidden = episodes.length > 0;

    episodes.forEach((ep, index) => {
      const hasText = !!(ep.text && String(ep.text).trim());
      const dateLabel = global.AscoltoPodcast.formatDate(ep.date) || "";
      const card = document.createElement("article");
      card.className = "question-admin-card";
      card.innerHTML = `
        <div class="question-admin-head">
          <span class="question-badge">E${index + 1}</span>
          <div class="question-admin-title">
            <h2>${escapeHtml(ep.title)}</h2>
            <p class="muted audio-path-label">
              ${escapeHtml(dateLabel ? `${dateLabel} · ` : "")}${hasText ? "Testo pronto" : "Senza testo"}
              ${ep.videoUrl ? ` · ${escapeHtml(ep.videoUrl)}` : ""}
            </p>
          </div>
          <div class="question-admin-actions">
            <button type="button" class="btn btn-secondary btn-sm" data-edit-episode="${ep.id}">Testo / modifica</button>
            <button type="button" class="btn btn-danger-outline btn-sm" data-delete-episode="${ep.id}">Elimina</button>
          </div>
        </div>
        ${
          ep.description
            ? `<p class="level-card-desc" style="margin:0.5rem 0 0">${escapeHtml(ep.description)}</p>`
            : ""
        }
      `;
      els.episodesList.appendChild(card);
    });
  }

  async function fetchPlaylistViaLocalApi(playlistId, apiKey) {
    const params = new URLSearchParams({ list: playlistId });
    if (apiKey) params.set("key", apiKey);
    const res = await fetch(`/api/youtube/playlist?${params.toString()}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      throw new Error(data.error || `API locale fallita (${res.status})`);
    }
    return data.videos || [];
  }

  async function fetchPlaylistViaYoutubeApi(playlistId, apiKey) {
    if (!apiKey) {
      throw new Error(
        "Manca la Google API Key (Branding) per leggere la playlist da GitHub Pages."
      );
    }
    const videos = [];
    let pageToken = "";
    do {
      const params = new URLSearchParams({
        part: "snippet,contentDetails",
        playlistId,
        maxResults: "50",
        key: apiKey,
      });
      if (pageToken) params.set("pageToken", pageToken);
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/playlistItems?${params.toString()}`,
        { cache: "no-store" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        const msg =
          (data.error && data.error.message) ||
          `YouTube API fallita (${res.status})`;
        throw new Error(msg);
      }
      (data.items || []).forEach((item) => {
        const snippet = item.snippet || {};
        const videoId = String((snippet.resourceId && snippet.resourceId.videoId) || "").trim();
        if (!videoId) return;
        videos.push({
          videoId,
          title: String(snippet.title || `Video ${videoId}`).trim(),
          date: String(snippet.publishedAt || "").slice(0, 10),
          videoUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
        });
      });
      pageToken = String(data.nextPageToken || "").trim();
    } while (pageToken && videos.length < 500);
    return videos;
  }

  async function syncPlaylistFromYoutube() {
    const show = global.AscoltoPodcast.getShow(content, activeShowId);
    if (!show) return;
    const playlistId = global.AscoltoPodcast.extractYouTubePlaylistId(show.playlistUrl);
    if (!playlistId) {
      api.showToast("Collega prima una playlist YouTube (Modifica podcast).", 4500);
      return;
    }

    const btn = els.btnSyncPodcastPlaylist;
    setButtonLoading(btn, true, "Sincronizzazione…");
    try {
      const apiKey = content?.site?.googleApiKey || "";
      let videos = [];
      let lastErr = null;
      try {
        videos = await fetchPlaylistViaLocalApi(playlistId, apiKey);
      } catch (err) {
        lastErr = err;
        videos = await fetchPlaylistViaYoutubeApi(playlistId, apiKey);
      }
      if (!videos.length) {
        throw lastErr || new Error("La playlist non contiene video pubblici.");
      }
      global.AscoltoPodcast.syncEpisodesFromPlaylist(content, activeShowId, videos);
      await api.persist({ silent: true });
      api.showToast(`Sincronizzati ${videos.length} episodi. Ora puoi aggiungere il testo.`);
      renderShow(activeShowId);
    } catch (err) {
      api.showToast(err.message || "Sincronizzazione fallita.", 5000);
    } finally {
      setButtonLoading(btn, false);
      if (btn && !btn.dataset.defaultLabel) {
        btn.textContent = "Sincronizza playlist";
      }
    }
  }

  function setCoverPreview(src) {
    if (!els.podcastCoverPreview) return;
    els.podcastCoverPreview.src = resolveCover(src);
    els.podcastCoverPreview.hidden = false;
  }

  function openShowModal(show = null) {
    if (!els.podcastShowForm) return;
    els.podcastShowForm.reset();
    els.podcastShowFormId.value = "";
    pendingCoverDataUrl = null;
    pendingCoverFile = null;
    if (els.podcastCoverFile) els.podcastCoverFile.value = "";
    if (els.podcastCoverHint) {
      els.podcastCoverHint.textContent =
        "Immagine quadrata consigliata. Percorso, link Drive, oppure carica un file.";
    }

    if (els.podcastPlaylistUrl) els.podcastPlaylistUrl.value = "";

    if (show) {
      els.podcastShowModalTitle.textContent = "Modifica podcast";
      els.podcastShowFormId.value = String(show.id);
      els.podcastTitle.value = show.title || "";
      els.podcastAuthor.value = show.author || "";
      els.podcastDesc.value = show.description || "";
      if (els.podcastPlaylistUrl) els.podcastPlaylistUrl.value = show.playlistUrl || "";
      els.podcastCover.value = show.cover || "";
      setCoverPreview(show.cover);
    } else {
      els.podcastShowModalTitle.textContent = "Nuovo podcast";
      els.podcastAuthor.value = content?.site?.ownerName || "Signora Reham Ramadan";
      els.podcastCover.value = global.AscoltoPodcast.DEFAULT_COVER;
      setCoverPreview(global.AscoltoPodcast.DEFAULT_COVER);
    }
    if (els.podcastShowModal) els.podcastShowModal.hidden = false;
    els.podcastTitle?.focus();
  }

  async function onCoverFileChange() {
    const file = els.podcastCoverFile?.files?.[0];
    pendingCoverDataUrl = null;
    pendingCoverFile = null;
    if (!file) return;
    if (!/^image\//i.test(file.type) && !/\.(jpe?g|png|webp|gif|svg)$/i.test(file.name)) {
      api.showToast("Seleziona un’immagine (JPG, PNG, WebP…).", 4000);
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      pendingCoverDataUrl = dataUrl;
      pendingCoverFile = file;
      setCoverPreview(dataUrl);
      if (els.podcastCoverHint) {
        els.podcastCoverHint.textContent = `Pronto: ${file.name} (${Math.round(file.size / 1024)} KB) → assets/images/`;
      }
    } catch (err) {
      api.showToast(err.message || "Lettura immagine fallita.", 4000);
    }
  }

  async function onShowFormSubmit(e) {
    e.preventDefault();
    const title = els.podcastTitle.value.trim();
    if (!title) return;

    const playlistUrl = (els.podcastPlaylistUrl?.value || "").trim();
    if (!global.AscoltoPodcast.extractYouTubePlaylistId(playlistUrl)) {
      api.showToast("Incolla un link valido di playlist YouTube (deve contenere list=…).", 4500);
      els.podcastPlaylistUrl?.focus();
      return;
    }

    const showId = els.podcastShowFormId.value;
    const btn = els.podcastShowFormSubmit;
    setButtonLoading(btn, true, pendingCoverDataUrl ? "Caricamento copertina…" : "Salvataggio…");

    try {
      let cover = els.podcastCover.value.trim();

      if (pendingCoverDataUrl && pendingCoverFile) {
        if (!global.AscoltoContent?.uploadImageAsset) {
          throw new Error("Upload immagine non disponibile. Avvia python3 server.py.");
        }
        const upload = await global.AscoltoContent.uploadImageAsset({
          dataUrl: pendingCoverDataUrl,
          filename: `podcast-cover-${showId || "new"}-${pendingCoverFile.name}`,
        });
        cover = upload.path;
      }

      if (!cover) cover = global.AscoltoPodcast.DEFAULT_COVER;

      const patch = {
        title,
        author: els.podcastAuthor.value.trim(),
        description: els.podcastDesc.value.trim(),
        cover,
        playlistUrl,
      };

      if (showId) {
        global.AscoltoPodcast.updateShow(content, showId, patch);
      } else {
        global.AscoltoPodcast.createShow(content, patch);
      }

      await api.persist({ silent: true });
      api.closeModal(els.podcastShowModal);
      api.showToast(showId ? "Podcast aggiornato." : "Podcast creato.");
      pendingCoverDataUrl = null;
      pendingCoverFile = null;
      activeShowId ? renderShow(activeShowId) : renderList();
    } catch (err) {
      api.showToast(api.friendlySaveError(err), 5000);
    } finally {
      setButtonLoading(btn, false);
    }
  }

  function revokePreviewBlob() {
    if (previewBlobUrl) {
      try {
        URL.revokeObjectURL(previewBlobUrl);
      } catch {
        /* ignore */
      }
      previewBlobUrl = null;
    }
  }

  function hideDrivePreview() {
    if (els.episodeDrivePreviewWrap) els.episodeDrivePreviewWrap.hidden = true;
    if (els.episodeDrivePreviewFrame) els.episodeDrivePreviewFrame.removeAttribute("src");
    if (els.episodeAudioPreview) els.episodeAudioPreview.hidden = false;
  }

  function showDrivePreview(fileId) {
    if (!els.episodeDrivePreviewWrap || !els.episodeDrivePreviewFrame) return false;
    const AC = global.AscoltoContent;
    if (!AC?.toGoogleDrivePreviewUrl) return false;
    if (els.episodeAudioPreview) {
      els.episodeAudioPreview.onerror = null;
      els.episodeAudioPreview.removeAttribute("src");
      try {
        els.episodeAudioPreview.load();
      } catch {
        /* ignore */
      }
      els.episodeAudioPreview.hidden = true;
    }
    revokePreviewBlob();
    els.episodeDrivePreviewWrap.hidden = false;
    els.episodeDrivePreviewFrame.src = AC.toGoogleDrivePreviewUrl(fileId);
    return true;
  }

  function resetEpisodeForm() {
    if (!els.episodeForm) return;
    els.episodeForm.reset();
    els.episodeFormId.value = "";
    pendingAudioDataUrl = null;
    pendingAudioFile = null;
    previewSourceKey = "";
    previewCandidates = [];
    previewCandidateIndex = 0;
    if (els.episodeFormError) els.episodeFormError.hidden = true;
    if (els.episodeAudioPreviewWrap) els.episodeAudioPreviewWrap.hidden = true;
    if (els.episodeAudioPreview) {
      els.episodeAudioPreview.onerror = null;
      els.episodeAudioPreview.removeAttribute("src");
      els.episodeAudioPreview.hidden = false;
      try {
        els.episodeAudioPreview.load();
      } catch {
        /* ignore */
      }
    }
    revokePreviewBlob();
    hideDrivePreview();
    if (els.episodeAudioHint) {
      els.episodeAudioHint.textContent =
        "Carica un MP3 (o WAV/OGG/M4A) su Firebase, oppure incolla un link Drive / URL.";
    }
  }

  async function setAudioPreview(src) {
    if (!els.episodeAudioPreview || !els.episodeAudioPreviewWrap) return;
    if (!src) {
      previewSourceKey = "";
      els.episodeAudioPreviewWrap.hidden = true;
      els.episodeAudioPreview.onerror = null;
      els.episodeAudioPreview.removeAttribute("src");
      els.episodeAudioPreview.hidden = false;
      revokePreviewBlob();
      hideDrivePreview();
      return;
    }

    els.episodeAudioPreviewWrap.hidden = false;
    previewSourceKey = String(src);
    revokePreviewBlob();
    hideDrivePreview();
    els.episodeAudioPreview.onerror = null;
    els.episodeAudioPreview.hidden = false;

    const AC = global.AscoltoContent;
    const apiKey = content?.site?.googleApiKey || "";
    const fileId = AC?.extractGoogleDriveFileId?.(src) || null;
    const isDrive = !!(fileId && AC?.isGoogleDriveUrl?.(src));

    if (isDrive && AC.prefersDriveEmbed?.(src, { apiKey })) {
      showDrivePreview(fileId);
      return;
    }

    if (isDrive && AC.fetchDriveAudioBlobUrl) {
      try {
        const blobUrl = await AC.fetchDriveAudioBlobUrl(src, { apiKey });
        if (blobUrl && String(src) === previewSourceKey) {
          previewBlobUrl = blobUrl;
          els.episodeAudioPreview.src = blobUrl;
          return;
        }
      } catch (err) {
        console.warn("Admin podcast Drive preview blob failed", err);
      }
    }

    previewCandidates = AC?.getAudioPlaybackCandidates
      ? AC.getAudioPlaybackCandidates(src, { apiKey })
      : [AC?.resolveAudioSrc?.(src) || src];
    previewCandidateIndex = 0;

    const tryNext = () => {
      if (String(src) !== previewSourceKey) return;
      if (previewCandidateIndex >= previewCandidates.length) {
        if (isDrive) showDrivePreview(fileId);
        return;
      }
      const url = previewCandidates[previewCandidateIndex];
      previewCandidateIndex += 1;
      els.episodeAudioPreview.src = url;
      try {
        els.episodeAudioPreview.load();
      } catch {
        /* ignore */
      }
    };

    els.episodeAudioPreview.onerror = () => {
      if (String(src) !== previewSourceKey) return;
      tryNext();
    };

    tryNext();
  }

  function openEpisodeModal(episode = null) {
    resetEpisodeForm();
    if (els.episodeText) els.episodeText.value = "";
    if (els.episodeVideoUrl) els.episodeVideoUrl.value = "";
    if (episode) {
      els.episodeModalTitle.textContent = "Modifica episodio";
      els.episodeFormId.value = String(episode.id);
      els.episodeTitle.value = episode.title || "";
      els.episodeDesc.value = episode.description || "";
      if (els.episodeText) els.episodeText.value = episode.text || "";
      if (els.episodeVideoUrl) els.episodeVideoUrl.value = episode.videoUrl || "";
      els.episodeDate.value = episode.date || "";
      if (els.episodeAudioPath) els.episodeAudioPath.value = episode.audio || "";
    } else {
      els.episodeModalTitle.textContent = "Nuovo episodio";
      els.episodeDate.value = new Date().toISOString().slice(0, 10);
    }
    if (els.episodeModal) els.episodeModal.hidden = false;
    (els.episodeText || els.episodeTitle)?.focus();
  }

  async function onEpisodeAudioFileChange() {
    const file = els.episodeAudioFile?.files?.[0];
    pendingAudioDataUrl = null;
    pendingAudioFile = null;
    if (!file) return;
    if (!/^audio\//i.test(file.type) && !/\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(file.name)) {
      if (els.episodeFormError) {
        els.episodeFormError.hidden = false;
        els.episodeFormError.textContent = "Seleziona un file audio valido.";
      }
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      pendingAudioDataUrl = dataUrl;
      pendingAudioFile = file;
      setAudioPreview(dataUrl);
      if (els.episodeAudioHint) {
        els.episodeAudioHint.textContent = `Pronto: ${file.name} (${Math.round(file.size / 1024)} KB) → Firebase Storage`;
      }
      if (els.episodeFormError) els.episodeFormError.hidden = true;
    } catch (err) {
      if (els.episodeFormError) {
        els.episodeFormError.hidden = false;
        els.episodeFormError.textContent = err.message || "Lettura audio fallita.";
      }
    }
  }

  async function onEpisodeFormSubmit(e) {
    e.preventDefault();
    if (els.episodeFormError) els.episodeFormError.hidden = true;

    const title = els.episodeTitle.value.trim();
    if (!title) {
      els.episodeFormError.hidden = false;
      els.episodeFormError.textContent = "Inserisci il titolo dell’episodio.";
      return;
    }

    const videoUrl = (els.episodeVideoUrl?.value || "").trim();
    if (!global.AscoltoPodcast.extractYouTubeVideoId(videoUrl)) {
      if (els.episodeFormError) {
        els.episodeFormError.hidden = false;
        els.episodeFormError.textContent = "Incolla un link video YouTube valido.";
      }
      els.episodeVideoUrl?.focus();
      return;
    }

    const episodeId = els.episodeFormId.value;
    const btn = els.episodeFormSubmit;
    setButtonLoading(btn, true, "Salvataggio…");

    try {
      const patch = {
        title,
        description: els.episodeDesc.value.trim(),
        text: (els.episodeText?.value || "").trim(),
        videoUrl,
        date: els.episodeDate.value.trim(),
        audio: (els.episodeAudioPath?.value || "").trim(),
      };

      if (episodeId) {
        global.AscoltoPodcast.updateEpisode(content, activeShowId, episodeId, patch);
      } else {
        global.AscoltoPodcast.createEpisode(content, activeShowId, patch);
      }

      await api.persist({ silent: true });
      api.closeModal(els.episodeModal);
      api.showToast(episodeId ? "Episodio aggiornato." : "Episodio aggiunto.");
      pendingAudioDataUrl = null;
      pendingAudioFile = null;
      renderShow(activeShowId);
    } catch (err) {
      const msg = api.friendlySaveError(err);
      if (els.episodeFormError) {
        els.episodeFormError.hidden = false;
        els.episodeFormError.textContent = msg;
      }
      api.showToast(msg, 5000);
    } finally {
      setButtonLoading(btn, false);
    }
  }

  function onClick(e) {
    const open = e.target.closest("[data-open-show]");
    if (open) {
      renderShow(Number(open.getAttribute("data-open-show")));
      return;
    }
    const editShow = e.target.closest("[data-edit-show]");
    if (editShow) {
      openShowModal(global.AscoltoPodcast.getShow(content, editShow.getAttribute("data-edit-show")));
      return;
    }
    const delShow = e.target.closest("[data-delete-show]");
    if (delShow) {
      const show = global.AscoltoPodcast.getShow(content, delShow.getAttribute("data-delete-show"));
      if (!show) return;
      api.openConfirm({
        title: "Eliminare il podcast?",
        message: `«${show.title}» verrà rimosso dalla piattaforma.`,
        confirmLabel: "Elimina",
        onConfirm: async () => {
          global.AscoltoPodcast.deleteShow(content, show.id);
          await api.persist({ silent: true });
          api.showToast("Podcast eliminato.");
          renderList();
        },
      });
      return;
    }
    const editEp = e.target.closest("[data-edit-episode]");
    if (editEp) {
      openEpisodeModal(
        global.AscoltoPodcast.getEpisode(content, activeShowId, editEp.getAttribute("data-edit-episode"))
      );
      return;
    }
    const delEp = e.target.closest("[data-delete-episode]");
    if (delEp) {
      const episode = global.AscoltoPodcast.getEpisode(
        content,
        activeShowId,
        delEp.getAttribute("data-delete-episode")
      );
      if (!episode) return;
      api.openConfirm({
        title: "Eliminare l’episodio?",
        message: `«${episode.title}» verrà rimosso.`,
        confirmLabel: "Elimina",
        onConfirm: async () => {
          global.AscoltoPodcast.deleteEpisode(content, activeShowId, episode.id);
          await api.persist({ silent: true });
          api.showToast("Episodio eliminato.");
          renderShow(activeShowId);
        },
      });
    }
  }

  let bound = false;

  function bindEvents() {
    if (bound) return;
    bound = true;
    if (els.btnAddPodcastShow) els.btnAddPodcastShow.addEventListener("click", () => openShowModal(null));
    if (els.btnBackPodcastShows) els.btnBackPodcastShows.addEventListener("click", renderList);
    if (els.btnEditPodcastShow) {
      els.btnEditPodcastShow.addEventListener("click", () => {
        openShowModal(global.AscoltoPodcast.getShow(content, activeShowId));
      });
    }
    if (els.btnAddEpisode) els.btnAddEpisode.addEventListener("click", () => openEpisodeModal(null));
    if (els.btnSyncPodcastPlaylist) {
      els.btnSyncPodcastPlaylist.addEventListener("click", syncPlaylistFromYoutube);
    }
    if (els.podcastShowForm) els.podcastShowForm.addEventListener("submit", onShowFormSubmit);
    if (els.podcastCoverFile) els.podcastCoverFile.addEventListener("change", onCoverFileChange);
    if (els.podcastCover) {
      els.podcastCover.addEventListener("change", () => setCoverPreview(els.podcastCover.value.trim()));
    }
    if (els.episodeForm) els.episodeForm.addEventListener("submit", onEpisodeFormSubmit);
    if (els.episodeAudioFile) els.episodeAudioFile.addEventListener("change", onEpisodeAudioFileChange);
    if (els.episodeAudioPath) {
      els.episodeAudioPath.addEventListener("change", () => {
        const v = els.episodeAudioPath.value.trim();
        if (v) setAudioPreview(v);
      });
    }
    if (els.viewPodcast) els.viewPodcast.addEventListener("click", onClick);
    if (els.viewPodcastShow) els.viewPodcastShow.addEventListener("click", onClick);
  }

  global.PodcastAdmin = {
    init(hooks) {
      api = hooks;
      bindEvents();
    },
    setContent(data) {
      content = data;
    },
    renderList,
    renderShow,
  };
})(window);
