/**
 * Public UI — Corsi video (YouTube / Drive playlists)
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
    screenCourses: $("#screenCourses"),
    screenCourse: $("#screenCourse"),
    coursesTitle: $("#coursesTitle"),
    coursesDescription: $("#coursesDescription"),
    coursesGrid: $("#coursesGrid"),
    coursesEmpty: $("#coursesEmpty"),
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

  function renderHome() {
    if (!content || !content.courses) return;
    const courses = content.courses;
    activeCourseId = null;
    activeVideoId = null;
    clearPlayer();

    if (els.coursesTitle) els.coursesTitle.textContent = courses.title || "Corsi video";
    if (els.coursesDescription) {
      els.coursesDescription.textContent =
        courses.description || "Scegli un corso e guarda i video della playlist.";
    }

    const items = courses.items || [];
    if (els.coursesGrid) els.coursesGrid.innerHTML = "";
    if (els.coursesEmpty) els.coursesEmpty.hidden = items.length > 0;

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
    const course = global.AscoltoCourses.getCourse(content, courseId);
    if (!course) {
      renderHome();
      return;
    }

    activeCourseId = Number(course.id);
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

  function bindEvents() {
    if (els.btnCourses) els.btnCourses.addEventListener("click", renderHome);
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
  }

  global.AscoltoCoursesUI = {
    init(data) {
      content = data;
      bindEvents();
    },
    setContent(data) {
      content = data;
    },
    renderHome,
    showScreen,
  };
})(window);
