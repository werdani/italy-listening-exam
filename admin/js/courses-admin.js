/**
 * Admin UI — Corsi video (playlist di link YouTube / Drive)
 */
(function (global) {
  "use strict";

  /** @type {object|null} */
  let content = null;
  /** @type {number|null} */
  let activeCourseId = null;
  /** @type {object|null} */
  let api = null;

  const $ = (sel, root = document) => root.querySelector(sel);

  const els = {
    viewCourses: $("#viewCourses"),
    viewCourse: $("#viewCourse"),
    coursesGrid: $("#coursesAdminGrid"),
    coursesEmpty: $("#coursesAdminEmpty"),
    courseTitle: $("#adminCourseTitle"),
    courseLead: $("#adminCourseLead"),
    videosList: $("#videosList"),
    videosEmpty: $("#videosEmpty"),
    btnBackCourses: $("#btnBackCourses"),
    btnAddCourse: $("#btnAddCourse"),
    btnEditCourse: $("#btnEditCourse"),
    btnAddVideo: $("#btnAddVideo"),
    courseModal: $("#courseModal"),
    courseModalTitle: $("#courseModalTitle"),
    courseForm: $("#courseForm"),
    courseFormId: $("#courseFormId"),
    courseName: $("#courseName"),
    courseDesc: $("#courseDesc"),
    courseFormSubmit: $("#courseFormSubmit"),
    videoModal: $("#videoModal"),
    videoModalTitle: $("#videoModalTitle"),
    videoForm: $("#videoForm"),
    videoFormId: $("#videoFormId"),
    videoTitle: $("#videoTitle"),
    videoUrl: $("#videoUrl"),
    videoFormError: $("#videoFormError"),
    videoFormSubmit: $("#videoFormSubmit"),
  };

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setButtonLoading(btn, isLoading, loadingLabel = "Salvataggio…") {
    if (!btn) return;
    if (isLoading) {
      if (!btn.dataset.defaultLabel) btn.dataset.defaultLabel = btn.textContent.trim();
      btn.classList.add("is-loading");
      btn.setAttribute("aria-busy", "true");
      btn.textContent = loadingLabel;
    } else {
      btn.classList.remove("is-loading");
      btn.removeAttribute("aria-busy");
      btn.textContent = btn.dataset.defaultLabel || "Salva";
    }
  }

  function courses() {
    return content?.courses?.items || [];
  }

  function renderList() {
    activeCourseId = null;
    if (!api) return;
    api.showView("courses");

    const list = courses();
    if (els.coursesGrid) els.coursesGrid.innerHTML = "";
    if (els.coursesEmpty) els.coursesEmpty.hidden = list.length > 0;

    list.forEach((course) => {
      const count = (course.videos || []).length;
      const card = document.createElement("article");
      card.className = "level-card";
      card.innerHTML = `
        <div class="level-card-top">
          <span class="level-badge">Corso</span>
          <h2>${escapeHtml(course.name)}</h2>
        </div>
        <p class="level-card-desc">${escapeHtml(course.description || "Playlist di video")}</p>
        <p class="level-card-meta">${count} video</p>
        <div class="level-card-actions">
          <button type="button" class="btn btn-primary btn-sm" data-open-course="${course.id}">Gestisci playlist</button>
          <button type="button" class="btn btn-secondary btn-sm" data-edit-course="${course.id}">Modifica</button>
          <button type="button" class="btn btn-danger-outline btn-sm" data-delete-course="${course.id}">Elimina</button>
        </div>
      `;
      els.coursesGrid.appendChild(card);
    });
  }

  function renderCourse(courseId) {
    const course = global.AscoltoCourses.getCourse(content, courseId);
    if (!course) {
      renderList();
      return;
    }
    activeCourseId = Number(course.id);
    api.showView("course");
    els.courseTitle.textContent = course.name;
    els.courseLead.textContent =
      (course.description ? `${course.description} · ` : "") +
      `${(course.videos || []).length} video nella playlist.`;

    const videos = course.videos || [];
    els.videosList.innerHTML = "";
    els.videosEmpty.hidden = videos.length > 0;

    videos.forEach((video, index) => {
      const provider = global.AscoltoCourses.providerLabel(video.provider);
      const card = document.createElement("article");
      card.className = "question-admin-card";
      card.innerHTML = `
        <div class="question-admin-head">
          <span class="question-badge">V${index + 1}</span>
          <div class="question-admin-title">
            <h2>${escapeHtml(video.title)}</h2>
            <p class="muted audio-path-label">${escapeHtml(provider)} · ${escapeHtml(
              video.url || "Nessun link"
            )}</p>
          </div>
          <div class="question-admin-actions">
            <button type="button" class="btn btn-secondary btn-sm" data-edit-video="${video.id}">Modifica</button>
            <button type="button" class="btn btn-danger-outline btn-sm" data-delete-video="${video.id}">Elimina</button>
          </div>
        </div>
      `;
      els.videosList.appendChild(card);
    });
  }

  function openCourseModal(course = null) {
    if (!els.courseForm) return;
    els.courseForm.reset();
    els.courseFormId.value = "";
    if (course) {
      els.courseModalTitle.textContent = "Modifica corso";
      els.courseFormId.value = String(course.id);
      els.courseName.value = course.name || "";
      els.courseDesc.value = course.description || "";
    } else {
      els.courseModalTitle.textContent = "Nuovo corso";
    }
    if (els.courseModal) els.courseModal.hidden = false;
    els.courseName?.focus();
  }

  async function onCourseFormSubmit(e) {
    e.preventDefault();
    const name = els.courseName.value.trim();
    if (!name) return;

    const courseId = els.courseFormId.value;
    const btn = els.courseFormSubmit;
    setButtonLoading(btn, true);

    try {
      if (courseId) {
        global.AscoltoCourses.updateCourse(content, courseId, {
          name,
          description: els.courseDesc.value.trim(),
        });
      } else {
        global.AscoltoCourses.createCourse(content, {
          name,
          description: els.courseDesc.value.trim(),
        });
      }
      await api.persist({ silent: true });
      api.closeModal(els.courseModal);
      api.showToast(courseId ? "Corso aggiornato." : "Corso creato.");
      activeCourseId ? renderCourse(activeCourseId) : renderList();
    } catch (err) {
      api.showToast(api.friendlySaveError(err), 5000);
    } finally {
      setButtonLoading(btn, false);
    }
  }

  function resetVideoForm() {
    els.videoForm.reset();
    els.videoFormId.value = "";
    els.videoFormError.hidden = true;
  }

  function openVideoModal(video = null) {
    resetVideoForm();
    if (video) {
      els.videoModalTitle.textContent = "Modifica video";
      els.videoFormId.value = String(video.id);
      els.videoTitle.value = video.title || "";
      els.videoUrl.value = video.url || "";
    } else {
      els.videoModalTitle.textContent = "Nuovo video";
    }
    if (els.videoModal) els.videoModal.hidden = false;
    els.videoTitle?.focus();
  }

  function validateVideoUrl(url) {
    const trimmed = String(url || "").trim();
    if (!trimmed) return "Incolla un link YouTube o Google Drive.";
    if (!/^https?:\/\//i.test(trimmed) && !global.AscoltoCourses.extractYouTubeId(trimmed)) {
      return "Il link deve iniziare con https:// (YouTube o Drive).";
    }
    const provider = global.AscoltoCourses.detectProvider(trimmed);
    if (provider === "other") {
      return "Usa un link YouTube o Google Drive.";
    }
    return "";
  }

  async function onVideoFormSubmit(e) {
    e.preventDefault();
    els.videoFormError.hidden = true;

    const title = els.videoTitle.value.trim();
    const url = els.videoUrl.value.trim();
    if (!title) {
      els.videoFormError.hidden = false;
      els.videoFormError.textContent = "Inserisci il titolo del video.";
      return;
    }

    const urlError = validateVideoUrl(url);
    if (urlError) {
      els.videoFormError.hidden = false;
      els.videoFormError.textContent = urlError;
      return;
    }

    const videoId = els.videoFormId.value;
    const btn = els.videoFormSubmit;
    setButtonLoading(btn, true);

    try {
      if (videoId) {
        global.AscoltoCourses.updateVideo(content, activeCourseId, videoId, { title, url });
      } else {
        global.AscoltoCourses.createVideo(content, activeCourseId, { title, url });
      }
      await api.persist({ silent: true });
      api.closeModal(els.videoModal);
      api.showToast(videoId ? "Video aggiornato." : "Video aggiunto.");
      renderCourse(activeCourseId);
    } catch (err) {
      const msg = api.friendlySaveError(err);
      els.videoFormError.hidden = false;
      els.videoFormError.textContent = msg;
      api.showToast(msg, 5000);
    } finally {
      setButtonLoading(btn, false);
    }
  }

  function onClick(e) {
    const open = e.target.closest("[data-open-course]");
    if (open) {
      renderCourse(Number(open.getAttribute("data-open-course")));
      return;
    }
    const editCourse = e.target.closest("[data-edit-course]");
    if (editCourse) {
      openCourseModal(
        global.AscoltoCourses.getCourse(content, editCourse.getAttribute("data-edit-course"))
      );
      return;
    }
    const delCourse = e.target.closest("[data-delete-course]");
    if (delCourse) {
      const course = global.AscoltoCourses.getCourse(
        content,
        delCourse.getAttribute("data-delete-course")
      );
      if (!course) return;
      api.openConfirm({
        title: "Eliminare il corso?",
        message: `«${course.name}» e tutta la playlist verranno rimossi.`,
        confirmLabel: "Elimina",
        onConfirm: async () => {
          global.AscoltoCourses.deleteCourse(content, course.id);
          await api.persist({ silent: true });
          api.showToast("Corso eliminato.");
          renderList();
        },
      });
      return;
    }
    const editVideo = e.target.closest("[data-edit-video]");
    if (editVideo) {
      const course = global.AscoltoCourses.getCourse(content, activeCourseId);
      const video = course?.videos.find(
        (v) => Number(v.id) === Number(editVideo.getAttribute("data-edit-video"))
      );
      openVideoModal(video);
      return;
    }
    const delVideo = e.target.closest("[data-delete-video]");
    if (delVideo) {
      const course = global.AscoltoCourses.getCourse(content, activeCourseId);
      const video = course?.videos.find(
        (v) => Number(v.id) === Number(delVideo.getAttribute("data-delete-video"))
      );
      if (!video || !course) return;
      api.openConfirm({
        title: "Eliminare il video?",
        message: `«${video.title}» verrà rimosso da ${course.name}.`,
        confirmLabel: "Elimina",
        onConfirm: async () => {
          global.AscoltoCourses.deleteVideo(content, activeCourseId, video.id);
          await api.persist({ silent: true });
          api.showToast("Video eliminato.");
          renderCourse(activeCourseId);
        },
      });
    }
  }

  let bound = false;

  function bindEvents() {
    if (bound) return;
    bound = true;
    if (els.btnAddCourse) els.btnAddCourse.addEventListener("click", () => openCourseModal(null));
    if (els.btnEditCourse) {
      els.btnEditCourse.addEventListener("click", () => {
        openCourseModal(global.AscoltoCourses.getCourse(content, activeCourseId));
      });
    }
    if (els.btnAddVideo) els.btnAddVideo.addEventListener("click", () => openVideoModal(null));
    if (els.btnBackCourses) els.btnBackCourses.addEventListener("click", renderList);
    if (els.courseForm) els.courseForm.addEventListener("submit", onCourseFormSubmit);
    if (els.videoForm) els.videoForm.addEventListener("submit", onVideoFormSubmit);
    if (els.viewCourses) els.viewCourses.addEventListener("click", onClick);
    if (els.viewCourse) els.viewCourse.addEventListener("click", onClick);
  }

  global.CoursesAdmin = {
    init(hooks) {
      api = hooks;
      bindEvents();
    },
    setContent(data) {
      content = data;
    },
    renderList,
    renderCourse,
  };
})(window);
