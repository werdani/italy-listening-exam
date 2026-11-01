/**
 * Landing testimonials slider — prev/next, dots, autoplay, swipe.
 */
(function (global) {
  "use strict";

  const AUTO_MS = 4500;
  const GAP = 14;

  function visibleCount() {
    const w = window.innerWidth;
    if (w <= 620) return 1;
    if (w <= 980) return 2;
    return 3;
  }

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function initSlider(root) {
    const viewport = root.querySelector("[data-testimonials-viewport]");
    const track = root.querySelector("[data-testimonials-track]");
    const prevBtn = root.querySelector("[data-testimonials-prev]");
    const nextBtn = root.querySelector("[data-testimonials-next]");
    const dotsWrap = root.querySelector("[data-testimonials-dots]");
    if (!viewport || !track) return;

    const slides = [...track.querySelectorAll(".testimonial")];
    if (!slides.length) return;

    let page = 0;
    let perView = visibleCount();
    let timer = null;
    let pointerId = null;
    let startX = 0;
    let deltaX = 0;
    let dragging = false;

    function pageCount() {
      return Math.max(1, Math.ceil(slides.length / perView));
    }

    function clampPage(p) {
      const total = pageCount();
      return ((p % total) + total) % total;
    }

    function apply() {
      const slideW = slides[0].getBoundingClientRect().width;
      const start = page * perView;
      const offset = start * (slideW + GAP);
      track.style.transform = `translate3d(${-offset}px, 0, 0)`;
      updateDots();
    }

    function goTo(nextPage) {
      page = clampPage(nextPage);
      apply();
    }

    function next() {
      goTo(page + 1);
    }

    function prev() {
      goTo(page - 1);
    }

    function buildDots() {
      if (!dotsWrap) return;
      dotsWrap.innerHTML = "";
      const total = pageCount();
      for (let i = 0; i < total; i += 1) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "testimonials-dot";
        btn.setAttribute("role", "tab");
        btn.setAttribute("aria-label", `Pagina recensioni ${i + 1}`);
        btn.addEventListener("click", () => {
          goTo(i);
          restartAuto();
        });
        dotsWrap.appendChild(btn);
      }
      updateDots();
    }

    function updateDots() {
      if (!dotsWrap) return;
      [...dotsWrap.children].forEach((dot, i) => {
        const active = i === page;
        dot.classList.toggle("is-active", active);
        dot.setAttribute("aria-selected", active ? "true" : "false");
      });
    }

    function stopAuto() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }

    function startAuto() {
      stopAuto();
      if (prefersReducedMotion() || pageCount() <= 1) return;
      timer = setInterval(next, AUTO_MS);
    }

    function restartAuto() {
      stopAuto();
      startAuto();
    }

    function onResize() {
      const nextPerView = visibleCount();
      if (nextPerView !== perView) {
        perView = nextPerView;
        page = Math.min(page, pageCount() - 1);
        buildDots();
      }
      apply();
    }

    function onPointerDown(e) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      pointerId = e.pointerId;
      startX = e.clientX;
      deltaX = 0;
      dragging = true;
      track.style.transition = "none";
      stopAuto();
      try {
        viewport.setPointerCapture(pointerId);
      } catch (_) {}
    }

    function onPointerMove(e) {
      if (!dragging || e.pointerId !== pointerId) return;
      deltaX = e.clientX - startX;
      const slideW = slides[0].getBoundingClientRect().width;
      const base = page * perView * (slideW + GAP);
      track.style.transform = `translate3d(${-(base - deltaX)}px, 0, 0)`;
    }

    function onPointerUp(e) {
      if (!dragging || e.pointerId !== pointerId) return;
      dragging = false;
      track.style.transition = "";
      const threshold = 48;
      if (deltaX > threshold) prev();
      else if (deltaX < -threshold) next();
      else apply();
      pointerId = null;
      deltaX = 0;
      restartAuto();
    }

    if (prevBtn) {
      prevBtn.addEventListener("click", () => {
        prev();
        restartAuto();
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener("click", () => {
        next();
        restartAuto();
      });
    }

    viewport.addEventListener("pointerdown", onPointerDown);
    viewport.addEventListener("pointermove", onPointerMove);
    viewport.addEventListener("pointerup", onPointerUp);
    viewport.addEventListener("pointercancel", onPointerUp);

    root.addEventListener("mouseenter", stopAuto);
    root.addEventListener("mouseleave", startAuto);
    root.addEventListener("focusin", stopAuto);
    root.addEventListener("focusout", (e) => {
      if (!root.contains(e.relatedTarget)) startAuto();
    });

    window.addEventListener("resize", onResize);

    buildDots();
    apply();
    startAuto();
  }

  function init() {
    document.querySelectorAll("[data-testimonials-slider]").forEach(initSlider);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  global.AscoltoTestimonials = { init };
})(typeof window !== "undefined" ? window : globalThis);
