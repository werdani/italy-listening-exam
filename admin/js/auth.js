/**
 * Simple client-side admin authentication (sessionStorage).
 * Default credentials: Reham / Ammar45@@
 * Password can be changed and is stored (hashed) in localStorage.
 */
(function (global) {
  "use strict";

  const SESSION_KEY = "ascoltoit-admin-session";
  const CREDS_KEY = "ascoltoit-admin-creds";
  const DEFAULT_USER = "reham";
  const DEFAULT_PASS = "Ammar45@@";

  async function sha256(text) {
    const data = new TextEncoder().encode(text);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  async function getStoredCreds() {
    try {
      const raw = localStorage.getItem(CREDS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.username && parsed.passHash) return parsed;
      }
    } catch {
      /* ignore */
    }
    return {
      username: DEFAULT_USER,
      passHash: await sha256(DEFAULT_PASS),
      isDefault: true,
    };
  }

  async function saveCreds(username, password) {
    const passHash = await sha256(password);
    const payload = { username: String(username).trim().toLowerCase(), passHash };
    localStorage.setItem(CREDS_KEY, JSON.stringify(payload));
    return payload;
  }

  function isLoggedIn() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return false;
      const session = JSON.parse(raw);
      return Boolean(session && session.username && session.at);
    } catch {
      return false;
    }
  }

  function getSession() {
    try {
      return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
    } catch {
      return null;
    }
  }

  async function login(username, password) {
    const creds = await getStoredCreds();
    const user = String(username || "").trim().toLowerCase();
    const passHash = await sha256(String(password || ""));
    const localPart = user.includes("@") ? user.split("@")[0] : user;
    const userOk = localPart === creds.username;
    if (!userOk || passHash !== creds.passHash) {
      return { ok: false, error: "Username o password non corretti." };
    }
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ username: creds.username, at: Date.now() })
    );
    return { ok: true, username: creds.username };
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  function requireAuth() {
    return isLoggedIn();
  }

  global.AdminAuth = {
    DEFAULT_USER,
    DEFAULT_PASS,
    login,
    logout,
    isLoggedIn,
    getSession,
    requireAuth,
    saveCreds,
    getStoredCreds,
  };
})(window);
