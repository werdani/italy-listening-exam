/**
 * ListenLab — Listening Comprehension Exam
 * Client-side exam engine: load JSON, navigate, timer, score, persistence.
 */
(() => {
  "use strict";

  const STORAGE_KEY = "listenlab-exam-state";
  const THEME_KEY = "listenlab-theme";
  const DATA_URL = "data/questions.json";

  /** @type {{ exam: object, questions: Array }} */
  let examData = null;

  const state = {
    currentIndex: 0,
    answers: /** @type {(number|null)[]} */ ([]),
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
    els.themeToggle.setAttribute("aria-label", `Switch to ${next} mode`);
    els.themeToggle.title = `Switch to ${next} mode`;
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme") || "light";
    applyTheme(current === "dark" ? "light" : "dark");
  }

  /* ---------- Storage ---------- */

  function saveState() {
    if (state.status !== "in_progress") return;
    const payload = {
      currentIndex: state.currentIndex,
      answers: state.answers,
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
      return JSON.parse(raw);
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

  function openModal({ title, message, confirmLabel = "Confirm", onConfirm }) {
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
    els.btnStart.textContent = resumable ? "Start over" : "Start Exam";
  }

  /* ---------- Exam UI ---------- */

  function buildDots() {
    els.questionDots.innerHTML = "";
    examData.questions.forEach((_, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "dot";
      btn.textContent = String(i + 1);
      btn.setAttribute("aria-label", `Go to question ${i + 1}`);
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

    els.progressLabel.textContent = `Question ${current} of ${total}`;
    els.answeredCount.textContent = `${answered} answered`;
    els.progressFill.style.width = `${pct}%`;
    els.progressFill.setAttribute("aria-valuenow", String(Math.round(pct)));
  }

  function renderChoices(question) {
    const letters = ["A", "B", "C", "D"];
    els.choicesFieldset.innerHTML = "";

    const legend = document.createElement("legend");
    legend.className = "visually-hidden";
    legend.textContent = "Answer choices";
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
    // Discourage download via context menu where supported
    audio.setAttribute("controlsList", "nodownload noplaybackrate");
    audio.oncontextmenu = (e) => e.preventDefault();
  }

  function renderQuestion() {
    const q = examData.questions[state.currentIndex];
    const n = state.currentIndex + 1;

    els.questionBadge.textContent = `Q${n}`;
    els.questionPrompt.textContent = q.prompt || "Listen to the audio and choose the best answer.";
    loadAudio(q.audio);
    renderChoices(q);
    updateProgress();
    updateDots();
    updateNavButtons();

    // Re-trigger entrance animation
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
    els.btnNext.textContent = last ? "Review & Submit" : "Next";
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
      showToast("Please select an answer before continuing.");
      return;
    }

    if (state.preventSkip && index > state.currentIndex + 1) {
      for (let i = 0; i < index; i++) {
        if (!isAnswered(i)) {
          showToast("Answer earlier questions before skipping ahead.");
          return;
        }
      }
    }

    if (!canLeaveQuestion(state.currentIndex, index) && index > state.currentIndex) {
      showToast("Please select an answer before continuing.");
      return;
    }

    state.currentIndex = index;
    saveState();
    renderQuestion();
  }

  function goNext() {
    const last = state.currentIndex === examData.questions.length - 1;
    if (last) {
      requestSubmit();
      return;
    }
    if (state.preventSkip && !isAnswered(state.currentIndex)) {
      showToast("Please select an answer before continuing.");
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
      `Time remaining ${formatTime(state.remainingSeconds)}`
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
        showToast("1 minute remaining.");
      }
      if (state.remainingSeconds === 30 && !warnedAtThirty) {
        warnedAtThirty = true;
        showToast("30 seconds left!");
      }

      if (state.remainingSeconds <= 0) {
        state.remainingSeconds = 0;
        updateTimerUI();
        stopTimer();
        showToast("Time is up — submitting your exam.");
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
        title: "No answers selected",
        message: "You have not selected any answers. Submit anyway? This will score all questions as incorrect.",
        confirmLabel: "Submit anyway",
        onConfirm: () => finalizeExam(false),
      });
      return;
    }

    if (unanswered > 0) {
      openModal({
        title: "Unanswered questions",
        message: `You have ${unanswered} unanswered question${unanswered === 1 ? "" : "s"}. Submit anyway?`,
        confirmLabel: "Submit",
        onConfirm: () => finalizeExam(false),
      });
      return;
    }

    openModal({
      title: "Submit exam?",
      message: "You have answered every question. Ready to submit?",
      confirmLabel: "Submit",
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
    els.resultsVerdict.textContent = r.passed ? "✓ Passed" : "✗ Failed";
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
      showToast("Time expired. Your answers have been submitted.");
    }
  }

  function renderReview() {
    const r = state.results;
    els.reviewList.innerHTML = "";

    const summary = document.createElement("p");
    summary.className = "hint";
    summary.style.textAlign = "left";
    summary.style.marginBottom = "1rem";
    summary.textContent = `Review all ${r.detail.length} questions below. Green marks correct answers; red marks incorrect or unanswered items.`;
    els.reviewList.appendChild(summary);

    r.detail.forEach((item, i) => {
      const card = document.createElement("article");
      card.className = `review-card ${item.isCorrect ? "correct" : "wrong"}`;
      card.style.animationDelay = `${Math.min(i * 40, 400)}ms`;
      card.setAttribute("aria-label", `Question ${i + 1}, ${item.isCorrect ? "correct" : "incorrect"}`);

      const userText =
        item.userIndex === null || item.userIndex === undefined
          ? "No answer"
          : item.choices[item.userIndex];
      const correctText = item.choices[item.correctIndex];

      card.innerHTML = `
        <h3>Question ${i + 1}</h3>
        <p>${escapeHtml(item.prompt || "Listen and choose the best answer.")}</p>
        <div class="audio-block">
          <label class="audio-label">Audio clip</label>
          <audio class="audio-player" controls controlsList="nodownload noplaybackrate" preload="none" src="${escapeAttr(item.audio)}"></audio>
        </div>
        <div class="review-meta">
          <span class="tag ${item.isCorrect ? "tag-ok" : "tag-bad"}">
            ${item.isCorrect ? "Correct" : "Incorrect"}
          </span>
          <span class="tag tag-neutral">Your answer: ${escapeHtml(userText)}</span>
          <span class="tag tag-ok">Correct answer: ${escapeHtml(correctText)}</span>
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
    showToast(resume ? "Exam resumed." : "Exam started. Good luck!");
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
          title: "Start a new exam?",
          message: "This will discard your saved progress and start from the beginning.",
          confirmLabel: "Start over",
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
      if (!res.ok) throw new Error(`Failed to load questions (${res.status})`);
      examData = await res.json();

      if (!examData.questions || !examData.questions.length) {
        throw new Error("No questions found in data file.");
      }

      renderHome();

      // Auto-resume if an attempt is in progress
      if (hasResumableAttempt()) {
        showScreen("home");
        showToast("Unfinished exam found — resume or start over.");
      } else {
        showScreen("home");
      }
    } catch (err) {
      console.error(err);
      els.loading.innerHTML = `
        <div class="card card-narrow">
          <h1>Unable to load exam</h1>
          <p class="lead">${escapeHtml(err.message || "Unknown error")}</p>
          <p class="hint">If you opened this file directly, serve the folder over HTTP (see README).</p>
        </div>`;
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
