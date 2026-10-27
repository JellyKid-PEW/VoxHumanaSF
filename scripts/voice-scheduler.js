/* ─────────────────────────────────────────────────────────────────────
   voice-scheduler.js — "occasional company" scheduling, no audio inside.
   Decides WHEN a character clip plays and WHICH one; playback itself is
   injected (ship-sound.js passes a player that uses the shared engine).
   Clip metadata (character, file, title, transcript, access, spoiler)
   lives in margins-server/voice/clips.json, not here.

   Rules
     · Nothing plays on enable: the first clip waits a full gap.
     · Gaps are random within the chosen frequency band and are measured
       from the END of the previous clip.
     · One shared schedule for all selected characters: clips never overlap.
     · Rotation: every eligible clip plays once before any repeats; the
       first of a new round is never the clip that just played.
     · Disable / deselect / mute: pending playback is cancelled; a clip that
       is speaking for a deselected character (or while muted) is stopped.
     · No catch-up: if a timer fires very late (sleep, throttled tab), it
       is skipped and a fresh gap is drawn. Only one timer ever exists.
     · Failed media: that clip is dropped for the session (one warning);
       if every candidate fails, the schedule stops as "unavailable".

   Usage (browser global VoxVoiceScheduler, or require() in node tests):
     const s = VoxVoiceScheduler.create({ play, stop, onState, timeScale });
     s.setClips(clips); s.setCharacters(["q-vox"]); s.setFrequency("intermittent");
     s.enable(); … s.disable();  s.setMuted(true/false);
   ───────────────────────────────────────────────────────────────────── */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.VoxVoiceScheduler = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var MIN = 60 * 1000;
  var FREQUENCIES = {
    rare:         { label: "Rare",         min: 12 * MIN, max: 20 * MIN, note: "about every 12–20 minutes" },
    intermittent: { label: "Intermittent", min: 5 * MIN,  max: 10 * MIN, note: "about every 5–10 minutes" },
    frequent:     { label: "Frequent",     min: 2 * MIN,  max: 4 * MIN,  note: "about every 2–4 minutes" },
  };
  var LATE_TOLERANCE = 90 * 1000;   // a timer this late is treated as missed
  var MIN_LEAD = 30 * 1000;         // never fire sooner than this after a change

  function create(opts) {
    opts = opts || {};
    var scale = opts.timeScale || 1;            // dev-only: shorten every interval
    var now = opts.now || function () { return Date.now(); };
    var setT = opts.setTimeout || function (f, ms) { return setTimeout(f, ms); };
    var clearT = opts.clearTimeout || function (id) { clearTimeout(id); };
    var random = opts.random || Math.random;
    var play = opts.play;                        // (clip) => Promise<{ ok, stopped? }>
    var stopPlayback = opts.stop || function () {};
    var onState = opts.onState || function () {};
    var warn = opts.warn || function (m) { if (typeof console !== "undefined") console.warn(m); };

    var clips = [];
    var characters = {};
    var freq = "intermittent";
    var enabled = false, muted = false;
    var timer = null, dueAt = null, anchorAt = null;
    var playing = null;            // { clip, token }
    var token = 0;
    var bag = [], lastId = null, lastEndAt = null;
    var failed = {};
    var phase = "idle";

    function emit() {
      onState({
        phase: phase, dueAt: dueAt, current: playing ? playing.clip : null,
        eligible: eligible().length, frequency: freq,
      });
    }
    function eligible() {
      return clips.filter(function (c) { return c && c.src && characters[c.character] && !failed[c.id]; });
    }
    function active() { return enabled && !muted && eligible().length > 0; }
    function band() { return FREQUENCIES[freq] || FREQUENCIES.intermittent; }
    function gap() { var b = band(); return (b.min + random() * (b.max - b.min)) * scale; }

    function cancelTimer() { if (timer != null) clearT(timer); timer = null; dueAt = null; }

    function scheduleAt(t) {
      cancelTimer();
      dueAt = t;
      timer = setT(fire, Math.max(0, t - now()));
      phase = "waiting"; emit();
    }
    // Fresh gap measured from the previous clip's end (or from when the
    // schedule began), but never sooner than a short lead from now.
    function scheduleNext() {
      if (!active()) {
        cancelTimer();
        var recorded = clips.filter(function (c) { return c && c.src && characters[c.character]; });
        var allFailed = recorded.length > 0 && recorded.every(function (c) { return failed[c.id]; });
        phase = allFailed ? "unavailable" : "idle"; emit(); return;
      }
      var base = lastEndAt != null ? lastEndAt : (anchorAt != null ? anchorAt : now());
      var t = base + gap();
      scheduleAt(Math.max(t, now() + MIN_LEAD * scale));
    }

    function pick() {
      var pool = eligible();
      if (!pool.length) return null;
      var ids = pool.map(function (c) { return c.id; });
      bag = bag.filter(function (id) { return ids.indexOf(id) >= 0; });
      if (!bag.length) {
        bag = ids.slice();
        for (var i = bag.length - 1; i > 0; i--) { var j = Math.floor(random() * (i + 1)); var x = bag[i]; bag[i] = bag[j]; bag[j] = x; }
        if (bag.length > 1 && bag[0] === lastId) { var y = bag[0]; bag[0] = bag[1]; bag[1] = y; }
      }
      var id = bag.shift();
      for (var k = 0; k < pool.length; k++) if (pool[k].id === id) return pool[k];
      return null;
    }

    function fire() {
      timer = null;
      var due = dueAt; dueAt = null;
      if (!active() || playing) return;
      if (due != null && now() - due > LATE_TOLERANCE * Math.max(scale, 0.01)) {
        // Missed while asleep/throttled: no catch-up, just a fresh gap.
        anchorAt = now(); lastEndAt = null; scheduleNext(); return;
      }
      var clip = pick();
      if (!clip) { scheduleNext(); return; }
      var my = ++token;
      playing = { clip: clip, token: my };
      phase = "playing"; emit();
      Promise.resolve()
        .then(function () { return play(clip); })
        .catch(function () { return { ok: false }; })
        .then(function (r) {
          if (!playing || playing.token !== my) return;   // stopped/replaced
          playing = null;
          lastId = clip.id;
          lastEndAt = now();
          if (!r || !r.ok) {
            if (!(r && r.stopped)) {
              failed[clip.id] = true;
              warn("[voice] recording unavailable, skipped for this visit: " + clip.id);
            }
          }
          scheduleNext();
        });
    }

    function stopCurrent() {
      if (!playing) return;
      playing = null; token++;
      try { stopPlayback(); } catch (e) {}
    }

    function reevaluate(restart) {
      if (playing && (!enabled || muted || !characters[playing.clip.character])) stopCurrent();
      if (!active()) { cancelTimer(); scheduleNext(); return; }
      if (playing) return;
      if (restart || timer == null) { if (restart) { anchorAt = now(); lastEndAt = null; } scheduleNext(); }
    }

    return {
      FREQUENCIES: FREQUENCIES,
      setClips: function (list) { clips = (list || []).slice(); reevaluate(false); },
      setCharacters: function (keys) {
        var next = {}; (keys || []).forEach(function (k) { next[k] = true; });
        var wasActive = active();
        characters = next;
        // Becoming active (first character picked) starts a fresh gap.
        reevaluate(!wasActive);
      },
      setFrequency: function (key) {
        if (!FREQUENCIES[key]) return;
        freq = key;
        if (active() && !playing) scheduleNext();
        else emit();
      },
      enable: function () { if (enabled) return; enabled = true; reevaluate(true); },
      disable: function () { enabled = false; stopCurrent(); cancelTimer(); phase = "idle"; emit(); },
      setMuted: function (m) {
        m = !!m; if (m === muted) return;
        muted = m;
        if (muted) { stopCurrent(); cancelTimer(); phase = "idle"; emit(); }
        else reevaluate(true);                 // fresh gap after unmuting
      },
      state: function () { return { phase: phase, dueAt: dueAt, playing: playing ? playing.clip.id : null, eligible: eligible().length }; },
      _debug: function () { return { bag: bag.slice(), lastId: lastId, failed: Object.keys(failed) }; },
    };
  }

  return { create: create, FREQUENCIES: FREQUENCIES };
});
