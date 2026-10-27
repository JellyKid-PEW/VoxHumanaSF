// ambiance.js — site-wide ship-ambiance engine + floating control.
// ─────────────────────────────────────────────────────────────────────────
// One shared mixer for the whole site. The Margins LISTEN panel drives it; this
// file also mounts a small floating control on every OTHER page so an entitled
// reader can keep the ship's beds with them and adjust them anywhere.
//
// PERSISTENCE: fader levels and master volume are remembered in localStorage.
// Sound itself is NOT: every fresh page load starts muted, and only an
// explicit "sound on" control (power(true), called from that control's own
// click) starts playback. No unrelated click or keypress restores sound.
//
// ACCESS TIERS: each channel carries `tier: "public" | "supporter"`. Pages
// that gate supporter layers call setAccess(false/true); while restricted,
// supporter layers are held silent whatever their fader says. Pages that
// never call setAccess (Margins, which has its own gate) are unrestricted.
// NOTE: these beds are synthesized in this public file, so the tier is an
// entitlement gate, not asset protection — protected extras would need to be
// recorded files served through margins-server (see voice routes there).
//
// VOICE BUS: character recordings (ship-sound.js) play through the same
// AudioContext via attachMedia(), with their own level and an optional,
// adjustable ambience reduction ("duck") while a voice is speaking.
//
// Gated: the floating control only appears for entitled readers (same gate as
// Margins). Load AFTER voices.js + memory.js:
//   <script src="../scripts/voices.js"></script>
//   <script src="../scripts/memory.js"></script>
//   <script src="../scripts/ambiance.js"></script>
// Add data-ambiance-no-control to <body> (the Margins page does, via its own
// full mixer) to suppress the floating control while still sharing the engine.
//
// Exposes window.VoxAmbiance: CHANNELS, PRESETS, levels(), setLevel(id,v),
// applyPreset(map), power(on), isLive(), subscribe(fn), entitled().
// ─────────────────────────────────────────────────────────────────────────
(function () {
  "use strict";

  var LS_LEVELS = "vox-ambiance-levels";
  var LS_MASTER = "vox-ambiance-master";
  var MASTER = 0.4;            // loudness ceiling; master volume scales it

  // Ship beds. Public = the ship's body (open to everyone). Supporter = the
  // story-flavoured extras (proposed split — see review notes).
  var CHANNELS = [
    { id: "hull",     name: "Hull Hum",       hint: "the ship's low constant",   level: 0.55, tier: "public" },
    { id: "vent",     name: "Vent Pressure",  hint: "air moved on a slow cycle", level: 0.30, tier: "public" },
    { id: "bridge",   name: "Bridge Idle",    hint: "consoles at rest",          level: 0.22, tier: "public" },
    { id: "galley",   name: "Galley Warmth",  hint: "the one warm room",         level: 0.18, tier: "public" },
    { id: "relay",    name: "Relay Static",   hint: "something almost arriving",  level: 0.10, tier: "supporter" },
    { id: "garden",   name: "Garden Air",     hint: "grown light, kept alive",   level: 0.14, tier: "supporter" },
    { id: "archive",  name: "Archive Bleed",  hint: "B.O.B. thinking nearby",    level: 0.12, tier: "supporter" },
    { id: "exterior", name: "Exterior Drift", hint: "the dark outside the hull", level: 0.20, tier: "public" }
  ];
  var PRESETS = [
    { id: "bridge-low",   name: "Bridge at Low Power",     levels: { hull: 0.6, vent: 0.22, bridge: 0.4, galley: 0.0, relay: 0.14, garden: 0.0, archive: 0.18, exterior: 0.28 } },
    { id: "galley-wake",  name: "Galley After Wake Cycle", levels: { hull: 0.4, vent: 0.3, bridge: 0.1, galley: 0.62, relay: 0.0, garden: 0.16, archive: 0.06, exterior: 0.08 } },
    { id: "dome",         name: "Observation Dome",        levels: { hull: 0.46, vent: 0.16, bridge: 0.12, galley: 0.0, relay: 0.08, garden: 0.0, archive: 0.0, exterior: 0.66 } },
    { id: "garden-feed",  name: "Garden Feed",             levels: { hull: 0.34, vent: 0.4, bridge: 0.0, galley: 0.12, relay: 0.0, garden: 0.6, archive: 0.05, exterior: 0.1 } },
    { id: "archive-idle", name: "Archive Idle",            levels: { hull: 0.42, vent: 0.18, bridge: 0.18, galley: 0.06, relay: 0.16, garden: 0.0, archive: 0.55, exterior: 0.12 } },
    { id: "drift-quiet",  name: "Drift Quiet",             levels: { hull: 0.5, vent: 0.1, bridge: 0.0, galley: 0.0, relay: 0.04, garden: 0.0, archive: 0.0, exterior: 0.5 } },
    { id: "manual",       name: "Manual Mode",             levels: { hull: 0.55, vent: 0.3, bridge: 0.22, galley: 0.18, relay: 0.1, garden: 0.14, archive: 0.12, exterior: 0.2 } }
  ];

  // ── State / persistence ──────────────────────────────────────────────
  var levels = defaultLevels();
  var wantOn = false;          // never restored: each load starts muted
  var masterLevel = 1;         // 0..1, remembered
  var supporterOk = null;      // null = unrestricted; false/true once a page gates
  var voiceLevel = 0.8, duckAmount = 0, ducking = false;
  var subs = [];
  function defaultLevels() { var o = {}; CHANNELS.forEach(function (c) { o[c.id] = c.level; }); return o; }
  function loadState() {
    try { var l = JSON.parse(localStorage.getItem(LS_LEVELS) || "null"); if (l) Object.keys(levels).forEach(function (k) { if (typeof l[k] === "number") levels[k] = l[k]; }); } catch (e) {}
    try { var m = parseFloat(localStorage.getItem(LS_MASTER)); if (!isNaN(m)) masterLevel = Math.max(0, Math.min(1, m)); } catch (e) {}
  }
  function saveLevels() { try { localStorage.setItem(LS_LEVELS, JSON.stringify(levels)); } catch (e) {} }
  function notify() { subs.forEach(function (fn) { try { fn({ levels: levels, live: isLive(), wantOn: wantOn, master: masterLevel }); } catch (e) {} }); }
  function tierOf(id) { for (var i = 0; i < CHANNELS.length; i++) if (CHANNELS[i].id === id) return CHANNELS[i].tier; return "public"; }
  function audible(id) { return supporterOk !== false || tierOf(id) !== "supporter"; }

  // ── Web Audio engine ─────────────────────────────────────────────────
  // Graph: channel faders → ambBus (duck) → master (power × volume) → out
  //        recordings    → voiceBus (voice level) ↗
  var ctx = null, master = null, ambBus = null, voiceBus = null, chans = {}, started = false;
  function noiseBuffer(type) {
    var len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    if (type === "brown") { var last = 0; for (var i = 0; i < len; i++) { var w = Math.random() * 2 - 1; d[i] = (last + 0.02 * w) / 1.02; last = d[i]; d[i] *= 3.5; } }
    else { for (var j = 0; j < len; j++) d[j] = Math.random() * 2 - 1; }
    return buf;
  }
  function noiseSource(type) { var s = ctx.createBufferSource(); s.buffer = noiseBuffer(type); s.loop = true; return s; }
  function lfo(rate, depth, target) { var o = ctx.createOscillator(); o.frequency.value = rate; var g = ctx.createGain(); g.gain.value = depth; o.connect(g); g.connect(target); o.start(); }
  // source → voice(ceiling + gentle breath) → fader(clean 0..1) → master.
  var RECIPES = {
    hull: function (v) { v.gain.value = 0.42; var a = ctx.createOscillator(); a.type = "sine"; a.frequency.value = 52; var b = ctx.createOscillator(); b.type = "triangle"; b.frequency.value = 78; b.detune.value = -6; var lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 210; a.connect(lp); b.connect(lp); lp.connect(v); a.start(); b.start(); lfo(0.05, 0.05, v.gain); },
    vent: function (v) { v.gain.value = 0.16; var n = noiseSource("white"); var bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 480; bp.Q.value = 0.6; n.connect(bp); bp.connect(v); n.start(); },
    bridge: function (v) { v.gain.value = 0.34; var n = noiseSource("brown"); var lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 130; var s = ctx.createOscillator(); s.type = "sine"; s.frequency.value = 120; var sg = ctx.createGain(); sg.gain.value = 0.1; s.connect(sg); sg.connect(v); n.connect(lp); lp.connect(v); n.start(); s.start(); },
    galley: function (v) { v.gain.value = 0.26; var n = noiseSource("brown"); var lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 300; var s = ctx.createOscillator(); s.type = "sine"; s.frequency.value = 110; var sg = ctx.createGain(); sg.gain.value = 0.14; s.connect(sg); sg.connect(v); n.connect(lp); lp.connect(v); n.start(); s.start(); lfo(0.04, 0.03, v.gain); },
    relay: function (v) { v.gain.value = 0.05; var n = noiseSource("white"); var hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 3400; n.connect(hp); hp.connect(v); n.start(); },
    garden: function (v) { v.gain.value = 0.12; var n = noiseSource("white"); var bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1100; bp.Q.value = 0.4; n.connect(bp); bp.connect(v); n.start(); },
    archive: function (v) { v.gain.value = 0.13; var n = noiseSource("white"); var bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 700; bp.Q.value = 0.8; var s = ctx.createOscillator(); s.type = "sine"; s.frequency.value = 220; var sg = ctx.createGain(); sg.gain.value = 0.05; s.connect(sg); sg.connect(v); n.connect(bp); bp.connect(v); n.start(); s.start(); },
    exterior: function (v) { v.gain.value = 0.42; var n = noiseSource("brown"); var lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 85; n.connect(lp); lp.connect(v); n.start(); lfo(0.025, 0.06, v.gain); }
  };
  function build() {
    if (started) return;
    var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
    ambBus = ctx.createGain(); ambBus.gain.value = 1; ambBus.connect(master);
    voiceBus = ctx.createGain(); voiceBus.gain.value = voiceLevel; voiceBus.connect(master);
    CHANNELS.forEach(function (c) {
      var fader = ctx.createGain(); fader.gain.value = 0;
      var voice = ctx.createGain(); voice.gain.value = 0.2;
      if (RECIPES[c.id]) RECIPES[c.id](voice);
      voice.connect(fader); fader.connect(ambBus);
      chans[c.id] = fader;
      fader.gain.value = audible(c.id) ? levels[c.id] : 0;
    });
    ctx.onstatechange = notify;
    started = true;
  }
  function applyEngineLevel(id) { if (ctx && chans[id]) chans[id].gain.setTargetAtTime(audible(id) ? levels[id] : 0, ctx.currentTime, 0.04); }
  function applyMaster(tc) { if (ctx && master) master.gain.setTargetAtTime(wantOn ? MASTER * masterLevel : 0, ctx.currentTime, tc || 0.12); }
  function resumeCtx() { if (ctx && ctx.state === "suspended") return ctx.resume().then(notify); return Promise.resolve(); }
  function isLive() { return !!(wantOn && started && ctx && ctx.state === "running"); }

  // ── Public actions ───────────────────────────────────────────────────
  // None of these start playback; only power(true) does.
  function setLevel(id, v) {
    v = Math.max(0, Math.min(1, v)); levels[id] = v; saveLevels(); applyEngineLevel(id); notify();
  }
  function applyPreset(map) { CHANNELS.forEach(function (c) { var v = (map && typeof map[c.id] === "number") ? map[c.id] : 0; levels[c.id] = v; applyEngineLevel(c.id); }); saveLevels(); notify(); }
  function setMaster(v) {
    masterLevel = Math.max(0, Math.min(1, v));
    try { localStorage.setItem(LS_MASTER, String(masterLevel)); } catch (e) {}
    applyMaster(0.05); notify();
  }
  function setAccess(ok) { supporterOk = !!ok; CHANNELS.forEach(function (c) { applyEngineLevel(c.id); }); notify(); }
  // Call ONLY from an explicit sound control's own click/keypress.
  function power(on) {
    wantOn = !!on;
    if (wantOn) { build(); CHANNELS.forEach(function (c) { applyEngineLevel(c.id); }); resumeCtx(); applyMaster(0.4); }
    else if (started) { applyMaster(0.25); }
    notify(); return isLive();
  }

  // ── Voice bus (character recordings) ─────────────────────────────────
  // Routes an <audio> element through this AudioContext so master volume
  // and mute govern voices too. Returns false if audio isn't built yet.
  var attached = typeof WeakSet === "function" ? new WeakSet() : null;
  function attachMedia(el) {
    if (!started || !ctx || !el) return false;
    if (attached && attached.has(el)) return true;
    try { ctx.createMediaElementSource(el).connect(voiceBus); if (attached) attached.add(el); return true; }
    catch (e) { return false; }
  }
  function setVoiceLevel(v) { voiceLevel = Math.max(0, Math.min(1, v)); if (ctx && voiceBus) voiceBus.gain.setTargetAtTime(voiceLevel, ctx.currentTime, 0.05); }
  function setDuckAmount(v) { duckAmount = Math.max(0, Math.min(0.6, v)); duck(ducking); }
  // Subtle, adjustable reduction of the beds while a voice speaks (0 = steady).
  function duck(on) {
    ducking = !!on;
    if (ctx && ambBus) ambBus.gain.setTargetAtTime(ducking ? 1 - duckAmount : 1, ctx.currentTime, ducking ? 0.6 : 1.2);
  }

  // ── Entitlement (same gate as Margins) ───────────────────────────────
  function entitled() {
    var dev = null; try { dev = localStorage.getItem("vox-margins-dev"); } catch (e) {}
    if (dev === "entitled") return Promise.resolve(true);
    if (dev === "threshold") return Promise.resolve(false);
    if (window.VoxMemory) return VoxMemory.lines("margins", "margins-frame").then(function (r) { return !!r.entitled; }).catch(function () { return false; });
    return Promise.resolve(false);
  }

  // ── Floating control UI ──────────────────────────────────────────────
  function injectCSS() {
    if (document.getElementById("vox-amb-css")) return;
    var s = document.createElement("style"); s.id = "vox-amb-css";
    s.textContent = [
      ".va-fab{position:fixed;left:22px;bottom:22px;z-index:9050;width:46px;height:46px;border-radius:50%;border:1px solid var(--line-strong,rgba(232,230,225,.22));background:rgba(8,8,8,.92);backdrop-filter:blur(6px);display:grid;place-items:center;cursor:pointer;transition:border-color .16s ease}",
      ".va-fab:hover{border-color:var(--signal,#E05A4F)}",
      ".va-eq{display:flex;align-items:flex-end;gap:2px;height:16px}",
      ".va-eq i{width:3px;height:5px;background:var(--ink-dim,#8a8881);transition:background .2s}",
      ".va-fab.live .va-eq i{background:var(--signal,#E05A4F);animation:va-bounce 1s ease-in-out infinite}",
      ".va-fab.live .va-eq i:nth-child(2){animation-delay:.18s}.va-fab.live .va-eq i:nth-child(3){animation-delay:.36s}.va-fab.live .va-eq i:nth-child(4){animation-delay:.1s}",
      "@keyframes va-bounce{0%,100%{height:4px}50%{height:15px}}",
      ".va-fab.armed .va-eq i{background:var(--warm,#d4c194)}",
      ".va-pop{position:fixed;left:22px;bottom:78px;z-index:9051;width:300px;max-width:calc(100vw - 44px);border:1px solid var(--line-strong,rgba(232,230,225,.22));background:rgba(7,7,7,.97);backdrop-filter:blur(10px);font-family:var(--mono,monospace);display:none;padding:16px 16px 14px}",
      ".va-pop.open{display:block}",
      ".va-pop-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--line,rgba(232,230,225,.1))}",
      ".va-pop-title{font-size:9.5px;letter-spacing:.24em;text-transform:uppercase;color:var(--ink-dim,#8a8881)}",
      ".va-pwr{appearance:none;cursor:pointer;background:none;border:1px solid var(--line-strong,rgba(232,230,225,.22));color:var(--ink-dim,#8a8881);font-family:inherit;font-size:8.5px;letter-spacing:.18em;text-transform:uppercase;padding:6px 11px;display:inline-flex;align-items:center;gap:8px}",
      ".va-pwr .dot{width:6px;height:6px;border-radius:50%;background:var(--ink-faint,#4a4845)}",
      ".va-pwr.live{color:var(--ink,#e8e6e1)}.va-pwr.live .dot{background:var(--signal,#E05A4F);box-shadow:0 0 7px var(--signal-dim,rgba(224,90,79,.55))}",
      ".va-row{display:grid;grid-template-columns:84px 1fr 26px;align-items:center;gap:10px;margin-bottom:8px}",
      ".va-name{font-size:8.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-dim,#8a8881);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".va-range{-webkit-appearance:none;appearance:none;width:100%;height:3px;background:var(--line-strong,rgba(232,230,225,.22));outline:none;border-radius:0}",
      ".va-range::-webkit-slider-thumb{-webkit-appearance:none;width:10px;height:14px;background:var(--ink,#e8e6e1);cursor:pointer;border:0}",
      ".va-range::-moz-range-thumb{width:10px;height:14px;background:var(--ink,#e8e6e1);cursor:pointer;border:0;border-radius:0}",
      ".va-range{accent-color:var(--signal,#E05A4F)}",
      ".va-val{font-size:8px;color:var(--ink-faint,#4a4845);text-align:right;font-variant-numeric:tabular-nums}",
      ".va-presets{margin-top:12px;padding-top:10px;border-top:1px solid var(--line,rgba(232,230,225,.1));display:flex;align-items:center;gap:8px}",
      ".va-presets label{font-size:8px;letter-spacing:.16em;text-transform:uppercase;color:var(--ink-faint,#4a4845)}",
      ".va-presets select{flex:1;background:rgba(0,0,0,.4);border:1px solid var(--line,rgba(232,230,225,.1));color:var(--ink,#e8e6e1);font-family:inherit;font-size:9.5px;padding:6px 8px}",
      ".va-foot{margin-top:10px;font-size:8px;letter-spacing:.02em;color:var(--ink-faint,#4a4845);font-style:italic;line-height:1.5}",
      ".va-foot a{color:var(--signal,#E05A4F)}"
    ].join("");
    document.head.appendChild(s);
  }

  function mountControl() {
    if (document.getElementById("vox-amb-fab")) return;
    injectCSS();
    var fab = document.createElement("button");
    fab.id = "vox-amb-fab"; fab.className = "va-fab"; fab.type = "button";
    fab.setAttribute("aria-label", "Ship ambiance");
    fab.title = "Ship ambiance";
    fab.innerHTML = '<span class="va-eq"><i></i><i></i><i></i><i></i></span>';

    var pop = document.createElement("div");
    pop.id = "vox-amb-pop"; pop.className = "va-pop"; pop.setAttribute("role", "dialog"); pop.setAttribute("aria-label", "Ambiance mixer");
    var rows = CHANNELS.map(function (c) {
      var v = Math.round(levels[c.id] * 100);
      return '<div class="va-row"><span class="va-name" title="' + c.hint + '">' + c.name + '</span>' +
        '<input class="va-range" type="range" min="0" max="100" value="' + v + '" data-ch="' + c.id + '" aria-label="' + c.name + '">' +
        '<span class="va-val" data-val="' + c.id + '">' + v + '</span></div>';
    }).join("");
    var opts = '<option value="">Recall preset…</option>' + PRESETS.map(function (p) { return '<option value="' + p.id + '">' + p.name + '</option>'; }).join("");
    pop.innerHTML =
      '<div class="va-pop-head"><span class="va-pop-title">Ambiance · Ship beds</span>' +
      '<button class="va-pwr" id="va-pwr" type="button"><span class="dot"></span><span class="t">Silent</span></button></div>' +
      rows +
      '<div class="va-presets"><label>Preset</label><select id="va-preset">' + opts + '</select></div>' +
      '<div class="va-foot">Travels with you across the ship. <a href="' + marginsHref() + '">Open the full mixer →</a></div>';

    document.body.appendChild(fab);
    document.body.appendChild(pop);

    fab.addEventListener("click", function (e) { e.stopPropagation(); pop.classList.toggle("open"); });
    document.addEventListener("click", function (e) { if (!pop.contains(e.target) && e.target !== fab && !fab.contains(e.target)) pop.classList.remove("open"); });

    pop.querySelectorAll(".va-range").forEach(function (r) {
      r.addEventListener("input", function () {
        var v = parseInt(r.value, 10) / 100; setLevel(r.dataset.ch, v);
        var val = pop.querySelector('[data-val="' + r.dataset.ch + '"]'); if (val) val.textContent = Math.round(v * 100);
        // Adjusting a fader never starts sound; only the power control does.
      });
    });
    var pwr = pop.querySelector("#va-pwr");
    pwr.addEventListener("click", function () { power(!wantOn); });
    var sel = pop.querySelector("#va-preset");
    sel.addEventListener("change", function () {
      var p = null; for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].id === sel.value) p = PRESETS[i];
      if (!p) return;
      applyPreset(p.levels);
      pop.querySelectorAll(".va-range").forEach(function (r) { var nv = Math.round((levels[r.dataset.ch] || 0) * 100); r.value = nv; var val = pop.querySelector('[data-val="' + r.dataset.ch + '"]'); if (val) val.textContent = nv; });
      // Recalling a preset never starts sound; only the power control does.
      sel.value = "";
    });

    function paint() {
      var live = isLive();
      fab.classList.toggle("live", live);
      fab.classList.toggle("armed", wantOn && !live); // wants sound, waiting for a gesture
      pwr.classList.toggle("live", wantOn);
      pwr.querySelector(".t").textContent = wantOn ? (live ? "Sounding" : "Tap to resume") : "Silent";
    }
    subscribe(paint); paint();
  }

  function marginsHref() {
    // The control lives on non-Margins pages; link relative to depth.
    var base = (document.body && document.body.dataset && document.body.dataset.assetBase) || "";
    return base + "world/margins.html";
  }

  function subscribe(fn) { subs.push(fn); return function () { subs = subs.filter(function (f) { return f !== fn; }); }; }

  // ── Boot ─────────────────────────────────────────────────────────────
  function boot() {
    loadState();
    // Starts muted. (The old "resume on first click/keypress" is gone: sound
    // only begins from an explicit sound control.)
    // Margins page runs its own full mixer; share the engine but no floating control.
    var noControl = document.body && (document.body.classList.contains("margins") || document.body.hasAttribute("data-ambiance-no-control"));
    if (!noControl) entitled().then(function (ok) { if (ok) mountControl(); });
  }

  window.VoxAmbiance = {
    CHANNELS: CHANNELS, PRESETS: PRESETS,
    levels: function () { return levels; },
    setLevel: setLevel, applyPreset: applyPreset,
    power: power, isLive: isLive, wantsOn: function () { return wantOn; },
    master: function () { return masterLevel; }, setMaster: setMaster,
    setAccess: setAccess, audible: audible,
    attachMedia: attachMedia, setVoiceLevel: setVoiceLevel, setDuckAmount: setDuckAmount, duck: duck,
    subscribe: subscribe, entitled: entitled
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
