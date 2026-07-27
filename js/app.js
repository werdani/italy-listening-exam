/**
 * AscoltoIT — Esame di Ascolto in Italiano
 * Client-side exam engine: load JSON, navigate, timer, score, persistence.
 */
(() => {
  "use strict";

  const STORAGE_KEY = "ascoltoit-exam-state";
  const STORAGE_VERSION = 3;
  const THEME_KEY = "listenlab-theme";
  const DATA_URL = "data/questions.json";

  /** @type {{ exam: object, questions: Array }} */
  let examData = null;

  const state = {
    currentIndex: 0,
    answers: /** @type {(number|null)[]} */ ([]),
    listened: /** @type {boolean[]} */ ([]),
    remainingSeconds: 0,
    totalSeconds: 0,
    startedAt: null,
    preventSkip: true,
    status: "idle", // idle | in_progress | completed
    results: null,
  };

  let timerId = null;
  let toastTimer = null;
  let pendingConfirmAction = null;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const els = {
    loading: $("#screenLoading"),
    home: $("#screenHome"),
    exam: $("#screenExam"),
    results: $("#screenResults"),
    examTitle: $("#examTitle"),
    examDescription: $("#examDescription"),
    metaQuestions: $("#metaQuestions"),
    metaMarks: $("#metaMarks"),
    metaDuration: $("#metaDuration"),
    metaPass: $("#metaPass"),
    preventSkipToggle: $("#preventSkipToggle"),
    btnStart: $("#btnStart"),
    btnResume: $("#btnResume"),
    resumeHint: $("#resumeHint"),
    timerChip: $("#timerChip"),
    timerDisplay: $("#timerDisplay"),
    themeToggle: $("#themeToggle"),
    progressLabel: $("#progressLabel"),
    answeredCount: $("#answeredCount"),
    progressFill: $("#progressFill"),
    questionBadge: $("#questionBadge"),
    questionPrompt: $("#questionPrompt"),
    examAudio: $("#examAudio"),
    choicesFieldset: $("#choicesFieldset"),
    afterAudioBlock: $("#afterAudioBlock"),
    listenFirstHint: $("#listenFirstHint"),
    btnPrev: $("#btnPrev"),
    btnNext: $("#btnNext"),
    btnSubmitEarly: $("#btnSubmitEarly"),
    questionDots: $("#questionDots"),
    resultsVerdict: $("#resultsVerdict"),
    resultsPercent: $("#resultsPercent"),
    resultsScore: $("#resultsScore"),
    resultsCorrect: $("#resultsCorrect"),
    resultsWrong: $("#resultsWrong"),
    resultsTime: $("#resultsTime"),
    scoreRingFg: $("#scoreRingFg"),
    reviewSection: $("#reviewSection"),
    reviewList: $("#reviewList"),
    btnReview: $("#btnReview"),
    btnRetake: $("#btnRetake"),
    btnBackHome: $("#btnBackHome"),
    confirmModal: $("#confirmModal"),
    modalTitle: $("#modalTitle"),
    modalMessage: $("#modalMessage"),
    modalConfirm: $("#modalConfirm"),
    toast: $("#toast"),
  };

  /* ---------- Theme ---------- */

  function getPreferredTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
    const next = theme === "dark" ? "light" : "dark";
    const label = next === "dark" ? "Passa alla modalità scura" : "Passa alla modalità chiara";
    els.themeToggle.setAttribute("aria-label", label);
    els.themeToggle.title = label;
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme") || "light";
    applyTheme(current === "dark" ? "light" : "dark");
  }

  /* ---------- Storage ---------- */

  function saveState() {
    if (state.status !== "in_progress") return;
    const payload = {
      version: STORAGE_VERSION,
      currentIndex: state.currentIndex,
      answers: state.answers,
      listened: state.listened,
      remainingSeconds: state.remainingSeconds,
      totalSeconds: state.totalSeconds,
      startedAt: state.startedAt,
      preventSkip: state.preventSkip,
      status: state.status,
      savedAt: Date.now(),
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* quota / private mode */
    }
  }

  function loadSavedState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      // Drop incompatible legacy payloads
      if (data.version && data.version !== STORAGE_VERSION) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return data;
    } catch {
      return null;
    }
  }

  function clearSavedState() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function hasResumableAttempt() {
    const saved = loadSavedState();
    if (!saved || saved.status !== "in_progress") return false;
    if (!examData) return false;
    if (!Array.isArray(saved.answers) || saved.answers.length !== examData.questions.length) {
      return false;
    }
    if (Array.isArray(saved.listened) && saved.listened.length !== examData.questions.length) {
      return false;
    }
    return typeof saved.remainingSeconds === "number" && saved.remainingSeconds > 0;
  }

  /* ---------- Screens ---------- */

  function showScreen(name) {
    const map = {
      loading: els.loading,
      home: els.home,
      exam: els.exam,
      results: els.results,
    };
    Object.entries(map).forEach(([key, el]) => {
      const active = key === name;
      el.hidden = !active;
      el.classList.toggle("screen-active", active);
    });
    els.timerChip.hidden = name !== "exam";
  }

  /* ---------- Utils ---------- */

  function formatTime(totalSec) {
    const s = Math.max(0, Math.floor(totalSec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  }

  function showToast(message, ms = 2600) {
    els.toast.textContent = message;
    els.toast.hidden = false;
    requestAnimationFrame(() => els.toast.classList.add("show"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      els.toast.classList.remove("show");
      setTimeout(() => {
        els.toast.hidden = true;
      }, 300);
    }, ms);
  }

  function openModal({ title, message, confirmLabel = "Conferma", onConfirm }) {
    els.modalTitle.textContent = title;
    els.modalMessage.textContent = message;
    els.modalConfirm.textContent = confirmLabel;
    pendingConfirmAction = onConfirm;
    els.confirmModal.hidden = false;
    els.modalConfirm.focus();
  }

  function closeModal() {
    els.confirmModal.hidden = true;
    pendingConfirmAction = null;
  }

  function answeredCount() {
    return state.answers.filter((a) => a !== null && a !== undefined).length;
  }

  function isAnswered(index) {
    return state.answers[index] !== null && state.answers[index] !== undefined;
  }

  /* ---------- Home ---------- */

  function renderHome() {
    const { exam, questions } = examData;
    const totalMarks = questions.length * (exam.marksPerQuestion || 1);

    els.examTitle.textContent = exam.title;
    els.examDescription.textContent = exam.description;
    els.metaQuestions.textContent = String(questions.length);
    els.metaMarks.textContent = String(totalMarks);
    els.metaDuration.textContent = `${exam.durationMinutes} min`;
    els.metaPass.textContent = `${exam.passPercentage}%`;
    els.preventSkipToggle.checked = exam.preventSkip !== false;

    const resumable = hasResumableAttempt();
    els.btnResume.hidden = !resumable;
    els.resumeHint.hidden = !resumable;
    els.btnStart.textContent = resumable ? "Ricomincia" : "Inizia l'esame";
  }

  /* ---------- Exam UI ---------- */

  function buildDots() {
    els.questionDots.innerHTML = "";
    examData.questions.forEach((_, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "dot";
      btn.textContent = String(i + 1);
      btn.setAttribute("aria-label", `Vai alla domanda ${i + 1}`);
      btn.addEventListener("click", () => tryGoTo(i));
      els.questionDots.appendChild(btn);
    });
  }

  function updateDots() {
    $$(".dot", els.questionDots).forEach((dot, i) => {
      dot.classList.toggle("current", i === state.currentIndex);
      dot.classList.toggle("answered", isAnswered(i));
      dot.setAttribute("aria-current", i === state.currentIndex ? "step" : "false");
    });
  }

  function updateProgress() {
    const total = examData.questions.length;
    const current = state.currentIndex + 1;
    const answered = answeredCount();
    const pct = (current / total) * 100;

    els.progressLabel.textContent = `Domanda ${current} di ${total}`;
    els.answeredCount.textContent = `${answered} risposte`;
    els.progressFill.style.width = `${pct}%`;
    els.progressFill.setAttribute("aria-valuenow", String(Math.round(pct)));
  }

  function renderChoices(question) {
    const letters = ["A", "B", "C", "D"];
    els.choicesFieldset.innerHTML = "";

    const legend = document.createElement("legend");
    legend.className = "visually-hidden";
    legend.textContent = "Opzioni di risposta";
    els.choicesFieldset.appendChild(legend);

    question.choices.forEach((text, i) => {
      const id = `choice-${question.id}-${i}`;
      const label = document.createElement("label");
      label.className = "choice";
      label.htmlFor = id;

      const input = document.createElement("input");
      input.type = "radio";
      input.name = `q-${question.id}`;
      input.id = id;
      input.value = String(i);
      input.checked = state.answers[state.currentIndex] === i;
      input.addEventListener("change", () => {
        state.answers[state.currentIndex] = i;
        saveState();
        updateDots();
        updateProgress();
        updateNavButtons();
      });

      const letter = document.createElement("span");
      letter.className = "choice-letter";
      letter.setAttribute("aria-hidden", "true");
      letter.textContent = letters[i] || String(i + 1);

      const span = document.createElement("span");
      span.className = "choice-text";
      span.textContent = text;

      label.append(input, letter, span);
      els.choicesFieldset.appendChild(label);
    });
  }

  function loadAudio(src) {
    const audio = els.examAudio;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    audio.src = src;
    audio.setAttribute("controlsList", "nodownload noplaybackrate");
    audio.oncontextmenu = (e) => e.preventDefault();
  }

  function revealQuestionIfReady() {
    const heard = !!state.listened[state.currentIndex];
    if (els.afterAudioBlock) els.afterAudioBlock.hidden = !heard;
    if (els.listenFirstHint) els.listenFirstHint.hidden = heard;
  }

  function markListened() {
    if (state.listened[state.currentIndex]) return;
    state.listened[state.currentIndex] = true;
    saveState();
    revealQuestionIfReady();
  }

  function renderQuestion() {
    const q = examData.questions[state.currentIndex];
    const n = state.currentIndex + 1;

    els.questionBadge.textContent = `D${n}`;
    els.questionPrompt.textContent = q.prompt || "Ascolta l'audio e scegli la risposta migliore.";
    loadAudio(q.audio);
    renderChoices(q);
    revealQuestionIfReady();
    updateProgress();
    updateDots();
    updateNavButtons();

    const card = $(".question-card");
    if (card) {
      card.classList.remove("fade-in");
      void card.offsetWidth;
      card.classList.add("fade-in");
    }
  }

  function updateNavButtons() {
    const last = state.currentIndex === examData.questions.length - 1;
    els.btnPrev.disabled = state.currentIndex === 0;
    els.btnNext.textContent = last ? "Rivedi e invia" : "Successiva";
  }

  function canLeaveQuestion(fromIndex, toIndex) {
    if (!state.preventSkip) return true;
    if (toIndex < fromIndex) return true; // always allow going back
    if (isAnswered(fromIndex)) return true;
    // Allow jumping only to answered questions or the next unanswered in order
    if (toIndex > fromIndex + 1) {
      for (let i = 0; i < toIndex; i++) {
        if (!isAnswered(i)) return false;
      }
    }
    return isAnswered(fromIndex) || toIndex === fromIndex;
  }

  function tryGoTo(index) {
    if (index < 0 || index >= examData.questions.length) return;
    if (index === state.currentIndex) return;

    if (state.preventSkip && index > state.currentIndex && !isAnswered(state.currentIndex)) {
      showToast("Seleziona una risposta prima di continuare.");
      return;
    }

    if (!state.listened[state.currentIndex] && index > state.currentIndex) {
      showToast("Ascolta prima l'audio.");
      return;
    }

    if (state.preventSkip && index > state.currentIndex + 1) {
      for (let i = 0; i < index; i++) {
        if (!isAnswered(i)) {
          showToast("Rispondi prima alle domande precedenti.");
          return;
        }
      }
    }

    if (!canLeaveQuestion(state.currentIndex, index) && index > state.currentIndex) {
      showToast("Seleziona una risposta prima di continuare.");
      return;
    }

    state.currentIndex = index;
    saveState();
    renderQuestion();
  }

  function goNext() {
    const last = state.currentIndex === examData.questions.length - 1;
    if (!state.listened[state.currentIndex]) {
      showToast("Ascolta prima l'audio.");
      return;
    }
    if (last) {
      requestSubmit();
      return;
    }
    if (state.preventSkip && !isAnswered(state.currentIndex)) {
      showToast("Seleziona una risposta prima di continuare.");
      return;
    }
    state.currentIndex += 1;
    saveState();
    renderQuestion();
  }

  function goPrev() {
    if (state.currentIndex === 0) return;
    state.currentIndex -= 1;
    saveState();
    renderQuestion();
  }

  /* ---------- Timer ---------- */

  function updateTimerUI() {
    els.timerDisplay.textContent = formatTime(state.remainingSeconds);
    els.timerChip.classList.toggle("warning", state.remainingSeconds <= 120 && state.remainingSeconds > 60);
    els.timerChip.classList.toggle("danger", state.remainingSeconds <= 60);
    els.timerChip.setAttribute(
      "aria-label",
      `Tempo rimanente ${formatTime(state.remainingSeconds)}`
    );
  }

  function stopTimer() {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function startTimer() {
    stopTimer();
    updateTimerUI();
    let warnedAtMinute = false;
    let warnedAtThirty = false;

    timerId = setInterval(() => {
      state.remainingSeconds -= 1;
      updateTimerUI();
      if (state.remainingSeconds % 5 === 0) saveState();

      // Countdown warnings
      if (state.remainingSeconds === 60 && !warnedAtMinute) {
        warnedAtMinute = true;
        showToast("Resta 1 minuto.");
      }
      if (state.remainingSeconds === 30 && !warnedAtThirty) {
        warnedAtThirty = true;
        showToast("Restano 30 secondi!");
      }

      if (state.remainingSeconds <= 0) {
        state.remainingSeconds = 0;
        updateTimerUI();
        stopTimer();
        showToast("Tempo scaduto — invio dell'esame in corso.");
        finalizeExam(true);
      }
    }, 1000);
  }

  /* ---------- Scoring / Submit ---------- */

  function computeResults() {
    const questions = examData.questions;
    const marksEach = examData.exam.marksPerQuestion || 1;
    let correct = 0;
    const detail = questions.map((q, i) => {
      const user = state.answers[i];
      const ok = user === q.correct;
      if (ok) correct += 1;
      return {
        id: q.id,
        prompt: q.prompt,
        audio: q.audio,
        choices: q.choices,
        correctIndex: q.correct,
        userIndex: user,
        isCorrect: ok,
      };
    });

    const total = questions.length;
    const score = correct * marksEach;
    const maxScore = total * marksEach;
    const percentage = total ? Math.round((correct / total) * 100) : 0;
    const passed = percentage >= (examData.exam.passPercentage || 60);
    const elapsed = Math.max(0, state.totalSeconds - state.remainingSeconds);

    return { correct, wrong: total - correct, score, maxScore, percentage, passed, elapsed, detail };
  }

  function requestSubmit() {
    const unanswered = examData.questions.length - answeredCount();

    if (answeredCount() === 0) {
      openModal({
        title: "Nessuna risposta selezionata",
        message: "Non hai selezionato nessuna risposta. Inviare comunque? Tutte le domande verranno considerate errate.",
        confirmLabel: "Invia comunque",
        onConfirm: () => finalizeExam(false),
      });
      return;
    }

    if (unanswered > 0) {
      openModal({
        title: "Domande senza risposta",
        message: `Hai ${unanswered} domand${unanswered === 1 ? "a" : "e"} senza risposta. Inviare comunque?`,
        confirmLabel: "Invia",
        onConfirm: () => finalizeExam(false),
      });
      return;
    }

    openModal({
      title: "Inviare l'esame?",
      message: "Hai risposto a tutte le domande. Vuoi inviare?",
      confirmLabel: "Invia",
      onConfirm: () => finalizeExam(false),
    });
  }

  function finalizeExam(auto = false) {
    closeModal();
    stopTimer();
    state.status = "completed";
    state.results = computeResults();
    clearSavedState();
    renderResults(auto);
    showScreen("results");
  }

  function renderResults(autoSubmitted) {
    const r = state.results;
    els.resultsVerdict.textContent = r.passed ? "✓ Superato" : "✗ Non superato";
    els.resultsVerdict.className = `verdict ${r.passed ? "pass" : "fail"}`;
    els.resultsPercent.textContent = `${r.percentage}%`;
    els.resultsScore.textContent = `${r.score} / ${r.maxScore}`;
    els.resultsCorrect.textContent = String(r.correct);
    els.resultsWrong.textContent = String(r.wrong);
    els.resultsTime.textContent = formatTime(r.elapsed);

    const circumference = 2 * Math.PI * 52;
    const offset = circumference * (1 - r.percentage / 100);
    els.scoreRingFg.style.strokeDasharray = String(circumference);
    els.scoreRingFg.style.strokeDashoffset = String(circumference);
    els.scoreRingFg.classList.toggle("pass", r.passed);
    els.scoreRingFg.classList.toggle("fail", !r.passed);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        els.scoreRingFg.style.strokeDashoffset = String(offset);
      });
    });

    els.reviewSection.hidden = true;
    if (autoSubmitted) {
      showToast("Tempo scaduto. Le tue risposte sono state inviate.");
    }
  }

  function renderReview() {
    const r = state.results;
    els.reviewList.innerHTML = "";

    const summary = document.createElement("p");
    summary.className = "hint";
    summary.style.textAlign = "left";
    summary.style.marginBottom = "1rem";
    summary.textContent = `Rivedi le ${r.detail.length} domande qui sotto. Il verde indica le risposte corrette; il rosso quelle errate o non date.`;
    els.reviewList.appendChild(summary);

    r.detail.forEach((item, i) => {
      const card = document.createElement("article");
      card.className = `review-card ${item.isCorrect ? "correct" : "wrong"}`;
      card.style.animationDelay = `${Math.min(i * 40, 400)}ms`;
      card.setAttribute("aria-label", `Domanda ${i + 1}, ${item.isCorrect ? "corretta" : "errata"}`);

      const userText =
        item.userIndex === null || item.userIndex === undefined
          ? "Nessuna risposta"
          : item.choices[item.userIndex];
      const correctText = item.choices[item.correctIndex];

      card.innerHTML = `
        <h3>Domanda ${i + 1}</h3>
        <p>${escapeHtml(item.prompt || "Ascolta e scegli la risposta migliore.")}</p>
        <div class="audio-block">
          <label class="audio-label">Audio</label>
          <audio class="audio-player" controls controlsList="nodownload noplaybackrate" preload="none" src="${escapeAttr(item.audio)}"></audio>
        </div>
        <div class="review-meta">
          <span class="tag ${item.isCorrect ? "tag-ok" : "tag-bad"}">
            ${item.isCorrect ? "Corretta" : "Errata"}
          </span>
          <span class="tag tag-neutral">La tua risposta: ${escapeHtml(userText)}</span>
          <span class="tag tag-ok">Risposta corretta: ${escapeHtml(correctText)}</span>
        </div>
      `;

      const audio = $("audio", card);
      if (audio) audio.oncontextmenu = (e) => e.preventDefault();

      els.reviewList.appendChild(card);
    });

    els.reviewSection.hidden = false;
    els.reviewSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }

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

  /* ---------- Session lifecycle ---------- */

  function initFreshExam() {
    const minutes = examData.exam.durationMinutes || 15;
    state.currentIndex = 0;
    state.answers = examData.questions.map(() => null);
    state.listened = examData.questions.map(() => false);
    state.totalSeconds = minutes * 60;
    state.remainingSeconds = state.totalSeconds;
    state.startedAt = Date.now();
    state.preventSkip = els.preventSkipToggle.checked;
    state.status = "in_progress";
    state.results = null;
    clearSavedState();
    saveState();
  }

  function restoreExam(saved) {
    state.currentIndex = Math.min(saved.currentIndex || 0, examData.questions.length - 1);
    state.answers = saved.answers;
    state.listened = Array.isArray(saved.listened)
      ? saved.listened
      : examData.questions.map((_, i) => state.answers[i] !== null);
    state.remainingSeconds = saved.remainingSeconds;
    state.totalSeconds = saved.totalSeconds || examData.exam.durationMinutes * 60;
    state.startedAt = saved.startedAt || Date.now();
    state.preventSkip =
      typeof saved.preventSkip === "boolean" ? saved.preventSkip : els.preventSkipToggle.checked;
    els.preventSkipToggle.checked = state.preventSkip;
    state.status = "in_progress";
    state.results = null;
  }

  function beginExam(resume = false) {
    const saved = loadSavedState();
    if (resume && saved && hasResumableAttempt()) {
      restoreExam(saved);
    } else {
      if (resume === false && saved) {
        // Start over
      }
      initFreshExam();
    }

    buildDots();
    showScreen("exam");
    renderQuestion();
    startTimer();
    showToast(resume ? "Esame ripreso." : "Esame iniziato. Buona fortuna!");
  }

  function resetToHome() {
    stopTimer();
    state.status = "idle";
    state.results = null;
    showScreen("home");
    renderHome();
  }

  /* ---------- Keyboard ---------- */

  function onKeyDown(e) {
    if (!els.confirmModal.hidden) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeModal();
      }
      return;
    }

    if (els.exam.hidden) return;

    const tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "AUDIO") {
      // Allow number keys only when not typing elsewhere — radios are inputs,
      // so handle choice shortcuts carefully.
    }

    if (e.key === "ArrowRight" || (e.key === "Enter" && e.ctrlKey)) {
      e.preventDefault();
      goNext();
      return;
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      goPrev();
      return;
    }

    // 1–4 select choices
    if (/^[1-4]$/.test(e.key) && document.activeElement?.tagName !== "INPUT") {
      const idx = Number(e.key) - 1;
      const radios = $$('input[type="radio"]', els.choicesFieldset);
      if (radios[idx]) {
        radios[idx].checked = true;
        radios[idx].dispatchEvent(new Event("change", { bubbles: true }));
        radios[idx].focus();
      }
    }
  }

  /* ---------- Events ---------- */

  function bindEvents() {
    els.themeToggle.addEventListener("click", toggleTheme);
    els.btnStart.addEventListener("click", () => {
      if (hasResumableAttempt()) {
        openModal({
          title: "Iniziare un nuovo esame?",
          message: "Il progresso salvato verrà eliminato e ripartirai dall'inizio.",
          confirmLabel: "Ricomincia",
          onConfirm: () => {
            clearSavedState();
            closeModal();
            beginExam(false);
          },
        });
      } else {
        beginExam(false);
      }
    });
    els.btnResume.addEventListener("click", () => beginExam(true));
    els.btnPrev.addEventListener("click", goPrev);
    els.btnNext.addEventListener("click", goNext);
    els.btnSubmitEarly.addEventListener("click", requestSubmit);
    els.btnReview.addEventListener("click", renderReview);
    els.btnRetake.addEventListener("click", () => {
      clearSavedState();
      beginExam(false);
    });
    els.btnBackHome.addEventListener("click", resetToHome);
    els.preventSkipToggle.addEventListener("change", () => {
      state.preventSkip = els.preventSkipToggle.checked;
      if (state.status === "in_progress") saveState();
    });

    // Reveal question only after the learner starts listening
    els.examAudio.addEventListener("play", markListened);

    els.modalConfirm.addEventListener("click", () => {
      const action = pendingConfirmAction;
      closeModal();
      if (typeof action === "function") action();
    });

    $$("[data-close-modal]").forEach((el) => {
      el.addEventListener("click", closeModal);
    });

    document.addEventListener("keydown", onKeyDown);

    // Persist on tab hide
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") saveState();
    });
    window.addEventListener("beforeunload", () => saveState());
  }

  /* ---------- Boot ---------- */

  async function init() {
    applyTheme(getPreferredTheme());
    bindEvents();

    try {
      const res = await fetch(DATA_URL);
      if (!res.ok) throw new Error(`Impossibile caricare le domande (${res.status})`);
      examData = await res.json();

      if (!examData.questions || !examData.questions.length) {
        throw new Error("Nessuna domanda trovata nel file dati.");
      }

      renderHome();

      // Auto-resume if an attempt is in progress
      if (hasResumableAttempt()) {
        showScreen("home");
        showToast("Trovato un esame non concluso — riprendi o ricomincia.");
      } else {
        showScreen("home");
      }
    } catch (err) {
      console.error(err);
      els.loading.innerHTML = `
        <div class="card card-narrow">
          <h1>Impossibile caricare l'esame</h1>
          <p class="lead">${escapeHtml(err.message || "Errore sconosciuto")}</p>
          <p class="hint">Se hai aperto il file direttamente, avvia un server HTTP locale (vedi README).</p>
        </div>`;
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
