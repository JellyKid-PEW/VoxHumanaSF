// memory.js — the real memory client (replaces the old preview stub).
// ─────────────────────────────────────────────────────────────────────────
// ONE client for every page. It reads the SAME payloads lib/read.js produces,
// whether they are baked to static JSON (default, host-anywhere) or served
// live by api/server.js. Pages never know which.
//
// GATED VIEWS (currently only "margins"):
//   Gated content is NEVER in the public baked JSON (db/export-static.js skips
//   it). For a gated view this client calls the entitlement server
//   (margins-server) WITH CREDENTIALS. If the visitor is entitled it returns
//   the lines; otherwise it resolves to { gated:true, entitled:false } and the
//   page shows the paywall instead of the content.
//
// Include AFTER voices.js (it reuses the asset-base convention):
//   <script src="scripts/voices.js"></script>
//   <script src="scripts/memory.js"></script>
//
// Public API (kept compatible with the old stub so signal.html keeps working):
//   VoxMemory.configure({ dataBase, apiBase, marginsApiBase })
//   VoxMemory.currentState()            -> Promise<{ state, book }>
//   VoxMemory.lines(view, surface, slot) -> Promise<listing>
//   VoxMemory.manifest()                -> Promise<manifest>
//   VoxMemory.isGated(view)             -> Promise<boolean>
//   VoxMemory.sample(arr, n)            -> n random items (stable copy)
//   VoxMemory.window(arr, n, seed)      -> n items via a rotating window
// A gated, unentitled listing looks like:
//   { kind:"memory-listing", view, surface, slot, gated:true, entitled:false,
//     lines:[], state:null }
// ─────────────────────────────────────────────────────────────────────────
(function () {
  "use strict";

  function assetBase() {
    var b = document.body && document.body.dataset && document.body.dataset.assetBase;
    return b || "";
  }

  // Config is resolved lazily so a page can override before first use, and so
  // deployment targets can set window.VOX_* without editing this file.
  var CFG = null;
  function cfg() {
    if (CFG) return CFG;
    var base = assetBase();
    CFG = {
      // Static baked JSON (default). Resolved against this page's depth.
      dataBase: (window.VOX_DATA_BASE != null ? window.VOX_DATA_BASE : base + "data"),
      // Live read API. If set, preferred over baked JSON for PUBLIC views.
      apiBase: (window.VOX_API_BASE != null ? window.VOX_API_BASE : null),
      // Entitlement server for GATED views. Same payload shape, requires auth.
      marginsApiBase: (window.VOX_MARGINS_API != null ? window.VOX_MARGINS_API : "/margins/api"),
    };
    return CFG;
  }

  function configure(opts) {
    cfg(); // ensure base resolved
    opts = opts || {};
    // `staticBase` is an accepted alias for `dataBase` (pages use both names).
    if (opts.staticBase != null && opts.dataBase == null) opts.dataBase = opts.staticBase;
    Object.assign(CFG, opts);
  }

  function trimSlash(s) { return String(s || "").replace(/\/+$/, ""); }

  async function getJSON(url, opts) {
    var res = await fetch(url, opts);
    if (!res.ok) {
      var err = new Error("HTTP " + res.status + " for " + url);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  // ── Manifest (cached) — tells us which views are gated, what exists ──
  var _manifest = null;
  async function manifest() {
    if (_manifest) return _manifest;
    var c = cfg();
    try {
      _manifest = await getJSON(trimSlash(c.dataBase) + "/manifest.json");
    } catch (e) {
      _manifest = { kind: "memory-manifest", views: [], surfaces: [], slots: {} };
    }
    return _manifest;
  }

  async function isGated(view) {
    var m = await manifest();
    var row = (m.views || []).find(function (v) { return v.id === view; });
    return !!(row && row.gated);
  }

  // ── Current state ────────────────────────────────────────────────────
  // Prefer the live API when configured, but fall back to baked JSON so the
  // same page works on a static host where no API is reachable.
  async function currentState() {
    var c = cfg();
    var urls = [];
    if (c.apiBase) urls.push(trimSlash(c.apiBase) + "/state/current");
    urls.push(trimSlash(c.dataBase) + "/state/current.json");
    for (var i = 0; i < urls.length; i++) {
      try {
        var data = await getJSON(urls[i]);
        return { state: data.state, book: data.book };
      } catch (e) { /* try next source */ }
    }
    return { state: null, book: null };
  }

  // ── Lines for a (view, surface, slot?) ───────────────────────────────
  function staticPath(c, view, surface, slot) {
    var p = trimSlash(c.dataBase) + "/views/" + encodeURIComponent(view) +
            "/" + encodeURIComponent(surface);
    return p + (slot ? "/" + encodeURIComponent(slot) : "") + ".json";
  }
  function apiPath(baseUrl, view, surface, slot) {
    var p = trimSlash(baseUrl) + "/views/" + encodeURIComponent(view) +
            "/" + encodeURIComponent(surface);
    return p + (slot ? "/" + encodeURIComponent(slot) : "");
  }

  function emptyListing(view, surface, slot, extra) {
    return Object.assign({
      kind: "memory-listing", view: view, surface: surface,
      slot: slot || null, state: null, count: 0, lines: [],
    }, extra || {});
  }

  async function lines(view, surface, slot) {
    slot = slot || null;
    var c = cfg();

    // Gated views go to the entitlement server with credentials, never to the
    // public JSON. A 402/401 means "show the paywall", not "error".
    if (await isGated(view)) {
      // No entitlement server configured (VOX_MARGINS_API = "", e.g. a static
      // host): gated views are simply locked; nothing is requested.
      if (!c.marginsApiBase) return emptyListing(view, surface, slot, { gated: true, entitled: false });
      try {
        var url = apiPath(c.marginsApiBase, view, surface, slot);
        var data = await getJSON(url, { credentials: "include" });
        return Object.assign({ gated: true, entitled: true }, data);
      } catch (e) {
        if (e.status === 402 || e.status === 401) {
          return emptyListing(view, surface, slot, { gated: true, entitled: false });
        }
        return emptyListing(view, surface, slot, { gated: true, entitled: false, error: true });
      }
    }

    // Public views: try the live API first (if configured), then fall back to
    // the baked JSON. This makes the same page work both in local dev (API up)
    // and on a static host (API absent) with no per-page changes.
    var urls = [];
    if (c.apiBase) urls.push(apiPath(c.apiBase, view, surface, slot));
    urls.push(staticPath(c, view, surface, slot));
    for (var i = 0; i < urls.length; i++) {
      try { return await getJSON(urls[i]); }
      catch (e) { /* try next source */ }
    }
    return emptyListing(view, surface, slot, { error: true });
  }

  // ── Reader-page helpers (per-visit variation; source-agnostic) ───────
  function sample(arr, n) {
    var a = (arr || []).slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a.slice(0, Math.max(0, n));
  }
  // Deterministic rotating window — stable within a visit, advances by seed.
  function windowOf(arr, n, seed) {
    var a = arr || [];
    if (!a.length || n <= 0) return [];
    var start = ((seed || 0) % a.length + a.length) % a.length;
    var out = [];
    for (var i = 0; i < Math.min(n, a.length); i++) out.push(a[(start + i) % a.length]);
    return out;
  }

  window.VoxMemory = {
    configure: configure,
    currentState: currentState,
    lines: lines,
    manifest: manifest,
    isGated: isGated,
    sample: sample,
    window: windowOf,
  };
})();
