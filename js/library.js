/**
 * Book library — separate from exam levels.
 * Schema: content.library.levels[].books[]
 */
(function (global) {
  "use strict";

  const PDF_DIR = "assets/pdf";

  function nextId(items) {
    if (!items || !items.length) return 1;
    return Math.max(...items.map((item) => Number(item.id) || 0)) + 1;
  }

  function normalizeBook(book, index) {
    return {
      id: book.id != null ? Number(book.id) : index + 1,
      name: String(book.name || book.title || `Libro ${index + 1}`).trim() || `Libro ${index + 1}`,
      file: String(book.file || book.path || "").trim(),
    };
  }

  function normalizeLibraryLevel(level, index) {
    return {
      id: level.id != null ? Number(level.id) : index + 1,
      name: String(level.name || `Livello ${index + 1}`).trim() || `Livello ${index + 1}`,
      description: String(level.description || "").trim(),
      books: Array.isArray(level.books)
        ? level.books.map((book, bi) => normalizeBook(book, bi))
        : [],
    };
  }

  function normalizeLibrary(data) {
    const libIn = data.library || {};
    const levels = Array.isArray(libIn.levels)
      ? libIn.levels.map((level, index) => normalizeLibraryLevel(level, index))
      : [];
    levels.sort((a, b) => a.id - b.id);
    data.library = {
      title: String(libIn.title || "Leggi il libro").trim() || "Leggi il libro",
      description:
        String(libIn.description || "Scegli un livello e apri i libri PDF.").trim() ||
        "Scegli un livello e apri i libri PDF.",
      levels,
    };
    return data;
  }

  function ensureLibrary(data) {
    if (!data.library) normalizeLibrary(data);
    if (!Array.isArray(data.library.levels)) data.library.levels = [];
    return data.library;
  }

  function getLevel(data, levelId) {
    return ensureLibrary(data).levels.find((l) => Number(l.id) === Number(levelId)) || null;
  }

  function createLevel(data, { name, description } = {}) {
    const lib = ensureLibrary(data);
    const id = nextId(lib.levels);
    const level = normalizeLibraryLevel(
      { id, name: name || `Livello ${id}`, description: description || "", books: [] },
      lib.levels.length
    );
    lib.levels.push(level);
    lib.levels.sort((a, b) => a.id - b.id);
    return level;
  }

  function updateLevel(data, levelId, patch) {
    const level = getLevel(data, levelId);
    if (!level) return null;
    if (patch.name != null) level.name = String(patch.name).trim() || level.name;
    if (patch.description != null) level.description = String(patch.description).trim();
    return level;
  }

  function deleteLevel(data, levelId) {
    const lib = ensureLibrary(data);
    const lid = Number(levelId);
    const before = lib.levels.length;
    lib.levels = lib.levels.filter((l) => Number(l.id) !== lid);
    return lib.levels.length < before;
  }

  function createBook(data, levelId, { name, file } = {}) {
    const level = getLevel(data, levelId);
    if (!level) return null;
    const id = nextId(level.books);
    const book = normalizeBook({ id, name, file }, level.books.length);
    level.books.push(book);
    return book;
  }

  function updateBook(data, levelId, bookId, patch) {
    const level = getLevel(data, levelId);
    if (!level) return null;
    const book = level.books.find((b) => Number(b.id) === Number(bookId));
    if (!book) return null;
    if (patch.name != null) book.name = String(patch.name).trim() || book.name;
    if (patch.file != null) book.file = String(patch.file).trim();
    return book;
  }

  function deleteBook(data, levelId, bookId) {
    const level = getLevel(data, levelId);
    if (!level) return false;
    const bid = Number(bookId);
    const before = level.books.length;
    level.books = level.books.filter((b) => Number(b.id) !== bid);
    return level.books.length < before;
  }

  function slug(name) {
    const s = String(name || "lib")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return s || "lib";
  }

  function sanitizePdfFilename(name) {
    let base = String(name || "document.pdf").replace(/\.pdf$/i, "");
    base = base
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "document";
    if (base.length > 50) base = base.slice(0, 50);
    return `${base}.pdf`;
  }

  function suggestPdfFilename(levelName, bookId, originalName) {
    const safe = sanitizePdfFilename(originalName);
    const base = safe.replace(/\.pdf$/i, "") || "document";
    const stamp = Date.now().toString(36);
    const p = bookId ? `b${bookId}` : "new";
    const combined = `${slug(levelName)}-${p}-${base}-${stamp}.pdf`;
    return combined.length > 80 ? combined.slice(0, 80) : combined;
  }

  function resolvePdfApiUrl() {
    const path = global.location.pathname || "";
    if (path.includes("/admin")) return "../api/pdf";
    return "/api/pdf";
  }

  function dataUrlToBase64(dataUrl) {
    const s = String(dataUrl || "");
    const i = s.indexOf("base64,");
    return i >= 0 ? s.slice(i + 7) : "";
  }

  function resolveBookSrc(file) {
    const src = String(file || "").trim();
    if (!src) return "";
    if (/^https?:\/\//i.test(src) || src.startsWith("data:")) return src;
    if (src.startsWith("/")) return src;
    const base = global.location.pathname.includes("/admin/") ? "../" : "";
    return `${base}${src.replace(/^\.\//, "")}`;
  }

  async function uploadBookPdf({ dataUrl, filename, levelName } = {}) {
    const C = global.AscoltoContent;
    if (!C) throw new Error("AscoltoContent non caricato.");

    const base64 = dataUrlToBase64(dataUrl);
    if (!base64) throw new Error("File PDF non valido.");

    const sanitized = sanitizePdfFilename(filename || suggestPdfFilename(levelName, "", "document.pdf"));
    const path = `${PDF_DIR}/${sanitized}`;

    let savedLocally = false;
    try {
      const res = await fetch(resolvePdfApiUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: sanitized, content: base64 }),
        cache: "no-store",
      });
      if (res.ok) {
        savedLocally = true;
      } else if (!C.isGitHubPagesHost()) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Salvataggio PDF fallito (${res.status})`);
      }
    } catch (err) {
      if (!C.isGitHubPagesHost() && !(C.getGithubSettings().token)) throw err;
    }

    const gh = C.getGithubSettings();
    let publishedToGithub = false;
    let githubError = null;
    const mustPublish = !!(gh.token && (C.isGitHubPagesHost() || !savedLocally));

    if (gh.token) {
      try {
        await C.publishBinaryToGitHub(path, base64, {
          message: `Library: upload ${path}`,
        });
        publishedToGithub = true;
      } catch (err) {
        githubError = err;
        if (mustPublish && !savedLocally) throw err;
      }
    } else if (!savedLocally) {
      throw new Error(
        "Impossibile salvare il PDF. Avvia python3 server.py oppure configura GitHub Token."
      );
    }

    return {
      ok: true,
      path,
      savedLocally,
      publishedToGithub,
      githubError: githubError ? githubError.message || String(githubError) : null,
    };
  }

  // Patch normalizeContent so library is always normalized with exam data
  if (global.AscoltoContent && typeof global.AscoltoContent.normalizeContent === "function") {
    const original = global.AscoltoContent.normalizeContent;
    global.AscoltoContent.normalizeContent = function (raw) {
      return normalizeLibrary(original(raw));
    };
  }

  global.AscoltoLibrary = {
    normalizeLibrary,
    ensureLibrary,
    getLevel,
    createLevel,
    updateLevel,
    deleteLevel,
    createBook,
    updateBook,
    deleteBook,
    uploadBookPdf,
    resolveBookSrc,
    suggestPdfFilename,
    sanitizePdfFilename,
  };
})(window);
