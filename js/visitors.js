/**
 * Unique visitor tracking — one count per device (localStorage id).
 * Local: POST /api/visit → data/visitors.json
 * Online: Firebase Firestore (siteStats/visitors + visitorDevices/{deviceId})
 */
(() => {
  "use strict";

  const DEVICE_KEY = "ascolto-device-id";
  const COUNTED_KEY = "ascolto-visit-counted";
  const STATS_CACHE_KEY = "ascolto-visitor-stats";
  const DEVICES_COLLECTION = "visitorDevices";
  const STATS_COLLECTION = "siteStats";
  const STATS_DOC = "visitors";
  // One-time seed if Firestore stats doc is missing.
  // data/visitors.json is local test only — production baseline was the public counter (~162).
  const COUNTER_NS = "werdani-italy-listening";
  const COUNTER_NAME = "unique-devices";
  const ABACUS_BASE = "https://abacus.jasoncameron.dev";
  const LEGACY_UNIQUE_FLOOR = 162;
  const FETCH_TIMEOUT_MS = 3500;

  const global = window;

  function isGitHubPagesHost() {
    if (global.AscoltoContent?.isGitHubPagesHost) {
      return global.AscoltoContent.isGitHubPagesHost();
    }
    const host = (global.location && global.location.hostname) || "";
    return /\.github\.io$/i.test(host);
  }

  function uuid() {
    if (crypto && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function getDeviceId() {
    try {
      let id = localStorage.getItem(DEVICE_KEY);
      if (!id || id.length < 8) {
        id = uuid();
        localStorage.setItem(DEVICE_KEY, id);
      }
      return id;
    } catch {
      return uuid();
    }
  }

  function alreadyCountedLocally() {
    try {
      return localStorage.getItem(COUNTED_KEY) === "1";
    } catch {
      return false;
    }
  }

  function markCountedLocally() {
    try {
      localStorage.setItem(COUNTED_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  function readCachedStats() {
    try {
      const raw = sessionStorage.getItem(STATS_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.count !== "number") return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function writeCachedStats(stats) {
    try {
      sessionStorage.setItem(
        STATS_CACHE_KEY,
        JSON.stringify({
          count: Number(stats.count) || 0,
          source: stats.source || "none",
          updatedAt: stats.updatedAt || null,
          cachedAt: Date.now(),
        })
      );
    } catch {
      /* ignore */
    }
  }

  function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    return fetch(url, {
      ...options,
      signal: controller ? controller.signal : options.signal,
    }).finally(() => {
      if (timer) clearTimeout(timer);
    });
  }

  function parseCountPayload(data) {
    const raw =
      typeof data?.count === "number"
        ? data.count
        : typeof data?.value === "number"
          ? data.value
          : Number(data?.count ?? data?.value ?? 0);
    return Number.isFinite(raw) ? raw : 0;
  }

  async function registerWithLocalApi(deviceId) {
    const res = await fetchWithTimeout("/api/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId }),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`visit api ${res.status}`);
    return res.json();
  }

  async function fetchLocalStats() {
    const res = await fetchWithTimeout("/api/visitors", { cache: "no-store" }, 2500);
    if (!res.ok) throw new Error(`visitors api ${res.status}`);
    return res.json();
  }

  async function fetchLegacyCounterSeed() {
    const url = `${ABACUS_BASE}/get/${encodeURIComponent(COUNTER_NS)}/${encodeURIComponent(COUNTER_NAME)}`;
    const res = await fetchWithTimeout(url, { cache: "no-store" }, 2500);
    if (!res.ok) throw new Error(`legacy counter ${res.status}`);
    const data = await res.json();
    return parseCountPayload(data);
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

  async function seedStatsIfMissing(db, statsRef) {
    const snap = await statsRef.get();
    if (snap.exists) {
      const data = snap.data() || {};
      return {
        count: Number(data.count) || 0,
        updatedAt: data.updatedAt || null,
        existed: true,
      };
    }

    // Never seed from local visitors.json (test devices). Prefer live legacy
    // counter, and never go below the last known production total.
    let remote = 0;
    try {
      remote = await fetchLegacyCounterSeed();
    } catch {
      remote = 0;
    }
    const seed = Math.max(LEGACY_UNIQUE_FLOOR, remote || 0);

    const payload = {
      count: seed,
      updatedAt: new Date().toISOString(),
      seededFrom: remote > 0 ? "counterapi" : "legacy-floor",
      legacyFloor: LEGACY_UNIQUE_FLOOR,
    };
    await statsRef.set(payload);
    return { count: seed, updatedAt: payload.updatedAt, existed: false };
  }

  async function registerWithFirestore(deviceId) {
    const db = await ensureFirestore();
    const deviceRef = db.collection(DEVICES_COLLECTION).doc(deviceId);
    const statsRef = db.collection(STATS_COLLECTION).doc(STATS_DOC);

    await seedStatsIfMissing(db, statsRef);

    const result = await db.runTransaction(async (tx) => {
      const deviceSnap = await tx.get(deviceRef);
      const statsSnap = await tx.get(statsRef);
      const current = statsSnap.exists ? Number(statsSnap.data().count) || 0 : 0;
      const updatedAt = new Date().toISOString();

      if (deviceSnap.exists) {
        return { ok: true, isNew: false, count: current, updatedAt: statsSnap.data()?.updatedAt || null };
      }

      tx.set(deviceRef, {
        deviceId,
        createdAt: updatedAt,
        serverCreatedAt: global.firebase.firestore.FieldValue.serverTimestamp(),
      });
      const next = current + 1;
      tx.set(
        statsRef,
        {
          count: next,
          updatedAt,
        },
        { merge: true }
      );
      return { ok: true, isNew: true, count: next, updatedAt };
    });

    return { ...result, source: "firestore" };
  }

  async function fetchFirestoreStats() {
    const db = await ensureFirestore();
    const statsRef = db.collection(STATS_COLLECTION).doc(STATS_DOC);
    const seeded = await seedStatsIfMissing(db, statsRef);
    return {
      ok: true,
      count: seeded.count,
      source: "firestore",
      updatedAt: seeded.updatedAt,
    };
  }

  /**
   * Register this device once. Safe to call on every page load.
   */
  async function registerVisit() {
    const deviceId = getDeviceId();
    if (alreadyCountedLocally()) {
      return { ok: true, counted: false, deviceId, reason: "already-local" };
    }

    if (!isGitHubPagesHost()) {
      try {
        const result = await registerWithLocalApi(deviceId);
        markCountedLocally();
        if (typeof result.count === "number") {
          writeCachedStats({ count: result.count, source: "api", updatedAt: null });
        }
        return { ...result, deviceId, counted: !!result.isNew };
      } catch {
        /* fall through to Firestore */
      }
    }

    try {
      const result = await registerWithFirestore(deviceId);
      markCountedLocally();
      writeCachedStats({
        count: result.count,
        source: "firestore",
        updatedAt: result.updatedAt || null,
      });
      return { ...result, deviceId, counted: !!result.isNew };
    } catch (err) {
      console.warn("[visitors] register failed", err);
      return { ok: false, deviceId, counted: false, error: String(err && err.message) };
    }
  }

  /**
   * Stats for admin dashboard.
   */
  async function getVisitorStats() {
    if (!isGitHubPagesHost()) {
      try {
        const local = await fetchLocalStats();
        const stats = {
          count: Number(local.count) || 0,
          source: "api",
          updatedAt: local.updatedAt || null,
        };
        writeCachedStats(stats);
        return stats;
      } catch {
        /* fall through */
      }
    }

    try {
      const remote = await fetchFirestoreStats();
      writeCachedStats(remote);
      return remote;
    } catch (err) {
      const cached = readCachedStats();
      if (cached) {
        return {
          count: cached.count,
          source: cached.source || "cache",
          updatedAt: cached.updatedAt || null,
          fromCache: true,
        };
      }
      return {
        count: 0,
        source: "none",
        updatedAt: null,
        error: String(err && err.message),
      };
    }
  }

  globalThis.AscoltoVisitors = {
    getDeviceId,
    registerVisit,
    getVisitorStats,
    getCachedVisitorStats: readCachedStats,
  };
})();
