/**
 * Course students — access rules per course.
 * Schema: content.courseUsers.users[]
 * Each user: { id, username, name, passHash, courseIds[], accessAll? }
 *
 * Built-in static user (always sees every course):
 *   username: tutti
 *   password: CorsiAll@@
 */
(function (global) {
  "use strict";

  const SESSION_KEY = "ascoltoit-course-user-session";
  const STATIC_USER_ID = 0;
  const STATIC_USERNAME = "tutti";
  const STATIC_PASSWORD = "CorsiAll@@";
  const STATIC_NAME = "Accesso completo";

  function nextId(items) {
    if (!items || !items.length) return 1;
    return Math.max(...items.map((item) => Number(item.id) || 0)) + 1;
  }

  async function sha256(text) {
    const data = new TextEncoder().encode(String(text || ""));
    const hash = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function normalizeUsername(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "");
  }

  function normalizeCourseIds(ids) {
    if (!Array.isArray(ids)) return [];
    const out = [];
    const seen = new Set();
    ids.forEach((id) => {
      const n = Number(id);
      if (!Number.isFinite(n) || n <= 0 || seen.has(n)) return;
      seen.add(n);
      out.push(n);
    });
    out.sort((a, b) => a - b);
    return out;
  }

  function normalizeUser(user, index) {
    return {
      id: user.id != null ? Number(user.id) : index + 1,
      username: normalizeUsername(user.username || user.user || `user${index + 1}`),
      name: String(user.name || user.displayName || "").trim(),
      passHash: String(user.passHash || "").trim(),
      courseIds: normalizeCourseIds(user.courseIds || user.courses || []),
      accessAll: Boolean(user.accessAll),
      isStatic: false,
    };
  }

  function getStaticUser() {
    return {
      id: STATIC_USER_ID,
      username: STATIC_USERNAME,
      name: STATIC_NAME,
      passHash: "",
      courseIds: [],
      accessAll: true,
      isStatic: true,
    };
  }

  function isStaticUsername(username) {
    return normalizeUsername(username) === STATIC_USERNAME;
  }

  function normalizeCourseUsers(data) {
    const block = data.courseUsers || {};
    const users = Array.isArray(block.users)
      ? block.users
          .map((user, index) => normalizeUser(user, index))
          .filter((user) => !isStaticUsername(user.username) && Number(user.id) !== STATIC_USER_ID)
      : [];
    users.sort((a, b) => a.id - b.id);
    data.courseUsers = { users };
    return data;
  }

  function ensureCourseUsers(data) {
    if (!data.courseUsers) normalizeCourseUsers(data);
    if (!Array.isArray(data.courseUsers.users)) data.courseUsers.users = [];
    return data.courseUsers;
  }

  function listUsers(data) {
    return ensureCourseUsers(data).users;
  }

  function getUser(data, userId) {
    if (Number(userId) === STATIC_USER_ID) return getStaticUser();
    return listUsers(data).find((u) => Number(u.id) === Number(userId)) || null;
  }

  function findByUsername(data, username) {
    const key = normalizeUsername(username);
    if (!key) return null;
    if (key === STATIC_USERNAME) return getStaticUser();
    return listUsers(data).find((u) => u.username === key) || null;
  }

  async function createUser(data, { username, name, password, courseIds, accessAll } = {}) {
    const users = ensureCourseUsers(data).users;
    const userKey = normalizeUsername(username);
    if (!userKey) throw new Error("Inserisci un username.");
    if (isStaticUsername(userKey)) {
      throw new Error(`Lo username «${STATIC_USERNAME}» è riservato all’utente statico.`);
    }
    if (listUsers(data).some((u) => u.username === userKey)) {
      throw new Error("Questo username esiste già.");
    }
    if (!password || String(password).trim().length < 4) {
      throw new Error("La password deve avere almeno 4 caratteri.");
    }
    const id = nextId(users);
    const user = normalizeUser(
      {
        id,
        username: userKey,
        name: name || "",
        passHash: await sha256(String(password).trim()),
        courseIds: accessAll ? [] : courseIds || [],
        accessAll: Boolean(accessAll),
      },
      users.length
    );
    users.push(user);
    users.sort((a, b) => a.id - b.id);
    return user;
  }

  async function updateUser(data, userId, patch = {}) {
    if (Number(userId) === STATIC_USER_ID) {
      throw new Error("L’utente statico non si può modificare.");
    }
    const user = listUsers(data).find((u) => Number(u.id) === Number(userId));
    if (!user) return null;

    if (patch.username != null) {
      const userKey = normalizeUsername(patch.username);
      if (!userKey) throw new Error("Inserisci un username.");
      if (isStaticUsername(userKey)) {
        throw new Error(`Lo username «${STATIC_USERNAME}» è riservato.`);
      }
      const other = listUsers(data).find((u) => u.username === userKey);
      if (other && Number(other.id) !== Number(user.id)) {
        throw new Error("Questo username esiste già.");
      }
      user.username = userKey;
    }
    if (patch.name != null) user.name = String(patch.name).trim();
    if (patch.accessAll != null) user.accessAll = Boolean(patch.accessAll);
    if (patch.courseIds != null) {
      user.courseIds = user.accessAll ? [] : normalizeCourseIds(patch.courseIds);
    }
    if (patch.password != null && String(patch.password).trim().length) {
      if (String(patch.password).trim().length < 4) {
        throw new Error("La password deve avere almeno 4 caratteri.");
      }
      user.passHash = await sha256(String(patch.password).trim());
    }
    return user;
  }

  function deleteUser(data, userId) {
    if (Number(userId) === STATIC_USER_ID) return false;
    const block = ensureCourseUsers(data);
    const uid = Number(userId);
    const before = block.users.length;
    block.users = block.users.filter((u) => Number(u.id) !== uid);
    return block.users.length < before;
  }

  function pruneCourseAccess(data, courseId) {
    const cid = Number(courseId);
    listUsers(data).forEach((user) => {
      user.courseIds = user.courseIds.filter((id) => Number(id) !== cid);
    });
  }

  function setCourseMembers(data, courseId, userIds) {
    const cid = Number(courseId);
    const allowed = new Set(
      (userIds || [])
        .map((id) => Number(id))
        .filter((n) => Number.isFinite(n) && n > 0)
    );
    listUsers(data).forEach((user) => {
      if (user.accessAll) return;
      const next = new Set(
        (user.courseIds || []).map(Number).filter((n) => Number.isFinite(n) && n > 0)
      );
      if (allowed.has(Number(user.id))) next.add(cid);
      else next.delete(cid);
      user.courseIds = normalizeCourseIds([...next]);
    });
    return listUsers(data);
  }

  function getUsersForCourse(data, courseId) {
    const cid = Number(courseId);
    return listUsers(data).filter((user) => canAccessCourse(user, cid));
  }

  function canAccessCourse(user, courseId) {
    if (!user) return false;
    if (user.accessAll || user.isStatic) return true;
    return (user.courseIds || []).some((id) => Number(id) === Number(courseId));
  }

  function getAccessibleCourses(data, user) {
    const courses = (data?.courses?.items || []).slice();
    if (!user) return [];
    if (user.accessAll || user.isStatic) return courses;
    return courses.filter((course) => canAccessCourse(user, course.id));
  }

  function getSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw);
      if (!session || session.userId == null || !session.username) return null;
      return session;
    } catch {
      return null;
    }
  }

  function isLoggedIn() {
    return !!getSession();
  }

  function logout() {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
  }

  function setSession(user) {
    const payload = {
      userId: Number(user.id),
      username: user.username,
      name: user.name || "",
      courseIds: normalizeCourseIds(user.courseIds),
      accessAll: Boolean(user.accessAll || user.isStatic),
      isStatic: Boolean(user.isStatic),
      at: Date.now(),
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload));
    return payload;
  }

  function syncSessionFromContent(data) {
    const session = getSession();
    if (!session) return null;
    if (session.isStatic || Number(session.userId) === STATIC_USER_ID || isStaticUsername(session.username)) {
      return setSession(getStaticUser());
    }
    const user = listUsers(data).find((u) => Number(u.id) === Number(session.userId));
    if (!user) {
      logout();
      return null;
    }
    return setSession(user);
  }

  async function login(data, username, password) {
    const userKey = normalizeUsername(username);
    const pass = String(password || "").trim();
    if (!userKey || !pass) {
      return { ok: false, error: "Inserisci username e password." };
    }

    if (userKey === STATIC_USERNAME) {
      if (pass !== STATIC_PASSWORD) {
        return { ok: false, error: "Username o password non corretti." };
      }
      const user = getStaticUser();
      const session = setSession(user);
      return { ok: true, user, session };
    }

    const users = listUsers(data);
    let user = users.find((u) => u.username === userKey);
    if (!user) {
      // Allow login with display name (common mistake)
      const nameKey = String(username || "").trim().toLowerCase();
      const byName = users.filter((u) => String(u.name || "").trim().toLowerCase() === nameKey);
      if (byName.length === 1) user = byName[0];
    }

    if (!user) {
      return {
        ok: false,
        error: "Username non trovato. Usa lo username creato in admin (es. corsoa1), non il nome.",
      };
    }
    if (!user.passHash) {
      return {
        ok: false,
        error: "Password non impostata. In admin apri l’utente e salva una nuova password.",
      };
    }

    const passHash = await sha256(pass);
    if (passHash !== user.passHash) {
      return { ok: false, error: "Password non corretta." };
    }
    const session = setSession(user);
    return { ok: true, user, session };
  }

  function getCurrentUser(data) {
    const session = syncSessionFromContent(data);
    if (!session) return null;
    if (session.isStatic || Number(session.userId) === STATIC_USER_ID) {
      return getStaticUser();
    }
    return listUsers(data).find((u) => Number(u.id) === Number(session.userId)) || null;
  }

  if (global.AscoltoContent && typeof global.AscoltoContent.normalizeContent === "function") {
    const original = global.AscoltoContent.normalizeContent;
    global.AscoltoContent.normalizeContent = function (raw) {
      return normalizeCourseUsers(original(raw));
    };
  }

  if (global.AscoltoCourses && typeof global.AscoltoCourses.deleteCourse === "function") {
    const originalDelete = global.AscoltoCourses.deleteCourse;
    global.AscoltoCourses.deleteCourse = function (data, courseId) {
      const ok = originalDelete(data, courseId);
      if (ok) pruneCourseAccess(data, courseId);
      return ok;
    };
  }

  global.AscoltoCourseUsers = {
    SESSION_KEY,
    STATIC_USERNAME,
    STATIC_PASSWORD,
    STATIC_NAME,
    STATIC_USER_ID,
    getStaticUser,
    normalizeCourseUsers,
    ensureCourseUsers,
    listUsers,
    getUser,
    findByUsername,
    createUser,
    updateUser,
    deleteUser,
    pruneCourseAccess,
    setCourseMembers,
    getUsersForCourse,
    canAccessCourse,
    getAccessibleCourses,
    sha256,
    normalizeUsername,
    login,
    logout,
    isLoggedIn,
    getSession,
    getCurrentUser,
    syncSessionFromContent,
  };
})(window);
