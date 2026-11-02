/* ═══════════════════════════════════════════════════════════════════
   VOX HUMANA — reading-progress.js
   "Continue reading": remembers where someone actually stopped reading,
   on this device only (localStorage), and offers it back on the index.

   On a chapter page (main.reader):
     · Saves nothing on arrival. A place is saved only once the reader has
       scrolled past the chapter's first few paragraphs.
     · The saved place is a stable chapter id (the file name, e.g.
       V1_B1_C03) plus a paragraph anchor: its position AND the start of
       its text, so a revised chapter still finds the right paragraph —
       by text first, then by position, else simply the chapter's start.
     · Reaching the last paragraph records that the chapter's end was
       reached (so the index can offer the next chapter). Opening a
       chapter never marks it complete.
     · Arriving with #continue scrolls to the saved paragraph.
   On the index (#resume): shows "Continue reading" only when a genuine
   saved place exists. Begin Book One and the queue stay as they are.
   Any storage failure is silent; reading never depends on it.
   ═══════════════════════════════════════════════════════════════════ */
(function readingProgress() {
  "use strict";
  var KEY = "voxhumana-reading-v1";
  var MIN_PARAGRAPH = 3; // a place counts once the reader is past this many

  function load() {
    try { var r = JSON.parse(localStorage.getItem(KEY) || "null"); return r && r.chapter ? r : null; }
    catch (e) { return null; }
  }
  function save(rec) { try { localStorage.setItem(KEY, JSON.stringify(rec)); } catch (e) {} }
  var norm = function (s) { return String(s || "").replace(/\s+/g, " ").trim(); };
  var lead = function (s) { return norm(s).slice(0, 60); };
  // Site-root-relative path of a URL ("chapters/volume1/book1/V1_B1_C03.html").
  function rootPath(href) {
    try {
      var p = new URL(href, location.href).pathname;
      var at = p.indexOf("chapters/");
      return at >= 0 ? p.slice(at) : null;
    } catch (e) { return null; }
  }

  window.VoxReading = { get: load, KEY: KEY };

  // ── Chapter pages ────────────────────────────────────────────────────
  var reader = document.querySelector("main.reader");
  if (reader) {
    var paras = Array.prototype.slice.call(reader.querySelectorAll(":scope > p"));
    var path = rootPath(location.href);
    var chapter = path ? path.replace(/^.*\//, "").replace(/\.html$/, "") : null;
    if (!chapter || !paras.length) return;
    var h1 = document.querySelector(".title-block h1, h1");
    var title = h1 ? norm(h1.textContent) : chapter;
    var nextLink = document.querySelector(".next-up a[href], nav.next-up a[href], .next-up[href]");
    var nextPath = nextLink ? rootPath(nextLink.getAttribute("href")) : null;

    var last = null, timer = null;
    // The reading line: the same 110px a restore scrolls to, so restoring
    // and then saving again never creeps forward.
    var TOP = 110;
    function current() {
      var line = Math.min(TOP + 10, window.innerHeight * 0.3);
      for (var i = 0; i < paras.length; i++) {
        if (paras[i].getBoundingClientRect().bottom > line) return i;
      }
      return paras.length - 1;
    }
    function record() {
      timer = null;
      var i = current();
      var endSeen = paras[paras.length - 1].getBoundingClientRect().bottom <= window.innerHeight;
      if (endSeen) i = paras.length - 1;
      var prev = load();
      var samePrev = prev && prev.chapter === chapter;
      // The chapter's first few paragraphs never count: arriving saves
      // nothing, and scrolling back to the top never erases a real place.
      if (i < MIN_PARAGRAPH) return;
      var rec = {
        chapter: chapter, path: path, title: title,
        anchor: { i: i, text: lead(paras[i].textContent) },
        atEnd: endSeen || !!(samePrev && prev.atEnd && i === paras.length - 1),
        next: nextPath, savedAt: Date.now(),
      };
      var sig = rec.anchor.i + "|" + rec.atEnd;
      if (sig === last) return;
      last = sig;
      save(rec);
    }
    var schedule = function () { if (!timer) timer = setTimeout(record, 700); };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("pagehide", function () { if (timer) { clearTimeout(timer); } record(); });

    // Arriving with #continue: go to the saved paragraph, tolerating
    // revised or missing anchors.
    if (location.hash === "#continue") {
      var rec = load();
      if (rec && rec.chapter === chapter && rec.anchor) {
        var target = null, best = Infinity;
        paras.forEach(function (p, idx) {
          if (rec.anchor.text && lead(p.textContent) === rec.anchor.text) {
            var d = Math.abs(idx - rec.anchor.i);
            if (d < best) { best = d; target = p; }
          }
        });
        if (!target && rec.anchor.i < paras.length) target = paras[rec.anchor.i];
        if (target) {
          target.style.scrollMarginTop = TOP + "px";
          // A timer, not requestAnimationFrame (paused in background tabs).
          var go = function () { setTimeout(function () { target.scrollIntoView({ block: "start" }); }, 0); };
          if (document.readyState === "complete") go();
          else window.addEventListener("load", go);
        }
      }
    }
    return;
  }

  // ── Index: the Continue reading entrance ─────────────────────────────
  var box = document.getElementById("resume");
  if (!box) return;
  var rec = load();
  if (!rec || !rec.path) return;
  var link = box.querySelector("[data-resume-link]");
  var ch = box.querySelector("[data-resume-ch]");
  var from = box.querySelector("[data-resume-from]");
  if (!link || !ch || !from) return;
  var label = function (id) {
    var m = /_C(\d+)$/.exec(id || "");
    return m ? "Ch. " + m[1] : /Epilogue$/.test(id || "") ? "Epilogue" : "";
  };
  if (rec.atEnd) {
    // Finished that chapter: continue with the next one, from its start.
    if (!rec.next) return;
    var nextId = rec.next.replace(/^.*\//, "").replace(/\.html$/, "");
    var row = document.querySelector('.q-row[href$="' + rec.next.replace(/^.*\//, "") + '"] .q-title');
    link.setAttribute("href", rec.next);
    ch.textContent = [label(nextId), row ? norm(row.textContent) : ""].filter(Boolean).join(" · ");
    from.textContent = "from the start — " + label(rec.chapter) + " finished";
  } else {
    link.setAttribute("href", rec.path + "#continue");
    ch.textContent = [label(rec.chapter), rec.title].filter(Boolean).join(" · ");
    var words = norm(rec.anchor && rec.anchor.text).split(" ").slice(0, 7).join(" ");
    from.textContent = words ? "from “" + words + "…”" : "";
  }
  box.hidden = false;
})();
