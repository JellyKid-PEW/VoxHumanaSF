/* ─────────────────────────────────────────────────────────────────────
   Vox Humana — index interface glue
   Used only by index.html:
     0. VoxPopover — one small manager so only one navigation popover is
        open at a time (Explore, Ship ambience, the Lens dropdown preview).
     1. Explore menu.
     2. Transmission panel — opening / queue views, each keeping its own
        scroll position.
   Remove the <script> tag (and style/home.css) to fall back to the
   original index behaviour.
   ───────────────────────────────────────────────────────────────────── */

// ── 0. Popover manager ──────────────────────────────────────────────
// register(toggle, panel, { wrap, menuKeys, onOpen, onClose }) wires a
// click-to-open popover: stays open until the visitor chooses, clicks
// elsewhere, tabs away or presses Escape (focus returns to the toggle).
window.VoxPopover = (function () {
  const all = [];
  function closeOthers(except) { all.forEach((p) => { if (p !== except) p.close(false); }); }

  function register(toggle, panel, opts = {}) {
    const wrap = opts.wrap || toggle.parentElement;
    const p = {
      isOpen: () => !panel.hidden,
      open(focusFirst) {
        if (!panel.hidden) return;
        closeOthers(p);
        panel.hidden = false;
        toggle.setAttribute('aria-expanded', 'true');
        wrap.classList.add('is-open');
        if (opts.onOpen) opts.onOpen(focusFirst);
      },
      close(returnFocus) {
        if (panel.hidden) return;
        panel.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
        wrap.classList.remove('is-open');
        if (opts.onClose) opts.onClose();
        if (returnFocus) toggle.focus();
      },
    };
    all.push(p);

    toggle.addEventListener('click', () => { if (panel.hidden) p.open(false); else p.close(false); });
    if (opts.menuKeys) {
      const items = () => [...panel.querySelectorAll(opts.menuKeys)];
      toggle.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); p.open(true); items()[0]?.focus(); }
      });
      panel.addEventListener('keydown', (e) => {
        const list = items();
        const at = list.indexOf(document.activeElement);
        let next = null;
        if (e.key === 'ArrowDown') next = list[(at + 1) % list.length];
        else if (e.key === 'ArrowUp') next = list[(at - 1 + list.length) % list.length];
        else if (e.key === 'Home') next = list[0];
        else if (e.key === 'End') next = list[list.length - 1];
        if (next) { e.preventDefault(); next.focus(); }
      });
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !panel.hidden) p.close(wrap.contains(document.activeElement));
    });
    document.addEventListener('pointerdown', (e) => { if (!wrap.contains(e.target)) p.close(false); });
    wrap.addEventListener('focusout', (e) => {
      if (e.relatedTarget && !wrap.contains(e.relatedTarget)) p.close(false);
    });
    return p;
  }
  return { register, closeAll: () => closeOthers(null) };
})();


// ── 1. Explore menu ─────────────────────────────────────────────────
(function exploreMenu() {
  const toggle = document.querySelector('.sn-toggle');
  const menu = toggle && document.getElementById(toggle.getAttribute('aria-controls'));
  if (!toggle || !menu) return;
  window.VoxPopover.register(toggle, menu, {
    wrap: toggle.closest('.sn-has-menu'),
    menuKeys: 'a',
  });
})();


// ── 2. Transmission panel views ─────────────────────────────────────
// ARIA tabs with automatic activation. Initial view comes from the
// panel's data-initial-view ("opening" | "queue"); a #queue link (the
// chapters' breadcrumb uses index.html#queue) always opens the queue.
// Each view scrolls inside the bounded panel and keeps its own position.
(function panelViews() {
  const panel = document.getElementById('queue');
  const tabs = [...document.querySelectorAll('.panel-switch [role="tab"]')];
  if (!panel || !tabs.length) return;

  const viewOf = (t) => document.getElementById(t.getAttribute('aria-controls'));
  // The element that actually scrolls in each view.
  const scrollerOf = (view) => (view && view.id === 'panel-queue' ? view.querySelector('.q-scroll') : view);
  const saved = new Map();

  function select(tab, moveFocus) {
    tabs.forEach((t) => {
      const view = viewOf(t);
      const sc = scrollerOf(view);
      if (view && !view.hidden && sc) saved.set(view.id, sc.scrollTop);
    });
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      const view = viewOf(t);
      if (view) view.hidden = !on;
    });
    const view = viewOf(tab);
    const sc = scrollerOf(view);
    if (sc && saved.has(view.id)) sc.scrollTop = saved.get(view.id);
    panel.dataset.view = tab.id === 'tab-queue' ? 'queue' : 'opening';
    if (moveFocus) tab.focus();
    // The queue's range indicator measures rows; re-measure once visible.
    if (panel.dataset.view === 'queue') window.dispatchEvent(new Event('resize'));
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => select(tab, false));
    tab.addEventListener('keydown', (e) => {
      const at = tabs.indexOf(tab);
      let next = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = tabs[(at + 1) % tabs.length];
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = tabs[(at - 1 + tabs.length) % tabs.length];
      else if (e.key === 'Home') next = tabs[0];
      else if (e.key === 'End') next = tabs[tabs.length - 1];
      if (next) { e.preventDefault(); select(next, true); }
    });
  });

  const byView = (v) => tabs.find((t) => t.id === 'tab-' + v) || tabs[0];
  function fromHash() {
    if (location.hash === '#queue') { select(byView('queue'), false); return true; }
    return false;
  }
  if (!fromHash()) select(byView(panel.dataset.initialView || 'opening'), false);
  window.addEventListener('hashchange', fromHash);
})();
