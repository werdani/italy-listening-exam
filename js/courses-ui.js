/**
 * Public UI — Corsi video with student login + per-course access
 */
(function (global) {
  "use strict";

  /** @type {object|null} */
  let content = null;
  /** @type {number|null} */
  let activeCourseId = null;
  /** @type {number|null} */
  let activeVideoId = null;

  const $ = (sel, root = document) => root.querySelector(sel);

  const els = {
    btnCourses: $("#btnCourses"),
    screenCourseLogin: $("#screenCourseLogin"),
    screenCourses: $("#screenCourses"),
    screenCourse: $("#screenCourse"),
    courseLoginForm: $("#courseLoginForm"),
    courseLoginUser: $("#courseLoginUser"),
    courseLoginPass: $("#courseLoginPass"),
    courseLoginError: $("#courseLoginError"),
    btnBackFromCourseLogin: $("#btnBackFromCourseLogin"),
    coursesTitle: $("#coursesTitle"),
    coursesDescription: $("#coursesDescription"),
    coursesGrid: $("#coursesGrid"),
    coursesEmpty: $("#coursesEmpty"),
    coursesUserBar: $("#coursesUserBar"),
    coursesUserLabel: $("#coursesUserLabel"),
    btnCourseLogout: $("#btnCourseLogout"),
    btnBackFromCourses: $("#btnBackFromCourses"),
    courseTitle: $("#courseTitle"),
    courseDescription: $("#courseDescription"),
    btnBackFromCourse: $("#btnBackFromCourse"),
    coursePlayerWrap: $("#coursePlayerWrap"),
    coursePlayerFrame: $("#coursePlayerFrame"),
    coursePlayerEmpty: $("#coursePlayerEmpty"),
    playlistList: $("#playlistList"),
    playlistEmpty: $("#playlistEmpty"),
  };

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function hideOtherFeatureScreens() {
    ["screenLibrary", "screenLibraryLevel"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.hidden = true;
        el.classList.remove("screen-active");
      }
    });
  }

  function showScreen(name) {
    hideOtherFeatureScreens();
    const screens = {
      loading: $("#screenLoading"),
      home: $("#screenHome"),
      courseLogin: els.screenCourseLogin,
      courses: els.screenCourses,
      course: els.screenCourse,
      exam: $("#screenExam"),
      results: $("#screenResults"),
    };
    Object.entries(screens).forEach(([key, el]) => {
      if (!el) return;
      const active = key === name;
      el.hidden = !active;
      el.classList.toggle("screen-active", active);
    });
    const timerChip = $("#timerChip");
    if (timerChip) timerChip.hidden = name !== "exam";
  }

  function clearPlayer() {
    if (els.coursePlayerFrame) {
      els.coursePlayerFrame.removeAttribute("src");
      els.coursePlayerFrame.hidden = true;
    }
    if (els.coursePlayerEmpty) els.coursePlayerEmpty.hidden = false;
  }

  function currentUser() {
    if (!global.AscoltoCourseUsers || !content) return null;
    return global.AscoltoCourseUsers.getCurrentUser(content);
  }

  function updateUserBar(user) {
    if (!els.coursesUserBar) return;
    if (!user) {
      els.coursesUserBar.hidden = true;
      return;
    }
    els.coursesUserBar.hidden = false;
    if (els.coursesUserLabel) {
      const label = user.name ? `${user.name} (@${user.username})` : `@${user.username}`;
      els.coursesUserLabel.textContent = label;
    }
  }

  function playVideo(video) {
    activeVideoId = video ? Number(video.id) : null;
    const embed = video ? global.AscoltoCourses.getEmbedUrl(video.url) : "";

    if (els.coursePlayerFrame) {
      if (embed) {
        els.coursePlayerFrame.src = embed;
        els.coursePlayerFrame.hidden = false;
        if (els.coursePlayerEmpty) els.coursePlayerEmpty.hidden = true;
      } else {
        els.coursePlayerFrame.removeAttribute("src");
        els.coursePlayerFrame.hidden = true;
        if (els.coursePlayerEmpty) {
          els.coursePlayerEmpty.hidden = false;
          els.coursePlayerEmpty.textContent = video
            ? "Anteprima non disponibile per questo link."
            : "Seleziona un video dalla playlist.";
        }
      }
    }

    if (els.playlistList) {
      els.playlistList.querySelectorAll(".playlist-item").forEach((btn) => {
        const id = Number(btn.getAttribute("data-video-id"));
        btn.classList.toggle("is-active", id === activeVideoId);
      });
    }
  }

  function renderLogin(errorMessage) {
    activeCourseId = null;
    activeVideoId = null;
    clearPlayer();
    if (els.courseLoginError) {
      if (errorMessage) {
        els.courseLoginError.hidden = false;
        els.courseLoginError.textContent = errorMessage;
      } else {
        els.courseLoginError.hidden = true;
        els.courseLoginError.textContent = "";
      }
    }
    if (els.courseLoginForm) els.courseLoginForm.reset();
    showScreen("courseLogin");
    els.courseLoginUser?.focus();
  }

  function renderHome() {
    if (!content || !content.courses) return;

    const user = currentUser();
    if (!user) {
      renderLogin();
      return;
    }

    const coursesMeta = content.courses;
    activeCourseId = null;
    activeVideoId = null;
    clearPlayer();
    updateUserBar(user);

    if (els.coursesTitle) els.coursesTitle.textContent = coursesMeta.title || "Corsi video";
    if (els.coursesDescription) {
      els.coursesDescription.textContent =
        coursesMeta.description || "Scegli un corso e guarda i video della playlist.";
    }

    const items = global.AscoltoCourseUsers.getAccessibleCourses(content, user);
    if (els.coursesGrid) els.coursesGrid.innerHTML = "";
    if (els.coursesEmpty) {
      els.coursesEmpty.hidden = items.length > 0;
      els.coursesEmpty.textContent = items.length
        ? ""
        : "Nessun corso assegnato al tuo account. Contatta l’insegnante.";
    }

    items.forEach((course) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "library-level-card course-card";
      const count = (course.videos || []).length;
      card.innerHTML = `
        <span class="library-level-badge">Corso</span>
        <strong class="library-level-name">${escapeHtml(course.name)}</strong>
        <span class="library-level-meta">${count} video</span>
        ${
          course.description
            ? `<span class="library-level-desc">${escapeHtml(course.description)}</span>`
            : ""
        }
      `;
      card.addEventListener("click", () => renderCourse(course.id));
      els.coursesGrid.appendChild(card);
    });

    showScreen("courses");
  }

  function renderCourse(courseId) {
    const user = currentUser();
    if (!user) {
      renderLogin();
      return;
    }
    if (!global.AscoltoCourseUsers.canAccessCourse(user, courseId)) {
      renderHome();
      return;
    }

    const course = global.AscoltoCourses.getCourse(content, courseId);
    if (!course) {
      renderHome();
      return;
    }

    activeCourseId = Number(course.id);
    updateUserBar(user);
    if (els.courseTitle) els.courseTitle.textContent = course.name;
    if (els.courseDescription) {
      els.courseDescription.textContent =
        (course.description ? `${course.description} · ` : "") +
        `${(course.videos || []).length} video nella playlist.`;
    }

    const videos = course.videos || [];
    if (els.playlistList) els.playlistList.innerHTML = "";
    if (els.playlistEmpty) els.playlistEmpty.hidden = videos.length > 0;

    videos.forEach((video, index) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "playlist-item";
      btn.setAttribute("data-video-id", String(video.id));
      btn.innerHTML = `
        <span class="playlist-item-index">${index + 1}</span>
        <span class="playlist-item-body">
          <strong class="playlist-item-title">${escapeHtml(video.title)}</strong>
          <span class="playlist-item-provider">${escapeHtml(
            global.AscoltoCourses.providerLabel(video.provider)
          )}</span>
        </span>
      `;
      btn.addEventListener("click", () => playVideo(video));
      els.playlistList.appendChild(btn);
    });

    showScreen("course");

    if (videos.length) {
      playVideo(videos[0]);
    } else {
      clearPlayer();
      if (els.coursePlayerEmpty) {
        els.coursePlayerEmpty.hidden = false;
        els.coursePlayerEmpty.textContent = "Nessun video in questa playlist.";
      }
    }
  }

  async function refreshContent() {
    if (!global.AscoltoContent || typeof global.AscoltoContent.loadContent !== "function") {
      return content;
    }
    try {
      const { data } = await global.AscoltoContent.loadContent({
        preferLocal: false,
        forceFile: true,
      });
      content = data;
      if (global.AscoltoCourseUsers) {
        global.AscoltoCourseUsers.syncSessionFromContent(content);
      }
      return content;
    } catch (err) {
      console.warn("Refresh corsi fallito, uso dati in memoria.", err);
      return content;
    }
  }

  async function onLoginSubmit(e) {
    e.preventDefault();
    if (!global.AscoltoCourseUsers) {
      renderLogin("Modulo utenti non caricato. Ricarica la pagina.");
      return;
    }
    const username = String(els.courseLoginUser?.value || "").trim();
    const password = String(els.courseLoginPass?.value || "").trim();
    const submitBtn = els.courseLoginForm?.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.setAttribute("aria-busy", "true");
    }
    try {
      await refreshContent();
      const result = await global.AscoltoCourseUsers.login(content, username, password);
      if (!result.ok) {
        renderLogin(result.error || "Accesso non riuscito.");
        if (els.courseLoginUser) els.courseLoginUser.value = username;
        return;
      }
      renderHome();
    } catch (err) {
      renderLogin(err.message || "Accesso non riuscito.");
      if (els.courseLoginUser) els.courseLoginUser.value = username;
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.removeAttribute("aria-busy");
      }
    }
  }

  function onLogout() {
    if (global.AscoltoCourseUsers) global.AscoltoCourseUsers.logout();
    clearPlayer();
    renderLogin();
  }

  async function openCourses() {
    await refreshContent();
    if (currentUser()) renderHome();
    else renderLogin();
  }

  function bindEvents() {
    if (els.btnCourses) els.btnCourses.addEventListener("click", openCourses);
    if (els.courseLoginForm) els.courseLoginForm.addEventListener("submit", onLoginSubmit);
    if (els.btnBackFromCourseLogin) {
      els.btnBackFromCourseLogin.addEventListener("click", () => showScreen("home"));
    }
    if (els.btnBackFromCourses) {
      els.btnBackFromCourses.addEventListener("click", () => {
        clearPlayer();
        showScreen("home");
      });
    }
    if (els.btnBackFromCourse) {
      els.btnBackFromCourse.addEventListener("click", () => {
        clearPlayer();
        renderHome();
      });
    }
    if (els.btnCourseLogout) els.btnCourseLogout.addEventListener("click", onLogout);
  }

  global.AscoltoCoursesUI = {
    init(data) {
      content = data;
      if (global.AscoltoCourseUsers) global.AscoltoCourseUsers.syncSessionFromContent(content);
      bindEvents();
    },
    setContent(data) {
      content = data;
      if (global.AscoltoCourseUsers) global.AscoltoCourseUsers.syncSessionFromContent(content);
    },
    renderHome,
    showScreen,
  };
})(window);
