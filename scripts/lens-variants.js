/* ─────────────────────────────────────────────────────────────────────
   lens-variants.js — the perspective Lens and its alternatives.
   PRODUCTION (index.html): <body data-lens-variant="rail-identity"> — the
   open rail under the lockup. The ORIGINAL Lens is kept intact for reuse
   elsewhere: its markup (.lens-col > nav.lens-dock in index.html) and its
   script (perspective-selector.js) still load; it shows when the variant
   is "current" (on a local host: ?lens=current).
     rail · open vertical rail between the two sides (refined original)
     seam · names set into a full-width rule under the ship's top bar
     type · open typographic block under the quote, part of the identity
   Placement comparison (iteration 5; ?lens=1|2|3|4):
     rail-identity · the open rail under the lockup, matched to its stamp
     rail-nav      · the rail in the site navigation, before the sound icon
     rail-panel    · the open rail in the Transmission panel's header
     classic       · the original vertical Lens, label on one line
   Choosing one for production: set data-lens-variant="…" on <body>.
   Previewing: on a local host only (localhost, 127.0.0.1, *.localhost,
   *.test) add ?lens=<name> (or 1|2|3). Public hosts
   ignore the parameter, so visitors never get an interface-style setting.
   All variants drive the same state (window.VoxPerspective) and are ARIA
   radio groups: Tab reaches the group, arrows move and select, Space/Enter
   or a click/tap selects.
   ───────────────────────────────────────────────────────────────────── */
