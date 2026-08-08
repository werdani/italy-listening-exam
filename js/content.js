/**
 * Shared content store for the exam app and admin dashboard.
 * Loads data/questions.json, overlays localStorage edits from the admin.
 */
(function (global) {
  "use strict";

  const CONTENT_KEY = "ascoltoit-content";
  const CONTENT_VERSION = 1;
  const DATA_URL = "data/questions.json";
  const API_KEY_STORAGE = "ascoltoit-google-api-key";

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function readStoredApiKey() {
    try {
      return String(localStorage.getItem(API_KEY_STORAGE) || "").trim();
    } catch {
      return "";
    }
  }

  function writeStoredApiKey(key) {
    try {
      const value = String(key || "").trim();
      if (value) localStorage.setItem(API_KEY_STORAGE, value);
      else localStorage.removeItem(API_KEY_STORAGE);
    } catch {
      /* ignore */
    }
  }

  function isLikelyGoogleApiKey(value) {
    return /^AIza[0-9A-Za-z_-]{20,}$/.test(String(value || "").trim());
  }

  function isLikelyOAuthClientId(value) {
    return /\.apps\.googleusercontent\.com$/i.test(String(value || "").trim());
  }

  function sanitizeApiKey(value) {
    const key = String(value || "").trim();
    if (!key) return "";
    if (isLikelyOAuthClientId(key)) return "";
    return key;
  }

  function stripSecretsForExport(data) {
    const clone = deepClone(data);
    if (clone.site) {
      // Keep browser API keys (AIza...) for GitHub Pages visitors; drop invalid/oauth values
      const key = sanitizeApiKey(clone.site.googleApiKey);
      clone.site.googleApiKey = isLikelyGoogleApiKey(key) ? key : "";
    }
    return clone;
  }

  function nextId(items) {
    if (!items || !items.length) return 1;
    return Math.max(...items.map((item) => Number(item.id) || 0)) + 1;
  }

  function normalizeContent(raw) {
    const data = deepClone(raw || {});
    data.exam = data.exam || {
      title: "Esame di Ascolto — Italiano",
      description: "",
      durationMinutes: 15,
      marksPerQuestion: 1,
      passPercentage: 60,
      preventSkip: true,
    };

    const siteIn = data.site || {};
    data.site = {
      ownerName: String(siteIn.ownerName || "Signora Reham Ramadan").trim() || "Signora Reham Ramadan",
      ownerTagline:
        String(siteIn.ownerTagline || "Insegnante di italiano in Italia").trim() ||
        "Insegnante di italiano in Italia",
      ownerPhoto: normalizeImageUrl(
        siteIn.ownerPhoto || "assets/images/logo.svg"
      ),
      googleApiKey: sanitizeApiKey(siteIn.googleApiKey || readStoredApiKey() || ""),
    };

    // Migrate legacy flat questions → Level 1
    if (!Array.isArray(data.levels)) {
      const legacy = Array.isArray(data.questions) ? data.questions : [];
      data.levels = [
        {
          id: 1,
          name: "Livello 1",
          description: "Domande di ascolto di base.",
          questions: legacy,
        },
      ];
      delete data.questions;
    }

    data.levels = data.levels.map((level, index) => ({
      id: level.id != null ? Number(level.id) : index + 1,
      name: level.name || `Livello ${index + 1}`,
      description: level.description || "",
      questions: Array.isArray(level.questions)
        ? level.questions.map((q, qi) => ({
            id: q.id != null ? Number(q.id) : qi + 1,
            prompt: q.prompt || "",
            audio: normalizeAudioUrl(q.audio || ""),
            choices: Array.isArray(q.choices) ? q.choices.slice(0, 4) : ["", "", "", ""],
            correct: typeof q.correct === "number" ? q.correct : 0,
          }))
        : [],
    }));

    data.levels.sort((a, b) => a.id - b.id);
    return data;
  }

  function readLocal() {
    try {
      const raw = localStorage.getItem(CONTENT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === CONTENT_VERSION && parsed.data) {
        return normalizeContent(parsed.data);
      }
      if (parsed && (parsed.levels || parsed.questions)) {
        return normalizeContent(parsed);
      }
      return null;
    } catch {
      return null;
    }
  }

  function writeLocal(data) {
    const normalized = normalizeContent(data);
    const key = sanitizeApiKey(normalized.site && normalized.site.googleApiKey);
    normalized.site.googleApiKey = key;
    if (key) writeStoredApiKey(key);

    const payload = {
      version: CONTENT_VERSION,
      savedAt: Date.now(),
      data: normalized,
    };
    localStorage.setItem(CONTENT_KEY, JSON.stringify(payload));
    // Notify other tabs/windows (exam page) that content changed
    try {
      localStorage.setItem(CONTENT_KEY + "-tick", String(Date.now()));
    } catch {
      /* ignore */
    }
    try {
      if (typeof BroadcastChannel !== "undefined") {
        const bc = new BroadcastChannel("ascoltoit-content");
        bc.postMessage({ type: "updated", at: payload.savedAt });
        bc.close();
      }
    } catch {
      /* ignore */
    }
    setSiteConfig(normalized.site);
    return normalized;
  }

  function clearLocal() {
    localStorage.removeItem(CONTENT_KEY);
    try {
      localStorage.setItem(CONTENT_KEY + "-tick", String(Date.now()));
    } catch {
      /* ignore */
    }
    try {
      if (typeof BroadcastChannel !== "undefined") {
        const bc = new BroadcastChannel("ascoltoit-content");
        bc.postMessage({ type: "cleared", at: Date.now() });
        bc.close();
      }
    } catch {
      /* ignore */
    }
  }

  function resolveDataUrl(basePath) {
    // Admin lives in /admin/, exam at root — allow optional override
    if (basePath) return basePath.replace(/\/?$/, "/") + "data/questions.json";
    // Detect if we're under /admin/
    const path = global.location.pathname || "";
    if (path.includes("/admin")) {
      return "../data/questions.json";
    }
    return DATA_URL;
  }

  function resolveApiUrl() {
    const path = global.location.pathname || "";
    if (path.includes("/admin")) return "../api/content";
    return "/api/content";
  }

  async function loadContent(options = {}) {
    // Default: load from file so localhost and 127.0.0.1 share the same data.
    // Set preferLocal:true only when you explicitly want browser-only overrides.
    const preferLocal = options.preferLocal === true;

    if (preferLocal) {
      const local = readLocal();
      if (local) {
        local.site.googleApiKey = readStoredApiKey() || local.site.googleApiKey || "";
        setSiteConfig(local.site);
        return { data: local, source: "local" };
      }
    }

    try {
      const base = options.url || resolveDataUrl(options.basePath);
      const sep = base.includes("?") ? "&" : "?";
      const url = `${base}${sep}t=${Date.now()}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`Impossibile caricare i contenuti (${res.status})`);
      const json = await res.json();
      const data = normalizeContent(json);
      data.site.googleApiKey = readStoredApiKey() || data.site.googleApiKey || "";
      setSiteConfig(data.site);
      return { data, source: "file" };
    } catch (err) {
      const local = readLocal();
      if (local) {
        local.site.googleApiKey = readStoredApiKey() || local.site.googleApiKey || "";
        setSiteConfig(local.site);
        return { data: local, source: "local" };
      }
      throw err;
    }
  }

  function saveContent(data) {
    return writeLocal(data);
  }

  /**
   * Persist to data/questions.json via local server API.
   * Returns { ok, source: "api"|"local" }.
   */
  async function saveContentRemote(data) {
    const normalized = writeLocal(data);
    const forFile = stripSecretsForExport(normalized);

    const apiUrl = resolveApiUrl();
    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(forFile),
        cache: "no-store",
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Salvataggio API fallito (${res.status})`);
      }
      return { ok: true, source: "api", data: normalized };
    } catch (err) {
      return {
        ok: false,
        source: "local",
        data: normalized,
        error: err && err.message ? err.message : String(err),
      };
    }
  }

  function exportContent(data, filename = "questions.json") {
    const blob = new Blob([JSON.stringify(stripSecretsForExport(normalizeContent(data)), null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function getLevel(data, levelId) {
    return (data.levels || []).find((l) => Number(l.id) === Number(levelId)) || null;
  }

  function examPayloadForLevel(data, levelId) {
    const level = getLevel(data, levelId);
    if (!level) return null;
    return {
      exam: {
        ...data.exam,
        title: `${data.exam.title} — ${level.name}`,
        levelId: level.id,
        levelName: level.name,
      },
      questions: level.questions || [],
    };
  }

  function createLevel(data, { name, description } = {}) {
    const levels = data.levels || [];
    const id = nextId(levels);
    const level = {
      id,
      name: name || `Livello ${id}`,
      description: description || "",
      questions: [],
    };
    levels.push(level);
    data.levels = levels;
    return level;
  }

  function updateLevel(data, levelId, patch) {
    const level = getLevel(data, levelId);
    if (!level) return null;
    if (patch.name != null) level.name = String(patch.name).trim() || level.name;
    if (patch.description != null) level.description = String(patch.description);
    return level;
  }

  function deleteLevel(data, levelId) {
    const before = data.levels.length;
    data.levels = data.levels.filter((l) => Number(l.id) !== Number(levelId));
    return data.levels.length < before;
  }

  function createQuestion(data, levelId, question) {
    const level = getLevel(data, levelId);
    if (!level) return null;
    const id = nextId(level.questions);
    const q = {
      id,
      prompt: question.prompt || "",
      audio: normalizeAudioUrl(question.audio || ""),
      choices: (question.choices || ["", "", "", ""]).slice(0, 4),
      correct: typeof question.correct === "number" ? question.correct : 0,
    };
    while (q.choices.length < 4) q.choices.push("");
    level.questions.push(q);
    return q;
  }

  function updateQuestion(data, levelId, questionId, patch) {
    const level = getLevel(data, levelId);
    if (!level) return null;
    const q = level.questions.find((item) => Number(item.id) === Number(questionId));
    if (!q) return null;
    if (patch.prompt != null) q.prompt = String(patch.prompt);
    if (patch.audio != null) q.audio = normalizeAudioUrl(String(patch.audio));
    if (Array.isArray(patch.choices)) {
      q.choices = patch.choices.slice(0, 4);
      while (q.choices.length < 4) q.choices.push("");
    }
    if (typeof patch.correct === "number") q.correct = patch.correct;
    return q;
  }

  function deleteQuestion(data, levelId, questionId) {
    const level = getLevel(data, levelId);
    if (!level) return false;
    const before = level.questions.length;
    level.questions = level.questions.filter((q) => Number(q.id) !== Number(questionId));
    return level.questions.length < before;
  }

  function extractGoogleDriveFileId(input) {
    const s = String(input || "").trim();
    if (!s) return null;

    let match = s.match(/\/file\/d\/([a-zA-Z0-9_-]{10,})/);
    if (match) return match[1];

    match = s.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
    if (match) return match[1];

    match = s.match(/\/api\/drive\/([a-zA-Z0-9_-]{10,})/);
    if (match) return match[1];

    match = s.match(/drive\.google\.com\/open\?[^#]*id=([a-zA-Z0-9_-]{10,})/i);
    if (match) return match[1];

    return null;
  }

  function isGoogleDriveUrl(input) {
    const s = String(input || "");
    return /drive\.google\.com|docs\.google\.com|drive\.usercontent\.google\.com|googleapis\.com\/drive/i.test(
      s
    );
  }

  function toGoogleDriveDirectUrl(fileId) {
    // Works better on static hosts (GitHub Pages) than the old uc? URL
    return `https://drive.usercontent.google.com/download?id=${encodeURIComponent(
      fileId
    )}&export=download&confirm=t`;
  }

  function toGoogleDriveApiMediaUrl(fileId, apiKey) {
    return `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
      fileId
    )}?alt=media&key=${encodeURIComponent(apiKey)}`;
  }

  function toGoogleDriveImageUrl(fileId) {
    return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w400`;
  }

  function resolveApiRoot() {
    const path = global.location.pathname || "";
    if (path.includes("/admin")) return "..";
    return "";
  }

  function toDriveProxyUrl(fileId) {
    return `${resolveApiRoot()}/api/drive/${encodeURIComponent(fileId)}`;
  }

  let driveProxyAvailable = null;
  let siteConfigRef = { googleApiKey: "" };

  function setSiteConfig(site) {
    siteConfigRef = site || {};
  }

  async function detectDriveProxy() {
    try {
      const res = await fetch(`${resolveApiRoot()}/api/content`, {
        method: "GET",
        cache: "no-store",
      });
      driveProxyAvailable = res.ok;
    } catch {
      driveProxyAvailable = false;
    }
    return driveProxyAvailable;
  }

  function getGoogleApiKey(options = {}) {
    if (options.apiKey) return String(options.apiKey).trim();
    return String(siteConfigRef.googleApiKey || "").trim();
  }

  /**
   * Playback candidates for Drive links.
   * Order is tuned so GitHub Pages works without server.py when possible.
   */
  function getAudioPlaybackCandidates(src, options = {}) {
    if (!src) return [];
    const trimmed = String(src).trim();
    if (trimmed.startsWith("data:") || trimmed.startsWith("blob:")) {
      return [trimmed];
    }

    const fileId = extractGoogleDriveFileId(trimmed);
    if (!(fileId && (isGoogleDriveUrl(trimmed) || /\/api\/drive\//.test(trimmed)))) {
      return [resolveAudioSrc(trimmed)];
    }

    const apiKey = getGoogleApiKey(options);
    const list = [];

    // 1) Local proxy (python3 server.py) — best when available
    if (driveProxyAvailable) {
      list.push(toDriveProxyUrl(fileId));
    }

    // 2) Google Drive API (works on GitHub Pages if API key is set)
    if (apiKey) {
      list.push(toGoogleDriveApiMediaUrl(fileId, apiKey));
    }

    // 3) Public direct download URLs (static hosting / GitHub Pages)
    list.push(toGoogleDriveDirectUrl(fileId));
    list.push(
      `https://docs.google.com/uc?export=open&id=${encodeURIComponent(fileId)}`
    );
    list.push(
      `https://drive.google.com/uc?export=download&id=${encodeURIComponent(
        fileId
      )}&confirm=t`
    );

    // 4) Try proxy last even if detection failed (maybe server came up later)
    if (!driveProxyAvailable) {
      list.push(toDriveProxyUrl(fileId));
    }

    return [...new Set(list)];
  }

  /**
   * Convert Google Drive share/view links into a direct media URL.
   */
  function normalizeAudioUrl(src) {
    if (!src) return "";
    const trimmed = String(src).trim();
    if (!trimmed || trimmed.startsWith("data:") || trimmed.startsWith("blob:")) {
      return trimmed;
    }

    if (isGoogleDriveUrl(trimmed) || /\/api\/drive\//.test(trimmed)) {
      const fileId = extractGoogleDriveFileId(trimmed);
      if (fileId) return toGoogleDriveDirectUrl(fileId);
    }

    return trimmed;
  }

  function normalizeImageUrl(src) {
    if (!src) return "";
    const trimmed = String(src).trim();
    if (!trimmed || trimmed.startsWith("data:") || trimmed.startsWith("blob:")) {
      return trimmed;
    }

    if (isGoogleDriveUrl(trimmed)) {
      const fileId = extractGoogleDriveFileId(trimmed);
      if (fileId) return toGoogleDriveImageUrl(fileId);
    }

    return trimmed;
  }

  function describeAudioSource(src) {
    if (!src) return "Nessun audio";
    if (src.startsWith("data:")) return "Audio caricato";
    if (
      isGoogleDriveUrl(src) ||
      /thumbnail\?id=/.test(src) ||
      /\/api\/drive\//.test(src) ||
      extractGoogleDriveFileId(src)
    ) {
      const id = extractGoogleDriveFileId(src);
      return id ? `Google Drive (${id.slice(0, 8)}…)` : "Google Drive";
    }
    if (/^https?:\/\//i.test(src)) return src;
    return src;
  }

  function resolveMediaSrc(src, kind) {
    if (!src) return "";
    const trimmed = String(src).trim();

    if (kind === "audio") {
      const fileId = extractGoogleDriveFileId(trimmed);
      if (fileId && (isGoogleDriveUrl(trimmed) || /\/api\/drive\//.test(trimmed))) {
        const apiKey = getGoogleApiKey();
        // Prefer paths that work on GitHub Pages first when no local proxy
        if (driveProxyAvailable) return toDriveProxyUrl(fileId);
        if (apiKey) return toGoogleDriveApiMediaUrl(fileId, apiKey);
        return toGoogleDriveDirectUrl(fileId);
      }
    }

    const normalized =
      kind === "image" ? normalizeImageUrl(trimmed) : normalizeAudioUrl(trimmed);
    if (
      normalized.startsWith("data:") ||
      normalized.startsWith("blob:") ||
      /^https?:\/\//i.test(normalized)
    ) {
      return normalized;
    }
    const path = global.location.pathname || "";
    if (path.includes("/admin") && !normalized.startsWith("../") && !normalized.startsWith("/")) {
      return "../" + normalized.replace(/^\.\//, "");
    }
    return normalized;
  }

  function resolveAudioSrc(src) {
    return resolveMediaSrc(src, "audio");
  }

  function resolveImageSrc(src) {
    return resolveMediaSrc(src, "image");
  }

  function updateSite(data, patch) {
    data.site = data.site || {};
    if (patch.ownerName != null) {
      data.site.ownerName = String(patch.ownerName).trim() || data.site.ownerName;
    }
    if (patch.ownerTagline != null) {
      data.site.ownerTagline = String(patch.ownerTagline).trim();
    }
    if (patch.ownerPhoto != null) {
      data.site.ownerPhoto = normalizeImageUrl(String(patch.ownerPhoto).trim());
    }
    if (patch.googleApiKey != null) {
      data.site.googleApiKey = sanitizeApiKey(patch.googleApiKey);
      writeStoredApiKey(data.site.googleApiKey);
    }
    setSiteConfig(data.site);
    return data.site;
  }

  global.AscoltoContent = {
    CONTENT_KEY,
    CONTENT_VERSION,
    normalizeContent,
    loadContent,
    saveContent,
    saveContentRemote,
    clearLocal,
    readLocal,
    exportContent,
    getLevel,
    examPayloadForLevel,
    createLevel,
    updateLevel,
    deleteLevel,
    createQuestion,
    updateQuestion,
    deleteQuestion,
    isLikelyGoogleApiKey,
    isLikelyOAuthClientId,
    sanitizeApiKey,
    updateSite,
    setSiteConfig,
    detectDriveProxy,
    extractGoogleDriveFileId,
    isGoogleDriveUrl,
    toGoogleDriveDirectUrl,
    toGoogleDriveImageUrl,
    toGoogleDriveApiMediaUrl,
    normalizeAudioUrl,
    normalizeImageUrl,
    describeAudioSource,
    getAudioPlaybackCandidates,
    resolveAudioSrc,
    resolveImageSrc,
    nextId,
    deepClone,
  };
})(window);
