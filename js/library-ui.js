/**
 * Public UI — Leggi il libro (book library)
 */
(function (global) {
  "use strict";

  /** @type {object|null} */
  let content = null;

  const $ = (sel, root = document) => root.querySelector(sel);

  const els = {
    btnBooks: $("#btnBooks"),
    screenLibrary: $("#screenLibrary"),
    screenLibraryLevel: $("#screenLibraryLevel"),
    libraryTitle: $("#libraryTitle"),
    libraryDescription: $("#libraryDescription"),
    libraryLevelsGrid: $("#libraryLevelsGrid"),
    libraryEmpty: $("#libraryEmpty"),
    btnBackFromLibrary: $("#btnBackFromLibrary"),
    libraryLevelTitle: $("#libraryLevelTitle"),
    libraryLevelDescription: $("#libraryLevelDescription"),
    btnBackFromLibraryLevel: $("#btnBackFromLibraryLevel"),
    booksGrid: $("#booksGrid"),
    booksEmpty: $("#booksEmpty"),
  };

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(str) {
    return escapeHtml(str).replace(/'/g, "&#39;");
  }

  function showScreen(name) {
    const screens = {
      loading: $("#screenLoading"),
      home: $("#screenHome"),
      library: els.screenLibrary,
      libraryLevel: els.screenLibraryLevel,
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

  function renderHome() {
    if (!content || !content.library) return;
    const lib = content.library;
    if (els.libraryTitle) els.libraryTitle.textContent = lib.title || "Leggi il libro";
    if (els.libraryDescription) {
      els.libraryDescription.textContent =
        lib.description || "Scegli un livello e apri i libri PDF.";
    }

    const levels = lib.levels || [];
    if (els.libraryLevelsGrid) els.libraryLevelsGrid.innerHTML = "";
    if (els.libraryEmpty) els.libraryEmpty.hidden = levels.length > 0;

    levels.forEach((level) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "library-level-card";
      const count = (level.books || []).length;
      card.innerHTML = `
        <span class="library-level-badge">${escapeHtml(level.name)}</span>
        <strong class="library-level-name">${escapeHtml(level.name)}</strong>
        <span class="library-level-meta">${count} libri</span>
        ${level.description ? `<span class="library-level-desc">${escapeHtml(level.description)}</span>` : ""}
      `;
      card.addEventListener("click", () => renderLevel(level.id));
      els.libraryLevelsGrid.appendChild(card);
    });

    showScreen("library");
  }

  function renderLevel(levelId) {
    const level = global.AscoltoLibrary.getLevel(content, levelId);
    if (!level) {
      renderHome();
      return;
    }

    if (els.libraryLevelTitle) els.libraryLevelTitle.textContent = level.name;
    if (els.libraryLevelDescription) {
      els.libraryLevelDescription.textContent =
        (level.description ? `${level.description} · ` : "") +
        `${(level.books || []).length} libri PDF.`;
    }

    const books = level.books || [];
    if (els.booksGrid) els.booksGrid.innerHTML = "";
    if (els.booksEmpty) els.booksEmpty.hidden = books.length > 0;

    books.forEach((book) => {
      const li = document.createElement("li");
      const href = global.AscoltoLibrary.resolveBookSrc(book.file);
      li.className = "book-card";
      li.innerHTML = `
        <a class="book-card-file" href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer" aria-label="Apri ${escapeAttr(book.name)}">
          <span class="book-card-icon" aria-hidden="true">PDF</span>
          <span class="book-card-open">Apri</span>
        </a>
        <p class="book-card-name">${escapeHtml(book.name)}</p>
      `;
      els.booksGrid.appendChild(li);
    });

    showScreen("libraryLevel");
  }

  function bindEvents() {
    if (els.btnBooks) els.btnBooks.addEventListener("click", renderHome);
    if (els.btnBackFromLibrary) {
      els.btnBackFromLibrary.addEventListener("click", () => showScreen("home"));
    }
    if (els.btnBackFromLibraryLevel) {
      els.btnBackFromLibraryLevel.addEventListener("click", renderHome);
    }
  }

  global.AscoltoLibraryUI = {
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
