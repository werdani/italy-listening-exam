/**
 * Unique visitor tracking — one count per device (localStorage id).
 * Local: POST /api/visit → data/visitors.json
 * GitHub Pages: CounterAPI (shared public counter), still once per device.
 */
(() => {
  "use strict";

  const DEVICE_KEY = "ascolto-device-id";
  const COUNTED_KEY = "ascolto-visit-counted";
  const COUNTER_NS = "werdani-italy-listening";
  const COUNTER_NAME = "unique-devices";

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

  async function registerWithLocalApi(deviceId) {
    const res = await fetch("/api/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId }),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`visit api ${res.status}`);
    return res.json();
  }

  async function registerWithCounterApi() {
    const url = `https://api.counterapi.dev/v1/${COUNTER_NS}/${COUNTER_NAME}/up`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`counter api ${res.status}`);
    const data = await res.json();
    const count =
      typeof data?.count === "number"
        ? data.count
        : typeof data?.value === "number"
          ? data.value
          : Number(data?.count || data?.value || 0);
    return { ok: true, count, source: "counterapi", isNew: true };
  }

  async function fetchLocalStats() {
    const res = await fetch("/api/visitors", { cache: "no-store" });
    if (!res.ok) throw new Error(`visitors api ${res.status}`);
    return res.json();
  }

  async function fetchCounterStats() {
    const url = `https://api.counterapi.dev/v1/${COUNTER_NS}/${COUNTER_NAME}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`counter get ${res.status}`);
    const data = await res.json();
    const count =
      typeof data?.count === "number"
        ? data.count
        : typeof data?.value === "number"
          ? data.value
          : Number(data?.count || data?.value || 0);
    return {
      ok: true,
      count: Number.isFinite(count) ? count : 0,
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
      return { ...result, deviceId, counted: !!result.isNew };
    } catch {
      /* GitHub Pages or API unavailable — try public counter once */
    }

    try {
      const result = await registerWithCounterApi();
      markCountedLocally();
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
      return {
        count: Number(local.count) || 0,
        source: "api",
        updatedAt: local.updatedAt || null,
      };
    } catch {
      /* fall through */
    }

    try {
      return await fetchCounterStats();
    } catch (err) {
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
  };
})();
