/**
 * Admin UI — registry of users stored in Cloud Firestore.
 * Fields: name, phone, Egyptian national ID (14 digits).
 */
(function (global) {
  "use strict";

  /** @type {object|null} */
  let api = null;
  let eventsBound = false;
  let loading = false;

  const $ = (sel, root = document) => root.querySelector(sel);

  const els = {
    view: $("#viewUsers"),
    form: $("#userForm"),
    name: $("#userName"),
    phone: $("#userPhone"),
    nationalId: $("#userNationalId"),
    error: $("#userFormError"),
    submit: $("#btnAddUser"),
    refresh: $("#btnRefreshUsers"),
    list: $("#usersList"),
    empty: $("#usersEmpty"),
  };

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setFormError(message) {
    if (!els.error) return;
    if (!message) {
      els.error.hidden = true;
      els.error.textContent = "";
      return;
    }
    els.error.hidden = false;
    els.error.textContent = message;
  }

  function normalizePhone(raw) {
    let digits = String(raw || "").replace(/[^\d]/g, "");
    if (digits.startsWith("0020")) digits = "0" + digits.slice(4);
    else if (digits.startsWith("20") && digits.length === 12) digits = "0" + digits.slice(2);
    return digits;
  }

  function isValidEgyptianPhone(digits) {
    return /^01[0125]\d{8}$/.test(digits);
  }

  function isValidNationalId(value) {
    if (!/^[23]\d{13}$/.test(value)) return false;
    const year = (value[0] === "2" ? 1900 : 2000) + Number(value.slice(1, 3));
    const month = Number(value.slice(3, 5));
    const day = Number(value.slice(5, 7));
    const date = new Date(year, month - 1, day);
    return (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    );
  }

  function formatWhen(iso) {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("it-IT", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function renderUsers(users) {
    if (!els.list || !els.empty) return;
    els.list.innerHTML = "";
    els.empty.hidden = users.length > 0;
    els.empty.textContent = "Nessun utente. Aggiungi il primo.";

    users.forEach((user) => {
      const when = formatWhen(user.createdAt);
      const card = document.createElement("article");
      card.className = "question-admin-card user-admin-card";
      card.innerHTML = `
        <div class="question-admin-head">
          <div class="question-admin-title">
            <h2>${escapeHtml(user.name)}</h2>
            <p class="user-admin-meta">
              <span>Tel. ${escapeHtml(user.phone)}</span>
              <span>ID ${escapeHtml(user.nationalId)}</span>
              ${when ? `<span>${escapeHtml(when)}</span>` : ""}
            </p>
          </div>
          <button type="button" class="btn btn-danger btn-sm" data-delete-user="${escapeHtml(user.id)}">Elimina</button>
        </div>
      `;
      els.list.appendChild(card);
    });
  }

  async function loadUsers() {
    if (!global.AscoltoContent || !global.AscoltoContent.listFirestoreUsers) {
      if (els.empty) {
        els.empty.hidden = false;
        els.empty.textContent = "Modulo Firebase non caricato.";
      }
      return;
    }
    if (loading) return;
    loading = true;
    if (els.empty) {
      els.empty.hidden = false;
      els.empty.textContent = "Caricamento…";
    }
    if (els.list) els.list.innerHTML = "";
    try {
      const users = await global.AscoltoContent.listFirestoreUsers();
      renderUsers(users);
    } catch (err) {
      console.error(err);
      if (els.list) els.list.innerHTML = "";
      if (els.empty) {
        els.empty.hidden = false;
        els.empty.textContent = err.message || "Impossibile caricare gli utenti.";
      }
    } finally {
      loading = false;
    }
  }

  async function onSubmit(event) {
    event.preventDefault();
    setFormError("");

    const name = els.name ? els.name.value.trim() : "";
    const phone = normalizePhone(els.phone ? els.phone.value : "");
    const nationalId = String(els.nationalId ? els.nationalId.value : "").replace(/\D/g, "");

    if (name.length < 2) {
      setFormError("Inserisci il nome completo.");
      return;
    }
    if (!isValidEgyptianPhone(phone)) {
      setFormError("Il telefono deve essere un numero egiziano di 11 cifre (01…).");
      return;
    }
    if (!isValidNationalId(nationalId)) {
      setFormError("Il numero di identità deve essere di 14 cifre e contenere una data di nascita valida.");
      return;
    }

    if (els.submit) els.submit.disabled = true;
    try {
      await global.AscoltoContent.addFirestoreUser({ name, phone, nationalId });
      if (els.form) els.form.reset();
      if (api && api.showToast) api.showToast("Utente salvato su Firebase.");
      await loadUsers();
    } catch (err) {
      console.error(err);
      setFormError(err.message || "Salvataggio non riuscito.");
    } finally {
      if (els.submit) els.submit.disabled = false;
    }
  }

  function onClick(event) {
    const button = event.target.closest("[data-delete-user]");
    if (!button || !api || !api.openConfirm) return;
    const id = button.getAttribute("data-delete-user");
    api.openConfirm({
      title: "Elimina utente",
      message: "L’utente verrà rimosso da Firebase. Continuare?",
      confirmLabel: "Elimina",
      onConfirm: async () => {
        await global.AscoltoContent.deleteFirestoreUser(id);
        if (api.showToast) api.showToast("Utente eliminato.");
        await loadUsers();
      },
    });
  }

  function bindEvents() {
    if (eventsBound) return;
    eventsBound = true;
    if (els.form) els.form.addEventListener("submit", onSubmit);
    if (els.refresh) els.refresh.addEventListener("click", () => loadUsers());
    if (els.view) els.view.addEventListener("click", onClick);
  }

  global.UsersAdmin = {
    init(hooks) {
      api = hooks;
      bindEvents();
    },
    renderList: loadUsers,
  };
})(window);
