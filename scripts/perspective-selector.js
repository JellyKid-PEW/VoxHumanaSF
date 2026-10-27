// perspective-selector.js
// ─────────────────────────────────────────────────────────────────────────
// Builds the character-lens switcher into [data-lens-dock] — "Crew Rail"
// (concept D): a quiet vertical edge-rail pinned to the left margin. Resting
// state is colored signal-bars + initials; the full name slides out on hover;
// the selected lens collapses to a single lit bar.
// Include AFTER voices.js and page-chrome.js:
//   <script src="scripts/voices.js"></script>
//   <script src="scripts/page-chrome.js"></script>
//   <script src="scripts/perspective-selector.js"></script>
//
// It is purely a *view*: all state still flows through page-chrome.js. Clicks
// call window.VoxPerspective.set(); the control re-syncs from the
// `perspectivechange` event page-chrome emits. So localStorage persistence,
// the accent CSS variables, the seal swaps and every other page stay in
// lockstep with no extra wiring — and page-chrome.js is untouched.
//
// Voice data (name, role, signal color, selectable) comes from window.Vox.

(function () {
  "use strict";

  function build() {
    var Vox = window.Vox;
    var P = window.VoxPerspective;
    if (!Vox || !P) {
      console.error("[perspective-selector] needs voices.js + page-chrome.js loaded first");
      return;
    }
    var dock = document.querySelector("[data-lens-dock]");
    if (!dock) return;

    var keys = Vox.keys(); // display order, includes reserved (Nova)

    // First alphabetic character of the name → rail initial (Q, I, B, N).
    function initialOf(v) {
      var m = (v.name || "").replace(/[^A-Za-z]/g, "");
      return (m.charAt(0) || "?").toUpperCase();
    }

    var rail = document.createElement("div");
    rail.className = "lens-rail";
    rail.setAttribute("role", "radiogroup");
    rail.setAttribute("aria-label", "Perspective");

    var label = document.createElement("span");
    label.className = "lens-rail-label";
    // Label text is per-page: <nav data-lens-dock data-lens-label="Attention">.
    label.textContent = (dock.dataset && dock.dataset.lensLabel) || "Lens";
    rail.appendChild(label);

    // Optional supporting line under the label, opt-in per page:
    // <nav data-lens-dock data-lens-hint="Choose perspective">.
    if (dock.dataset && dock.dataset.lensHint) {
      var hint = document.createElement("span");
      hint.className = "lens-rail-hint";
      hint.textContent = dock.dataset.lensHint;
      rail.appendChild(hint);
    }

    keys.forEach(function (k) {
      var v = Vox.get(k);
      var sel = !!v.selectable;
      var b = document.createElement("button");
      b.type = "button";
      b.className = "lens-item" + (sel ? "" : " locked");
      b.dataset.key = k;
      b.style.setProperty("--c", v.signal);
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", "false");
      var aria = v.name + (sel ? " · " + (v.role || "") : " · not yet available");
      b.setAttribute("aria-label", aria);
      b.title = aria;
      if (!sel) { b.disabled = true; b.setAttribute("aria-disabled", "true"); }

      // order for a rail on the queue's LEFT edge: initial · bar (bar nearest
      // the queue). The name is an absolutely-positioned tooltip (CSS).
      var ini = document.createElement("span");
      ini.className = "lens-ini";
      ini.textContent = initialOf(v);

      var bar = document.createElement("span");
      bar.className = "lens-bar";

      var meta = document.createElement("span");
      meta.className = "lens-meta";
      meta.innerHTML = "<b></b><i></i>";
      meta.querySelector("b").textContent = v.name;
      meta.querySelector("i").textContent = sel ? (v.role || "") : "Reserved";

      b.appendChild(ini);
      b.appendChild(bar);
      b.appendChild(meta);
      rail.appendChild(b);
    });

    dock.appendChild(rail);

    // ── Behavior ─────────────────────────────────────────────────────
    function choose(k) {
      var v = Vox.get(k);
      if (v && v.selectable) P.set(k); // page-chrome does the rest + emits event
    }

    rail.querySelectorAll(".lens-item").forEach(function (b) {
      b.addEventListener("click", function () { if (!b.disabled) choose(b.dataset.key); });
    });

    // Radio-group keys: arrows move to the next available voice and select
    // it (reserved voices are skipped). Tab still reaches every button.
    rail.addEventListener("keydown", function (e) {
      var keysNext = ["ArrowDown", "ArrowRight"], keysPrev = ["ArrowUp", "ArrowLeft"];
      if (keysNext.indexOf(e.key) < 0 && keysPrev.indexOf(e.key) < 0) return;
      var items = Array.prototype.filter.call(rail.querySelectorAll(".lens-item"), function (b) { return !b.disabled; });
      var at = items.indexOf(document.activeElement);
      if (at < 0) return;
      e.preventDefault();
      var step = keysNext.indexOf(e.key) >= 0 ? 1 : -1;
      var nextBtn = items[(at + step + items.length) % items.length];
      nextBtn.focus();
      choose(nextBtn.dataset.key);
    });

    // ── Sync visual state to the active perspective ──────────────────
    function sync(key) {
      var v = Vox.get(key);
      if (!v) return;
      rail.querySelectorAll(".lens-item").forEach(function (b) {
        var on = b.dataset.key === key;
        b.classList.toggle("on", on);
        b.setAttribute("aria-checked", on ? "true" : "false");
      });
    }

    sync(P.get());
    window.addEventListener("perspectivechange", function (e) {
      sync(e.detail && e.detail.perspective);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }
})();