(function lensVariants() {
  "use strict";
  const body = document.body;
  const host = location.hostname;
  const isDevHost = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(host) || /\.(localhost|test)$/.test(host);
  // 1/2/3/4 = the current placement comparison (iteration 5).
  const alias = { 1: "rail-identity", 2: "rail-nav", 3: "classic", 4: "rail-panel" };
  let q = new URLSearchParams(location.search).get("lens");
  q = alias[q] || q;
  const known = /^(rail|seam|type|rail-identity|rail-nav|rail-panel|classic|current)$/;
  const variant = (isDevHost && known.test(q || "")) ? q : (known.test(body.dataset.lensVariant || "") ? body.dataset.lensVariant : "current");
  body.dataset.lensVariant = variant;
  // "classic" is the original vertical Lens (perspective-selector.js) with a
  // CSS-only label change, so there is nothing to build.
  if (variant === "current" || variant === "classic") return;

  const P = window.VoxPerspective, Vox = window.Vox;
  if (!P || !Vox) return;
  const keys = Vox.keys().filter((k) => Vox.get(k).selectable);
  const v = (k) => Vox.get(k);
  const initial = (k) => ((v(k).name || "").replace(/[^A-Za-z]/g, "").charAt(0) || "?").toUpperCase();
  const esc = (s) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // Shared radio-group behaviour for every variant.
  function wireGroup(root) {
    const items = [...root.querySelectorAll('[role="radio"]')];
    items.forEach((b) => b.addEventListener("click", () => P.set(b.dataset.key)));
    root.addEventListener("keydown", (e) => {
      const at = items.indexOf(document.activeElement);
      if (at < 0) return;
      let n = null;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") n = items[(at + 1) % items.length];
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") n = items[(at - 1 + items.length) % items.length];
      else if (e.key === "Home") n = items[0];
      else if (e.key === "End") n = items[items.length - 1];
      if (n) { e.preventDefault(); n.focus(); P.set(n.dataset.key); }
    });
    function sync(k) {
      items.forEach((b) => {
        const on = b.dataset.key === k;
        b.setAttribute("aria-checked", on ? "true" : "false");
        b.tabIndex = on ? 0 : -1;
        b.classList.toggle("on", on);
      });
      root.style.setProperty("--sel", v(k) ? v(k).signal : "currentColor");
    }
    sync(P.get());
    window.addEventListener("perspectivechange", (e) => sync(e.detail.perspective));
  }
  const ariaFor = (k) => `${esc(v(k).name)}, ${esc(v(k).role || "")}`;

  // ── open rail: one builder, three placements ───────────────────────
  //   rail          · between the halves (vertical; horizontal once stacked)
  //   rail-identity · under the VH / VOX HUMANA lockup, before the quote
  //   rail-panel    · right-aligned in the Transmission panel's fixed header
  function buildRail(extraClass, invite) {
    const el = document.createElement("div");
    el.className = "lr" + (extraClass ? " " + extraClass : "");
    el.setAttribute("role", "radiogroup");
    el.setAttribute("aria-labelledby", "lr-k");
    el.innerHTML = `
      <div class="lr-head"><span class="lr-k" id="lr-k">Lens</span><span class="lr-invite">${esc(invite)}</span></div>
      <div class="lr-line">
        ${keys.map((k) => `
          <button type="button" role="radio" class="lr-item" data-key="${k}" style="--c:${v(k).signal}" aria-label="${ariaFor(k)}">
            <span class="lr-text" aria-hidden="true"><span class="lr-name">${esc(v(k).name)}</span><span class="lr-role">${esc(v(k).role)}</span></span>
            <span class="lr-ini" aria-hidden="true">${initial(k)}</span>
            <span class="lr-mark" aria-hidden="true"></span>
          </button>`).join("")}
      </div>`;
    // The hover fill's glow follows the pointer across a station (--mx);
    // CSS eases it, so the light drifts after the cursor rather than snapping.
    el.querySelectorAll(".lr-item").forEach((b) => {
      const track = (e) => {
        const r = b.getBoundingClientRect();
        if (!r.width) return;
        const x = Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100));
        b.style.setProperty("--mx", x.toFixed(1) + "%");
      };
      b.addEventListener("pointerenter", track);
      b.addEventListener("pointermove", track);
    });
    return el;
  }

  if (variant === "rail") {
    const col = document.querySelector(".lens-col");
    if (!col) return;
    const el = buildRail("", "Choose perspective");
    col.appendChild(el);
    wireGroup(el);
    // Horizontal form once the layout stacks (same breakpoint as the CSS).
    const mq = window.matchMedia("(max-width: 1079px)");
    const orient = () => el.classList.toggle("lr--h", mq.matches);
    orient();
    if (mq.addEventListener) mq.addEventListener("change", orient); else mq.addListener(orient);
  }

  if (variant === "rail-identity") {
    const brand = document.querySelector(".identity .brand");
    if (!brand) return;
    const el = buildRail("lr--h lr--identity", "Choose perspective");
    brand.insertAdjacentElement("afterend", el);
    wireGroup(el);
  }

  // In the site navigation, between Support and the sound icon. The nav's
  // bottom rule doubles as the rail's hairline (see home.css §13).
  if (variant === "rail-nav") {
    const sound = document.querySelector(".sn-list > li.sn-sound");
    if (!sound) return;
    const li = document.createElement("li");
    li.className = "sn-lens";
    li.innerHTML = `
      <div class="lnv" role="radiogroup" aria-label="Lens: choose perspective" title="Choose perspective">
        <span class="lnv-k" aria-hidden="true">Lens</span>
        ${keys.map((k) => `
          <button type="button" role="radio" class="lnv-item" data-key="${k}" style="--c:${v(k).signal}" aria-label="${ariaFor(k)}">
            <span class="lnv-tick" aria-hidden="true"></span>
            <span class="lnv-name" aria-hidden="true">${esc(v(k).name)}</span>
            <span class="lnv-role" aria-hidden="true">${esc(v(k).role)}</span>
          </button>`).join("")}
      </div>`;
    sound.insertAdjacentElement("beforebegin", li);
    wireGroup(li.querySelector(".lnv"));
  }

  if (variant === "rail-panel") {
    const head = document.querySelector("#queue .queue-head");
    if (!head) return;
    // Says plainly that this changes the whole site, not just the chapter.
    const el = buildRail("lr--h lr--panel", "Choose perspective for the whole site");
    head.appendChild(el);
    wireGroup(el);
  }

  // ── 2 · seam under the top bar ─────────────────────────────────────
  if (variant === "seam") {
    const topbar = document.querySelector(".topbar");
    if (!topbar) return;
    const el = document.createElement("div");
    el.className = "lsm";
    el.setAttribute("role", "radiogroup");
    el.setAttribute("aria-labelledby", "lsm-k");
    el.innerHTML = `
      <span class="lsm-k"><span id="lsm-k">Lens</span><span class="lsm-invite">choose perspective</span></span>
      ${keys.map((k) => `
        <button type="button" role="radio" class="lsm-item" data-key="${k}" style="--c:${v(k).signal}" aria-label="${ariaFor(k)}">
          <span class="lsm-tick" aria-hidden="true"></span>
          <span class="lsm-name" aria-hidden="true">${esc(v(k).name)}</span>
          <span class="lsm-role" aria-hidden="true">${esc(v(k).role)}</span>
        </button>`).join("")}`;
    topbar.insertAdjacentElement("afterend", el);
    wireGroup(el);
  }

  // ── 3 · open typographic block under the quote ─────────────────────
  if (variant === "type") {
    const hero = document.querySelector(".identity .brand-hero");
    if (!hero) return;
    const el = document.createElement("div");
    el.className = "lt";
    el.setAttribute("role", "radiogroup");
    el.setAttribute("aria-labelledby", "lt-k");
    el.innerHTML = `
      <div class="lt-k"><span id="lt-k">Lens</span><span class="lt-invite">choose perspective</span></div>
      <div class="lt-grid">
        ${keys.map((k) => `
          <button type="button" role="radio" class="lt-item" data-key="${k}" style="--c:${v(k).signal}" aria-label="${ariaFor(k)}">
            <span class="lt-rule" aria-hidden="true"></span>
            <span class="lt-name" aria-hidden="true">${esc(v(k).name)}</span>
            <span class="lt-role" aria-hidden="true">${esc(v(k).role)}</span>
          </button>`).join("")}
      </div>`;
    hero.insertAdjacentElement("afterend", el);
    wireGroup(el);
  }
})();
