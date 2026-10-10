/**
 * Exam submissions — student name/phone + score.
 * Local API when available; Firebase Firestore on GitHub Pages / when API is down.
 */
(() => {
  "use strict";

  const COLLECTION = "examSubmissions";
  const global = window;

  function isGitHubPagesHost() {
    if (global.AscoltoContent?.isGitHubPagesHost) {
      return global.AscoltoContent.isGitHubPagesHost();
    }
    const host = (global.location && global.location.hostname) || "";
    return /\.github\.io$/i.test(host);
  }

  function normalizePhone(value) {
    return String(value || "").replace(/[^\d+]/g, "").trim();
  }

  function normalizeName(value) {
    return String(value || "").trim().replace(/\s+/g, " ");
  }

  function validateStudent({ name, phone } = {}) {
    const cleanName = normalizeName(name);
    const cleanPhone = normalizePhone(phone);
    if (cleanName.length < 2) {
      return { ok: false, error: "Inserisci il nome completo." };
    }
    if (cleanName.length > 80) {
      return { ok: false, error: "Il nome è troppo lungo." };
    }
    const digits = cleanPhone.replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) {
      return { ok: false, error: "Inserisci un numero di telefono valido." };
    }
    return { ok: true, name: cleanName, phone: cleanPhone };
  }

  function buildPayload(input = {}) {
    const checked = validateStudent(input);
    if (!checked.ok) throw new Error(checked.error);

    const level = input.level || null;
    return {
      name: checked.name,
      phone: checked.phone,
      levelId: input.levelId != null ? Number(input.levelId) : null,
      levelName: String(level?.name || input.levelName || "").trim(),
      examTitle: String(input.examTitle || "").trim(),
      score: Number(input.score) || 0,
      maxScore: Number(input.maxScore) || 0,
      percentage: Number(input.percentage) || 0,
      passed: Boolean(input.passed),
      correct: Number(input.correct) || 0,
      wrong: Number(input.wrong) || 0,
      elapsedSeconds: Number(input.elapsedSeconds) || 0,
      autoSubmitted: Boolean(input.autoSubmitted),
      startedAt: input.startedAt
        ? new Date(input.startedAt).toISOString()
        : null,
      endedAt: input.endedAt
        ? new Date(input.endedAt).toISOString()
        : new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
  }

  async function saveViaLocalApi(payload) {
    const res = await fetch("/api/exam-submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || `API ${res.status}`);
    }
    return res.json();
  }

  async function listViaLocalApi() {
    const res = await fetch("/api/exam-submissions", { cache: "no-store" });
    if (!res.ok) throw new Error(`API ${res.status}`);
    const data = await res.json();
    return Array.isArray(data.items) ? data.items : [];
  }

  async function ensureFirestore() {
    const settings = global.AscoltoContent?.getFirebaseSettings?.();
    if (!settings?.apiKey || !settings?.projectId || !settings?.bucket) {
      throw new Error(
        "Firebase non configurato. Salva Firebase nell'admin e pubblica online."
      );
    }

    await global.AscoltoContent.loadScriptOnce?.(
      "https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js"
    );
    await global.AscoltoContent.loadScriptOnce?.(
      "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-compat.js"
    );

    // Reuse app init from content.js when possible
    if (global.AscoltoContent.ensureFirebaseApp) {
      await global.AscoltoContent.ensureFirebaseApp();
    } else if (!global.firebase?.apps?.length) {
      global.firebase.initializeApp({
        apiKey: settings.apiKey,
        authDomain: `${settings.projectId}.firebaseapp.com`,
        projectId: settings.projectId,
        storageBucket: settings.bucket,
      });
    }

    if (!global.firebase?.firestore) {
      throw new Error("Firestore non disponibile.");
    }
    return global.firebase.firestore();
  }

  async function saveViaFirestore(payload) {
    const db = await ensureFirestore();
    const ref = await db.collection(COLLECTION).add({
      ...payload,
      createdAt: payload.createdAt,
      serverCreatedAt: global.firebase.firestore.FieldValue.serverTimestamp(),
    });
    return { ok: true, id: ref.id, source: "firestore" };
  }

  async function listViaFirestore() {
    const db = await ensureFirestore();
    const snap = await db.collection(COLLECTION).orderBy("createdAt", "desc").limit(200).get();
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }

  async function saveSubmission(input) {
    const payload = buildPayload(input);

    // GitHub Pages has no local API — go straight to Firestore
    if (isGitHubPagesHost()) {
      const remote = await saveViaFirestore(payload);
      return { ...remote, payload };
    }

    try {
      const local = await saveViaLocalApi(payload);
      return { ...local, source: local.source || "api", payload };
    } catch (localErr) {
      try {
        const remote = await saveViaFirestore(payload);
        return { ...remote, payload };
      } catch (remoteErr) {
        const message =
          (remoteErr && remoteErr.message) ||
          (localErr && localErr.message) ||
          "Salvataggio risultato fallito.";
        throw new Error(message);
      }
    }
  }

  async function listSubmissions() {
    if (isGitHubPagesHost()) {
      return listViaFirestore();
    }
    try {
      return await listViaLocalApi();
    } catch (_) {
      return listViaFirestore();
    }
  }

  global.AscoltoExamSubmissions = {
    validateStudent,
    normalizeName,
    normalizePhone,
    saveSubmission,
    listSubmissions,
  };
})();
