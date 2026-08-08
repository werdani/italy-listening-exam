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
    questionModal: $("#questionModal"),
    questionModalTitle: $("#questionModalTitle"),
    questionForm: $("#questionForm"),
    questionFormId: $("#questionFormId"),
    questionPrompt: $("#questionPrompt"),
    questionAudioPath: $("#questionAudioPath"),
    questionAudioFile: $("#questionAudioFile"),
    audioPathHint: $("#audioPathHint"),
    audioFileHint: $("#audioFileHint"),
    driveStatus: $("#driveStatus"),
    btnNormalizeDrive: $("#btnNormalizeDrive"),
    audioPreviewWrap: $("#audioPreviewWrap"),
    audioPreview: $("#audioPreview"),
    questionFormError: $("#questionFormError"),
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
  }

  function closeAllModals() {
    [els.levelModal, els.questionModal, els.confirmModal].forEach((m) => {
      m.hidden = true;
    });
    pendingConfirmAction = null;
    pendingAudioDataUrl = null;
  }

  function openConfirm({ title, message, confirmLabel = "Elimina", onConfirm }) {
    els.confirmTitle.textContent = title;
    els.confirmMessage.textContent = message;
    els.confirmOk.textContent = confirmLabel;
    els.confirmOk.className = confirmLabel.toLowerCase().includes("ripristina")
      ? "btn btn-primary"
      : "btn btn-danger";
    pendingConfirmAction = onConfirm;
    els.confirmModal.hidden = false;
    els.confirmOk.focus();
  }

  async function persist() {
    try {
      const result = await AscoltoContent.saveContentRemote(content);
      content = result.data;
      contentSource = result.source === "api" ? "file" : "local";
      updateSourceBanner();
      if (result.source === "api") {
        // saved to questions.json — exam will see it on any host
      } else if (result.error) {
        showToast("Salvato solo nel browser (avvia python3 server.py).");
      }
      return result;
    } catch (err) {
      console.error(err);
      showToast("Salvataggio non riuscito.");
      throw err;
    }
  }

  function updateSourceBanner() {
    if (!els.sourceBanner) return;
    els.sourceBanner.hidden = false;
    if (contentSource === "file") {
      els.sourceBanner.innerHTML =
        "Modifiche salvate in <code>data/questions.json</code> — l’esame le mostra subito (anche su 127.0.0.1 o localhost).";
    } else if (contentSource === "local") {
      els.sourceBanner.innerHTML =
        "Salvato solo in questo browser. Per aggiornare il file: avvia <code>python3 server.py</code> oppure usa <strong>Esporta JSON</strong>.";
    } else {
      els.sourceBanner.textContent =
        "Contenuti caricati da data/questions.json.";
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
    const photo = AscoltoContent.resolveImageSrc(site.ownerPhoto || "../assets/images/logo.svg");
    if (els.adminBrandLogo) {
      els.adminBrandLogo.src = photo;
      els.adminBrandLogo.alt = site.ownerName || "";
      els.adminBrandLogo.onerror = () => {
        els.adminBrandLogo.onerror = null;
        els.adminBrandLogo.src = "../assets/images/logo.svg";
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
    const resolved = AscoltoContent.resolveImageSrc(src || "assets/images/logo.svg");
    els.sitePhotoPreview.src = resolved;
    els.sitePhotoPreview.onerror = () => {
      els.sitePhotoPreview.onerror = null;
      els.sitePhotoPreview.src = "../assets/images/logo.svg";
    };
  }

  function applyPhotoDriveNormalization(options = {}) {
    const raw = (els.siteOwnerPhoto.value || "").trim();
    if (!raw) {
      setPhotoDriveStatus("");
      updateSitePhotoPreview("assets/images/logo.svg");
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
      applyPhotoDriveNormalization({ preview: true }) || "assets/images/logo.svg";
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
    await persist();
    fillSiteForm();
    showToast("Profilo salvato — visibile sul sito.");
  }

  /* ---------- Levels view ---------- */

  function renderLevels() {
    showView("levels");
    activeLevelId = null;
    updateSourceBanner();
    fillSiteForm();

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
        <p class="level-card-meta">${level.questions.length} domand${level.questions.length === 1 ? "a" : "e"} audio</p>
        <div class="level-card-actions">
          <button type="button" class="btn btn-primary btn-sm" data-open-level="${level.id}">Apri</button>
          <button type="button" class="btn btn-secondary btn-sm" data-edit-level="${level.id}">Modifica</button>
          <button type="button" class="btn btn-danger-outline btn-sm" data-delete-level="${level.id}">Elimina</button>
        </div>
      `;
      els.levelsGrid.appendChild(card);
    });
  }

  function openLevelModal(level = null) {
    els.levelForm.reset();
    if (level) {
      els.levelModalTitle.textContent = "Modifica livello";
      els.levelFormId.value = String(level.id);
      els.levelName.value = level.name;
      els.levelDesc.value = level.description || "";
    } else {
      els.levelModalTitle.textContent = "Nuovo livello";
      els.levelFormId.value = "";
      const next = AscoltoContent.nextId(content.levels);
      els.levelName.value = `Livello ${next}`;
      els.levelDesc.value = "";
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

    if (id) {
      AscoltoContent.updateLevel(content, id, { name, description });
      await persist();
      showToast("Livello aggiornato.");
    } else {
      AscoltoContent.createLevel(content, { name, description });
      await persist();
      showToast("Livello creato — aggiorna l’esame per vederlo.");
    }
    closeAllModals();
    if (activeLevelId && Number(id) === Number(activeLevelId)) {
      renderLevelDetail(activeLevelId);
    } else {
      renderLevels();
    }
  }

  function requestDeleteLevel(levelId) {
    const level = AscoltoContent.getLevel(content, levelId);
    if (!level) return;
    openConfirm({
      title: "Eliminare il livello?",
      message: `«${level.name}» e tutte le sue ${level.questions.length} domande verranno eliminate.`,
      confirmLabel: "Elimina",
      onConfirm: async () => {
        AscoltoContent.deleteLevel(content, levelId);
        await persist();
        showToast("Livello eliminato.");
        renderLevels();
      },
    });
  }

  /* ---------- Level detail / questions ---------- */

  function renderLevelDetail(levelId) {
    const level = AscoltoContent.getLevel(content, levelId);
    if (!level) {
      renderLevels();
      return;
    }

    activeLevelId = Number(level.id);
    showView("level");
    els.levelTitle.textContent = level.name;
    els.levelLead.textContent =
      level.description ||
      `Gestisci le domande audio di ${level.name}. Livello → Domanda → Opzioni → Risposta corretta.`;

    const questions = level.questions || [];
    els.questionsList.innerHTML = "";
    els.questionsEmpty.hidden = questions.length > 0;

    questions.forEach((q, index) => {
      const correctLetter = LETTERS[q.correct] || "?";
      const correctText = q.choices[q.correct] || "—";
      const audioLabel = AscoltoContent.describeAudioSource(q.audio);

      const card = document.createElement("article");
      card.className = "question-admin-card";
      card.innerHTML = `
        <div class="question-admin-head">
          <span class="question-badge">V${index + 1}</span>
          <div class="question-admin-title">
            <h2>${escapeHtml(q.prompt || `Voce ${index + 1}`)}</h2>
            <p class="muted audio-path-label">${escapeHtml(audioLabel)}</p>
          </div>
          <div class="question-admin-actions">
            <button type="button" class="btn btn-secondary btn-sm" data-edit-question="${q.id}">Modifica</button>
            <button type="button" class="btn btn-danger-outline btn-sm" data-delete-question="${q.id}">Elimina</button>
          </div>
        </div>
        <div class="audio-block">
          <label class="audio-label">Anteprima audio</label>
          ${
            q.audio
              ? `<audio class="audio-player" controls preload="none" src="${escapeHtml(
                  AscoltoContent.resolveAudioSrc(q.audio)
                )}"></audio>`
              : `<p class="muted">Nessun file audio</p>`
          }
        </div>
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
    els.questionAudioFile.value = "";
    els.audioPreviewWrap.hidden = true;
    els.audioPreview.removeAttribute("src");
    els.audioFileHint.textContent =
      "Il file verrà salvato localmente (base64). Preferisci Drive per GitHub Pages.";
    setDriveStatus("");
    $$('input[name="correctChoice"]').forEach((r, i) => {
      r.checked = i === 0;
    });
  }

  function openQuestionModal(question = null) {
    resetQuestionForm();
    if (question) {
      els.questionModalTitle.textContent = "Modifica domanda audio";
      els.questionFormId.value = String(question.id);
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
      if (els.questionAudioPath.value) {
        applyDriveNormalization({ preview: true });
      } else {
        updateAudioPreview(question.audio);
      }
    } else {
      els.questionModalTitle.textContent = "Nuova domanda audio";
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

  async function onAudioFileChange() {
    const file = els.questionAudioFile.files && els.questionAudioFile.files[0];
    if (!file) return;
    if (file.size > 4.5 * 1024 * 1024) {
      els.questionFormError.hidden = false;
      els.questionFormError.textContent =
        "File troppo grande (max ~4.5 MB per il salvataggio locale). Usa un percorso file invece.";
      els.questionAudioFile.value = "";
      return;
    }
    try {
      pendingAudioDataUrl = await readFileAsDataUrl(file);
      els.questionAudioPath.value = "";
      els.audioFileHint.textContent = `Caricato: ${file.name} (${Math.round(file.size / 1024)} KB)`;
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

    const choices = [0, 1, 2, 3].map((i) => ($(`#choice${i}`)?.value || "").trim());
    if (choices.some((c) => !c)) {
      els.questionFormError.hidden = false;
      els.questionFormError.textContent = "Compila tutte e quattro le risposte.";
      return;
    }

    const correctRadio = $('input[name="correctChoice"]:checked');
    const correct = correctRadio ? Number(correctRadio.value) : 0;
    const path = applyDriveNormalization({ preview: false });
    const audio = pendingAudioDataUrl || path;

    if (!audio) {
      els.questionFormError.hidden = false;
      els.questionFormError.textContent = "Seleziona un percorso audio o carica un file.";
      return;
    }

    const payload = {
      prompt: els.questionPrompt.value.trim(),
      audio,
      choices,
      correct,
    };

    const qid = els.questionFormId.value;
    if (qid) {
      AscoltoContent.updateQuestion(content, activeLevelId, qid, payload);
      showToast("Domanda aggiornata.");
    } else {
      AscoltoContent.createQuestion(content, activeLevelId, payload);
      showToast("Domanda aggiunta.");
    }

    await persist();
    closeAllModals();
    renderLevelDetail(activeLevelId);
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
        await persist();
        showToast("Domanda eliminata.");
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
        await loadData({ preferLocal: false });
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

    // If browser had more levels than the file (old save), keep them and write to disk
    const local = AscoltoContent.readLocal();
    if (
      local &&
      Array.isArray(local.levels) &&
      local.levels.length > (content.levels || []).length
    ) {
      content = local;
      contentSource = "local";
      AscoltoContent.setSiteConfig(content.site);
      await persist();
    }
  }

  async function enterDashboard() {
    showApp();
    try {
      await loadData();
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
    els.btnBackLevels.addEventListener("click", renderLevels);
    els.btnEditLevel.addEventListener("click", () => {
      openLevelModal(AscoltoContent.getLevel(content, activeLevelId));
    });
    els.btnAddQuestion.addEventListener("click", () => openQuestionModal(null));
    els.levelForm.addEventListener("submit", onLevelFormSubmit);
    els.questionForm.addEventListener("submit", onQuestionFormSubmit);
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
        updateSitePhotoPreview(els.siteOwnerPhoto.value.trim() || "assets/images/logo.svg");
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
      closeAllModals();
      if (typeof action === "function") await action();
    });

    $$("[data-close-modal]").forEach((el) => {
      el.addEventListener("click", closeAllModals);
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeAllModals();
    });
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
