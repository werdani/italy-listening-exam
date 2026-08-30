/**
 * Admin Dashboard — levels & voice question management
 */
(() => {
  "use strict";

  const THEME_KEY = "listenlab-theme";
  const LETTERS = ["A", "B", "C", "D"];

  /** @type {object|null} */
  let content = null;
  let contentSource = "file";
  /** @type {number|null} */
  let activeLevelId = null;
  /** @type {string|null} pending uploaded audio data URL */
  let pendingAudioDataUrl = null;
  /** @type {File|null} last selected audio file for naming */
  let pendingAudioFile = null;
  let pendingConfirmAction = null;
  let toastTimer = null;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const els = {
    screenLogin: $("#screenLogin"),
    screenApp: $("#screenApp"),
    loginForm: $("#loginForm"),
    loginUser: $("#loginUser"),
    loginPass: $("#loginPass"),
    loginError: $("#loginError"),
    btnLogout: $("#btnLogout"),
    themeToggle: $("#themeToggle"),
    viewLevels: $("#viewLevels"),
    viewLevel: $("#viewLevel"),
    levelsGrid: $("#levelsGrid"),
    levelsEmpty: $("#levelsEmpty"),
    sourceBanner: $("#sourceBanner"),
    siteForm: $("#siteForm"),
    siteOwnerName: $("#siteOwnerName"),
    siteOwnerTagline: $("#siteOwnerTagline"),
    siteOwnerPhoto: $("#siteOwnerPhoto"),
    siteGoogleApiKey: $("#siteGoogleApiKey"),
    sitePhotoPreview: $("#sitePhotoPreview"),
    photoDriveStatus: $("#photoDriveStatus"),
    btnNormalizePhoto: $("#btnNormalizePhoto"),
    adminBrandLogo: $("#adminBrandLogo"),
    adminBrandTagline: $("#adminBrandTagline"),
    btnAddLevel: $("#btnAddLevel"),
    btnExport: $("#btnExport"),
    btnResetLocal: $("#btnResetLocal"),
    btnPublishGithub: $("#btnPublishGithub"),
    btnPublishGithub2: $("#btnPublishGithub2"),
    githubForm: $("#githubForm"),
    ghToken: $("#ghToken"),
    ghRepo: $("#ghRepo"),
    ghBranch: $("#ghBranch"),
    ghAutoPublish: $("#ghAutoPublish"),
    githubStatus: $("#githubStatus"),
    visitorCount: $("#visitorCount"),
    visitorStatsHint: $("#visitorStatsHint"),
    btnRefreshVisitors: $("#btnRefreshVisitors"),
    btnBackLevels: $("#btnBackLevels"),
    btnEditLevel: $("#btnEditLevel"),
    btnAddQuestion: $("#btnAddQuestion"),
    levelTitle: $("#levelTitle"),
    levelLead: $("#levelLead"),
    questionsList: $("#questionsList"),
    questionsEmpty: $("#questionsEmpty"),
    levelModal: $("#levelModal"),
    levelModalTitle: $("#levelModalTitle"),
    levelForm: $("#levelForm"),
    levelFormId: $("#levelFormId"),
    levelName: $("#levelName"),
    levelDesc: $("#levelDesc"),
    levelDuration: $("#levelDuration"),
    questionModal: $("#questionModal"),
    questionModalTitle: $("#questionModalTitle"),
    questionForm: $("#questionForm"),
    questionFormId: $("#questionFormId"),
    questionPrompt: $("#questionPrompt"),
    questionPromptLabel: $("#questionPromptLabel"),
    audioFieldset: $("#audioFieldset"),
    questionAudioPath: $("#questionAudioPath"),
    questionAudioFile: $("#questionAudioFile"),
    audioPathHint: $("#audioPathHint"),
    audioFileHint: $("#audioFileHint"),
    driveStatus: $("#driveStatus"),
    btnNormalizeDrive: $("#btnNormalizeDrive"),
    audioPreviewWrap: $("#audioPreviewWrap"),
    audioPreview: $("#audioPreview"),
    questionFormError: $("#questionFormError"),
    questionFormSubmit: $("#questionFormSubmit"),
    confirmModal: $("#confirmModal"),
    confirmTitle: $("#confirmTitle"),
    confirmMessage: $("#confirmMessage"),
    confirmOk: $("#confirmOk"),
    toast: $("#toast"),
  };

  /* ---------- Theme ---------- */

  function getPreferredTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
    if (!els.themeToggle) return;
    const next = theme === "dark" ? "light" : "dark";
    const label = next === "dark" ? "Passa alla modalità scura" : "Passa alla modalità chiara";
    els.themeToggle.setAttribute("aria-label", label);
    els.themeToggle.title = label;
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme") || "light";
    applyTheme(current === "dark" ? "light" : "dark");
  }

  /* ---------- UI helpers ---------- */

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function showToast(message, ms = 2600) {
    els.toast.textContent = message;
    els.toast.hidden = false;
    requestAnimationFrame(() => els.toast.classList.add("show"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      els.toast.classList.remove("show");
      setTimeout(() => {
        els.toast.hidden = true;
      }, 300);
    }, ms);
  }

  function setButtonLoading(btn, isLoading, loadingLabel = "Salvataggio…") {
    if (!btn) return;
    if (isLoading) {
      if (!btn.dataset.defaultLabel) {
        btn.dataset.defaultLabel = btn.textContent.trim();
      }
      btn.classList.add("is-loading");
      btn.setAttribute("aria-busy", "true");
      btn.textContent = loadingLabel;
    } else {
      btn.classList.remove("is-loading");
      btn.removeAttribute("aria-busy");
      btn.textContent = btn.dataset.defaultLabel || "Salva domanda";
    }
  }

  function showLogin() {
    els.screenLogin.hidden = false;
    els.screenApp.hidden = true;
    els.loginError.hidden = true;
    els.loginUser.focus();
  }

  function showApp() {
    els.screenLogin.hidden = true;
    els.screenApp.hidden = false;
  }

  function showView(name) {
    els.viewLevels.hidden = name !== "levels";
    els.viewLevel.hidden = name !== "level";
    const libView = document.getElementById("viewLibrary");
    const libLevelView = document.getElementById("viewLibraryLevel");
    if (libView) libView.hidden = name !== "library";
    if (libLevelView) libLevelView.hidden = name !== "libraryLevel";
    const coursesView = document.getElementById("viewCourses");
    const courseView = document.getElementById("viewCourse");
    if (coursesView) coursesView.hidden = name !== "courses";
    if (courseView) courseView.hidden = name !== "course";
    const courseUsersView = document.getElementById("viewCourseUsers");
    if (courseUsersView) courseUsersView.hidden = name !== "courseUsers";
    if (window.LibraryAdmin) LibraryAdmin.setContent(content);
    if (window.CoursesAdmin) CoursesAdmin.setContent(content);
    if (window.CourseUsersAdmin) CourseUsersAdmin.setContent(content);
  }

  function closeAllModals() {
    [
      els.levelModal,
      els.questionModal,
      els.confirmModal,
      document.getElementById("libraryLevelModal"),
      document.getElementById("bookModal"),
      document.getElementById("courseModal"),
      document.getElementById("videoModal"),
      document.getElementById("courseUserModal"),
    ].forEach((m) => {
      if (m) m.hidden = true;
    });
    pendingConfirmAction = null;
    pendingAudioDataUrl = null;
    pendingAudioFile = null;
  }

  function openConfirm({ title, message, confirmLabel = "Elimina", onConfirm }) {
    els.confirmTitle.textContent = title;
    els.confirmMessage.textContent = message;
    els.confirmOk.textContent = confirmLabel;
    els.confirmOk.dataset.defaultLabel = confirmLabel;
    els.confirmOk.classList.remove("is-loading");
    els.confirmOk.removeAttribute("aria-busy");
    els.confirmOk.className = confirmLabel.toLowerCase().includes("ripristina")
      ? "btn btn-primary"
      : "btn btn-danger";
    pendingConfirmAction = onConfirm;
    els.confirmModal.hidden = false;
    els.confirmOk.focus();
  }

  function friendlySaveError(err) {
    const name = err && err.name ? String(err.name) : "";
    const msg = err && err.message ? String(err.message) : String(err || "");
    if (
      name === "QuotaExceededError" ||
      name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      /quota/i.test(msg)
    ) {
      return "Memoria del browser piena. Usa un link Google Drive per l’audio, non caricare il file.";
    }
    return msg || "Salvataggio non riuscito.";
  }

  /** Token from localStorage, or from Pubblicazione form if user typed but did not save yet. */
  function getEffectiveGithubSettings() {
    if (!AscoltoContent.getGithubSettings) return { token: "", repo: "", branch: "main", autoPublish: false };
    const stored = AscoltoContent.getGithubSettings();
    const typed = els.ghToken ? els.ghToken.value.trim() : "";
    if (stored.token || !typed) return stored;
    AscoltoContent.saveGithubSettings({
      token: typed,
      repo: els.ghRepo ? els.ghRepo.value.trim() : stored.repo,
      branch: els.ghBranch ? els.ghBranch.value.trim() : stored.branch,
      autoPublish: !!(els.ghAutoPublish && els.ghAutoPublish.checked),
    });
    return AscoltoContent.getGithubSettings();
  }

  function githubTokenRequiredMessage() {
    return (
      "Token GitHub non trovato in questo browser. " +
      "Vai in «Pubblicazione automatica» (pagina principale admin), incolla il token e premi " +
      "«Salva impostazioni GitHub» finché vedi «Token OK»."
    );
  }

  async function persist(options = {}) {
    try {
      const result = await AscoltoContent.saveContentRemote(content);
      content = result.data;
      if (window.LibraryAdmin) LibraryAdmin.setContent(content);
      if (window.CoursesAdmin) CoursesAdmin.setContent(content);
      if (window.CourseUsersAdmin) CourseUsersAdmin.setContent(content);
      contentSource = result.source === "api" ? "file" : "local";
      updateSourceBanner();

      const effectiveGh = getEffectiveGithubSettings();
      const hasToken = !!(effectiveGh && effectiveGh.token);
      const apiOk = result.source === "api";
      // If the local API is down (GitHub Pages), GitHub is the only durable save.
      const shouldPublish =
        hasToken &&
        (options.publish === true ||
          (effectiveGh.autoPublish && options.publish !== false) ||
          (!apiOk && options.publish !== false));

      let published = false;
      let publishError = null;
      if (shouldPublish) {
        try {
          await publishOnline({ silent: true });
          published = true;
        } catch (pubErr) {
          console.error(pubErr);
          publishError = pubErr;
          showToast(friendlySaveError(pubErr), 5000);
        }
      }

      if (apiOk || published) {
        if (!options.silent) {
          if (published) {
            showToast("Salvato e pubblicato online per tutti.");
          } else {
            showToast("Salvato — l’esame è aggiornato.");
          }
        }
        return result;
      }

      const failMsg = publishError
        ? friendlySaveError(publishError)
        : hasToken
          ? "Salvataggio online non riuscito. Riprova o premi «Pubblica online»."
          : /\.github\.io$/i.test(location.hostname)
            ? "Salvataggio non riuscito. Salva il GitHub Token e premi «Pubblica online»."
            : "Salvataggio non riuscito. Avvia python3 server.py oppure configura GitHub.";
      showToast(failMsg, 5000);
      throw new Error(failMsg);
    } catch (err) {
      console.error(err);
      const msg = friendlySaveError(err);
      if (!String(els.toast.textContent || "").includes(msg)) {
        showToast(msg, 5000);
      }
      throw err;
    }
  }

  function setGithubStatus(message, type = "") {
    if (!els.githubStatus) return;
    if (!message) {
      els.githubStatus.hidden = true;
      els.githubStatus.textContent = "";
      els.githubStatus.className = "drive-status";
      return;
    }
    els.githubStatus.hidden = false;
    els.githubStatus.textContent = message;
    els.githubStatus.className = `drive-status ${type}`.trim();
  }

  function fillGithubForm() {
    if (!AscoltoContent.getGithubSettings || !els.githubForm) return;
    const gh = AscoltoContent.getGithubSettings();
    if (els.ghToken) els.ghToken.value = gh.token || "";
    if (els.ghRepo) els.ghRepo.value = gh.repo || "werdani/italy-listening-exam";
    if (els.ghBranch) els.ghBranch.value = gh.branch || "main";
    if (els.ghAutoPublish) els.ghAutoPublish.checked = !!gh.autoPublish;
    if (gh.token) {
      setGithubStatus("Token salvato in questo browser. Puoi pubblicare online.", "ok");
    } else {
      setGithubStatus("Inserisci un token per pubblicare le modifiche a tutti i visitatori.", "warn");
    }
  }

  async function onGithubFormSubmit(e) {
    e.preventDefault();
    const token = els.ghToken.value.trim();
    const repo = els.ghRepo.value.trim();
    const branch = els.ghBranch.value.trim();
    const autoPublish = !!(els.ghAutoPublish && els.ghAutoPublish.checked);

    if (token) {
      setGithubStatus("Verifica token GitHub…", "");
      try {
        const check = await AscoltoContent.validateGithubToken(token, repo || "werdani/italy-listening-exam");
        AscoltoContent.saveGithubSettings({ token, repo, branch, autoPublish });
        fillGithubForm();
        updateSourceBanner();
        setGithubStatus(`Token OK (${check.login}) — puoi pubblicare online.`, "ok");
        showToast("Token GitHub valido e salvato.");
        return;
      } catch (err) {
        setGithubStatus(err.message || "Token non valido", "warn");
        showToast(err.message || "Token GitHub non valido.");
        return;
      }
    }

    AscoltoContent.saveGithubSettings({ token, repo, branch, autoPublish });
    fillGithubForm();
    updateSourceBanner();
    showToast("Impostazioni GitHub salvate.");
  }

  async function publishOnline(options = {}) {
    if (!AscoltoContent.publishToGitHub) {
      throw new Error("Modulo pubblicazione non disponibile.");
    }
    content = AscoltoContent.saveContent(content);
    setGithubStatus("Pubblicazione su GitHub in corso…", "");
    const result = await AscoltoContent.publishToGitHub(content);
    contentSource = "file";
    updateSourceBanner();
    setGithubStatus(
      `Pubblicato su ${result.repo}@${result.branch}. Online tra 1–2 minuti.`,
      "ok"
    );
    if (!options.silent) {
      showToast("Pubblicato online. Tra 1–2 minuti tutti vedranno le modifiche.");
    }
    return result;
  }

  function updateSourceBanner() {
    if (!els.sourceBanner) return;
    els.sourceBanner.hidden = false;
    const gh = AscoltoContent.getGithubSettings ? AscoltoContent.getGithubSettings() : null;
    const hasToken = !!(gh && gh.token);
    if (hasToken) {
      els.sourceBanner.innerHTML =
        "Puoi aggiornare il sito pubblico con <strong>Pubblica online</strong>" +
        (gh.autoPublish ? " (auto attiva)" : "") +
        " — senza export/push manuale.";
    } else {
      els.sourceBanner.innerHTML =
        "Configura il <strong>GitHub Token</strong> sotto e usa <strong>Pubblica online</strong> per aggiornare tutti i visitatori.";
    }
  }

  /* ---------- Site branding ---------- */

  function setPhotoDriveStatus(message, type = "") {
    if (!els.photoDriveStatus) return;
    if (!message) {
      els.photoDriveStatus.hidden = true;
      els.photoDriveStatus.textContent = "";
      els.photoDriveStatus.className = "drive-status";
      return;
    }
    els.photoDriveStatus.hidden = false;
    els.photoDriveStatus.textContent = message;
    els.photoDriveStatus.className = `drive-status ${type}`.trim();
  }

  function applyAdminBrandChrome() {
    if (!content || !content.site) return;
    const site = content.site;
    const photo = AscoltoContent.resolveImageSrc(site.ownerPhoto || "../assets/images/reham.jpeg");
    if (els.adminBrandLogo) {
      els.adminBrandLogo.src = photo;
      els.adminBrandLogo.alt = site.ownerName || "";
      els.adminBrandLogo.onerror = () => {
        els.adminBrandLogo.onerror = null;
        els.adminBrandLogo.src = "../assets/images/reham.jpeg";
      };
    }
    if (els.adminBrandTagline) {
      els.adminBrandTagline.textContent = site.ownerName || "Signora Reham Ramadan";
    }
  }

  function fillSiteForm() {
    if (!content || !content.site || !els.siteForm) return;
    const site = content.site;
    AscoltoContent.setSiteConfig(site);
    els.siteOwnerName.value = site.ownerName || "";
    els.siteOwnerTagline.value = site.ownerTagline || "";
    els.siteOwnerPhoto.value = site.ownerPhoto || "";
    if (els.siteGoogleApiKey) els.siteGoogleApiKey.value = site.googleApiKey || "";
    updateSitePhotoPreview(site.ownerPhoto);
    applyAdminBrandChrome();
    setPhotoDriveStatus("");
  }

  function updateSitePhotoPreview(src) {
    if (!els.sitePhotoPreview) return;
    const resolved = AscoltoContent.resolveImageSrc(src || "assets/images/reham.jpeg");
    els.sitePhotoPreview.src = resolved;
    els.sitePhotoPreview.onerror = () => {
      els.sitePhotoPreview.onerror = null;
      els.sitePhotoPreview.src = "../assets/images/reham.jpeg";
    };
  }

  function applyPhotoDriveNormalization(options = {}) {
    const raw = (els.siteOwnerPhoto.value || "").trim();
    if (!raw) {
      setPhotoDriveStatus("");
      updateSitePhotoPreview("assets/images/reham.jpeg");
      return "";
    }

    const normalized = AscoltoContent.normalizeImageUrl(raw);
    const wasDrive = AscoltoContent.isGoogleDriveUrl(raw);
    const fileId = AscoltoContent.extractGoogleDriveFileId(raw);

    if (wasDrive && fileId) {
      els.siteOwnerPhoto.value = normalized;
      setPhotoDriveStatus("Link Google Drive convertito (miniatura). Condivisione pubblica richiesta.", "ok");
      if (options.preview !== false) updateSitePhotoPreview(normalized);
      return normalized;
    }

    if (wasDrive && !fileId) {
      setPhotoDriveStatus("Link Drive non riconosciuto.", "warn");
      return raw;
    }

    if (/^https?:\/\//i.test(raw)) {
      setPhotoDriveStatus("URL immagine impostato.", "ok");
    } else {
      setPhotoDriveStatus("");
    }
    if (options.preview !== false) updateSitePhotoPreview(normalized);
    return normalized;
  }

  async function onSiteFormSubmit(e) {
    e.preventDefault();
    const ownerName = els.siteOwnerName.value.trim();
    const ownerTagline = els.siteOwnerTagline.value.trim();
    const ownerPhoto =
      applyPhotoDriveNormalization({ preview: true }) || "assets/images/reham.jpeg";
    const googleApiKey = els.siteGoogleApiKey ? els.siteGoogleApiKey.value.trim() : "";

    if (!ownerName) {
      showToast("Inserisci il nome.");
      return;
    }

    if (googleApiKey && AscoltoContent.isLikelyOAuthClientId(googleApiKey)) {
      showToast("Questo non è un API Key. Crea una API key (inizia con AIza…).");
      return;
    }
    if (googleApiKey && !AscoltoContent.isLikelyGoogleApiKey(googleApiKey)) {
      showToast("API Key non valida. Deve iniziare con AIza…");
      return;
    }

    AscoltoContent.updateSite(content, { ownerName, ownerTagline, ownerPhoto, googleApiKey });
    try {
      await persist({ silent: true });
      fillSiteForm();
      showToast("Profilo salvato — visibile sul sito.");
    } catch {
      fillSiteForm();
    }
  }

  /* ---------- Levels view ---------- */

  async function refreshVisitorStats() {
    if (!els.visitorCount) return;
    if (els.visitorStatsHint) els.visitorStatsHint.textContent = "Aggiornamento…";
    try {
      if (!window.AscoltoVisitors || !AscoltoVisitors.getVisitorStats) {
        throw new Error("Modulo visitatori non disponibile.");
      }
      const stats = await AscoltoVisitors.getVisitorStats();
      els.visitorCount.textContent = String(stats.count ?? 0);
      if (els.visitorStatsHint) {
        if (stats.source === "api") {
          els.visitorStatsHint.textContent = stats.updatedAt
            ? `Aggiornato: ${stats.updatedAt}`
            : "Dati dal server locale.";
        } else if (stats.source === "counterapi") {
          els.visitorStatsHint.textContent =
            "Dati dal contatore online (GitHub Pages). Ogni dispositivo conta una volta.";
        } else {
          els.visitorStatsHint.textContent =
            stats.error ||
            "Impossibile leggere le statistiche. Avvia python3 server.py oppure pubblica il sito e riprova.";
        }
      }
    } catch (err) {
      console.error(err);
      els.visitorCount.textContent = "—";
      if (els.visitorStatsHint) {
        els.visitorStatsHint.textContent = err.message || "Errore nel caricamento.";
      }
    }
  }

  function renderLevels() {
    showView("levels");
    activeLevelId = null;
    updateSourceBanner();
    fillSiteForm();
    fillGithubForm();
    refreshVisitorStats();

    const levels = content.levels || [];
    els.levelsGrid.innerHTML = "";
    els.levelsEmpty.hidden = levels.length > 0;

    levels.forEach((level) => {
      const card = document.createElement("article");
      card.className = "level-card";
      card.innerHTML = `
        <div class="level-card-top">
          <span class="level-badge">L${escapeHtml(level.id)}</span>
          <h2>${escapeHtml(level.name)}</h2>
        </div>
        <p class="level-card-desc">${escapeHtml(level.description || "Nessuna descrizione")}</p>
        <p class="level-card-meta">${escapeHtml(formatQuestionCounts(level.questions))} · ${escapeHtml(formatLevelDuration(level))} min</p>
        <div class="level-card-actions">
          <button type="button" class="btn btn-primary btn-sm" data-open-level="${level.id}">Apri</button>
          <button type="button" class="btn btn-secondary btn-sm" data-edit-level="${level.id}">Modifica</button>
          <button type="button" class="btn btn-danger-outline btn-sm" data-delete-level="${level.id}">Elimina</button>
        </div>
      `;
      els.levelsGrid.appendChild(card);
    });
  }

  function formatLevelDuration(level) {
    if (AscoltoContent.getLevelDurationMinutes) {
      return String(AscoltoContent.getLevelDurationMinutes(level, content.exam));
    }
    return String(level?.durationMinutes || content.exam?.durationMinutes || 15);
  }

  function styleLevelDurationInput() {
    const input = els.levelDuration;
    if (!input) return;
    // Convert leftover number inputs (e.g. cached / old deploy) to text
    if (input.type === "number") input.type = "text";
    input.classList.add("admin-control");
    input.setAttribute("inputmode", "numeric");
    input.setAttribute("autocomplete", "off");
    input.setAttribute("maxlength", "3");
    const surface = getComputedStyle(document.documentElement).getPropertyValue("--surface").trim() || "#1a1f27";
    const text = getComputedStyle(document.documentElement).getPropertyValue("--text").trim() || "#e8eaed";
    const border = getComputedStyle(document.documentElement).getPropertyValue("--border-strong").trim() || "#3c4654";
    input.style.setProperty("background", surface, "important");
    input.style.setProperty("background-color", surface, "important");
    input.style.setProperty("color", text, "important");
    input.style.setProperty("-webkit-text-fill-color", text, "important");
    input.style.setProperty("border", `1.5px solid ${border}`, "important");
    input.style.setProperty("border-radius", "10px", "important");
    input.style.setProperty("padding", "0.7rem 0.85rem", "important");
    input.style.setProperty("width", "100%", "important");
    input.style.setProperty("box-shadow", "none", "important");
    input.style.setProperty("font", "inherit", "important");
  }

  function openLevelModal(level = null) {
    els.levelForm.reset();
    styleLevelDurationInput();
    const defaultMinutes = AscoltoContent.DEFAULT_DURATION_MINUTES || 15;
    if (level) {
      els.levelModalTitle.textContent = "Modifica livello";
      els.levelFormId.value = String(level.id);
      els.levelName.value = level.name;
      els.levelDesc.value = level.description || "";
      if (els.levelDuration) {
        els.levelDuration.value = String(formatLevelDuration(level));
      }
    } else {
      els.levelModalTitle.textContent = "Nuovo livello";
      els.levelFormId.value = "";
      const next = AscoltoContent.nextId(content.levels);
      els.levelName.value = `Livello ${next}`;
      els.levelDesc.value = "";
      if (els.levelDuration) els.levelDuration.value = String(defaultMinutes);
    }
    els.levelModal.hidden = false;
    els.levelName.focus();
  }

  async function onLevelFormSubmit(e) {
    e.preventDefault();
    const id = els.levelFormId.value;
    const name = els.levelName.value.trim();
    const description = els.levelDesc.value.trim();
    if (!name) return;

    const rawDuration = els.levelDuration ? els.levelDuration.value : "";
    const durationMinutes = AscoltoContent.clampDurationMinutes
      ? AscoltoContent.clampDurationMinutes(rawDuration, AscoltoContent.DEFAULT_DURATION_MINUTES || 15)
      : Math.max(1, Math.min(180, Math.round(Number(rawDuration) || 15)));

    try {
      if (id) {
        AscoltoContent.updateLevel(content, id, { name, description, durationMinutes });
        await persist({ silent: true });
        showToast("Livello aggiornato.");
      } else {
        AscoltoContent.createLevel(content, { name, description, durationMinutes });
        await persist({ silent: true });
        showToast("Livello creato — visibile nell’esame dopo refresh.");
      }
      closeAllModals();
      if (activeLevelId && Number(id) === Number(activeLevelId)) {
        renderLevelDetail(activeLevelId);
      } else {
        renderLevels();
      }
    } catch {
      /* persist already showed the error */
    }
  }

  function requestDeleteLevel(levelId) {
    const level = AscoltoContent.getLevel(content, levelId);
    if (!level) return;
    if ((content.levels || []).length <= 1) {
      showToast("Non puoi eliminare l’unico livello.");
      return;
    }
    openConfirm({
      title: "Eliminare il livello?",
      message: `«${level.name}» e tutte le sue ${level.questions.length} domande verranno eliminate.`,
      confirmLabel: "Elimina",
      onConfirm: async () => {
        const id = Number(levelId);
        const ok = AscoltoContent.deleteLevel(content, id);
        if (!ok) {
          showToast("Eliminazione non riuscita.");
          return;
        }
        // Drop selected-level preference if it pointed to the deleted level
        try {
          if (Number(localStorage.getItem("ascoltoit-selected-level")) === id) {
            localStorage.removeItem("ascoltoit-selected-level");
          }
        } catch {
          /* ignore */
        }
        if (Number(activeLevelId) === id) activeLevelId = null;
        try {
          await persist({ silent: true });
          showToast(`Livello eliminato. Restano ${content.levels.length} livelli.`);
        } catch {
          /* persist already showed the error */
        }
        renderLevels();
      },
    });
  }

  /* ---------- Level detail / questions ---------- */

  function isListening(q) {
    return AscoltoContent.isListeningQuestion
      ? AscoltoContent.isListeningQuestion(q)
      : (q?.type || "listening") !== "mcq";
  }

  function formatQuestionCounts(questions) {
    const list = questions || [];
    const listening = list.filter((q) => isListening(q)).length;
    const mcq = list.length - listening;
    if (!list.length) return "0 domande";
    const parts = [];
    if (listening) parts.push(`${listening} ascolto`);
    if (mcq) parts.push(`${mcq} scelta`);
    return `${list.length} domand${list.length === 1 ? "a" : "e"} (${parts.join(" · ")})`;
  }

  function getSelectedQuestionType() {
    const checked = $('input[name="questionType"]:checked');
    return checked && checked.value === "mcq" ? "mcq" : "listening";
  }

  function setQuestionType(type) {
    const value = type === "mcq" ? "mcq" : "listening";
    const radio = $(`input[name="questionType"][value="${value}"]`);
    if (radio) radio.checked = true;
    syncQuestionTypeUi();
  }

  function syncQuestionTypeUi() {
    const type = getSelectedQuestionType();
    const isMcq = type === "mcq";
    if (els.audioFieldset) {
      els.audioFieldset.hidden = isMcq;
      els.audioFieldset.setAttribute("aria-hidden", isMcq ? "true" : "false");
      // Extra guard: .form-fieldset { display:flex } can override [hidden]
      els.audioFieldset.style.display = isMcq ? "none" : "";
    }
    if (els.questionPromptLabel) {
      els.questionPromptLabel.textContent = isMcq
        ? "Testo della domanda"
        : "Testo della domanda (opzionale)";
    }
    if (els.questionPrompt) {
      els.questionPrompt.required = isMcq;
      els.questionPrompt.placeholder = isMcq
        ? "es. Qual è il plurale di «libro»?"
        : "es. Dove lavora?";
    }
    // Clear audio when switching to MCQ so it cannot be saved by mistake
    if (isMcq) {
      pendingAudioDataUrl = null;
      pendingAudioFile = null;
      if (els.questionAudioPath) els.questionAudioPath.value = "";
      if (els.questionAudioFile) els.questionAudioFile.value = "";
      if (els.audioPreviewWrap) els.audioPreviewWrap.hidden = true;
      if (els.audioPreview) els.audioPreview.removeAttribute("src");
      setDriveStatus("");
    }
  }

  function renderLevelDetail(levelId) {
    const level = AscoltoContent.getLevel(content, levelId);
    if (!level) {
      renderLevels();
      return;
    }

    activeLevelId = Number(level.id);
    showView("level");
    els.levelTitle.textContent = level.name;
    const minutes = formatLevelDuration(level);
    els.levelLead.textContent =
      (level.description ? `${level.description} · ` : "") +
      `Tempo esame: ${minutes} min. Puoi mischiare ascolto e scelta multipla.`;

    const questions = level.questions || [];
    els.questionsList.innerHTML = "";
    els.questionsEmpty.hidden = questions.length > 0;

    questions.forEach((q, index) => {
      const listening = isListening(q);
      const correctLetter = LETTERS[q.correct] || "?";
      const correctText = q.choices[q.correct] || "—";
      const audioLabel = listening
        ? AscoltoContent.describeAudioSource(q.audio)
        : "Senza audio";
      const typeLabel = listening ? "Ascolto" : "Scelta";
      const typeClass = listening ? "type-listening" : "type-mcq";

      const card = document.createElement("article");
      card.className = "question-admin-card";
      card.innerHTML = `
        <div class="question-admin-head">
          <span class="question-badge">V${index + 1}</span>
          <div class="question-admin-title">
            <h2>${escapeHtml(q.prompt || (listening ? `Voce ${index + 1}` : `Scelta ${index + 1}`))}</h2>
            <p class="muted audio-path-label">
              <span class="q-type-pill ${typeClass}">${typeLabel}</span>
              ${escapeHtml(audioLabel)}
            </p>
          </div>
          <div class="question-admin-actions">
            <button type="button" class="btn btn-secondary btn-sm" data-edit-question="${q.id}">Modifica</button>
            <button type="button" class="btn btn-danger-outline btn-sm" data-delete-question="${q.id}">Elimina</button>
          </div>
        </div>
        ${
          listening
            ? `<div class="audio-block">
          <label class="audio-label">Anteprima audio</label>
          ${
            q.audio
              ? `<audio class="audio-player" controls preload="none" src="${escapeHtml(
                  AscoltoContent.resolveAudioSrc(q.audio)
                )}"></audio>`
              : `<p class="muted">Nessun file audio</p>`
          }
        </div>`
            : ""
        }
        <ul class="admin-choices">
          ${q.choices
            .map(
              (text, i) => `
            <li class="${i === q.correct ? "is-correct" : ""}">
              <span class="choice-letter">${LETTERS[i]}</span>
              <span>${escapeHtml(text || "—")}</span>
              ${i === q.correct ? '<span class="correct-pill">Corretta</span>' : ""}
            </li>`
            )
            .join("")}
        </ul>
        <p class="correct-summary">Risposta corretta: <strong>${correctLetter}</strong> — ${escapeHtml(
          correctText
        )}</p>
      `;

      const audio = $("audio", card);
      if (audio) audio.oncontextmenu = (ev) => ev.preventDefault();

      els.questionsList.appendChild(card);
    });
  }

  function setDriveStatus(message, type = "") {
    if (!els.driveStatus) return;
    if (!message) {
      els.driveStatus.hidden = true;
      els.driveStatus.textContent = "";
      els.driveStatus.className = "drive-status";
      return;
    }
    els.driveStatus.hidden = false;
    els.driveStatus.textContent = message;
    els.driveStatus.className = `drive-status ${type}`.trim();
  }

  function applyDriveNormalization(options = {}) {
    const raw = (els.questionAudioPath.value || "").trim();
    if (!raw) {
      setDriveStatus("");
      return "";
    }

    const normalized = AscoltoContent.normalizeAudioUrl(raw);
    const wasDrive = AscoltoContent.isGoogleDriveUrl(raw);
    const fileId = AscoltoContent.extractGoogleDriveFileId(raw);

    if (wasDrive && fileId) {
      els.questionAudioPath.value = normalized;
      pendingAudioDataUrl = null;
      if (els.questionAudioFile) els.questionAudioFile.value = "";
      setDriveStatus(
        "Link Google Drive convertito in URL diretto. Assicurati che la condivisione sia pubblica.",
        "ok"
      );
      if (options.preview !== false) updateAudioPreview(normalized);
      return normalized;
    }

    if (wasDrive && !fileId) {
      setDriveStatus(
        "Link Drive non riconosciuto. Usa un link tipo: https://drive.google.com/file/d/ID/view",
        "warn"
      );
      return raw;
    }

    if (/^https?:\/\//i.test(raw)) {
      setDriveStatus("URL esterno impostato.", "ok");
    } else {
      setDriveStatus("");
    }
    if (options.preview !== false) updateAudioPreview(normalized);
    return normalized;
  }

  function resetQuestionForm() {
    els.questionForm.reset();
    els.questionFormId.value = "";
    els.questionFormError.hidden = true;
    pendingAudioDataUrl = null;
    pendingAudioFile = null;
    els.questionAudioFile.value = "";
    els.audioPreviewWrap.hidden = true;
    els.audioPreview.removeAttribute("src");
    els.audioFileHint.textContent =
      "Il file va in assets/audio/ — con GitHub Token viene pubblicato su Git automaticamente.";
    setDriveStatus("");
    $$('input[name="correctChoice"]').forEach((r, i) => {
      r.checked = i === 0;
    });
    setQuestionType("listening");
  }

  function openQuestionModal(question = null) {
    resetQuestionForm();
    if (question) {
      const listening = isListening(question);
      els.questionModalTitle.textContent = listening
        ? "Modifica domanda audio"
        : "Modifica domanda a scelta";
      els.questionFormId.value = String(question.id);
      setQuestionType(listening ? "listening" : "mcq");
      els.questionPrompt.value = question.prompt || "";
      els.questionAudioPath.value =
        question.audio && !question.audio.startsWith("data:") ? question.audio : "";
      if (question.audio && question.audio.startsWith("data:")) {
        pendingAudioDataUrl = question.audio;
        els.audioFileHint.textContent =
          "Audio caricato già presente. Caricane uno nuovo per sostituirlo, oppure usa un link Drive.";
      }
      question.choices.forEach((text, i) => {
        const input = $(`#choice${i}`);
        if (input) input.value = text || "";
      });
      const radio = $(`input[name="correctChoice"][value="${question.correct}"]`);
      if (radio) radio.checked = true;
      if (listening && els.questionAudioPath.value) {
        applyDriveNormalization({ preview: true });
      } else if (listening) {
        updateAudioPreview(question.audio);
      }
    } else {
      els.questionModalTitle.textContent = "Nuova domanda";
      setQuestionType("listening");
    }
    els.questionModal.hidden = false;
    els.questionPrompt.focus();
  }

  function updateAudioPreview(src) {
    if (!src) {
      els.audioPreviewWrap.hidden = true;
      els.audioPreview.removeAttribute("src");
      return;
    }

    const candidates = AscoltoContent.getAudioPlaybackCandidates
      ? AscoltoContent.getAudioPlaybackCandidates(src, {
          apiKey: content?.site?.googleApiKey || "",
        })
      : [AscoltoContent.resolveAudioSrc(src)];
    let index = 0;

    const tryNext = () => {
      if (index >= candidates.length) {
        setDriveStatus(
          "Anteprima non riuscita. Avvia python3 server.py e verifica che il file Drive sia pubblico.",
          "warn"
        );
        return;
      }
      const url = candidates[index];
      index += 1;
      els.audioPreview.onerror = () => tryNext();
      els.audioPreview.onloadeddata = () => {
        setDriveStatus("Audio pronto (anteprima ok).", "ok");
      };
      els.audioPreview.src = url;
      els.audioPreview.load();
    };

    els.audioPreviewWrap.hidden = false;
    tryNext();
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Impossibile leggere il file."));
      reader.readAsDataURL(file);
    });
  }

  function rejectOversizedAudioUpload(file) {
    if (file.size > 10 * 1024 * 1024) {
      return "File troppo grande (max 10 MB).";
    }
    return "";
  }

  async function onAudioFileChange() {
    const file = els.questionAudioFile.files && els.questionAudioFile.files[0];
    if (!file) return;
    const tooBig = rejectOversizedAudioUpload(file);
    if (tooBig) {
      els.questionFormError.hidden = false;
      els.questionFormError.textContent = tooBig;
      els.questionAudioFile.value = "";
      return;
    }
    try {
      pendingAudioFile = file;
      pendingAudioDataUrl = await readFileAsDataUrl(file);
      els.questionAudioPath.value = "";
      els.audioFileHint.textContent = `Pronto: ${file.name} (${Math.round(file.size / 1024)} KB) → assets/audio/`;
      updateAudioPreview(pendingAudioDataUrl);
      els.questionFormError.hidden = true;
    } catch (err) {
      els.questionFormError.hidden = false;
      els.questionFormError.textContent = err.message || "Errore nel caricamento.";
    }
  }

  async function onQuestionFormSubmit(e) {
    e.preventDefault();
    els.questionFormError.hidden = true;

    const type = getSelectedQuestionType();
    const choices = [0, 1, 2, 3].map((i) => ($(`#choice${i}`)?.value || "").trim());
    if (choices.some((c) => !c)) {
      els.questionFormError.hidden = false;
      els.questionFormError.textContent = "Compila tutte e quattro le risposte.";
      return;
    }

    const correctRadio = $('input[name="correctChoice"]:checked');
    const correct = correctRadio ? Number(correctRadio.value) : 0;
    const prompt = els.questionPrompt.value.trim();

    if (type === "mcq" && !prompt) {
      els.questionFormError.hidden = false;
      els.questionFormError.textContent = "Scrivi il testo della domanda.";
      return;
    }

    if (type === "listening") {
      const path = applyDriveNormalization({ preview: false });
      const hasUpload = pendingAudioDataUrl && pendingAudioDataUrl.startsWith("data:");
      if (!hasUpload && !pendingAudioDataUrl && !path) {
        els.questionFormError.hidden = false;
        els.questionFormError.textContent = "Seleziona un percorso audio o carica un file.";
        return;
      }
    }

    const submitBtn = els.questionFormSubmit;
    setButtonLoading(submitBtn, true, "Salvataggio…");

    try {
      let audio = "";
      let uploadWarning = "";
      if (type === "listening") {
        const path = applyDriveNormalization({ preview: false });
        if (pendingAudioDataUrl && pendingAudioDataUrl.startsWith("data:")) {
          setButtonLoading(submitBtn, true, "Caricamento audio…");
          if (!AscoltoContent.uploadAudioAsset) {
            throw new Error("Modulo audio non disponibile. Ricarica la pagina (Ctrl+Shift+R).");
          }
          const gh = getEffectiveGithubSettings();
          const onPages = /\.github\.io$/i.test(location.hostname);
          if (onPages && !(gh && gh.token)) {
            throw new Error(githubTokenRequiredMessage());
          }
          const upload = await AscoltoContent.uploadAudioAsset({
            dataUrl: pendingAudioDataUrl,
            filename: AscoltoContent.suggestAudioAssetName
              ? AscoltoContent.suggestAudioAssetName(
                  activeLevelId,
                  els.questionFormId.value,
                  pendingAudioFile?.name || "audio.mp3"
                )
              : pendingAudioFile?.name || "audio.mp3",
            levelId: activeLevelId,
            questionId: els.questionFormId.value,
          });
          audio = upload.path;
          if (upload.githubError) {
            uploadWarning = upload.githubError;
          }
          setButtonLoading(submitBtn, true, "Salvataggio…");
        } else {
          audio = pendingAudioDataUrl || path;
        }
        if (!audio) {
          throw new Error("Seleziona un percorso audio o carica un file.");
        }
      }

      const payload = {
        type,
        prompt,
        audio,
        choices,
        correct,
      };

      const qid = els.questionFormId.value;
      const snapshot = AscoltoContent.deepClone
        ? AscoltoContent.deepClone(content)
        : JSON.parse(JSON.stringify(content));

      if (qid) {
        const updated = AscoltoContent.updateQuestion(content, activeLevelId, qid, payload);
        if (!updated) throw new Error("Domanda non trovata. Riapri il livello e riprova.");
      } else {
        const created = AscoltoContent.createQuestion(content, activeLevelId, payload);
        if (!created) throw new Error("Livello non trovato. Riapri il livello e riprova.");
      }

      setButtonLoading(submitBtn, true, "Pubblicazione…");

      try {
        await persist({ silent: true });
      } catch (persistErr) {
        content = snapshot;
        throw persistErr;
      }

      if (uploadWarning) {
        showToast(`Domanda salvata. GitHub audio: ${uploadWarning}`, 6000);
      } else {
        const gh = AscoltoContent.getGithubSettings ? AscoltoContent.getGithubSettings() : null;
        if (gh && gh.token && /\.github\.io$/i.test(location.hostname)) {
          showToast(qid ? "Domanda aggiornata e pubblicata su Git." : "Domanda aggiunta e pubblicata su Git.");
        } else {
          showToast(qid ? "Domanda aggiornata." : "Domanda aggiunta.");
        }
      }

      closeAllModals();
      renderLevelDetail(activeLevelId);
    } catch (err) {
      console.error(err);
      const msg = friendlySaveError(err);
      els.questionFormError.hidden = false;
      els.questionFormError.textContent = msg;
      showToast(msg, 5000);
    } finally {
      setButtonLoading(submitBtn, false);
    }
  }

  function requestDeleteQuestion(questionId) {
    const level = AscoltoContent.getLevel(content, activeLevelId);
    const q = level?.questions.find((item) => Number(item.id) === Number(questionId));
    if (!q) return;
    openConfirm({
      title: "Eliminare la domanda?",
      message: `«${q.prompt || "Voce " + questionId}» verrà rimossa da questo livello.`,
      confirmLabel: "Elimina",
      onConfirm: async () => {
        AscoltoContent.deleteQuestion(content, activeLevelId, questionId);
        try {
          await persist({ silent: true });
          showToast("Domanda eliminata.");
        } catch {
          /* persist already showed the error */
        }
        renderLevelDetail(activeLevelId);
      },
    });
  }

  /* ---------- Export / reset ---------- */

  function exportJson() {
    AscoltoContent.exportContent(content, "questions.json");
    showToast("File questions.json scaricato.");
  }

  function requestReset() {
    openConfirm({
      title: "Ripristinare dal file?",
      message:
        "Le modifiche salvate in questo browser verranno eliminate. Tornerai ai contenuti di data/questions.json.",
      confirmLabel: "Ripristina",
      onConfirm: async () => {
        AscoltoContent.clearLocal();
        await loadData({ forceFile: true, preferLocal: false });
        showToast("Contenuti ripristinati dal file.");
        renderLevels();
      },
    });
  }

  /* ---------- Routing / events ---------- */

  function onAppClick(e) {
    const openBtn = e.target.closest("[data-open-level]");
    if (openBtn) {
      renderLevelDetail(Number(openBtn.getAttribute("data-open-level")));
      return;
    }
    const editLevelBtn = e.target.closest("[data-edit-level]");
    if (editLevelBtn) {
      const level = AscoltoContent.getLevel(content, editLevelBtn.getAttribute("data-edit-level"));
      openLevelModal(level);
      return;
    }
    const deleteLevelBtn = e.target.closest("[data-delete-level]");
    if (deleteLevelBtn) {
      requestDeleteLevel(deleteLevelBtn.getAttribute("data-delete-level"));
      return;
    }
    const editQ = e.target.closest("[data-edit-question]");
    if (editQ) {
      const level = AscoltoContent.getLevel(content, activeLevelId);
      const q = level?.questions.find(
        (item) => Number(item.id) === Number(editQ.getAttribute("data-edit-question"))
      );
      openQuestionModal(q);
      return;
    }
    const delQ = e.target.closest("[data-delete-question]");
    if (delQ) {
      requestDeleteQuestion(delQ.getAttribute("data-delete-question"));
    }
  }

  async function onLoginSubmit(e) {
    e.preventDefault();
    els.loginError.hidden = true;
    const result = await AdminAuth.login(els.loginUser.value, els.loginPass.value);
    if (!result.ok) {
      els.loginError.hidden = false;
      els.loginError.textContent = result.error;
      return;
    }
    els.loginPass.value = "";
    await enterDashboard();
  }

  function logout() {
    AdminAuth.logout();
    content = null;
    closeAllModals();
    showLogin();
    showToast("Sei uscito.");
  }

  async function loadData(options = {}) {
    const { data, source } = await AscoltoContent.loadContent({
      preferLocal: false,
      ...options,
    });
    content = data;
    contentSource = source === "local" ? "local" : "file";
    AscoltoContent.setSiteConfig(content.site);
    if (AscoltoContent.detectDriveProxy) {
      await AscoltoContent.detectDriveProxy();
    }
  }

  function initLibraryAdmin() {
    if (!window.LibraryAdmin) return;
    LibraryAdmin.init({
      persist,
      showToast,
      openConfirm,
      closeModal: (el) => {
        if (el) el.hidden = true;
      },
      friendlySaveError,
      getEffectiveGithubSettings,
      githubTokenRequiredMessage,
      showView,
    });
  }

  function initCoursesAdmin() {
    if (!window.CoursesAdmin) return;
    CoursesAdmin.init({
      persist,
      showToast,
      openConfirm,
      closeModal: (el) => {
        if (el) el.hidden = true;
      },
      friendlySaveError,
      getEffectiveGithubSettings,
      githubTokenRequiredMessage,
      showView,
    });
  }

  function initCourseUsersAdmin() {
    if (!window.CourseUsersAdmin) return;
    CourseUsersAdmin.init({
      persist,
      showToast,
      openConfirm,
      closeModal: (el) => {
        if (el) el.hidden = true;
      },
      friendlySaveError,
      getEffectiveGithubSettings,
      githubTokenRequiredMessage,
      showView,
    });
  }

  function switchAdminNav(target) {
    $$("[data-admin-nav]").forEach((b) => {
      b.classList.toggle("is-active", b.getAttribute("data-admin-nav") === target);
    });
    if (target === "library" && window.LibraryAdmin) {
      LibraryAdmin.setContent(content);
      LibraryAdmin.renderList();
    } else if (target === "courses" && window.CoursesAdmin) {
      CoursesAdmin.setContent(content);
      CoursesAdmin.renderList();
    } else if (target === "courseUsers" && window.CourseUsersAdmin) {
      CourseUsersAdmin.setContent(content);
      CourseUsersAdmin.renderList();
    } else {
      renderLevels();
    }
  }

  async function enterDashboard() {
    showApp();
    showView("levels");
    initLibraryAdmin();
    initCoursesAdmin();
    initCourseUsersAdmin();
    try {
      await loadData();
      if (window.LibraryAdmin) LibraryAdmin.setContent(content);
      if (window.CoursesAdmin) CoursesAdmin.setContent(content);
      if (window.CourseUsersAdmin) CourseUsersAdmin.setContent(content);
      renderLevels();
    } catch (err) {
      console.error(err);
      els.levelsGrid.innerHTML = "";
      els.levelsEmpty.hidden = false;
      els.levelsEmpty.textContent = err.message || "Errore di caricamento.";
      showToast("Impossibile caricare i contenuti.");
    }
  }

  function bindEvents() {
    els.loginForm.addEventListener("submit", onLoginSubmit);
    els.btnLogout.addEventListener("click", logout);
    els.themeToggle.addEventListener("click", toggleTheme);
    els.btnAddLevel.addEventListener("click", () => openLevelModal(null));
    els.btnExport.addEventListener("click", exportJson);
    els.btnResetLocal.addEventListener("click", requestReset);
    const publishHandler = async () => {
      try {
        // Save github form fields first if present
        if (els.ghToken) {
          AscoltoContent.saveGithubSettings({
            token: els.ghToken.value.trim(),
            repo: els.ghRepo.value.trim(),
            branch: els.ghBranch.value.trim(),
            autoPublish: !!(els.ghAutoPublish && els.ghAutoPublish.checked),
          });
        }
        await publishOnline();
      } catch (err) {
        console.error(err);
        setGithubStatus(err.message || "Errore pubblicazione", "warn");
        showToast(err.message || "Pubblicazione fallita.");
      }
    };
    if (els.btnPublishGithub) els.btnPublishGithub.addEventListener("click", publishHandler);
    if (els.btnPublishGithub2) els.btnPublishGithub2.addEventListener("click", publishHandler);
    if (els.githubForm) els.githubForm.addEventListener("submit", onGithubFormSubmit);
    if (els.btnRefreshVisitors) {
      els.btnRefreshVisitors.addEventListener("click", () => {
        refreshVisitorStats();
        showToast("Statistiche aggiornate.");
      });
    }
    els.btnBackLevels.addEventListener("click", renderLevels);
    els.btnEditLevel.addEventListener("click", () => {
      openLevelModal(AscoltoContent.getLevel(content, activeLevelId));
    });
    els.btnAddQuestion.addEventListener("click", () => openQuestionModal(null));
    els.levelForm.addEventListener("submit", onLevelFormSubmit);
    els.questionForm.addEventListener("submit", onQuestionFormSubmit);
    $$('input[name="questionType"]').forEach((radio) => {
      radio.addEventListener("change", syncQuestionTypeUi);
    });
    $$(".type-pick").forEach((label) => {
      label.addEventListener("click", () => {
        const input = $("input[name='questionType']", label);
        if (!input) return;
        input.checked = true;
        syncQuestionTypeUi();
      });
    });
    if (els.siteForm) {
      els.siteForm.addEventListener("submit", onSiteFormSubmit);
    }
    if (els.btnNormalizePhoto) {
      els.btnNormalizePhoto.addEventListener("click", () => {
        applyPhotoDriveNormalization({ preview: true });
        showToast("Link foto elaborato.");
      });
    }
    if (els.siteOwnerPhoto) {
      els.siteOwnerPhoto.addEventListener("blur", () => {
        if (els.siteOwnerPhoto.value.trim()) {
          applyPhotoDriveNormalization({ preview: true });
        }
      });
      els.siteOwnerPhoto.addEventListener("paste", () => {
        setTimeout(() => applyPhotoDriveNormalization({ preview: true }), 0);
      });
      els.siteOwnerPhoto.addEventListener("input", () => {
        updateSitePhotoPreview(els.siteOwnerPhoto.value.trim() || "assets/images/reham.jpeg");
      });
    }
    els.questionAudioFile.addEventListener("change", onAudioFileChange);
    if (els.btnNormalizeDrive) {
      els.btnNormalizeDrive.addEventListener("click", () => {
        const result = applyDriveNormalization({ preview: true });
        if (result && AscoltoContent.isGoogleDriveUrl(result)) {
          showToast("Link Drive convertito.");
        }
      });
    }
    els.questionAudioPath.addEventListener("input", () => {
      if (els.questionAudioPath.value.trim()) {
        pendingAudioDataUrl = null;
      }
    });
    els.questionAudioPath.addEventListener("blur", () => {
      if (els.questionAudioPath.value.trim()) {
        pendingAudioDataUrl = null;
        applyDriveNormalization({ preview: true });
      } else {
        setDriveStatus("");
      }
    });
    els.questionAudioPath.addEventListener("paste", () => {
      setTimeout(() => {
        if (els.questionAudioPath.value.trim()) {
          pendingAudioDataUrl = null;
          applyDriveNormalization({ preview: true });
        }
      }, 0);
    });
    els.screenApp.addEventListener("click", onAppClick);

    els.confirmOk.addEventListener("click", async () => {
      const action = pendingConfirmAction;
      if (typeof action !== "function") {
        closeAllModals();
        return;
      }

      const btn = els.confirmOk;
      const defaultLabel = btn.dataset.defaultLabel || btn.textContent.trim() || "Elimina";
      const loadingLabel = defaultLabel.toLowerCase().includes("ripristina")
        ? "Ripristino…"
        : defaultLabel.toLowerCase().includes("elimina")
          ? "Eliminazione…"
          : "Attendere…";

      setButtonLoading(btn, true, loadingLabel);

      try {
        await action();
        closeAllModals();
      } catch (err) {
        console.error(err);
        showToast(friendlySaveError(err), 5000);
      } finally {
        setButtonLoading(btn, false);
        btn.className = defaultLabel.toLowerCase().includes("ripristina")
          ? "btn btn-primary"
          : "btn btn-danger";
      }
    });

    $$("[data-close-modal]").forEach((el) => {
      el.addEventListener("click", closeAllModals);
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeAllModals();
    });

    initLibraryAdmin();
    $$("[data-admin-nav]").forEach((btn) => {
      btn.addEventListener("click", () => {
        switchAdminNav(btn.getAttribute("data-admin-nav"));
      });
    });

    styleLevelDurationInput();
  }

  async function init() {
    applyTheme(getPreferredTheme());
    bindEvents();

    if (!window.AscoltoContent || !window.AdminAuth) {
      showLogin();
      els.loginError.hidden = false;
      els.loginError.textContent = "Moduli non caricati. Ricarica la pagina.";
      return;
    }

    if (AdminAuth.isLoggedIn()) {
      await enterDashboard();
    } else {
      showLogin();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
