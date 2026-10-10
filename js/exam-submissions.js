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

  function normalizeName(value) {
    return String(value || "").trim().replace(/\s+/g, " ");
  }

  function normalizePhone(value) {
    let digits = String(value || "").replace(/\D/g, "");
    if (digits.startsWith("0020")) digits = "0" + digits.slice(4);
    else if (digits.startsWith("20") && digits.length >= 12) digits = "0" + digits.slice(2);
    return digits;
  }

  function normalizeNationalId(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function isValidNationalId(value) {
    if (!/^[23]\d{13}$/.test(value)) return false;
    const year = (value[0] === "2" ? 1900 : 2000) + Number(value.slice(1, 3));
    const month = Number(value.slice(3, 5));
    const day = Number(value.slice(5, 7));
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  }

  function validateStudent({ name, phone, nationalId } = {}) {
    const cleanName = normalizeName(name);
    const cleanPhone = normalizePhone(phone);
    const cleanId = normalizeNationalId(nationalId);
    if (cleanName.length < 2) {
      return { ok: false, error: "Inserisci il nome completo." };
    }
    if (cleanName.length > 80) {
      return { ok: false, error: "Il nome è troppo lungo." };
    }
    if (!/^01[0125]\d{8}$/.test(cleanPhone)) {
      return { ok: false, error: "Il telefono deve essere un numero egiziano di 11 cifre (01…)." };
    }
    if (!isValidNationalId(cleanId)) {
      return { ok: false, error: "Il numero di identità deve essere di 14 cifre e contenere una data di nascita valida." };
    }
    return { ok: true, name: cleanName, phone: cleanPhone, nationalId: cleanId };
  }

  function buildPayload(input = {}) {
    const checked = validateStudent(input);
    if (!checked.ok) throw new Error(checked.error);

    const level = input.level || null;
    return {
      name: checked.name,
      phone: checked.phone,
      nationalId: checked.nationalId,
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

  function matchesPriorAttempt(item, { phone, nationalId, levelId }) {
    if (!item) return false;
    return (
      normalizeNationalId(item.nationalId) === nationalId &&
      normalizePhone(item.phone) === phone &&
      Number(item.levelId) === Number(levelId)
    );
  }

  async function findPriorViaFirestore(phone, nationalId, levelId) {
    const db = await ensureFirestore();
    const snap = await db
      .collection(COLLECTION)
      .where("nationalId", "==", nationalId)
      .limit(40)
      .get();
    const match = snap.docs.find((doc) => {
      const data = doc.data() || {};
      return matchesPriorAttempt(data, { phone, nationalId, levelId });
    });
    return match ? { id: match.id, ...match.data() } : null;
  }

  async function findPriorAttempt({ phone, nationalId, levelId } = {}) {
    const cleanPhone = normalizePhone(phone);
    const cleanId = normalizeNationalId(nationalId);
    const level = Number(levelId);
    if (!cleanPhone || cleanId.length !== 14 || !Number.isFinite(level)) return null;

    if (isGitHubPagesHost()) {
      return findPriorViaFirestore(cleanPhone, cleanId, level);
    }
    try {
      const items = await listViaLocalApi();
      return (
        items.find((item) =>
          matchesPriorAttempt(item, { phone: cleanPhone, nationalId: cleanId, levelId: level })
        ) || null
      );
    } catch (_) {
      return findPriorViaFirestore(cleanPhone, cleanId, level);
    }
  }

  global.AscoltoExamSubmissions = {
    validateStudent,
    normalizeName,
    normalizePhone,
    normalizeNationalId,
    saveSubmission,
    listSubmissions,
    findPriorAttempt,
  };
})();
