/**
 * Admin UI — Utenti corsi (accesso per corso)
 */
(function (global) {
  "use strict";

  /** @type {object|null} */
  let content = null;
  /** @type {object|null} */
  let api = null;

  const $ = (sel, root = document) => root.querySelector(sel);

  const els = {
    viewCourseUsers: $("#viewCourseUsers"),
    usersGrid: $("#courseUsersGrid"),
    usersEmpty: $("#courseUsersEmpty"),
    btnAddUser: $("#btnAddCourseUser"),
    userModal: $("#courseUserModal"),
    userModalTitle: $("#courseUserModalTitle"),
    userForm: $("#courseUserForm"),
    userFormId: $("#courseUserFormId"),
    userName: $("#courseUserDisplayName"),
    userUsername: $("#courseUserUsername"),
    userPassword: $("#courseUserPassword"),
    userPasswordHint: $("#courseUserPasswordHint"),
    userAccessAll: $("#courseUserAccessAll"),
    userCourses: $("#courseUserCourses"),
    userFormError: $("#courseUserFormError"),
    userFormSubmit: $("#courseUserFormSubmit"),
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

  function courseNameMap() {
    const map = new Map();
    (content?.courses?.items || []).forEach((c) => map.set(Number(c.id), c.name));
    return map;
  }

  function renderCourseCheckboxes(selectedIds = []) {
    const selected = new Set((selectedIds || []).map(Number));
    const courses = content?.courses?.items || [];
    if (!els.userCourses) return;

    if (!courses.length) {
      els.userCourses.innerHTML =
        '<p class="field-hint">Nessun corso creato. Crea prima un corso in «Corsi video».</p>';
      return;
    }

    els.userCourses.innerHTML = courses
      .map((course) => {
        const checked = selected.has(Number(course.id)) ? "checked" : "";
        return `
          <label class="course-access-check">
            <input type="checkbox" name="courseAccess" value="${course.id}" ${checked} />
            <span>
              <strong>${escapeHtml(course.name)}</strong>
              ${
                course.description
                  ? `<span class="muted">${escapeHtml(course.description)}</span>`
                  : ""
              }
            </span>
          </label>
        `;
      })
      .join("");
  }

  function selectedCourseIdsFromForm() {
    if (!els.userCourses) return [];
    return [...els.userCourses.querySelectorAll('input[name="courseAccess"]:checked')].map((el) =>
      Number(el.value)
    );
  }

  function renderList() {
    if (!api) return;
    api.showView("courseUsers");

    const users = global.AscoltoCourseUsers.listUsers(content);
    const names = courseNameMap();
    const staticUser = global.AscoltoCourseUsers.getStaticUser();

    if (els.usersGrid) els.usersGrid.innerHTML = "";
    if (els.usersEmpty) els.usersEmpty.hidden = true;

    // Always show the built-in full-access account
    if (els.usersGrid && staticUser) {
      const card = document.createElement("article");
      card.className = "level-card";
      card.innerHTML = `
        <div class="level-card-top">
          <span class="level-badge">Statico</span>
          <h2>${escapeHtml(staticUser.name)}</h2>
        </div>
        <p class="level-card-desc">@${escapeHtml(staticUser.username)}</p>
        <p class="level-card-meta">Accesso a <strong>tutti</strong> i corsi (sempre)</p>
        <p class="field-hint" style="margin:0.5rem 0 0">
          Password: <code>${escapeHtml(global.AscoltoCourseUsers.STATIC_PASSWORD)}</code>
        </p>
      `;
      els.usersGrid.appendChild(card);
    }

    if (!users.length && els.usersEmpty) {
      // keep empty hint below static card only if no custom users — hide standard empty
      els.usersEmpty.hidden = true;
    }

    users.forEach((user) => {
      const courseLabels = (user.courseIds || [])
        .map((id) => names.get(Number(id)) || `#${id}`)
        .join(", ");
      const card = document.createElement("article");
      card.className = "level-card";
      card.innerHTML = `
        <div class="level-card-top">
          <span class="level-badge">${user.accessAll ? "Tutti i corsi" : "Utente"}</span>
          <h2>${escapeHtml(user.name || user.username)}</h2>
        </div>
        <p class="level-card-desc">Username login: <strong>@${escapeHtml(user.username)}</strong></p>
        <p class="level-card-meta">${
          user.accessAll
            ? "Accesso a tutti i corsi"
            : user.courseIds.length
              ? `${user.courseIds.length} corsi: ${escapeHtml(courseLabels)}`
              : "Nessun corso assegnato"
        }</p>
        <div class="level-card-actions">
          <button type="button" class="btn btn-secondary btn-sm" data-edit-course-user="${user.id}">Modifica</button>
          <button type="button" class="btn btn-danger-outline btn-sm" data-delete-course-user="${user.id}">Elimina</button>
        </div>
      `;
      els.usersGrid.appendChild(card);
    });
  }

  function openUserModal(user = null) {
    if (!els.userForm) return;
    els.userForm.reset();
    els.userFormId.value = "";
    els.userFormError.hidden = true;
    els.userPassword.value = "";
    els.userPassword.required = !user;
    if (els.userAccessAll) els.userAccessAll.checked = false;

    if (user) {
      els.userModalTitle.textContent = "Modifica utente";
      els.userFormId.value = String(user.id);
      els.userName.value = user.name || "";
      els.userUsername.value = user.username || "";
      if (els.userAccessAll) els.userAccessAll.checked = !!user.accessAll;
      if (els.userPasswordHint) {
        els.userPasswordHint.textContent =
          "Lascia vuoto per mantenere la password attuale. Minimo 4 caratteri se la cambi.";
      }
      renderCourseCheckboxes(user.courseIds);
      toggleCoursePickerDisabled(!!user.accessAll);
    } else {
      els.userModalTitle.textContent = "Nuovo utente";
      if (els.userPasswordHint) {
        els.userPasswordHint.textContent = "Minimo 4 caratteri. L’utente userà username e password sul sito.";
      }
      renderCourseCheckboxes([]);
      toggleCoursePickerDisabled(false);
    }

    if (els.userModal) els.userModal.hidden = false;
    els.userUsername?.focus();
  }

  function toggleCoursePickerDisabled(disabled) {
    if (!els.userCourses) return;
    els.userCourses.querySelectorAll('input[name="courseAccess"]').forEach((input) => {
      input.disabled = !!disabled;
    });
    els.userCourses.style.opacity = disabled ? "0.5" : "1";
  }

  async function onUserFormSubmit(e) {
    e.preventDefault();
    els.userFormError.hidden = true;

    const userId = els.userFormId.value;
    const username = els.userUsername.value.trim();
    const name = els.userName.value.trim();
    const password = els.userPassword.value;
    const accessAll = !!(els.userAccessAll && els.userAccessAll.checked);
    const courseIds = accessAll ? [] : selectedCourseIdsFromForm();
    const btn = els.userFormSubmit;
    setButtonLoading(btn, true);

    try {
      if (userId) {
        await global.AscoltoCourseUsers.updateUser(content, userId, {
          username,
          name,
          password: password || undefined,
          courseIds,
          accessAll,
        });
      } else {
        await global.AscoltoCourseUsers.createUser(content, {
          username,
          name,
          password,
          courseIds,
          accessAll,
        });
      }
      await api.persist({ silent: true });
      api.closeModal(els.userModal);
      api.showToast(userId ? "Utente aggiornato." : "Utente creato.");
      renderList();
    } catch (err) {
      const msg = api.friendlySaveError(err);
      els.userFormError.hidden = false;
      els.userFormError.textContent = msg;
      api.showToast(msg, 5000);
    } finally {
      setButtonLoading(btn, false);
    }
  }

  function onClick(e) {
    const edit = e.target.closest("[data-edit-course-user]");
    if (edit) {
      openUserModal(
        global.AscoltoCourseUsers.getUser(content, edit.getAttribute("data-edit-course-user"))
      );
      return;
    }
    const del = e.target.closest("[data-delete-course-user]");
    if (del) {
      const user = global.AscoltoCourseUsers.getUser(
        content,
        del.getAttribute("data-delete-course-user")
      );
      if (!user) return;
      api.openConfirm({
        title: "Eliminare l’utente?",
        message: `«${user.username}» non potrà più accedere ai corsi.`,
        confirmLabel: "Elimina",
        onConfirm: async () => {
          global.AscoltoCourseUsers.deleteUser(content, user.id);
          await api.persist({ silent: true });
          api.showToast("Utente eliminato.");
          renderList();
        },
      });
    }
  }

  let bound = false;

  function bindEvents() {
    if (bound) return;
    bound = true;
    if (els.btnAddUser) els.btnAddUser.addEventListener("click", () => openUserModal(null));
    if (els.userForm) els.userForm.addEventListener("submit", onUserFormSubmit);
    if (els.userAccessAll) {
      els.userAccessAll.addEventListener("change", () => {
        toggleCoursePickerDisabled(els.userAccessAll.checked);
      });
    }
    if (els.viewCourseUsers) els.viewCourseUsers.addEventListener("click", onClick);
  }

  global.CourseUsersAdmin = {
    init(hooks) {
      api = hooks;
      bindEvents();
    },
    setContent(data) {
      content = data;
    },
    renderList,
  };
})(window);
