/**
 * Admin UI — Biblioteca libri (separate from exam levels)
 */
(function (global) {
  "use strict";

  /** @type {object|null} */
  let content = null;
  /** @type {number|null} */
  let activeLevelId = null;
  /** @type {string|null} */
  let pendingPdfDataUrl = null;
  /** @type {File|null} */
  let pendingPdfFile = null;
  /** @type {object|null} */
  let api = null;

  const $ = (sel, root = document) => root.querySelector(sel);

  const els = {
    viewLibrary: $("#viewLibrary"),
    viewLibraryLevel: $("#viewLibraryLevel"),
    libraryGrid: $("#libraryGrid"),
    libraryEmpty: $("#libraryEmpty"),
    libraryLevelTitle: $("#libraryLevelTitle"),
    libraryLevelLead: $("#libraryLevelLead"),
    booksList: $("#booksList"),
    booksEmpty: $("#booksEmpty"),
    btnBackLibrary: $("#btnBackLibrary"),
    btnAddLibraryLevel: $("#btnAddLibraryLevel"),
    btnEditLibraryLevel: $("#btnEditLibraryLevel"),
    btnAddBook: $("#btnAddBook"),
    libraryLevelModal: $("#libraryLevelModal"),
    libraryLevelModalTitle: $("#libraryLevelModalTitle"),
    libraryLevelForm: $("#libraryLevelForm"),
    libraryLevelFormId: $("#libraryLevelFormId"),
    libraryLevelName: $("#libraryLevelName"),
    libraryLevelDesc: $("#libraryLevelDesc"),
    libraryLevelFormSubmit: $("#libraryLevelFormSubmit"),
    bookModal: $("#bookModal"),
    bookModalTitle: $("#bookModalTitle"),
    bookForm: $("#bookForm"),
    bookFormId: $("#bookFormId"),
    bookName: $("#bookName"),
    bookFile: $("#bookFile"),
    bookFileHint: $("#bookFileHint"),
    bookFormError: $("#bookFormError"),
    bookFormSubmit: $("#bookFormSubmit"),
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

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Impossibile leggere il file."));
      reader.readAsDataURL(file);
    });
  }

  function levels() {
    return content?.library?.levels || [];
  }

  function renderList() {
    activeLevelId = null;
    if (!api) return;
    api.showView("library");

    const list = levels();
    if (els.libraryGrid) els.libraryGrid.innerHTML = "";
    if (els.libraryEmpty) els.libraryEmpty.hidden = list.length > 0;

    list.forEach((level) => {
      const count = (level.books || []).length;
      const card = document.createElement("article");
      card.className = "level-card";
      card.innerHTML = `
        <div class="level-card-top">
          <span class="level-badge">${escapeHtml(level.name)}</span>
          <h2>${escapeHtml(level.name)}</h2>
        </div>
        <p class="level-card-desc">${escapeHtml(level.description || "Libri PDF per questo livello")}</p>
        <p class="level-card-meta">${count} libri</p>
        <div class="level-card-actions">
          <button type="button" class="btn btn-primary btn-sm" data-open-library-level="${level.id}">Gestisci libri</button>
          <button type="button" class="btn btn-secondary btn-sm" data-edit-library-level="${level.id}">Modifica</button>
          <button type="button" class="btn btn-danger-outline btn-sm" data-delete-library-level="${level.id}">Elimina</button>
        </div>
      `;
      els.libraryGrid.appendChild(card);
    });
  }

  function renderLevel(levelId) {
    const level = global.AscoltoLibrary.getLevel(content, levelId);
    if (!level) {
      renderList();
      return;
    }
    activeLevelId = Number(level.id);
    api.showView("libraryLevel");
    els.libraryLevelTitle.textContent = level.name;
    els.libraryLevelLead.textContent =
      (level.description ? `${level.description} · ` : "") +
      `${(level.books || []).length} libri in questo livello.`;

    const books = level.books || [];
    els.booksList.innerHTML = "";
    els.booksEmpty.hidden = books.length > 0;

    books.forEach((book, index) => {
      const card = document.createElement("article");
      card.className = "question-admin-card";
      card.innerHTML = `
        <div class="question-admin-head">
          <span class="question-badge">B${index + 1}</span>
          <div class="question-admin-title">
            <h2>${escapeHtml(book.name)}</h2>
            <p class="muted audio-path-label">${escapeHtml(book.file || "Nessun file")}</p>
          </div>
          <div class="question-admin-actions">
            <button type="button" class="btn btn-secondary btn-sm" data-edit-book="${book.id}">Modifica</button>
            <button type="button" class="btn btn-danger-outline btn-sm" data-delete-book="${book.id}">Elimina</button>
          </div>
        </div>
      `;
      els.booksList.appendChild(card);
    });
  }

  function openLevelModal(level = null) {
    if (!els.libraryLevelForm) return;
    els.libraryLevelForm.reset();
    els.libraryLevelFormId.value = "";
    if (level) {
      els.libraryLevelModalTitle.textContent = "Modifica livello biblioteca";
      els.libraryLevelFormId.value = String(level.id);
      els.libraryLevelName.value = level.name || "";
      els.libraryLevelDesc.value = level.description || "";
    } else {
      els.libraryLevelModalTitle.textContent = "Nuovo livello biblioteca";
    }
    if (els.libraryLevelModal) els.libraryLevelModal.hidden = false;
    els.libraryLevelName?.focus();
  }

  async function onLevelFormSubmit(e) {
    e.preventDefault();
    const name = els.libraryLevelName.value.trim();
    if (!name) return;

    const levelId = els.libraryLevelFormId.value;
    const btn = els.libraryLevelFormSubmit;
    setButtonLoading(btn, true);

    try {
      if (levelId) {
        global.AscoltoLibrary.updateLevel(content, levelId, {
          name,
          description: els.libraryLevelDesc.value.trim(),
        });
      } else {
        global.AscoltoLibrary.createLevel(content, {
          name,
          description: els.libraryLevelDesc.value.trim(),
        });
      }
      await api.persist({ silent: true });
      api.closeModal(els.libraryLevelModal);
      api.showToast(levelId ? "Livello aggiornato." : "Livello creato.");
      activeLevelId ? renderLevel(activeLevelId) : renderList();
    } catch (err) {
      api.showToast(api.friendlySaveError(err), 5000);
    } finally {
      setButtonLoading(btn, false);
    }
  }

  function resetBookForm() {
    els.bookForm.reset();
    els.bookFormId.value = "";
    els.bookFormError.hidden = true;
    pendingPdfDataUrl = null;
    pendingPdfFile = null;
    if (els.bookFileHint) {
      els.bookFileHint.textContent = "Solo file .pdf — salvato in assets/pdf/";
    }
  }

  function openBookModal(book = null) {
    resetBookForm();
    if (book) {
      els.bookModalTitle.textContent = "Modifica libro";
      els.bookFormId.value = String(book.id);
      els.bookName.value = book.name || "";
      if (book.file && els.bookFileHint) {
        els.bookFileHint.textContent = `File attuale: ${book.file}. Caricane uno nuovo per sostituirlo.`;
      }
    } else {
      els.bookModalTitle.textContent = "Nuovo libro PDF";
    }
    if (els.bookModal) els.bookModal.hidden = false;
    els.bookName?.focus();
  }

  async function onBookFileChange() {
    const file = els.bookFile.files && els.bookFile.files[0];
    if (!file) return;
    if (!/\.pdf$/i.test(file.name)) {
      els.bookFormError.hidden = false;
      els.bookFormError.textContent = "Solo file PDF (.pdf).";
      els.bookFile.value = "";
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      els.bookFormError.hidden = false;
      els.bookFormError.textContent = "File troppo grande (max 25 MB).";
      els.bookFile.value = "";
      return;
    }
    try {
      pendingPdfFile = file;
      pendingPdfDataUrl = await readFileAsDataUrl(file);
      els.bookFileHint.textContent = `Pronto: ${file.name} (${Math.round(file.size / 1024)} KB)`;
      els.bookFormError.hidden = true;
    } catch (err) {
      els.bookFormError.hidden = false;
      els.bookFormError.textContent = err.message || "Errore nel caricamento.";
    }
  }

  async function onBookFormSubmit(e) {
    e.preventDefault();
    els.bookFormError.hidden = true;

    const name = els.bookName.value.trim();
    if (!name) {
      els.bookFormError.hidden = false;
      els.bookFormError.textContent = "Inserisci il nome del libro.";
      return;
    }

    const bookId = els.bookFormId.value;
    const level = global.AscoltoLibrary.getLevel(content, activeLevelId);
    const existing = bookId
      ? level?.books.find((b) => Number(b.id) === Number(bookId))
      : null;

    if (!pendingPdfDataUrl && !existing?.file) {
      els.bookFormError.hidden = false;
      els.bookFormError.textContent = "Carica un file PDF.";
      return;
    }

    const btn = els.bookFormSubmit;
    setButtonLoading(btn, true, "Salvataggio…");

    try {
      let filePath = existing?.file || "";
      if (pendingPdfDataUrl && pendingPdfDataUrl.startsWith("data:")) {
        setButtonLoading(btn, true, "Caricamento PDF…");
        const gh = api.getEffectiveGithubSettings();
        if (/\.github\.io$/i.test(location.hostname) && !(gh && gh.token)) {
          throw new Error(api.githubTokenRequiredMessage());
        }
        const upload = await global.AscoltoLibrary.uploadBookPdf({
          dataUrl: pendingPdfDataUrl,
          filename: global.AscoltoLibrary.suggestPdfFilename(
            level?.name,
            bookId,
            pendingPdfFile?.name || "document.pdf"
          ),
          levelName: level?.name,
        });
        filePath = upload.path;
      }

      if (bookId) {
        global.AscoltoLibrary.updateBook(content, activeLevelId, bookId, { name, file: filePath });
      } else {
        global.AscoltoLibrary.createBook(content, activeLevelId, { name, file: filePath });
      }

      await api.persist({ silent: true });
      api.closeModal(els.bookModal);
      api.showToast(bookId ? "Libro aggiornato." : "Libro aggiunto.");
      renderLevel(activeLevelId);
    } catch (err) {
      const msg = api.friendlySaveError(err);
      els.bookFormError.hidden = false;
      els.bookFormError.textContent = msg;
      api.showToast(msg, 5000);
    } finally {
      setButtonLoading(btn, false);
    }
  }

  function onClick(e) {
    const open = e.target.closest("[data-open-library-level]");
    if (open) {
      renderLevel(Number(open.getAttribute("data-open-library-level")));
      return;
    }
    const editLevel = e.target.closest("[data-edit-library-level]");
    if (editLevel) {
      openLevelModal(global.AscoltoLibrary.getLevel(content, editLevel.getAttribute("data-edit-library-level")));
      return;
    }
    const delLevel = e.target.closest("[data-delete-library-level]");
    if (delLevel) {
      const level = global.AscoltoLibrary.getLevel(content, delLevel.getAttribute("data-delete-library-level"));
      if (!level) return;
      api.openConfirm({
        title: "Eliminare il livello?",
        message: `«${level.name}» e tutti i suoi libri verranno rimossi.`,
        confirmLabel: "Elimina",
        onConfirm: async () => {
          global.AscoltoLibrary.deleteLevel(content, level.id);
          await api.persist({ silent: true });
          api.showToast("Livello eliminato.");
          renderList();
        },
      });
      return;
    }
    const editBook = e.target.closest("[data-edit-book]");
    if (editBook) {
      const lvl = global.AscoltoLibrary.getLevel(content, activeLevelId);
      const book = lvl?.books.find((b) => Number(b.id) === Number(editBook.getAttribute("data-edit-book")));
      openBookModal(book);
      return;
    }
    const delBook = e.target.closest("[data-delete-book]");
    if (delBook) {
      const lvl = global.AscoltoLibrary.getLevel(content, activeLevelId);
      const book = lvl?.books.find((b) => Number(b.id) === Number(delBook.getAttribute("data-delete-book")));
      if (!book || !lvl) return;
      api.openConfirm({
        title: "Eliminare il libro?",
        message: `«${book.name}» verrà rimosso da ${lvl.name}.`,
        confirmLabel: "Elimina",
        onConfirm: async () => {
          global.AscoltoLibrary.deleteBook(content, activeLevelId, book.id);
          await api.persist({ silent: true });
          api.showToast("Libro eliminato.");
          renderLevel(activeLevelId);
        },
      });
    }
  }

  let bound = false;

  function bindEvents() {
    if (bound) return;
    bound = true;
    if (els.btnAddLibraryLevel) els.btnAddLibraryLevel.addEventListener("click", () => openLevelModal(null));
    if (els.btnEditLibraryLevel) {
      els.btnEditLibraryLevel.addEventListener("click", () => {
        openLevelModal(global.AscoltoLibrary.getLevel(content, activeLevelId));
      });
    }
    if (els.btnAddBook) els.btnAddBook.addEventListener("click", () => openBookModal(null));
    if (els.btnBackLibrary) els.btnBackLibrary.addEventListener("click", renderList);
    if (els.libraryLevelForm) els.libraryLevelForm.addEventListener("submit", onLevelFormSubmit);
    if (els.bookForm) els.bookForm.addEventListener("submit", onBookFormSubmit);
    if (els.bookFile) els.bookFile.addEventListener("change", onBookFileChange);
    if (els.viewLibrary) els.viewLibrary.addEventListener("click", onClick);
    if (els.viewLibraryLevel) els.viewLibraryLevel.addEventListener("click", onClick);
  }

  global.LibraryAdmin = {
    init(hooks) {
      api = hooks;
      bindEvents();
    },
    setContent(data) {
      content = data;
    },
    renderList,
    renderLevel,
  };
})(window);
