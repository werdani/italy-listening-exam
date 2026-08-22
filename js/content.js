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

  const DEFAULT_DURATION_MINUTES = 15;
  const MIN_DURATION_MINUTES = 1;
  const MAX_DURATION_MINUTES = 180;

  function nextId(items) {
    if (!items || !items.length) return 1;
    return Math.max(...items.map((item) => Number(item.id) || 0)) + 1;
  }

  function clampDurationMinutes(value, fallback = DEFAULT_DURATION_MINUTES) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return fallback;
    return Math.min(MAX_DURATION_MINUTES, Math.max(MIN_DURATION_MINUTES, Math.round(n)));
  }

  /** Per-level timer; falls back to exam default (15 min). */
  function getLevelDurationMinutes(level, exam) {
    const examDefault = clampDurationMinutes(
      exam?.durationMinutes,
      DEFAULT_DURATION_MINUTES
    );
    if (level && level.durationMinutes != null && level.durationMinutes !== "") {
      return clampDurationMinutes(level.durationMinutes, examDefault);
    }
    return examDefault;
  }

  function normalizeContent(raw) {
    const data = deepClone(raw || {});
    data.exam = data.exam || {
      title: "Esame di Ascolto — Italiano",
      description: "",
      durationMinutes: DEFAULT_DURATION_MINUTES,
      marksPerQuestion: 1,
      passPercentage: 60,
      preventSkip: true,
    };
    data.exam.durationMinutes = clampDurationMinutes(
      data.exam.durationMinutes,
      DEFAULT_DURATION_MINUTES
    );

    const siteIn = data.site || {};
    data.site = {
      ownerName: String(siteIn.ownerName || "Signora Reham Ramadan").trim() || "Signora Reham Ramadan",
      ownerTagline:
        String(siteIn.ownerTagline || "Insegnante di italiano in Italia").trim() ||
        "Insegnante di italiano in Italia",
      ownerPhoto: normalizeImageUrl(
        siteIn.ownerPhoto || "assets/images/reham.jpeg"
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

    data.levels = data.levels.map((level, index) => {
      const normalized = {
        id: level.id != null ? Number(level.id) : index + 1,
        name: level.name || `Livello ${index + 1}`,
        description: level.description || "",
        questions: Array.isArray(level.questions)
          ? level.questions.map((q, qi) => normalizeQuestion(q, qi))
          : [],
      };
      // Keep per-level timer only when explicitly set; otherwise use exam default
      if (level.durationMinutes != null && level.durationMinutes !== "") {
        normalized.durationMinutes = clampDurationMinutes(
          level.durationMinutes,
          data.exam.durationMinutes
        );
      }
      return normalized;
    });

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
    // forceFile: ignore browser overrides (used by "Ripristina file")
    const forceFile = options.forceFile === true;
    // Default: admin edits in localStorage win over the static file in this browser.
    // This makes Create/Update/Delete visible immediately on the exam page.
    const preferLocal = options.preferLocal !== false && !forceFile;

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
      if (!forceFile) {
        const local = readLocal();
        if (local) {
          local.site.googleApiKey = readStoredApiKey() || local.site.googleApiKey || "";
          setSiteConfig(local.site);
          return { data: local, source: "local" };
        }
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

  /* ---------- GitHub publish (no manual push each time) ---------- */

  const GH_TOKEN_KEY = "ascoltoit-github-token";
  const GH_REPO_KEY = "ascoltoit-github-repo";
  const GH_BRANCH_KEY = "ascoltoit-github-branch";
  const GH_AUTO_KEY = "ascoltoit-github-autopublish";

  function getGithubSettings() {
    try {
      return {
        token: String(localStorage.getItem(GH_TOKEN_KEY) || "").trim(),
        repo: String(localStorage.getItem(GH_REPO_KEY) || "werdani/italy-listening-exam").trim(),
        branch: String(localStorage.getItem(GH_BRANCH_KEY) || "main").trim() || "main",
        autoPublish: localStorage.getItem(GH_AUTO_KEY) === "1",
      };
    } catch {
      return {
        token: "",
        repo: "werdani/italy-listening-exam",
        branch: "main",
        autoPublish: false,
      };
    }
  }

  function saveGithubSettings({ token, repo, branch, autoPublish } = {}) {
    try {
      if (token != null) {
        const t = String(token).trim();
        if (t) localStorage.setItem(GH_TOKEN_KEY, t);
        else localStorage.removeItem(GH_TOKEN_KEY);
      }
      if (repo != null) {
        localStorage.setItem(GH_REPO_KEY, String(repo).trim() || "werdani/italy-listening-exam");
      }
      if (branch != null) {
        localStorage.setItem(GH_BRANCH_KEY, String(branch).trim() || "main");
      }
      if (autoPublish != null) {
        localStorage.setItem(GH_AUTO_KEY, autoPublish ? "1" : "0");
      }
    } catch {
      /* ignore */
    }
    return getGithubSettings();
  }

  function utf8ToBase64(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    bytes.forEach((b) => {
      binary += String.fromCharCode(b);
    });
    return btoa(binary);
  }

  /**
   * Publish questions.json to GitHub via Contents API.
   * Requires a Personal Access Token with Contents: Read and write.
   */
  async function publishToGitHub(data, options = {}) {
    const settings = getGithubSettings();
    const token = String(options.token || settings.token || "").trim();
    const repoFull = String(options.repo || settings.repo || "").trim();
    const branch = String(options.branch || settings.branch || "main").trim() || "main";
    const path = options.path || "data/questions.json";

    if (!token) {
      throw new Error("Manca il GitHub Token. Salvalo nella sezione Pubblicazione.");
    }
    const parts = repoFull.split("/").filter(Boolean);
    if (parts.length !== 2) {
      throw new Error("Repo non valido. Usa il formato owner/repo");
    }
    const [owner, repo] = parts;

    const payload = stripSecretsForExport(normalizeContent(data));
    const raw = JSON.stringify(payload, null, 2) + "\n";
    const content = utf8ToBase64(raw);

    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };

    const metaUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURI(
      path
    )}?ref=${encodeURIComponent(branch)}`;
    const metaRes = await fetch(metaUrl, { headers, cache: "no-store" });
    let sha;
    if (metaRes.ok) {
      const meta = await metaRes.json();
      sha = meta.sha;
    } else if (metaRes.status !== 404) {
      const err = await metaRes.json().catch(() => ({}));
      throw new Error(err.message || `GitHub GET failed (${metaRes.status})`);
    }

    const putRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURI(path)}`,
      {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message:
            options.message ||
            `Admin dashboard: update ${path} (${new Date().toISOString()})`,
          content,
          branch,
          ...(sha ? { sha } : {}),
        }),
      }
    );

    if (!putRes.ok) {
      const err = await putRes.json().catch(() => ({}));
      throw new Error(err.message || `GitHub PUT failed (${putRes.status})`);
    }

    const result = await putRes.json();
    return {
      ok: true,
      commit: result.commit && result.commit.sha,
      htmlUrl: result.content && result.content.html_url,
      repo: repoFull,
      branch,
      path,
    };
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
        durationMinutes: getLevelDurationMinutes(level, data.exam),
      },
      questions: level.questions || [],
    };
  }

  function createLevel(data, { name, description, durationMinutes } = {}) {
    const levels = data.levels || [];
    const id = nextId(levels);
    const level = {
      id,
      name: name || `Livello ${id}`,
      description: description || "",
      durationMinutes: clampDurationMinutes(
        durationMinutes,
        data.exam?.durationMinutes || DEFAULT_DURATION_MINUTES
      ),
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
    if (Object.prototype.hasOwnProperty.call(patch, "durationMinutes")) {
      if (patch.durationMinutes == null || patch.durationMinutes === "") {
        delete level.durationMinutes;
      } else {
        level.durationMinutes = clampDurationMinutes(
          patch.durationMinutes,
          data.exam?.durationMinutes || DEFAULT_DURATION_MINUTES
        );
      }
    }
    return level;
  }

  function deleteLevel(data, levelId) {
    const id = Number(levelId);
    const before = data.levels.length;
    data.levels = (data.levels || []).filter((l) => Number(l.id) !== id);
    return data.levels.length < before;
  }

  function normalizeQuestionType(raw, hasAudio) {
    const t = String(raw || "").toLowerCase().trim();
    if (t === "mcq" || t === "choice" || t === "text" || t === "scelta") return "mcq";
    if (t === "listening" || t === "audio" || t === "ascolto") return "listening";
    // Legacy questions (no type): keep as listening so existing exams stay unchanged
    void hasAudio;
    return "listening";
  }

  function isListeningQuestion(q) {
    if (!q) return true;
    return normalizeQuestionType(q.type, !!(q.audio && String(q.audio).trim())) === "listening";
  }

  function normalizeQuestion(q, qi = 0) {
    const audio = normalizeAudioUrl(q.audio || "");
    const type = normalizeQuestionType(q.type, !!audio);
    return {
      id: q.id != null ? Number(q.id) : qi + 1,
      type,
      prompt: q.prompt || "",
      audio: type === "listening" ? audio : "",
      choices: Array.isArray(q.choices) ? q.choices.slice(0, 4) : ["", "", "", ""],
      correct: typeof q.correct === "number" ? q.correct : 0,
    };
  }

  function createQuestion(data, levelId, question) {
    const level = getLevel(data, levelId);
    if (!level) return null;
    const id = nextId(level.questions);
    const q = normalizeQuestion({ ...question, id }, level.questions.length);
    while (q.choices.length < 4) q.choices.push("");
    level.questions.push(q);
    return q;
  }

  function updateQuestion(data, levelId, questionId, patch) {
    const level = getLevel(data, levelId);
    if (!level) return null;
    const q = level.questions.find((item) => Number(item.id) === Number(questionId));
    if (!q) return null;
    if (patch.type != null) q.type = normalizeQuestionType(patch.type, !!(patch.audio ?? q.audio));
    if (patch.prompt != null) q.prompt = String(patch.prompt);
    if (patch.audio != null) q.audio = normalizeAudioUrl(String(patch.audio));
    if (Array.isArray(patch.choices)) {
      q.choices = patch.choices.slice(0, 4);
      while (q.choices.length < 4) q.choices.push("");
    }
    if (typeof patch.correct === "number") q.correct = patch.correct;
    if (q.type === "mcq") q.audio = "";
    return q;
  }

  function deleteQuestion(data, levelId, questionId) {
    const level = getLevel(data, levelId);
    if (!level) return false;
    const qid = Number(questionId);
    const before = level.questions.length;
    level.questions = level.questions.filter((q) => Number(q.id) !== qid);
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

  function toGoogleDrivePreviewUrl(fileId) {
    // Embedded Drive player — works on GitHub Pages for public files
    return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/preview`;
  }

  function isGitHubPagesHost() {
    const host = (global.location && global.location.hostname) || "";
    return /\.github\.io$/i.test(host);
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
    // Never expect local API on GitHub Pages
    if (isGitHubPagesHost()) {
      driveProxyAvailable = false;
      return false;
    }
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

    if (driveProxyAvailable === true) {
      list.push(toDriveProxyUrl(fileId));
    }

    if (apiKey && isLikelyGoogleApiKey(apiKey)) {
      list.push(toGoogleDriveApiMediaUrl(fileId, apiKey));
    }

    // Direct links (often blocked in <audio> on GitHub Pages, but try anyway)
    list.push(toGoogleDriveDirectUrl(fileId));
    list.push(`https://docs.google.com/uc?export=open&id=${encodeURIComponent(fileId)}`);

    return [...new Set(list)];
  }

  /**
   * Fetch Drive file via API key into a blob: URL (best for GitHub Pages).
   */
  async function fetchDriveAudioBlobUrl(src, options = {}) {
    const fileId = extractGoogleDriveFileId(src);
    const apiKey = getGoogleApiKey(options);
    if (!fileId || !isLikelyGoogleApiKey(apiKey)) return null;

    const url = toGoogleDriveApiMediaUrl(fileId, apiKey);
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Drive API ${res.status}`);
    }
    const blob = await res.blob();
    if (!blob || blob.size < 100) {
      throw new Error("Drive file vuoto");
    }
    return URL.createObjectURL(blob);
  }

  function prefersDriveEmbed(src, options = {}) {
    const fileId = extractGoogleDriveFileId(src);
    if (!fileId) return false;
    if (!(isGoogleDriveUrl(src) || /\/api\/drive\//.test(src))) return false;
    // On GitHub Pages without a valid API key / proxy, use embed player
    const apiKey = getGoogleApiKey(options);
    if (driveProxyAvailable === true) return false;
    if (isLikelyGoogleApiKey(apiKey)) return false;
    return isGitHubPagesHost() || driveProxyAvailable === false;
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
    getGithubSettings,
    saveGithubSettings,
    publishToGitHub,
    getLevel,
    getLevelDurationMinutes,
    clampDurationMinutes,
    DEFAULT_DURATION_MINUTES,
    MIN_DURATION_MINUTES,
    MAX_DURATION_MINUTES,
    examPayloadForLevel,
    createLevel,
    updateLevel,
    deleteLevel,
    createQuestion,
    updateQuestion,
    deleteQuestion,
    isListeningQuestion,
    normalizeQuestionType,
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
    toGoogleDrivePreviewUrl,
    fetchDriveAudioBlobUrl,
    prefersDriveEmbed,
    isGitHubPagesHost,
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
