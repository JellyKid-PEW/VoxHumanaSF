/* ─────────────────────────────────────────────────────────────────────
   ship-sound.js — the index navigation's "Ship ambience" control.
   A compact mixer over the ONE shared engine (scripts/ambiance.js): no
   second AudioContext, no second mixer, no floating control on this page.

   Sound rules
     · Every page load starts muted. Only "Sound on" (its own click) starts
       playback — opening the mixer, choosing a room or moving a slider
       never does. Closing the mixer leaves deliberate sound playing.
     · Remembered on this device: layer levels, master volume, room,
       selected voice characters, voice frequency, voice volume, ducking.
       Not remembered: sound on/off, voices on/off.

   Access
     · Public layers work for everyone, always.
     · Supporter layers and character audio need access VERIFIED by
       margins-server (signed cookie → VoxMemory gated read). localStorage
       is never treated as proof.
     · Development only (localhost / *.test): ?supporter-preview unlocks
       the supporter UI, clearly labelled as unverified; ?voice-fast
       shortens voice gaps ~100× for testing.

   Character audio
     · Metadata comes from margins-server /margins/api/voice/manifest
       (entitled only). A clip is eligible only if it has a recording, its
       character is selected and its spoiler review is complete with level
       "none". Transcript-only logs are listed as not recorded, never as
       playable. Scheduling lives in voice-scheduler.js.
   ───────────────────────────────────────────────────────────────────── */
