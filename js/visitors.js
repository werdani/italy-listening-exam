/**
 * Unique visitor tracking — one count per device (localStorage id).
 * Local: POST /api/visit → data/visitors.json
 * GitHub Pages: Abacus public counter (countapi-compatible), still once per device.
 */
(() => {
  "use strict";

  const DEVICE_KEY = "ascolto-device-id";
  const COUNTED_KEY = "ascolto-visit-counted";
  const STATS_CACHE_KEY = "ascolto-visitor-stats";
  const COUNTER_NS = "werdani-italy-listening";
  const COUNTER_NAME = "unique-devices";
  // countapi.xyz successor — no API key required (CounterAPI v1 was retired Aug 2026)
  const ABACUS_BASE = "https://abacus.jasoncameron.dev";
  const FETCH_TIMEOUT_MS = 3500;

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

  async function registerWithPublicCounter() {
    const url = `${ABACUS_BASE}/hit/${encodeURIComponent(COUNTER_NS)}/${encodeURIComponent(COUNTER_NAME)}`;
    const res = await fetchWithTimeout(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`public counter ${res.status}`);
    const data = await res.json();
    return { ok: true, count: parseCountPayload(data), source: "counterapi", isNew: true };
  }

  async function fetchLocalStats() {
    const res = await fetchWithTimeout("/api/visitors", { cache: "no-store" }, 2500);
    if (!res.ok) throw new Error(`visitors api ${res.status}`);
    return res.json();
  }

  async function fetchPublicCounterStats() {
    const url = `${ABACUS_BASE}/get/${encodeURIComponent(COUNTER_NS)}/${encodeURIComponent(COUNTER_NAME)}`;
    const res = await fetchWithTimeout(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`public counter get ${res.status}`);
    const data = await res.json();
    return {
      ok: true,
      count: parseCountPayload(data),
      source: "counterapi",
      updatedAt: null,
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

    try {
      const result = await registerWithLocalApi(deviceId);
      markCountedLocally();
      if (typeof result.count === "number") {
        writeCachedStats({ count: result.count, source: "api", updatedAt: null });
      }
      return { ...result, deviceId, counted: !!result.isNew };
    } catch {
      /* GitHub Pages or API unavailable — try public counter once */
    }

    try {
      const result = await registerWithPublicCounter();
      markCountedLocally();
      writeCachedStats({ count: result.count, source: "counterapi", updatedAt: null });
      return { ...result, deviceId, counted: true };
    } catch (err) {
      console.warn("[visitors] register failed", err);
      return { ok: false, deviceId, counted: false, error: String(err && err.message) };
    }
  }

  /**
   * Stats for admin dashboard.
   */
  async function getVisitorStats() {
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

    try {
      const remote = await fetchPublicCounterStats();
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
