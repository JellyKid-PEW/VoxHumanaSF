// page-chrome.js
// Shared chrome for every page on the site. Include AFTER voices.js:
//   <script src="scripts/voices.js"></script>
//   <script src="scripts/page-chrome.js"></script>
// (Adjust the relative path on nested pages, e.g. ../../../scripts/…)
//
// Handles four cross-cutting concerns:
//   1. Cursor companion ring (native cursor stays visible)
//   2. Scanline / grain / vignette atmospherics (skips if already present)
//   3. Ship clock — writes SHIP TIME (UTC, see ship-time.js) into any [data-clock] element
//   4. Perspective state — reads/writes localStorage, applies CSS
//      variables, swaps [data-perspective-seal] images, toggles the
//      .psp-btn switcher's active state, and emits a `perspectivechange`
//      event on window for page-specific logic.
//
// CHANGED IN REFACTOR: the per-character table used to live here. It now
// lives in voices.js (window.Vox), the single source of truth shared by
// every page. This file only contains *behavior*.

(function () {
  "use strict";

  // voices.js must load first. Fail loud (in console) but don't crash the
  // page if it's missing — fall back to a minimal default.
  const Vox = window.Vox;
  if (!Vox) {
    console.error("[page-chrome] voices.js must be included before page-chrome.js");
  }

  const STORAGE_KEY = Vox ? Vox.STORAGE_KEY : "voxhumana-perspective";
  const DEFAULT_VOICE = Vox ? Vox.DEFAULT_VOICE : "q-vox";
  let current = DEFAULT_VOICE;

  // ── Perspective state ──────────────────────────────────────────
  //
  // To add the switcher to a page, drop this snippet anywhere (typically in
  // a small chrome bar). Buttons are wired automatically by class .psp-btn:
  //
  //   <span class="perspective" role="radiogroup" aria-label="Perspective">
  //     <button class="psp-btn psp-q-vox"   data-perspective="q-vox" ...></button>
  //     <button class="psp-btn psp-iri-six" data-perspective="iri-six" ...></button>
  //     <button class="psp-btn psp-bob"     data-perspective="bob" ...></button>
  //     <button class="psp-btn psp-nova"    data-perspective="nova" disabled aria-disabled="true" ...></button>
  //   </span>
  //
  // For a perspective-aware logo on any page, include:
  //   <img src="assets/vox-logo-q-vox.png" data-perspective-seal>
  // (On nested pages set <body data-asset-base="../../../"> once.)

  function isSelectable(key) {
    const v = Vox && Vox.get(key);
    return !!(v && v.selectable);
  }

  function applyPerspective(key) {
    const v = Vox && Vox.get(key);
    if (!v) return;
    current = key;

    // 1. CSS variables drive every accent color on every page.
    const root = document.documentElement;
    root.style.setProperty("--signal", v.signal);
    root.style.setProperty("--signal-dim", v.signalDim);
    root.setAttribute("data-perspective", key);

    // 2. Logo seals (path resolved for this page's depth via Vox.logo).
    const logoSrc = Vox.logo(key);
    document.querySelectorAll("[data-perspective-seal]").forEach((img) => {
      img.src = logoSrc;
    });

    // 3. Perspective-tagged blocks (show only the matching one).
    document.querySelectorAll("[data-perspective-show]").forEach((el) => {
      el.hidden = el.dataset.perspectiveShow !== key;
    });

    // 4. Switcher button visual state.
    document.querySelectorAll(".psp-btn").forEach((b) => {
      const on = b.dataset.perspective === key;
      b.classList.toggle("active", on);
      b.setAttribute("aria-checked", on ? "true" : "false");
    });

    // 5. Persist + broadcast (detail mirrors the voice record).
    try { localStorage.setItem(STORAGE_KEY, key); } catch (e) {}
    window.dispatchEvent(new CustomEvent("perspectivechange", {
      detail: { perspective: key, signal: v.signal, signalDim: v.signalDim, logo: logoSrc },
    }));
  }

  function setupPerspective() {
    let saved = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    // Restore saved voice only if it exists and is selectable; else default.
    applyPerspective(saved && isSelectable(saved) ? saved : DEFAULT_VOICE);

    document.querySelectorAll(".psp-btn").forEach((b) => {
      b.addEventListener("click", () => {
        if (b.disabled || b.getAttribute("aria-disabled") === "true") return;
        applyPerspective(b.dataset.perspective);
      });
    });
  }

  // Expose for ad-hoc programmatic control (kept stable for existing pages).
  window.VoxPerspective = {
    get: () => current,
    set: applyPerspective,
    list: () => (Vox ? Vox.keys() : []),
    config: (k) => (Vox ? Vox.get(k) : null),
  };

  // ── Cursor presence (companion ring; native cursor stays visible) ─
  const QUIET_CURSOR = "#panel-opening, .reader, .chapter-body, .prose, [data-cursor-quiet], textarea, [contenteditable='true']";
  function setupCursor() {
    if (window.matchMedia("(hover: none)").matches) return;
    const ring = document.createElement("div");
    ring.className = "cursor-ring";
    document.body.appendChild(ring);
    let x = -100, y = -100, tx = -100, ty = -100;
    function tick() {
      tx += (x - tx) * 0.22;
      ty += (y - ty) * 0.22;
      ring.style.transform = `translate(${tx}px, ${ty}px) translate(-50%, -50%)`;
      requestAnimationFrame(tick);
    }
    window.addEventListener("mousemove", (e) => {
      x = e.clientX; y = e.clientY;
      const el = e.target;
      if (!el) return;
      // Focusable reading panels (tabpanels with tabindex) aren't targets.
      const interactive = el.closest("a, button, input, select, [role='button'], [tabindex='0']:not([role='tabpanel'])");
      const isText = interactive && interactive.matches("input, textarea, [contenteditable='true']");
      // Quiet where someone is concentrating: over prose (the index's
      // reading panel, chapter readers, anything marked data-cursor-quiet)
      // and over text-entry fields. Links inside prose still answer.
      const reading = !interactive && el.closest(QUIET_CURSOR);
      ring.classList.toggle("over-link", !!interactive && !isText);
      ring.classList.toggle("over-text", !!isText);
      ring.classList.toggle("quiet", !!isText || !!reading);
    });
    requestAnimationFrame(tick);
  }

  // ── Atmospherics — scan + grain + vignette ─────────────────────
  function setupAtmos() {
    if (document.querySelector(".atmos")) return;
    const a = document.createElement("div");
    a.className = "atmos";
    a.innerHTML = `<div class="scan"></div><div class="grain"></div><div class="vignette"></div>`;
    document.body.appendChild(a);
  }

  // ── Time clock — drives any [data-clock] element on the page ────
  function setupClock() {
    const els = document.querySelectorAll("[data-clock]");
    if (!els.length) return;
    // Ship time is Universal time, the same for every visitor
    // (scripts/ship-time.js); the inline UTC read is a fallback only.
    function tick() {
      let time;
      if (window.VoxShipTime) time = window.VoxShipTime.clock();
      else {
        const d = new Date();
        time = [d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()].map((n) => String(n).padStart(2, "0")).join(":");
      }
      els.forEach((el) => { el.textContent = time; });
    }
    tick();
    setInterval(tick, 1000);
  }

  // ── Init on DOM ready ──────────────────────────────────────────
  function init() {
    setupAtmos();
    setupCursor();
    setupClock();
    setupPerspective();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