(function shipSound() {
  "use strict";
  const A = window.VoxAmbiance;
  const btn = document.querySelector("[data-sound-btn]");
  const panel = document.getElementById("sn-sound-panel");
  if (!A || !btn || !panel || !window.VoxPopover) return;

  const Vox = window.Vox;
  const host = location.hostname;
  const isDevHost = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(host) || /\.(localhost|test)$/.test(host);
  const params = new URLSearchParams(location.search);
  const DEV_PREVIEW = isDevHost && params.has("supporter-preview");
  const DEV_FAST = isDevHost && params.has("voice-fast");
  const API = (window.VOX_MARGINS_API != null ? window.VOX_MARGINS_API : "/margins/api").replace(/\/$/, "");

  const LS_PREFS = "vox-voice-prefs";
  const LS_ROOM = "vox-ambiance-room";
  const CHAR_KEYS = ["q-vox", "iri-six", "bob", "nova"];

  // ── Remembered preferences ─────────────────────────────────────────
  const prefs = Object.assign(
    { characters: ["q-vox", "iri-six"], frequency: "intermittent", voiceLevel: 0.8, duck: 0 },
    readJSON(LS_PREFS)
  );
  function readJSON(k) { try { return JSON.parse(localStorage.getItem(k) || "null") || {}; } catch (e) { return {}; } }
  function savePrefs() { try { localStorage.setItem(LS_PREFS, JSON.stringify(prefs)); } catch (e) {} }
  let room = ""; try { room = localStorage.getItem(LS_ROOM) || ""; } catch (e) {}

  A.setAccess(false);                 // supporter layers silent until verified
  A.setVoiceLevel(prefs.voiceLevel);
  A.setDuckAmount(prefs.duck);

  // ── State ──────────────────────────────────────────────────────────
  let access = DEV_PREVIEW ? "preview" : "checking";  // checking | verified | unverified | preview
  let manifest = { state: "none", clips: [] };          // none | loading | ok | error
  let voicesOn = false;
  let now = null, last = null;                          // clip playing / last heard

  // ── Voice player (one <audio>, routed through the shared engine) ────
  const voiceEl = new Audio();
  voiceEl.preload = "none";
  voiceEl.crossOrigin = "use-credentials";
  let settle = null;
  function finish(result) {
    A.duck(false);
    const r = settle; settle = null;
    if (r) r(result);
  }
  voiceEl.addEventListener("ended", () => finish({ ok: true }));
  voiceEl.addEventListener("error", () => { if (settle) finish({ ok: false }); });
  voiceEl.addEventListener("playing", () => A.duck(true));

  const scheduler = window.VoxVoiceScheduler.create({
    timeScale: DEV_FAST ? 0.01 : 1,
    play(clip) {
      return new Promise((resolve) => {
        if (!A.attachMedia(voiceEl)) { resolve({ ok: false, stopped: true }); return; }
        settle = resolve;
        now = clip; paintVoice();
        voiceEl.src = clip.src;
        voiceEl.play().catch(() => finish({ ok: false }));
      }).then((r) => { if (now) last = now; now = null; paintVoice(); return r; });
    },
    stop() {
      try { voiceEl.pause(); voiceEl.removeAttribute("src"); voiceEl.load(); } catch (e) {}
      finish({ ok: false, stopped: true });
    },
    onState: () => paintVoice(),
  });
  scheduler.setFrequency(prefs.frequency);
  scheduler.setCharacters(prefs.characters);
  scheduler.setMuted(true);

  function eligibleClips() {
    if (access !== "verified" && access !== "preview") return [];
    return manifest.clips.filter((c) =>
      c.status === "recorded" && c.src &&
      c.spoiler && c.spoiler.reviewed === true && c.spoiler.level === "none");
  }

  // ── Access check (server-verified only) ─────────────────────────────
  // margins-server checks its signed cookie on the manifest route: 200 means
  // verified, 401/402 means not a supporter. If that route is missing (an
  // older server), fall back to the existing gated Margins read.
  function verify() {
    // No margins server configured (VOX_MARGINS_API = "", e.g. a static
    // host): no supporter access to check and no recordings to list.
    if (!API) { manifest = { state: "none", clips: [] }; return setAccess("unverified"); }
    manifest = { state: "loading", clips: [] };
    fetch(API + "/voice/manifest", { credentials: "include", headers: { Accept: "application/json" } })
      .then((res) => {
        if (res.ok) return res.json().then((data) => { setManifest(data); setAccess("verified"); });
        if (res.status === 401 || res.status === 402) { manifest = { state: "none", clips: [] }; return setAccess("unverified"); }
        throw new Error(String(res.status));
      })
      .catch(() => {
        manifest = { state: "error", clips: [] };
        if (!window.VoxMemory) return setAccess("unverified");
        return VoxMemory.lines("margins", "margins-frame")
          .then((r) => setAccess(r && r.gated && r.entitled === true && !r.error ? "verified" : "unverified"))
          .catch(() => setAccess("unverified"));
      });
  }
  function setManifest(data) {
    const clips = (data && Array.isArray(data.clips) ? data.clips : []).map((c) =>
      Object.assign({}, c, { src: c.src ? new URL(c.src, location.origin + API + "/").href : null }));
    manifest = { state: "ok", clips };
  }
  function setAccess(state) {
    // Dev preview unlocks the UI locally, but never claims verification.
    access = state === "verified" ? "verified" : (DEV_PREVIEW ? "preview" : state);
    A.setAccess(access === "verified" || access === "preview");
    scheduler.setClips(eligibleClips());
    paintAll();
  }

  // ── Mixer markup ───────────────────────────────────────────────────
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  const pct = (v) => Math.round((v || 0) * 100);
  const charName = (k) => (Vox && Vox.get(k) && Vox.get(k).name) || k;
  const charRole = (k) => (Vox && Vox.get(k) && Vox.get(k).role) || "";
  const charColor = (k) => (Vox && Vox.get(k) && Vox.get(k).signal) || "currentColor";

  function layerRow(c) {
    const locked = c.tier === "supporter" && !A.audible(c.id);
    const v = pct(A.levels()[c.id]);
    return `<div class="mx-layer${locked ? " is-locked" : ""}">
      <label for="mx-l-${c.id}" title="${esc(c.hint)}">${esc(c.name)}</label>
      <input id="mx-l-${c.id}" class="mx-range" type="range" min="0" max="100" step="1" value="${v}" data-layer="${c.id}"${locked ? " disabled" : ""} aria-describedby="${locked ? "mx-locked-note" : ""}">
      <output for="mx-l-${c.id}" data-out="${c.id}">${locked ? "—" : v}</output>
    </div>`;
  }

  function render() {
    const roomOpts = ['<option value="">Choose a room…</option>']
      .concat(A.PRESETS.map((p) => `<option value="${p.id}"${p.id === room ? " selected" : ""}>${esc(p.name)}</option>`))
      .concat(room === "custom" ? ['<option value="custom" selected>Custom mix</option>'] : []);
    const pub = A.CHANNELS.filter((c) => c.tier !== "supporter");
    const sup = A.CHANNELS.filter((c) => c.tier === "supporter");
    const freqs = window.VoxVoiceScheduler.FREQUENCIES;
    // The deeper sections start folded so a first visit sees a simple
    // ambience (power, volume, room, public layers); their open state is
    // remembered on this device.
    const openSec = Object.assign({ additional: false, voices: false }, prefs.open || {});

    panel.innerHTML = `
      <div class="mx-head">
        <span class="mx-title">Ship ambience</span>
        <button class="mx-close" type="button" data-mx-close aria-label="Close ship ambience mixer"><span aria-hidden="true">×</span></button>
      </div>
      ${DEV_PREVIEW ? '<p class="mx-dev">Development preview — supporter access is NOT verified. Local only.</p>' : ""}
      <div class="mx-power-row">
        <button class="mx-power" type="button" data-mx-power aria-pressed="false"><span class="mx-dot" aria-hidden="true"></span><span data-mx-power-text>Sound off</span></button>
        <div class="mx-master">
          <label for="mx-master">Volume</label>
          <input id="mx-master" class="mx-range" type="range" min="0" max="100" step="1" value="${pct(A.master())}" data-mx-master>
          <output for="mx-master" data-out="master">${pct(A.master())}</output>
        </div>
      </div>
      <div class="mx-field">
        <label for="mx-room">Room</label>
        <select id="mx-room" data-mx-room>${roomOpts.join("")}</select>
      </div>
      <div class="mx-group" role="group" aria-label="Ambience layers">
        <div class="mx-group-head">Layers</div>
        ${pub.map(layerRow).join("")}
      </div>
      <details class="mx-more" data-mx-more="additional"${openSec.additional ? " open" : ""}>
        <summary class="mx-sum"><span class="mx-sum-k">Additional sounds</span><span class="mx-tag">Supporter</span><span class="mx-sum-state" data-mx-sum="additional"></span></summary>
        <div class="mx-more-body" role="group" aria-label="Additional sounds">
          ${sup.map(layerRow).join("")}
          <p class="mx-note" id="mx-locked-note" data-mx-access-note></p>
        </div>
      </details>
      <details class="mx-more" data-mx-more="voices"${openSec.voices ? " open" : ""}>
        <summary class="mx-sum" id="mx-voices-h"><span class="mx-sum-k">Character audio</span><span class="mx-tag">Supporter</span><span class="mx-sum-state" data-mx-sum="voices"></span></summary>
      <section class="mx-voices mx-more-body" aria-labelledby="mx-voices-h">
        <p class="mx-note" data-mx-voice-status></p>
        <button class="mx-toggle" type="button" data-mx-voices aria-pressed="false"><span class="mx-check" aria-hidden="true"></span>Occasional voices</button>
        <fieldset class="mx-chars" data-mx-chars>
          <legend>Who you might overhear</legend>
          ${CHAR_KEYS.map((k) => `
            <label class="mx-char" style="--c:${charColor(k)}">
              <input type="checkbox" value="${k}"${prefs.characters.includes(k) ? " checked" : ""}>
              <span class="mx-char-box" aria-hidden="true"></span>
              <span class="mx-char-name">${esc(charName(k))}</span>
              <span class="mx-char-meta" data-char-meta="${k}"></span>
            </label>`).join("")}
        </fieldset>
        <div class="mx-layer">
          <label for="mx-voice">Voice volume</label>
          <input id="mx-voice" class="mx-range" type="range" min="0" max="100" step="1" value="${pct(prefs.voiceLevel)}" data-mx-voice-level>
          <output for="mx-voice" data-out="voice">${pct(prefs.voiceLevel)}</output>
        </div>
        <div class="mx-field">
          <label for="mx-freq">How often</label>
          <select id="mx-freq" data-mx-freq aria-describedby="mx-freq-note">
            ${Object.keys(freqs).map((k) => `<option value="${k}"${k === prefs.frequency ? " selected" : ""}>${freqs[k].label}</option>`).join("")}
          </select>
        </div>
        <p class="mx-note" id="mx-freq-note" data-mx-freq-note></p>
        <div class="mx-layer">
          <label for="mx-duck" title="Lower the ambience a little while a voice speaks">Ambience dip</label>
          <input id="mx-duck" class="mx-range" type="range" min="0" max="40" step="5" value="${pct(prefs.duck)}" data-mx-duck>
          <output for="mx-duck" data-out="duck">${prefs.duck ? "−" + pct(prefs.duck) + "%" : "steady"}</output>
        </div>
        <div class="mx-heard" data-mx-heard hidden></div>
      </section>
      </details>
      <p class="mx-foot">Sound starts muted on every visit. Your mix is remembered on this device.</p>`;
    wire();
    paintAll();
  }

  // ── Wiring ─────────────────────────────────────────────────────────
  function wire() {
    panel.querySelectorAll("[data-mx-more]").forEach((d) => d.addEventListener("toggle", () => {
      prefs.open = Object.assign({}, prefs.open || {}, { [d.dataset.mxMore]: d.open });
      savePrefs();
    }));
    panel.querySelector("[data-mx-close]").addEventListener("click", () => pop.close(true));
    panel.querySelector("[data-mx-power]").addEventListener("click", () => {
      const on = !A.wantsOn();
      A.power(on);                         // explicit activation only
      scheduler.setMuted(!on);
      if (on && voicesOn) scheduler.enable();
      paintAll();
    });
    const master = panel.querySelector("[data-mx-master]");
    master.addEventListener("input", () => { A.setMaster(master.value / 100); out("master", master.value); });

    panel.querySelectorAll("[data-layer]").forEach((r) => {
      r.addEventListener("input", () => {
        A.setLevel(r.dataset.layer, r.value / 100);   // never starts sound
        out(r.dataset.layer, r.value);
        setRoom("custom");
      });
    });
    const roomSel = panel.querySelector("[data-mx-room]");
    roomSel.addEventListener("change", () => {
      const p = A.PRESETS.find((x) => x.id === roomSel.value);
      if (!p) return;
      A.applyPreset(p.levels);                        // never starts sound
      setRoom(p.id);
      panel.querySelectorAll("[data-layer]").forEach((r) => {
        const v = pct(A.levels()[r.dataset.layer]);
        r.value = v; if (!r.disabled) out(r.dataset.layer, v);
      });
    });

    panel.querySelector("[data-mx-voices]").addEventListener("click", () => {
      if (!voiceAccess()) return;
      voicesOn = !voicesOn;
      if (voicesOn) { scheduler.setMuted(!A.wantsOn()); scheduler.enable(); }
      else scheduler.disable();
      paintAll();
    });
    panel.querySelectorAll("[data-mx-chars] input").forEach((cb) => {
      cb.addEventListener("change", () => {
        prefs.characters = [...panel.querySelectorAll("[data-mx-chars] input:checked")].map((x) => x.value);
        savePrefs();
        scheduler.setCharacters(prefs.characters);     // deselect cancels pending
        paintVoice();
      });
    });
    const vl = panel.querySelector("[data-mx-voice-level]");
    vl.addEventListener("input", () => { prefs.voiceLevel = vl.value / 100; A.setVoiceLevel(prefs.voiceLevel); out("voice", vl.value); savePrefs(); });
    const fq = panel.querySelector("[data-mx-freq]");
    fq.addEventListener("change", () => { prefs.frequency = fq.value; savePrefs(); scheduler.setFrequency(fq.value); paintVoice(); });
    const dk = panel.querySelector("[data-mx-duck]");
    dk.addEventListener("input", () => {
      prefs.duck = dk.value / 100; A.setDuckAmount(prefs.duck); savePrefs();
      out("duck", prefs.duck ? "−" + dk.value + "%" : "steady", true);
    });
  }
  function out(key, v, raw) { const o = panel.querySelector(`[data-out="${key}"]`); if (o) o.textContent = raw ? v : Math.round(v); }
  function setRoom(id) {
    room = id; try { localStorage.setItem(LS_ROOM, id); } catch (e) {}
    const sel = panel.querySelector("[data-mx-room]");
    if (!sel) return;
    if (id === "custom" && !sel.querySelector('option[value="custom"]')) sel.insertAdjacentHTML("beforeend", '<option value="custom">Custom mix</option>');
    sel.value = id;
  }
  const voiceAccess = () => access === "verified" || access === "preview";

  // ── Painting ───────────────────────────────────────────────────────
  function paintButton() {
    const live = A.isLive();
    btn.classList.toggle("is-live", live);
    btn.setAttribute("aria-label", "Ship ambience — sound " + (live ? "on" : "off"));
    const p = panel.querySelector("[data-mx-power]");
    if (p) {
      p.setAttribute("aria-pressed", A.wantsOn() ? "true" : "false");
      p.classList.toggle("is-on", A.wantsOn());
      p.querySelector("[data-mx-power-text]").textContent = A.wantsOn() ? (live ? "Sound on" : "Starting…") : "Sound off";
    }
  }
  function paintAccess() {
    const note = panel.querySelector("[data-mx-access-note]");
    if (note) {
      note.textContent =
        access === "checking" ? "Checking supporter access…" :
        access === "verified" ? "Supporter layers unlocked." :
        access === "preview" ? "Supporter layers shown for local review only." :
        "Supporter layers stay silent until supporter access is verified. Everything else works as usual.";
    }
    const sumAdd = panel.querySelector('[data-mx-sum="additional"]');
    if (sumAdd) sumAdd.textContent = access === "verified" ? "Unlocked" : access === "preview" ? "Preview" : access === "checking" ? "Checking…" : "Locked";
    panel.querySelectorAll("[data-layer]").forEach((r) => {
      const c = A.CHANNELS.find((x) => x.id === r.dataset.layer);
      const locked = c.tier === "supporter" && !A.audible(c.id);
      r.disabled = locked;
      r.closest(".mx-layer").classList.toggle("is-locked", locked);
      out(c.id, locked ? "—" : pct(A.levels()[c.id]), true);
    });
  }
  function paintVoice() {
    const sec = panel.querySelector(".mx-voices");
    if (!sec) return;
    const ok = voiceAccess();
    sec.classList.toggle("is-locked", !ok);
    const sumV = panel.querySelector('[data-mx-sum="voices"]');
    if (sumV) sumV.textContent = !ok ? (access === "checking" ? "Checking…" : "Locked") : voicesOn ? "On" : "Off";
    sec.querySelectorAll("input, select, [data-mx-voices]").forEach((el) => { el.disabled = !ok; });
    const tog = sec.querySelector("[data-mx-voices]");
    tog.setAttribute("aria-pressed", voicesOn ? "true" : "false");
    tog.classList.toggle("is-on", voicesOn);

    const elig = eligibleClips();
    const st = sec.querySelector("[data-mx-voice-status]");
    let msg;
    if (!ok) msg = access === "checking" ? "Checking supporter access…" :
      'Supporters occasionally overhear the crew at work. Access isn’t verified on this visit. <a href="world/support.html">About supporting</a>';
    else if (manifest.state === "loading") msg = "Looking for recordings…";
    else if (manifest.state === "error") msg = "The recordings list couldn’t be reached. Nothing will play.";
    else if (!elig.length) msg = "No recordings are connected yet, so nothing will play. Written logs exist; they haven’t been recorded or spoiler-reviewed.";
    else if (!voicesOn) msg = "Off. Turn on to hear occasional logs while sound is on.";
    else if (!A.wantsOn()) msg = "Waiting for sound to be turned on.";
    else msg = scheduler.state().phase === "playing" ? "Speaking now." : "Listening. The next log comes after a long, varied pause.";
    st.innerHTML = msg;

    CHAR_KEYS.forEach((k) => {
      const m = sec.querySelector(`[data-char-meta="${k}"]`);
      if (!m) return;
      if (!ok || manifest.state !== "ok") { m.textContent = charRole(k); return; }
      const listed = manifest.clips.filter((c) => c.character === k);
      const playable = elig.filter((c) => c.character === k).length;
      m.textContent = playable ? `${playable} recording${playable > 1 ? "s" : ""}` :
        listed.length ? "not recorded yet" : "no logs yet";
    });

    const b = window.VoxVoiceScheduler.FREQUENCIES[prefs.frequency];
    const fn = sec.querySelector("[data-mx-freq-note]");
    if (fn && b) fn.textContent = `${b.label}: ${b.note}, counted from the end of the last log. Never right away${DEV_FAST ? " (dev: ~100× faster)" : ""}.`;

    const heard = sec.querySelector("[data-mx-heard]");
    const c = now || last;
    if (heard) {
      heard.hidden = !c;
      if (c) heard.innerHTML = `<span class="mx-heard-k">${now ? "Now" : "Last heard"}</span> ${esc(charName(c.character))} · ${esc(c.title)}
        ${c.transcript ? `<details><summary>Transcript</summary><p>${esc(c.transcript)}</p></details>` : ""}`;
    }
  }
  function paintAll() { paintButton(); paintAccess(); paintVoice(); }

  // ── Popover + engine sync ──────────────────────────────────────────
  const pop = window.VoxPopover.register(btn, panel, { wrap: btn.closest(".sn-has-menu") });
  A.subscribe(() => {
    paintButton();
    if (!A.wantsOn()) scheduler.setMuted(true);   // any mute silences voices
  });

  // The engine restores saved levels/volume on DOMContentLoaded; draw after.
  function start() { render(); verify(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
