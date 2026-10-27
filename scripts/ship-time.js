/* ═══════════════════════════════════════════════════════════════════
   VOX HUMANA — ship-time.js
   One clock for the whole site.

   SHIP TIME is a single 24-hour clock kept on Universal time (UTC), the
   same for every visitor — the way a real crewed station keeps one
   standard clock rather than each crew member's home time (the ISS runs
   on UTC). The panel footer already reads "Ship Time · Universal".

   SIGNAL DRIFT is the gap between ship time and the visitor's own clock
   (their UTC offset), e.g. "−07:00". It explains why ship time never
   matches the reader's wall clock, and it is the same number every visit.

   Every displayed time on the site should come from here:
     VoxShipTime.clock()        → "21:14:07"   (now, ship time)
     VoxShipTime.stamp(ms)      → "21:14"      (any moment, ship time)
     VoxShipTime.drift()        → "−07:00"     (visitor offset from ship time)
     VoxShipTime.watch()        → 0–5          (which 4-hour watch it is)
     VoxShipTime.minutes(ms)    → minutes since ship midnight
   Elements are filled automatically:
     [data-ship-clock]          live HH:MM:SS
     [data-ship-clock="short"]  live HH:MM
     [data-ship-drift]          the visitor's drift, e.g. −07:00
   Events (for later — site changes keyed to ship time):
     "shipminute"  every ship minute        detail: { minutes, watch }
     "shipwatch"   when the watch changes   detail: { watch, previous }
   ═══════════════════════════════════════════════════════════════════ */
(function shipTime() {
  "use strict";

  const pad = (n) => String(n).padStart(2, "0");

  // Ship time is UTC; read the UTC fields of any moment.
  function parts(ms) {
    const d = new Date(ms == null ? Date.now() : ms);
    return { h: d.getUTCHours(), m: d.getUTCMinutes(), s: d.getUTCSeconds() };
  }
  function clock(ms) { const p = parts(ms); return `${pad(p.h)}:${pad(p.m)}:${pad(p.s)}`; }
  function stamp(ms) { const p = parts(ms); return `${pad(p.h)}:${pad(p.m)}`; }
  function minutes(ms) { const p = parts(ms); return p.h * 60 + p.m; }
  // Six four-hour watches, numbered from ship midnight (0 = 00:00–03:59).
  function watch(ms) { return Math.floor(parts(ms).h / 4); }

  // The visitor's clock relative to ship time: local − UTC, as ±HH:MM.
  function drift(ms) {
    const off = -new Date(ms == null ? Date.now() : ms).getTimezoneOffset(); // minutes
    const sign = off < 0 ? "−" : "+";
    const a = Math.abs(off);
    return `${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
  }

  function paint() {
    const now = Date.now();
    document.querySelectorAll("[data-ship-clock]").forEach((el) => {
      el.textContent = el.dataset.shipClock === "short" ? stamp(now) : clock(now);
    });
    document.querySelectorAll("[data-ship-drift]").forEach((el) => { el.textContent = drift(now); });
  }

  let lastMinute = -1, lastWatch = -1;
  function tick() {
    paint();
    const now = Date.now();
    const m = minutes(now);
    if (m !== lastMinute) {
      const w = watch(now);
      if (lastMinute !== -1) window.dispatchEvent(new CustomEvent("shipminute", { detail: { minutes: m, watch: w } }));
      if (lastWatch !== -1 && w !== lastWatch) window.dispatchEvent(new CustomEvent("shipwatch", { detail: { watch: w, previous: lastWatch } }));
      lastMinute = m; lastWatch = w;
    }
  }

  window.VoxShipTime = { clock, stamp, minutes, watch, drift, paint };

  function start() { tick(); setInterval(tick, 1000); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
