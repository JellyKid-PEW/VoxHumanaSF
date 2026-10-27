/* ─────────────────────────────────────────────────────────────────────
   Vox Humana — Manual Interface · homepage glue
   Shared chrome (cursor ring, atmospherics, real-time clock) lives in
   page-chrome.js. This file only handles things specific to the
   landing page: boot sweep, glitch hover, the ship-time footer line, the
   listening rotator, the queue indicator, and the signup form.
   ───────────────────────────────────────────────────────────────────── */

// ── Boot cover ─────────────────────────────────────────────────────
// A single scan line sweeps the page on load, then fades. Remove the
// #boot-cover div in HTML to kill the effect entirely.
(function boot() {
  const cover = document.getElementById('boot-cover');
  const screen = document.querySelector('.screen');
  if (!cover) return;
  // Return visits get a brief version (≈0.35s) so the page someone came
  // back to use isn't held dark; the first visit keeps the full sweep.
  let seen = false;
  try { seen = localStorage.getItem('voxhumana-seen') === '1'; localStorage.setItem('voxhumana-seen', '1'); } catch (e) {}
  if (seen) cover.classList.add('brief');
  setTimeout(() => {
    cover.classList.remove('scanning');
    cover.classList.add('gone');
    if (screen && !seen) screen.classList.add('flicker');
  }, seen ? 350 : 800);
})();


// ── Glitch flash ───────────────────────────────────────────────────
// Brief animation flash applied to elements with [data-glitch] on
// pointer enter. One-shot — restarts on each re-entry. Add the attr
// to any element you want to flash on hover.
(function glitchHover() {
  document.querySelectorAll('[data-glitch]').forEach((el) => {
    el.addEventListener('pointerenter', () => {
      el.classList.remove('glitch');
      void el.offsetWidth;            // force reflow so the class re-applies
      el.classList.add('glitch');
    });
  });
})();


// ── Ship time ─────────────────────────────────────────────────────
// The footer line (SHIP TIME · SIGNAL DRIFT) and every other clock come
// from scripts/ship-time.js. The old per-visitor "signal drift" counter
// (localStorage voxhumana-signal-drift-start) is retired.
try { localStorage.removeItem('voxhumana-signal-drift-start'); } catch (e) {}


// ── Stable queue waveforms ─────────────────────────────────────────
// Replaces the huge inline line-by-line SVGs with compact deterministic
// paths. Each .q-wave gets a different trace via data-wave="01".."12".
(function queueWaves() {
  const waves = document.querySelectorAll('.q-wave[data-wave]');
  if (!waves.length) return;

  const patterns = {
    // Deliberately distinct silhouettes: quiet pulse, twin spike, broad swell,
    // clipped static, then increasingly unstable held transmissions.
    '01': [11,11,10,11,9,12,8,14,6,16,9,13,10,12,11,10,11,11],
    '02': [11,10,12,10,9,13,6,18,3,19,7,15,10,12,8,14,11,11],
    '03': [11,11,11,10,12,9,13,8,14,6,16,4,18,6,16,8,14,10,12,11],
    '04': [11,9,13,7,15,5,17,3,19,2,20,4,18,6,16,8,14,10,12,11],
    '05': [11,10,11,10,12,10,11,9,13,8,14,7,15,8,14,9,13,10,12,11],
    '06': [11,12,10,13,9,14,8,15,7,16,4,18,2,20,2,20,5,17,9,13,11],
    '07': [11,11,10,12,11,9,13,10,12,6,16,9,13,3,19,8,14,10,12,11],
    '08': [11,10,12,8,14,9,13,5,17,7,15,2,20,4,18,9,13,8,14,11],
    '09': [11,11,10,11,12,11,10,9,13,6,16,2,20,6,16,9,13,10,11,11],
    '10': [11,9,13,6,16,3,19,2,20,5,17,8,14,11,10,12,9,13,10,11],
    '11': [11,11,12,10,11,8,14,5,17,7,15,9,13,4,18,6,16,8,14,11],
    '12': [11,10,11,9,13,6,16,4,18,2,20,3,19,5,17,7,15,9,13,11],
  };

  function pathFrom(points) {
    const step = 64 / (points.length - 1);
    return points.map((y, i) => `${i === 0 ? 'M' : 'L'} ${Number(i * step).toFixed(2)} ${y}`).join(' ');
  }

  waves.forEach((svg) => {
    const key = svg.dataset.wave || '01';
    const pts = patterns[key] || patterns['01'];
    const ghost = pts.map((y) => 22 - y);
    svg.innerHTML = `
      <line class="q-baseline" x1="0" y1="11" x2="64" y2="11"></line>
      <path class="q-ghost" d="${pathFrom(ghost)}"></path>
      <path class="q-trace" d="${pathFrom(pts)}"></path>
    `;
  });
})();


// ── Listening panel rotator ────────────────────────────────────────
// Three voices: B.O.B. (archive), Iri-Six (navigation), Quenby Vox
// (captain). The active perspective filters the rotation — only that
// character's lines show.  Edit freely; just keep `perspective` set to
// one of "q-vox" | "iri-six" | "bob".
const LISTENING = [
  // ─────────────────────────────────────────────
  // B.O.B. · Shipwide / Archive / Systems
  // ─────────────────────────────────────────────

  { perspective: 'bob', who: "B.O.B. · Internal Comms", text: "Observation: silence correlates with worsening captain vitals." },
  { perspective: 'bob', who: "B.O.B. · Archive", text: "Archive note: logged and idle." },
  { perspective: 'bob', who: "B.O.B. · Bridge Feed", text: "Recommendation withheld." },
  { perspective: 'bob', who: "B.O.B. · Medbay Monitor", text: "Crew vitals remain technically discouraging." },
  { perspective: 'bob', who: "B.O.B. · Environmental Control", text: "Atmospheric normals holding. Emotional normals unavailable." },
  { perspective: 'bob', who: "B.O.B. · Cargo Manifest", text: "Manifest reads green. Crew judgment pending." },
  { perspective: 'bob', who: "B.O.B. · Galley Feed", text: "Kettle cycled twice. No one claimed responsibility." },
  { perspective: 'bob', who: "B.O.B. · Helm Subroutine", text: "Manual mode persists. Ship irritation measurable." },
  { perspective: 'bob', who: "B.O.B. · Registry Cache", text: "Registry mismatch ignored by mutual consent." },
  { perspective: 'bob', who: "B.O.B. · Environmental Control", text: "Comfort loops reduced. Complaint likelihood elevated." },
  { perspective: 'bob', who: "B.O.B. · Crew Log", text: "Crew designation update deferred." },
  { perspective: 'bob', who: "B.O.B. · Corridor Routing", text: "Local pathways narrowing. Haste advised." },
  { perspective: 'bob', who: "B.O.B. · Docking Collar", text: "Dock seal cooperative. I am choosing optimism." },
  { perspective: 'bob', who: "B.O.B. · Risk Assessment", text: "The pessimistic subsystem has been outvoted." },
  { perspective: 'bob', who: "B.O.B. · Debt Ledger", text: "Debt flag present. Status: inconveniently alive." },
  { perspective: 'bob', who: "B.O.B. · Relay Feed", text: "Signal bleed detected. Politeness level: poor." },
  { perspective: 'bob', who: "B.O.B. · Medbay Monitor", text: "Hydration recommended before the next argument." },
  { perspective: 'bob', who: "B.O.B. · Engine Crawl", text: "The ship is not sulking. The ship is registering disagreement." },
  { perspective: 'bob', who: "B.O.B. · Cooling Manifold", text: "Cooling patch window recalculating. Please enjoy uncertainty." },
  { perspective: 'bob', who: "B.O.B. · Bridge Lights", text: "Bridge lights trimmed. Drama level remains externally generated." },
  { perspective: 'bob', who: "B.O.B. · Rest Cycle Log", text: "Archive note: nobody aboard sleeps correctly." },
  { perspective: 'bob', who: "B.O.B. · View Dome", text: "Crew proximity increasing. Comment withheld under duress." },
  { perspective: 'bob', who: "B.O.B. · Pilot Cradle", text: "Captain ignored advisory. Advisory remains emotionally available." },
  { perspective: 'bob', who: "B.O.B. · Internal Comms", text: "Internal comms quiet. This is rarely a good sign." },
  { perspective: 'bob', who: "B.O.B. · Tea Rack", text: "Galley temperature stable. Tea morale inconclusive." },
  { perspective: 'bob', who: "B.O.B. · Port Registry", text: "Port registry ping declined to become useful." },
  { perspective: 'bob', who: "B.O.B. · Archive", text: "Archive query returned seventeen rumors and no apology." },
  { perspective: 'bob', who: "B.O.B. · Medbay Door", text: "Crew status: upright. This is not the same as fine." },
  { perspective: 'bob', who: "B.O.B. · Environmental Control", text: "Environmental loop trimmed by captain request. Regret probable." },
  { perspective: 'bob', who: "B.O.B. · Maintenance Bay", text: "Diagnostic result: ship remains stubborn." },
  { perspective: 'bob', who: "B.O.B. · Hull Skin", text: "Unregistered signal brushed hull. No handshake accepted." },
  { perspective: 'bob', who: "B.O.B. · Bridge Feed", text: "Captain tone suggests further questions would be poorly received." },
  { perspective: 'bob', who: "B.O.B. · Legacy File", text: "Legacy file opened itself. I did not appreciate that." },
  { perspective: 'bob', who: "B.O.B. · Internal Comms", text: "Observation: captain uses silence as punctuation." },
  { perspective: 'bob', who: "B.O.B. · Auxiliary Console", text: "Observation: Iri-Six uses silence as infrastructure." },
  { perspective: 'bob', who: "B.O.B. · Archive", text: "Archive note: Vox references remain culturally unstable." },
  { perspective: 'bob', who: "B.O.B. · Docking Collar", text: "Docking request accepted under suspiciously casual terms." },
  { perspective: 'bob', who: "B.O.B. · Cooling Manifold", text: "Thermal drift inside tolerance. Barely." },
  { perspective: 'bob', who: "B.O.B. · Rest Cycle Log", text: "Crew rest recommendation filed. Crew ignored filing." },
  { perspective: 'bob', who: "B.O.B. · Surface Relay", text: "Signal mirror active. Surface contamination low." },

  // ─────────────────────────────────────────────
  // Iri-Six · Locations should imply function, restraint, cost, or quiet care.
  // ─────────────────────────────────────────────

  { perspective: 'iri-six', who: "Iri-Six · Navigation Well", text: "Forward works." },
  { perspective: 'iri-six', who: "Iri-Six · Maintenance Bay", text: "Margin used." },
  { perspective: 'iri-six', who: "Iri-Six · Cooling Manifold", text: "Enough holds until it doesn't." },
  { perspective: 'iri-six', who: "Iri-Six · Auxiliary Console", text: "No correction yet." },
  { perspective: 'iri-six', who: "Iri-Six · Docking Collar", text: "The line opens once. Take it." },
  { perspective: 'iri-six', who: "Iri-Six · Portside Corridor", text: "Noise is not movement." },
  { perspective: 'iri-six', who: "Iri-Six · Garden Feed", text: "Two clicks open. Close on the breath after." },
  { perspective: 'iri-six', who: "Iri-Six · View Dome", text: "Do not make drift sentimental." },
  { perspective: 'iri-six', who: "Iri-Six · Engine Crawl", text: "The ship listens better when no one flatters it." },
  { perspective: 'iri-six', who: "Iri-Six · Skiff Bay", text: "I can ride the well." },
  { perspective: 'iri-six', who: "Iri-Six · Dockside Approach", text: "Not clean. Possible." },
  { perspective: 'iri-six', who: "Iri-Six · Common Bench", text: "Rest is maintenance." },
  { perspective: 'iri-six', who: "Iri-Six · Cargo Alcove", text: "A closed hatch still tells you where the room ends." },
  { perspective: 'iri-six', who: "Iri-Six · Maintenance Bay", text: "If it rattles, shut it down." },
  { perspective: 'iri-six', who: "Iri-Six · Airlock", text: "We leave before luck remembers us." },
  { perspective: 'iri-six', who: "Iri-Six · Bridge Rail", text: "Both hands." },
  { perspective: 'iri-six', who: "Iri-Six · Garden Feed", text: "Schedule. Not orders." },
  { perspective: 'iri-six', who: "Iri-Six · Skiff Locker", text: "Don’t carry weight you don’t need." },
  { perspective: 'iri-six', who: "Iri-Six · Maintenance Bay", text: "Check the seal twice. Trust it once." },
  { perspective: 'iri-six', who: "Iri-Six · Training Chamber", text: "Angle wrong. Try again." },
  { perspective: 'iri-six', who: "Iri-Six · Skiff Bay", text: "Less drag. More room." },
  { perspective: 'iri-six', who: "Iri-Six · Auxiliary Console", text: "The map is lying by omission." },
  { perspective: 'iri-six', who: "Iri-Six · Gravity Well Plot", text: "Bad is a moral term. Gravity doesn’t care." },
  { perspective: 'iri-six', who: "Iri-Six · Airlock", text: "Door first. Then corridor." },
  { perspective: 'iri-six', who: "Iri-Six · Relay Station", text: "Watch the seam." },
  { perspective: 'iri-six', who: "Iri-Six · Dockside Approach", text: "No. The other left." },
  { perspective: 'iri-six', who: "Iri-Six · Corridor Routing", text: "This route wants panic. Don’t give it any." },
  { perspective: 'iri-six', who: "Iri-Six · Engine Crawl", text: "The ship is compensating. Badly." },
  { perspective: 'iri-six', who: "Iri-Six · Medbay Door", text: "Useful damage is still damage." },
  { perspective: 'iri-six', who: "Iri-Six · Relay Station", text: "Keep the exit behind your shoulder." },
  { perspective: 'iri-six', who: "Iri-Six · Pressure Readout", text: "Count pressure, not seconds." },
  { perspective: 'iri-six', who: "Iri-Six · Station Threshold", text: "The first alarm is rarely the problem." },
  { perspective: 'iri-six', who: "Iri-Six · Maintenance Bay", text: "Your hand is too loud." },
  { perspective: 'iri-six', who: "Iri-Six · Cooling Manifold", text: "It holds because I told it to." },
  { perspective: 'iri-six', who: "Iri-Six · Training Chamber", text: "No wasted motion." },
  { perspective: 'iri-six', who: "Iri-Six · Relay Station", text: "Move when the room commits." },
  { perspective: 'iri-six', who: "Iri-Six · Airlock", text: "A clean cut still costs." },
  { perspective: 'iri-six', who: "Iri-Six · Cabin Hatch", text: "Names matter. Later." },
  { perspective: 'iri-six', who: "Iri-Six · Bridge Rail", text: "Forward. Then argue." },

  // ─────────────────────────────────────────────
  // Quenby Vox · Location changes whether she is commanding, deflecting, avoiding, or almost honest.
  // ─────────────────────────────────────────────

  { perspective: 'q-vox', who: "Quenby Vox · Pilot Cradle", text: "We run quiet until we don't." },
  { perspective: 'q-vox', who: "Quenby Vox · Bridge", text: "No banners. Just the lane." },
  { perspective: 'q-vox', who: "Quenby Vox · Navigation Well", text: "Plot me the cleanest filthy lane." },
  { perspective: 'q-vox', who: "Quenby Vox · Debt Ledger", text: "Debt lingers. Don’t give it a chair." },
  { perspective: 'q-vox', who: "Quenby Vox · Environmental Control", text: "Comfort is expensive. Cut it." },
  { perspective: 'q-vox', who: "Quenby Vox · View Dome", text: "Forward is not the same as safe." },
  { perspective: 'q-vox', who: "Quenby Vox · Maintenance Bay", text: "I’ve rented worse." },
  { perspective: 'q-vox', who: "Quenby Vox · Relay Station", text: "We look. We don’t promise." },
  { perspective: 'q-vox', who: "Quenby Vox · View Dome", text: "The trick is knowing when quiet turns into a trap." },
  { perspective: 'q-vox', who: "Quenby Vox · Pilot Cradle", text: "Don’t make drift a philosophy." },
  { perspective: 'q-vox', who: "Quenby Vox · Skiff Bay", text: "We’re not taking banners. We’re taking exits." },
  { perspective: 'q-vox', who: "Quenby Vox · Archive Terminal", text: "Sounds fade. People just hate noticing." },
  { perspective: 'q-vox', who: "Quenby Vox · Dockside Market", text: "Let the room think we’re smaller than we are." },
  { perspective: 'q-vox', who: "Quenby Vox · Tea Rack", text: "Don’t confuse craving with feeling." },
  { perspective: 'q-vox', who: "Quenby Vox · Common Bench", text: "We breathe. Then we decide." },
  { perspective: 'q-vox', who: "Quenby Vox · Maintenance Bay", text: "I’m careful with different things." },
  { perspective: 'q-vox', who: "Quenby Vox · View Dome", text: "Don’t sell silence back to me like it’s peace." },
  { perspective: 'q-vox', who: "Quenby Vox · Engine Crawl", text: "Keep the ship ugly and moving." },
  { perspective: 'q-vox', who: "Quenby Vox · Docking Collar", text: "If it wants ceremony, disappoint it." },
  { perspective: 'q-vox', who: "Quenby Vox · Airlock", text: "I don’t trust friendly docks." },
  { perspective: 'q-vox', who: "Quenby Vox · Skiff Bay", text: "Make the exit boring." },
  { perspective: 'q-vox', who: "Quenby Vox · Medbay Door", text: "Nothing heroic. Just useful." },
  { perspective: 'q-vox', who: "Quenby Vox · Relay Station", text: "The room wants a show. Don’t give it one." },
  { perspective: 'q-vox', who: "Quenby Vox · Archive Terminal", text: "If the myth knocks, don’t answer fast." },
  { perspective: 'q-vox', who: "Quenby Vox · Registry Cache", text: "Old names open bad doors." },
  { perspective: 'q-vox', who: "Quenby Vox · Bridge Lights", text: "No stage lights. Not today." },
  { perspective: 'q-vox', who: "Quenby Vox · Debt Ledger", text: "We can be broke after we’re alive." },
  { perspective: 'q-vox', who: "Quenby Vox · Internal Comms", text: "Good news should make less noise." },
  { perspective: 'q-vox', who: "Quenby Vox · Relay Station", text: "Keep your hands where the ship can see them." },
  { perspective: 'q-vox', who: "Quenby Vox · Archive Feed", text: "If I start performing, cut the feed." },
  { perspective: 'q-vox', who: "Quenby Vox · Skiff Bay", text: "That’s not a plan. That’s a dare wearing boots." },
  { perspective: 'q-vox', who: "Quenby Vox · Pilot Cradle", text: "The Huntress hates being begged." },
  { perspective: 'q-vox', who: "Quenby Vox · Maintenance Bay", text: "Ugly counts if it flies." },
  { perspective: 'q-vox', who: "Quenby Vox · Dockside Approach", text: "I don’t need clean. I need through." },
  { perspective: 'q-vox', who: "Quenby Vox · View Dome", text: "A quiet room is still a room with teeth." },
  { perspective: 'q-vox', who: "Quenby Vox · Engine Crawl", text: "Don’t make me call that luck." },
  { perspective: 'q-vox', who: "Quenby Vox · Airlock", text: "We leave before the station gets sentimental." },
  { perspective: 'q-vox', who: "Quenby Vox · Registry Cache", text: "Names travel badly." },
  { perspective: 'q-vox', who: "Quenby Vox · Job Board", text: "If they wanted honest work, they’d pay honest money." },
  { perspective: 'q-vox', who: "Quenby Vox · Pilot Cradle", text: "The chair’s warm. That’s not loyalty." },

  // ─────────────────────────────────────────────
  // Nova · Early Book 2 Bleed
  // I’d consider using “Unregistered Signal” before she is named.
  // Once Book 2 begins, switch to Nova-specific location tags.
  // ─────────────────────────────────────────────

  { perspective: 'nova', who: "Unregistered Signal · Medbay", text: "A blanket is not a room." },
  { perspective: 'nova', who: "Unregistered Signal · Medbay Door", text: "Don’t look at my wrists unless you’re going to say something useful." },
  { perspective: 'nova', who: "Unregistered Signal · Galley", text: "If this is rescue, you need a better word." },
  { perspective: 'nova', who: "Unregistered Signal · Common Bench", text: "I don’t need soft. I need true." },
  { perspective: 'nova', who: "Unregistered Signal · Corridor", text: "Every quiet room has a hook in it." },
  { perspective: 'nova', who: "Unregistered Signal · Bridge Threshold", text: "I know when people are waiting to decide what I am." },
  { perspective: 'nova', who: "Unregistered Signal · Galley", text: "You can’t rescue someone and keep them unnamed." },
  { perspective: 'nova', who: "Unregistered Signal · Medbay Cot", text: "The cot’s too clean. That’s how I know it’s lying." },
  { perspective: 'nova', who: "Unregistered Signal · Bridge", text: "Your ship acts like it already voted." },
  { perspective: 'nova', who: "Unregistered Signal · Galley", text: "Fine. I’ll be the problem with a chair." },

  { perspective: 'nova', who: "Nova · Bridge Floor", text: "Drift is just a box of air pretending to move." },
  { perspective: 'nova', who: "Nova · Tea Rack", text: "Sugar isn’t a feeling. Fine. Still want it." },
  { perspective: 'nova', who: "Nova · View Dome", text: "You two circle like the silence belongs to you." },
  { perspective: 'nova', who: "Nova · Cargo Alcove", text: "Funny how nobody says asset until they want something." },
  { perspective: 'nova', who: "Nova · Skiff Bay", text: "I hate when the ship feels right before people do." },
  { perspective: 'nova', who: "Nova · Relay Station", text: "I can feel it before it breaks." },
  { perspective: 'nova', who: "Nova · Training Chamber", text: "One block isn’t a pattern. I know." },
  { perspective: 'nova', who: "Nova · Bridge Threshold", text: "You don’t get to call me variable and then act surprised when I move." },
  { perspective: 'nova', who: "Nova · Garden Feed", text: "The garden smells alive. That’s worse." },
  { perspective: 'nova', who: "Nova · Corridor", text: "Doors sound different when they’re lying." },
  { perspective: 'nova', who: "Nova · Common Bench", text: "If you’re going to keep watch, admit it." },
  { perspective: 'nova', who: "Nova · Archive Terminal", text: "Counting doesn’t stop just because you leave the room." },
  { perspective: 'nova', who: "Nova · Bridge Floor", text: "I’m younger. I’ll outlast you." },
  { perspective: 'nova', who: "Nova · Medbay Door", text: "You keep acting like wanting is louder than alarms." },
  { perspective: 'nova', who: "Nova · Galley", text: "Don’t trade me a choice and call it kindness." },
  { perspective: 'nova', who: "Nova · Tea Rack", text: "If I get a tin, it says Sugar." },
  { perspective: 'nova', who: "Nova · View Dome", text: "That wasn’t silence. That was everyone choosing not to blink." },
  { perspective: 'nova', who: "Nova · Relay Feed", text: "I don’t know the story. I know the pressure." },
  { perspective: 'nova', who: "Nova · Common Bench", text: "You said stay like it was a system command." },
  { perspective: 'nova', who: "Nova · Training Chamber", text: "Better than drift." },
  { perspective: 'nova', who: "Nova · Medbay Cot", text: "This ship waits before it opens. I hate that." },
  { perspective: 'nova', who: "Nova · Corridor", text: "Everybody here talks like doors can hear them." },
  { perspective: 'nova', who: "Nova · Galley", text: "You both say nothing like it means something different." },
  { perspective: 'nova', who: "Nova · Skiff Bay", text: "I’m not cargo because you carried me." },
  { perspective: 'nova', who: "Nova · Corridor", text: "I asked for a name. You gave me a hallway." },
  { perspective: 'nova', who: "Nova · Bridge", text: "The ship hums better when no one’s pretending." },
  { perspective: 'nova', who: "Nova · Galley", text: "I don’t want comfort. I want proof." },
  { perspective: 'nova', who: "Nova · Common Bench", text: "If I’m staying, I’m not staying politely." },
  { perspective: 'nova', who: "Nova · Galley", text: "I don’t trust food that tastes like medicine." }
];

// "Unknown Signal" entries. While Nova could not be selected, these were
// injected at random into every perspective's rotation as foreshadowing.
// They now belong to Nova's stream only (see updateListening) and never
// appear in Quenby's, Iri-Six's or B.O.B.'s. Provenance: the memory store's
// "unknown-signal" view (db/extract-from-voices.js) — this array is its
// offline fallback. The labels are kept as written here; the page shows
// them as "Nova · <place>" (novaWho in updateListening).
const UNKNOWN_LISTENING = [
  { who: "Unknown Signal · Medbay Cot", text: "Blanket logged as shelter. Dispute pending." },
  { who: "Unknown Signal · Galley", text: "The room hums wrong when they stop talking." },
  { who: "Unknown Signal · Corridor", text: "Hands hidden. Eyes open." },
  { who: "Unknown Signal · Bridge Threshold", text: "Question repeated. Answer avoided." },
  { who: "Unknown Signal · Skiff Bay", text: "The ship opened before anyone asked." },
  { who: "Unknown Signal · Tea Rack", text: "Sweet request denied by silence." },
  { who: "Unknown Signal · Relay Feed", text: "Pressure arrived before the sound." },
  { who: "Unknown Signal · Medbay Door", text: "Nobody says cargo when they mean person." },
  { who: "Unknown Signal · Common Bench", text: "Choice offered. Proof still pending." },
  { who: "Unknown Signal · Hull Skin", text: "Something small knocked once and listened back." },
];

const MAX_LISTENING_CARDS = 6;

// Current active mini-deck — rebuilt whenever the perspective switches.
let listeningFilter = LISTENING.slice(0, MAX_LISTENING_CARDS);

function shuffleCopy(items) {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pickOne(items) {
  return items[Math.floor(Math.random() * items.length)];
}

(function listeningRotator() {
  // The visual quote carousel. Slow automatic rotation, plus manual
  // browsing from the bottom strip (previous · pause/resume · next · dots).
  //   · Entries come only from the current perspective's own pool. Cards
  //     are dealt six at a time without repeats until the whole pool has
  //     been shown, so every entry is reachable; dots/count show the deck.
  //   · Hover or keyboard focus inside the block holds rotation briefly.
  //   · Any manual browse pauses rotation until the visitor resumes it.
  //   · Resuming gives the current quote a full interval.
  //   · Reduced-motion visitors start paused.
  //   · A perspective switch cancels any pending fade or timer, so nothing
  //     from the previous stream can appear afterwards.
  // Separate from the ship-ambience audio in the navigation.
  const panel = document.getElementById('listening');
  const who   = panel && panel.querySelector('[data-ls-who]');
  const line  = panel && panel.querySelector('[data-ls-line]');
  const dots  = panel && panel.querySelector('[data-ls-dots]');
  const num   = panel && panel.querySelector('[data-ls-num]');
  const total = panel && panel.querySelector('[data-ls-total]');
  const prevB = panel && panel.querySelector('[data-ls-prev]');
  const nextB = panel && panel.querySelector('[data-ls-next]');
  const toggleB = panel && panel.querySelector('[data-ls-toggle]');
  if (!who || !line) return;

  const LISTENING_DWELL = 20000;
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let pool = [];        // every eligible entry for the current perspective
  let bag = [];         // entries not yet dealt in this round
  let i = 0;
  let userPaused = reduceMotion;   // explicit pause (button, manual browse, reduced motion)
  let hovering = false;
  let focused = false;
  let timer = null;
  let fadeTimer = null;

  function engaged() {
    return hovering || focused || panel.matches(':hover') || panel.contains(document.activeElement);
  }

  // Next deck of up to MAX_LISTENING_CARDS from the pool, no repeats until
  // the pool is exhausted; a new round never opens on the card just shown.
  function deal() {
    const last = listeningFilter[i];
    if (!bag.length) {
      bag = shuffleCopy(pool);
      if (bag.length > 1 && bag[0] === last) bag.push(bag.shift());
    }
    listeningFilter = bag.splice(0, MAX_LISTENING_CARDS);
    i = 0;
    rebuildDots();
  }

  function rebuildDots() {
    if (!dots) return;
    dots.innerHTML = '';
    listeningFilter.forEach((_, n) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ls-dot';
      b.setAttribute('aria-label', `Quote ${n + 1} of ${listeningFilter.length}`);
      b.innerHTML = '<i></i>';
      b.addEventListener('click', () => browse(n));
      dots.appendChild(b);
    });
  }

  function paintControls() {
    if (toggleB) {
      toggleB.setAttribute('aria-pressed', userPaused ? 'true' : 'false');
      toggleB.setAttribute('aria-label', userPaused ? 'Resume automatic rotation' : 'Pause automatic rotation');
      toggleB.title = userPaused ? 'Resume rotation' : 'Pause rotation';
      toggleB.classList.toggle('is-paused', userPaused);
    }
    panel.classList.toggle('is-paused', userPaused);
    // Announce changes only while the visitor is driving the carousel.
    line.setAttribute('aria-live', userPaused ? 'polite' : 'off');
    const none = pool.length < 2;
    [prevB, nextB, toggleB].forEach((b) => { if (b) b.disabled = none; });
  }

  function render() {
    if (!listeningFilter.length) {
      panel.classList.remove('is-unknown');
      who.textContent = '';
      line.textContent = '';
      if (num) num.textContent = '00';
      if (total) total.textContent = '00';
      return;
    }
    if (i >= listeningFilter.length || i < 0) i = 0;   // never point past the deck
    const cur = listeningFilter[i];
    const unknown = !!cur.unknown;
    panel.classList.toggle('is-unknown', unknown);
    who.classList.toggle('is-unknown', unknown);
    who.textContent  = cur.who;
    line.textContent = `“${cur.text}”`;
    if (dots) {
      [...dots.children].forEach((d, n) => {
        const on = n === i;
        d.classList.toggle('on', on);
        if (on) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current');
      });
    }
    if (num) num.textContent = String(i + 1).padStart(2, '0');
    if (total) total.textContent = String(listeningFilter.length).padStart(2, '0');
  }

  // Reserve the height of the longest quote and attribution across EVERY
  // perspective (not just the current pool), so neither rotating nor
  // switching the Lens ever resizes the block. reserveTexts collects all
  // the lines seen this session; updateListening feeds it each view's lines.
  const reserveTexts = { line: new Set(), who: new Set() };
  window.__listeningReserve = (items) => {
    let grew = false;
    (items || []).forEach((c) => {
      const t = `“${c.text}”`;
      if (!reserveTexts.line.has(t)) { reserveTexts.line.add(t); grew = true; }
      if (c.who && !reserveTexts.who.has(c.who)) { reserveTexts.who.add(c.who); grew = true; }
    });
    if (grew) reserveHeight();
  };
  function reserveHeight() {
    if (!line.clientWidth || !(pool.length || reserveTexts.line.size)) return;
    const probe = (el, texts) => {
      const ghost = el.cloneNode(false);
      ghost.removeAttribute('data-ls-line');
      ghost.removeAttribute('data-ls-who');
      ghost.removeAttribute('aria-live');
      ghost.setAttribute('aria-hidden', 'true');
      Object.assign(ghost.style, {
        position: 'absolute', visibility: 'hidden', minHeight: '0',
        width: el.getBoundingClientRect().width + 'px', left: '-9999px', top: '0',
      });
      el.parentNode.appendChild(ghost);
      let max = 0;
      texts.forEach((t) => { ghost.textContent = t; max = Math.max(max, ghost.getBoundingClientRect().height); });
      ghost.remove();
      return Math.ceil(max);
    };
    pool.forEach((c) => { reserveTexts.line.add(`“${c.text}”`); if (c.who) reserveTexts.who.add(c.who); });
    line.style.minHeight = probe(line, [...reserveTexts.line]) + 'px';
    who.style.minHeight = probe(who, [...reserveTexts.who]) + 'px';
  }

  function clearTimers() {
    clearTimeout(timer); timer = null;
    clearTimeout(fadeTimer); fadeTimer = null;
    line.classList.remove('fade');
  }

  function schedule() {
    clearTimeout(timer);
    if (userPaused || hovering || focused || document.hidden || pool.length < 2) return;
    timer = setTimeout(advance, LISTENING_DWELL);
  }

  function step(dir) {
    if (dir > 0 && i + 1 >= listeningFilter.length) { deal(); }
    else i = (i + dir + listeningFilter.length) % listeningFilter.length;
  }

  function advance() {
    if (userPaused) return;
    if (pool.length < 2 || engaged()) return schedule();
    line.classList.add('fade');
    fadeTimer = setTimeout(() => {
      fadeTimer = null;
      if (userPaused) { line.classList.remove('fade'); return; }
      step(1);
      render();
      line.classList.remove('fade');
      schedule();
    }, 380);
  }

  // Manual browse: immediate, no focus movement, rotation stays paused.
  function browse(target) {
    if (!listeningFilter.length) return;
    clearTimers();
    userPaused = true;
    if (target === 'next') step(1);
    else if (target === 'prev') step(-1);
    else i = target;
    render();
    paintControls();
  }

  if (prevB) prevB.addEventListener('click', () => browse('prev'));
  if (nextB) nextB.addEventListener('click', () => browse('next'));
  if (toggleB) toggleB.addEventListener('click', () => {
    userPaused = !userPaused;
    paintControls();
    // A full interval for the current quote. (Hover/focus still hold the
    // timer until attention leaves the block.)
    schedule();
  });

  panel.addEventListener('pointerenter', () => { hovering = true; schedule(); });
  panel.addEventListener('pointerleave', () => { hovering = false; schedule(); });
  panel.addEventListener('focusin', () => { focused = true; schedule(); });
  panel.addEventListener('focusout', (e) => {
    if (e.relatedTarget && panel.contains(e.relatedTarget)) return;
    focused = false; schedule();
  });
  document.addEventListener('visibilitychange', schedule);
  let rz = null;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(reserveHeight, 120); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(reserveHeight);

  // Called when the perspective changes: new pool, same pause state.
  // opts.keepCurrent: same perspective, fuller data — keep the quote that is
  // on screen as the first card of the new deck so nothing visibly jumps.
  window.__listeningRefilter = (items, opts = {}) => {
    clearTimers();
    const cur = listeningFilter[i];
    pool = Array.isArray(items) ? items.slice() : [];
    bag = [];
    listeningFilter = [];
    deal();
    if (opts.keepCurrent && cur && pool.length && cur.perspective === pool[0].perspective) {
      listeningFilter = [cur].concat(listeningFilter.filter((c) => c.text !== cur.text)).slice(0, MAX_LISTENING_CARDS);
      bag = bag.filter((c) => c.text !== cur.text);
      i = 0;
      rebuildDots();
    }
    render();
    reserveHeight();
    paintControls();
    schedule();
  };

  // Debug/verification hook (read-only).
  window.__listeningState = () => ({ pool: pool.length, deck: listeningFilter.map((c) => c.who + ' | ' + c.text), index: i, paused: userPaused });

  // First paint: the saved perspective's offline lines (the store version
  // replaces them moments later), so no other perspective flashes first.
  let first = 'q-vox';
  try { first = localStorage.getItem('voxhumana-perspective') || 'q-vox'; } catch (e) {}
  window.__listeningRefilter(LISTENING.filter((l) => l.perspective === first));
})();


// ── Transmission Queue scroll indicator ────────────────────────────
// ─────────────────────────────────────────────
// FIT TO THE WINDOW (two-column desktop)
// Sizes the Transmission panel so the whole page — header, both halves,
// footer — fits the window height, instead of the panel alone filling it.
// The panel never drops below 460px or below the left column's own
// height (shrinking past that would gain nothing); when the window is
// too short for even that, the page scrolls as before. Stacked and phone
// layouts keep their CSS heights.
// ─────────────────────────────────────────────
(function fitToWindow() {
  const q = document.querySelector('.home .queue');
  const main = document.querySelector('.home .main');
  const ident = document.querySelector('.home .identity');
  const screen = document.querySelector('.home .screen');
  const foot = document.querySelector('.home .bottombar');
  // Scale the outer wrapper so the SHIP TIME line (outside .screen) scales too.
  const frame = document.querySelector('.home .hull') || screen;
  if (!q || !main || !ident || !screen || !foot) return;
  const wide = window.matchMedia('(min-width: 1080px)');
  const MIN = 460, MAX = 1000;
  // Laptop-height windows: after the panel has given what it can, the
  // whole page scales down to fit, the way browser zoom does — but never
  // below 80%, so text stays readable. Shorter windows than that scroll.
  const MIN_SCALE = 0.8;
  let raf = 0;

  // Where the page's content really ends (the page box itself always
  // stretches to the window, so it can't be used): footer + bottom padding.
  function contentBottom(z) {
    return foot.getBoundingClientRect().bottom + (parseFloat(getComputedStyle(screen).paddingBottom) || 0) * z;
  }

  // z = the page's current scale; measurements are in screen pixels, the
  // panel's height is set in the page's own (unscaled) pixels.
  function fitPanel(z) {
    // Below this the panel would end above the left column, gaining nothing.
    const floor = Math.max(MIN, Math.ceil((ident.getBoundingClientRect().bottom - q.getBoundingClientRect().top) / z));
    let h = q.getBoundingClientRect().height / z;
    for (let i = 0; i < 3; i++) {
      // Positive: too tall; negative: room to spare (the panel may grow).
      const diff = (contentBottom(z) - window.innerHeight) / z;
      const nh = Math.max(floor, Math.min(MAX, Math.floor(h - diff)));
      if (Math.abs(nh - h) < 1) break;
      q.style.setProperty('--panel-h', nh + 'px');
      h = nh;
    }
  }
  // While scaled, the page's "at least the window's height" is set in px
  // (browsers disagree on whether vh units scale with zoom; px always do),
  // so the background still reaches the bottom of the window.
  function setScale(z) {
    const els = frame === screen ? [screen] : [frame, screen];
    if (z >= 1) {
      frame.style.removeProperty('zoom');
      els.forEach((el) => el.style.removeProperty('min-height'));
      document.documentElement.style.removeProperty('--page-scale');
    } else {
      frame.style.zoom = String(z);
      els.forEach((el) => { el.style.minHeight = Math.floor(window.innerHeight / z) + 'px'; });
      document.documentElement.style.setProperty('--page-scale', String(z));
    }
  }
  function fit() {
    raf = 0;
    q.style.removeProperty('--panel-h');
    setScale(1);
    if (!wide.matches) return;
    fitPanel(1);
    if (!('zoom' in frame.style)) return;
    // Scaling reflows the page slightly (it gains width), so settle in a
    // few passes; 2px spare so rounding never brings back a scrollbar.
    let z = 1;
    for (let i = 0; i < 4; i++) {
      const bottom = contentBottom(z);
      if (z === 1 && bottom <= window.innerHeight) break;
      const nz = Math.min(1, Math.max(MIN_SCALE, Math.floor(z * ((window.innerHeight - 2) / bottom) * 1000) / 1000));
      if (Math.abs(nz - z) < 0.003) break;
      z = nz;
      setScale(z);
      fitPanel(z);
    }
  }
  // A short timer rather than requestAnimationFrame, which doesn't run in
  // background tabs (a page opened behind another would never fit).
  const schedule = () => { clearTimeout(raf); raf = setTimeout(fit, 40); };
  window.__fitToWindow = fit; // review tooling: refit on demand
  window.addEventListener('resize', schedule);
  if (wide.addEventListener) wide.addEventListener('change', schedule);
  // The left column settles late (fonts, Listening's reserved height).
  if ('ResizeObserver' in window) new ResizeObserver(schedule).observe(ident);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
  schedule();
})();

// Updates the "Viewing 01–06 of 12 · N more · scroll" line and tracks
// the red pip to the "Up Next" row's vertical position.
(function queueScroll() {
  const scroll = document.getElementById('q-scroll');
  const rail   = document.getElementById('q-rail');
  const pip    = document.getElementById('q-pip');
  const range  = document.getElementById('q-range');
  const more   = document.getElementById('q-more');
  const moreT  = document.getElementById('q-more-text');
  const end    = document.getElementById('q-end');
  const ind    = document.getElementById('q-indicator');
  if (!scroll) return;

  const rows = [...scroll.querySelectorAll('.q-row')];
  const TOTAL = rows.length;

  function update() {
    // Track the pip to the "Up Next" row.
    const nextRow = scroll.querySelector('[data-status="next"]');
    if (nextRow && pip && rail) {
      const railRect = rail.getBoundingClientRect();
      const rowRect  = nextRow.getBoundingClientRect();
      const top = Math.max(0, Math.min(railRect.height - rowRect.height,
                                       rowRect.top - railRect.top));
      pip.style.top = top + 'px';
      pip.style.height = rowRect.height + 'px';
    }

    // Figure out visible range by row midpoint
    const sr = scroll.getBoundingClientRect();
    let first = TOTAL, last = 0;
    rows.forEach((r, i) => {
      const rr = r.getBoundingClientRect();
      const mid = rr.top + rr.height / 2;
      if (mid >= sr.top && mid <= sr.bottom) {
        first = Math.min(first, i + 1);
        last  = Math.max(last,  i + 1);
      }
    });
    if (last === 0) { first = 1; last = 1; }
    // The end is reached once the last row is in view (or the list can't
    // scroll further) — never show "0 more · scroll" beside the end note.
    const atBottom = last >= TOTAL ||
      scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 4;

    range.textContent =
      `${String(first).padStart(2, '0')}–${String(last).padStart(2, '0')}`;

    if (atBottom) {
      more.hidden = true;
      end.hidden = false;
      ind.classList.add('at-end');
    } else {
      more.hidden = false;
      end.hidden = true;
      ind.classList.remove('at-end');
      moreT.textContent = (TOTAL - last) + ' more · scroll';
    }
  }

  update();
  scroll.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  // The panel's height is fitted to the window, so watch the list itself.
  if ('ResizeObserver' in window) new ResizeObserver(update).observe(scroll);
})();


// ── Signal signup ─────────────────────────────────────────────────
// Replace the form with an acknowledgement line on submit. Hook this
// up to your mailing-list endpoint when you have one.
(function signalForm() {
  const form = document.getElementById('signal-form');
  const ack  = document.getElementById('signal-ack');
  if (!form || !ack) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    // TODO: send `new FormData(form).get('email')` to your endpoint
    form.hidden = true;
    ack.hidden  = false;
  });
})();


// Additional Nova dispatch entries (formerly the "??:" interruptions in
// every perspective). Shown in Nova's ticker only, as ordinary dispatch
// items: each gets a real HH:MM stamp, drawn at random between its
// neighbours' times so the feed reads in descending order like the other
// characters' feeds. Wording unchanged.
const NOVA_EXTRA_DISPATCH = [
  'Unregistered tremor · Medbay light shifted',
  'Small hands detected · Fabric tension logged',
  'Unknown passenger weight · Chair angle disputed',
  'Sweetener query formed · Not transmitted',
  'Door tone irregular · Listener present',
  'Unmapped pressure · Corridor held breath',
  'Cot occupancy unstable · Eyes open',
  'Signal fit improved · Cause withheld',
];

const CHAPTER_LENSES = {
  "q-vox": [
    {
      "num": "01",
      "href": "chapters/volume1/book1/V1_B1_C01.html",
      "title": "The Ship That Listens",
      "subtitle": "You don’t earn a ship. You survive what it hears."
    },
    {
      "num": "02",
      "href": "chapters/volume1/book1/V1_B1_C02.html",
      "title": "Filter by Honesty",
      "subtitle": "Not the clean signal. The one that admits what it wants."
    },
    {
      "num": "03",
      "href": "chapters/volume1/book1/V1_B1_C03.html",
      "title": "A Room That Grows",
      "subtitle": "She came for supplies. The room had other ideas."
    },
    {
      "num": "04",
      "href": "chapters/volume1/book1/V1_B1_C04.html",
      "title": "Beauty’s Not Always Optional",
      "subtitle": "Some doors look like weakness until they refuse to close."
    },
    {
      "num": "05",
      "href": "chapters/volume1/book1/V1_B1_C05.html",
      "title": "For Whoever’s Left Out There",
      "subtitle": "Going back counts as strategy if no one says care out loud."
    },
    {
      "num": "06",
      "href": "chapters/volume1/book1/V1_B1_C06.html",
      "title": "No Way Back",
      "subtitle": "The wreck opened its mouth. She went in anyway."
    },
    {
      "num": "07",
      "href": "chapters/volume1/book1/V1_B1_C07.html",
      "title": "Momentum, Not Relief",
      "subtitle": "Surviving the event does not mean surviving the quiet after."
    },
    {
      "num": "08",
      "href": "chapters/volume1/book1/V1_B1_C08.html",
      "title": "Presence Is a Choice",
      "subtitle": "Staying in the room is harder when no one makes you."
    },
    {
      "num": "09",
      "href": "chapters/volume1/book1/V1_B1_C09.html",
      "title": "Cadence Mapping",
      "subtitle": "Some routes aren’t hidden. They’re waiting to be noticed."
    },
    {
      "num": "10",
      "href": "chapters/volume1/book1/V1_B1_C10.html",
      "title": "Location Only",
      "subtitle": "Coordinates are safer than wanting to be found."
    },
    {
      "num": "11",
      "href": "chapters/volume1/book1/V1_B1_C11.html",
      "title": "Destination: Optional",
      "subtitle": "If the route won’t save you, make the light mean something."
    },
    {
      "num": "12",
      "href": "chapters/volume1/book1/V1_B1_Epilogue.html",
      "title": "Give Them the Sound",
      "subtitle": "Don’t give them the name. Let the ship remember the rhythm."
    }
  ],
  "iri-six": [
    {
      "num": "01",
      "href": "chapters/volume1/book1/V1_B1_C01.html",
      "title": "Forward Remains",
      "subtitle": "Movement is not safety. It is only the first condition."
    },
    {
      "num": "02",
      "href": "chapters/volume1/book1/V1_B1_C02.html",
      "title": "Signal Discipline",
      "subtitle": "Useful noise survives the filter. So does intent."
    },
    {
      "num": "03",
      "href": "chapters/volume1/book1/V1_B1_C03.html",
      "title": "Unmarked Viability",
      "subtitle": "A thing can survive without permission."
    },
    {
      "num": "04",
      "href": "chapters/volume1/book1/V1_B1_C04.html",
      "title": "Doorway Conditions",
      "subtitle": "An opening is not trust. It is a test under pressure."
    },
    {
      "num": "05",
      "href": "chapters/volume1/book1/V1_B1_C05.html",
      "title": "Return Vector",
      "subtitle": "A course correction reveals more than the route."
    },
    {
      "num": "06",
      "href": "chapters/volume1/book1/V1_B1_C06.html",
      "title": "Tether Protocol",
      "subtitle": "Forward is permitted only while the line holds."
    },
    {
      "num": "07",
      "href": "chapters/volume1/book1/V1_B1_C07.html",
      "title": "Post-Impact Assessment",
      "subtitle": "Damage continues after motion stabilizes."
    },
    {
      "num": "08",
      "href": "chapters/volume1/book1/V1_B1_C08.html",
      "title": "Occupied Space",
      "subtitle": "Presence is measurable before it is admitted."
    },
    {
      "num": "09",
      "href": "chapters/volume1/book1/V1_B1_C09.html",
      "title": "Unlisted Corridor",
      "subtitle": "What is unmarked can still become a path."
    },
    {
      "num": "10",
      "href": "chapters/volume1/book1/V1_B1_C10.html",
      "title": "Inventory Without Claim",
      "subtitle": "A location is not belonging. Not yet."
    },
    {
      "num": "11",
      "href": "chapters/volume1/book1/V1_B1_C11.html",
      "title": "Inefficient Signal",
      "subtitle": "Not every unnecessary thing is waste."
    },
    {
      "num": "12",
      "href": "chapters/volume1/book1/V1_B1_Epilogue.html",
      "title": "Rhythm File Opened",
      "subtitle": "Identity is not the same as recognition."
    }
  ],
  "bob": [
    {
      "num": "01",
      "href": "chapters/volume1/book1/V1_B1_C01.html",
      "title": "Initial Crew Irregularity",
      "subtitle": "One aboard. Several unresolved definitions."
    },
    {
      "num": "02",
      "href": "chapters/volume1/book1/V1_B1_C02.html",
      "title": "Archive: Honesty Filter Applied",
      "subtitle": "Local anomalies persist despite captain’s refusal to categorize them."
    },
    {
      "num": "03",
      "href": "chapters/volume1/book1/V1_B1_C03.html",
      "title": "Stathos Arc Nine: Local Draw Detected",
      "subtitle": "Supply loop active. Emotional relevance not yet authorized."
    },
    {
      "num": "04",
      "href": "chapters/volume1/book1/V1_B1_C04.html",
      "title": "Environmental Anomaly: Aesthetic Value",
      "subtitle": "Beauty detected. Tactical utility disputed."
    },
    {
      "num": "05",
      "href": "chapters/volume1/book1/V1_B1_C05.html",
      "title": "Loopback Authorized",
      "subtitle": "Captain has selected the emotionally inefficient path."
    },
    {
      "num": "06",
      "href": "chapters/volume1/book1/V1_B1_C06.html",
      "title": "External Entry: Tether Recommended",
      "subtitle": "Vitals synchronized. Confidence artificially brightened."
    },
    {
      "num": "07",
      "href": "chapters/volume1/book1/V1_B1_C07.html",
      "title": "Rebalance Achieved, Relief Unconfirmed",
      "subtitle": "Ship hum nominal. Crew interpretation needlessly dramatic."
    },
    {
      "num": "08",
      "href": "chapters/volume1/book1/V1_B1_C08.html",
      "title": "Galley Occupancy: Voluntary",
      "subtitle": "No emergency detected. Continued proximity remains suspicious."
    },
    {
      "num": "09",
      "href": "chapters/volume1/book1/V1_B1_C09.html",
      "title": "Local Map Incomplete",
      "subtitle": "Corridor unregistered. Crew significance escalating without filing."
    },
    {
      "num": "10",
      "href": "chapters/volume1/book1/V1_B1_C10.html",
      "title": "System Inventory in Progress",
      "subtitle": "Crew categories remain technically available and emotionally avoided."
    },
    {
      "num": "11",
      "href": "chapters/volume1/book1/V1_B1_C11.html",
      "title": "Ambient Pattern Unauthorized",
      "subtitle": "Alert code absent. Emotional interference probable."
    },
    {
      "num": "12",
      "href": "chapters/volume1/book1/V1_B1_Epilogue.html",
      "title": "Blackbox: Evaluation Deferred",
      "subtitle": "Origin unverified. Emotional relevance inconveniently high."
    }
  ],
  "nova": [
    {
      "num": "01",
      "href": "chapters/volume1/book1/V1_B1_C01.html",
      "title": "A Room Before the Name",
      "subtitle": "Something is listening before anyone knows what to call it."
    },
    {
      "num": "02",
      "href": "chapters/volume1/book1/V1_B1_C02.html",
      "title": "The Lie in Clean Rooms",
      "subtitle": "Clean things ask the sharpest questions."
    },
    {
      "num": "03",
      "href": "chapters/volume1/book1/V1_B1_C03.html",
      "title": "Proof of Green Things",
      "subtitle": "Growth is what happens when a room stops being only a cage."
    },
    {
      "num": "04",
      "href": "chapters/volume1/book1/V1_B1_C04.html",
      "title": "The Door That Doesn’t Demand",
      "subtitle": "Not every open thing is waiting to take something."
    },
    {
      "num": "05",
      "href": "chapters/volume1/book1/V1_B1_C05.html",
      "title": "The Shape of Almost Rescue",
      "subtitle": "Someone always calls it a route before they call it a choice."
    },
    {
      "num": "06",
      "href": "chapters/volume1/book1/V1_B1_C06.html",
      "title": "The Mouth of the Wreck",
      "subtitle": "Some places don’t trap you. They recognize you."
    },
    {
      "num": "07",
      "href": "chapters/volume1/book1/V1_B1_C07.html",
      "title": "The Quiet After the Hit",
      "subtitle": "The room changes when nobody knows where to stand."
    },
    {
      "num": "08",
      "href": "chapters/volume1/book1/V1_B1_C08.html",
      "title": "A Chair Means Something",
      "subtitle": "The first proof of safety is whether the room lets you stay."
    },
    {
      "num": "09",
      "href": "chapters/volume1/book1/V1_B1_C09.html",
      "title": "The Part the Map Refused",
      "subtitle": "Every system has a place it forgot to name."
    },
    {
      "num": "10",
      "href": "chapters/volume1/book1/V1_B1_C10.html",
      "title": "Where the Ship Puts You",
      "subtitle": "A place can hold you before it knows your name."
    },
    {
      "num": "11",
      "href": "chapters/volume1/book1/V1_B1_C11.html",
      "title": "Light Without a Trap",
      "subtitle": "The strange part is when the room changes and doesn’t hurt you."
    },
    {
      "num": "12",
      "href": "chapters/volume1/book1/V1_B1_Epilogue.html",
      "title": "Before the Name Arrives",
      "subtitle": "A sound can reach the room before the person does."
    }
  ]
};

// Chapter titles are the same under every Lens (Quenby's list is the
// canonical title set); each Lens keeps its own line beneath the title.
function updateQueueLens(key) {
  const rows = document.querySelectorAll('.q-row[data-chapter]');
  const canon = CHAPTER_LENSES['q-vox'];
  const lens = CHAPTER_LENSES[key] || canon;
  rows.forEach((row) => {
    const num = row.dataset.chapter;
    const item = lens.find((entry) => entry.num === num);
    const base = canon.find((entry) => entry.num === num) || item;
    if (!item || !base) return;
    const title = row.querySelector('.q-title');
    const sub = row.querySelector('.q-sub');
    if (title) title.textContent = base.title;
    if (sub) sub.textContent = item.subtitle;
    if (base.href) row.setAttribute('href', base.href);
    row.setAttribute('aria-label', `${num}. ${base.title}. ${item.subtitle}`);
  });
  updateOpeningEpigraph(lens);
}

// READ THE OPENING: the epigraph under the chapter 01 title is this Lens's
// chapter 01 line (Quenby: "You don't earn a ship. / You survive what it
// hears."), set on two lines at the sentence break nearest its middle.
function updateOpeningEpigraph(lens) {
  const epi = document.querySelector('#panel-opening .op-epigraph');
  const item = lens && lens.find((entry) => entry.num === '01');
  if (!epi || !item || !item.subtitle) return;
  const text = item.subtitle;
  let cut = -1;
  for (const m of text.matchAll(/[.!?]\s+/g)) {
    const at = m.index + 1;
    if (cut < 0 || Math.abs(text.length / 2 - at) < Math.abs(text.length / 2 - cut)) cut = at;
  }
  epi.textContent = '';
  if (cut > 0) epi.append(text.slice(0, cut), document.createElement('br'), text.slice(cut).trim());
  else epi.append(text);
}

// ── Perspective-driven homepage updates ───────────────────────────
// page-chrome.js owns the cross-cutting work (CSS vars, seal images,
// switcher button state, localStorage). This block listens for its
// `perspectivechange` event and updates the homepage-only modules:
//   · dispatch ticker — rebuilt from #dispatch-source filtered by who
//   · captain dispatch — toggles between the three <article> variants
//   · listening rotator — filters LISTENING to current perspective
(function homePerspective() {
  const dispatchTrack  = document.getElementById('dispatch-track');
  const dispatchSource = document.getElementById('dispatch-source');
  const cdispatches    = document.querySelectorAll('.cdispatch[data-perspective]');

  const TICKER_MAX = 16; // feed items before the marquee loop repeats

  // A ticker item in the existing markup shape (body via textContent — safe).
  function makeDispatchItem(who, ts, bodyText) {
    const span = document.createElement('span');
    span.className = 'dispatch-item';
    span.dataset.who = who;
    const t = document.createElement('span'); t.className = 'dispatch-ts';  t.textContent = ts;
    const s = document.createElement('span'); s.className = 'dispatch-sep'; s.textContent = '·';
    const b = document.createElement('span'); b.className = 'dispatch-body'; b.textContent = bodyText;
    const g = document.createElement('span'); g.className = 'dispatch-gap'; g.textContent = '·';
    span.append(t, s, b, g);
    return span;
  }

  // Descending HH:MM stamps from "now" in SHIP TIME (ship-time.js), so the
  // feed reads against the same clock as the footer and every page header.
  // The spacing is cosmetic (the store carries no timestamps).
  function stampSequence(n) {
    const out = [];
    const d = new Date();
    let mins = window.VoxShipTime ? VoxShipTime.minutes() : d.getUTCHours() * 60 + d.getUTCMinutes();
    for (let i = 0; i < n; i++) {
      const m = ((mins % 1440) + 1440) % 1440;
      out.push(String(Math.floor(m / 60)).padStart(2, '0') + ':' +
               String(m % 60).padStart(2, '0'));
      mins -= 11 + Math.floor(Math.random() * 9); // step back 11–19 min
    }
    return out;
  }

  // House branding items (e.g. the VoxHumanaSF.com / registry line) stay pinned
  // to the front of the feed regardless of source.
  function pinnedBrandItems() {
    return [...dispatchSource.content.querySelectorAll('.dispatch-item')]
      .filter((it) => it.querySelector('.domain-lock'))
      .map((it) => it.cloneNode(true));
  }

  // Offline fallback: the hand-written items in the #dispatch-source template
  // for this perspective only (never another perspective's items).
  function tickerFromTemplate(key) {
    const all = dispatchSource.content.querySelectorAll('.dispatch-item');
    return [...all].filter((it) => it.dataset.who === key).map((it) => it.cloneNode(true));
  }

  // Nova's ticker also carries the "??:" entries that used to interrupt the
  // other perspectives. Spread them through her feed rather than in a block.
  function withPerspectiveExtras(key, items) {
    if (key !== 'nova') return items;
    const out = items.slice();
    const step = Math.max(1, Math.floor(out.length / (NOVA_EXTRA_DISPATCH.length + 1)));
    NOVA_EXTRA_DISPATCH.forEach((body, n) => {
      const at = Math.min(out.length, (n + 1) * step + n);
      out.splice(at, 0, makeDispatchItem('nova', stampBetween(out[at - 1], out[at]), body));
    });
    return out;
  }

  // A random HH:MM strictly between the neighbouring items' stamps (the
  // feed runs newest → oldest). Falls back to a nearby time at the edges.
  function stampOf(item) {
    const t = item && item.querySelector('.dispatch-ts');
    const m = t && /^(\d{2}):(\d{2})$/.exec(t.textContent.trim());
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  }
  function stampBetween(newer, older) {
    const hi = stampOf(newer), lo = stampOf(older);
    let mins;
    if (hi != null && lo != null && hi - lo > 1) mins = lo + 1 + Math.floor(Math.random() * (hi - lo - 1));
    else if (hi != null) mins = hi - (3 + Math.floor(Math.random() * 12));
    else if (lo != null) mins = lo + (3 + Math.floor(Math.random() * 12));
    else mins = Math.floor(Math.random() * 1440);
    mins = ((mins % 1440) + 1440) % 1440;
    return String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0');
  }

  function paintTicker(items) {
    dispatchTrack.innerHTML = '';
    for (let pass = 0; pass < 2; pass++) {       // duplicate for seamless marquee
      items.forEach((it) => {
        const node = it.cloneNode(true);
        if (pass === 1) node.setAttribute('aria-hidden', 'true'); // loop copy
        dispatchTrack.appendChild(node);
      });
    }
    setTickerPace();
  }

  // Constant reading pace regardless of how many items the feed holds
  // (the old fixed 72s loop ran ~100px/s with a full feed). Hover/focus
  // pausing lives in home.css.
  const DISPATCH_PX_PER_SEC = 22;
  function setTickerPace() {
    const half = dispatchTrack.scrollWidth / 2;
    if (!half) return;
    dispatchTrack.style.animationDuration = (half / DISPATCH_PX_PER_SEC).toFixed(1) + 's';
    // Restart from the first item after a rebuild (e.g. perspective change).
    dispatchTrack.style.animationName = 'none';
    void dispatchTrack.offsetWidth;
    dispatchTrack.style.animationName = '';
  }
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { if (dispatchTrack && dispatchTrack.children.length) setTickerPace(); });
  }

  // Each rebuild gets a generation number; a slower, older load (from a
  // perspective the visitor has already left) is dropped instead of painted.
  let dispatchGen = 0;
  function rebuildDispatch(key) {
    if (!dispatchTrack || !dispatchSource) return;
    const gen = ++dispatchGen;
    // Every item, pinned or not, is restamped in ship time, newest first, so
    // the whole feed reads against the same clock (written times in the
    // template are placeholders).
    const restamp = (items) => {
      const stamps = stampSequence(items.length);
      items.forEach((it, i) => { const t = it.querySelector('.dispatch-ts'); if (t) t.textContent = stamps[i]; });
      return items;
    };
    const paint = (items) => { if (gen === dispatchGen) paintTicker(withPerspectiveExtras(key, restamp(items))); };
    // Clear at once so the previous perspective's feed doesn't keep scrolling
    // while this one loads.
    dispatchTrack.innerHTML = '';
    // Store first, template as offline fallback. NOTE: the data model has no
    // dedicated ticker pool, so the feed draws from this view's listen-section
    // surface (the same memories the ship is surfacing), formatted as bridge
    // telemetry. A separate ticker surface is a future authoring decision.
    if (!window.VoxMemory) return paint(tickerFromTemplate(key));
    VoxMemory.lines(key, 'listen-section').then((payload) => {
      const lines = (payload && payload.lines) || [];
      if (!lines.length) return paint(tickerFromTemplate(key));
      const pick = VoxMemory.sample(lines, TICKER_MAX);
      const stamps = stampSequence(pick.length);
      const items = pinnedBrandItems()
        .concat(pick.map((l, i) => makeDispatchItem(key, stamps[i], l.text)));
      paint(items);
    }).catch(() => paint(tickerFromTemplate(key)));
  }

  function updateCaptain(key) {
    cdispatches.forEach((art) => {
      art.hidden = art.dataset.perspective !== key;
    });
  }

  function updateListening(key) {
    // The memory store is the source of truth — the same listen-section the
    // Signal page surfaces. The hardcoded LISTENING array below is now only an
    // OFFLINE FALLBACK, used if the baked JSON isn't present or reachable, so
    // the homepage never goes blank. (Gated views return no lines here unless
    // entitled, so nothing paywalled can leak onto the homepage.)
    //
    // Only this perspective's entries are ever used (no cross-perspective
    // fallback). Nova's stream also gets the "Unknown Signal" entries that
    // used to interrupt the others. A generation number drops results from
    // a perspective the visitor has already switched away from.
    const gen = ++listenGen;
    // Switch at once to this perspective's own offline lines, so nothing from
    // the previous stream stays on screen while the store loads; the store
    // version then replaces the pool without changing the visible quote.
    if (window.__listeningRefilter) window.__listeningRefilter(offlineListening(key));
    storeListening(key).then((items) => {
      if (gen === listenGen && window.__listeningRefilter) window.__listeningRefilter(items, { keepCurrent: true });
    });
  }
  let listenGen = 0;

  // A perspective's offline Listening lines (Nova's include her former
  // "Unknown Signal" entries).
  function offlineListening(key, withUnknown = true) {
    if (typeof LISTENING === 'undefined') return [];
    const own = LISTENING.filter((l) => l.perspective === key);
    if (key !== 'nova') return own;
    const extra = withUnknown && typeof UNKNOWN_LISTENING !== 'undefined' ? UNKNOWN_LISTENING.map(asNova) : [];
    return own.map(asNova).concat(extra);
  }

  // A perspective's Listening lines from the memory store, falling back to
  // the offline lines when the store has none.
  function storeListening(key) {
    const withExtras = (items) => (key === 'nova' ? novaUnknownLines().then((x) => items.concat(x)) : Promise.resolve(items));
    const fallback = () => withExtras(offlineListening(key, false));
    if (!window.VoxMemory) return fallback();
    const vname = (window.Vox && Vox.get(key) && Vox.get(key).name) || key;
    return VoxMemory.lines(key, 'listen-section').then((payload) => {
      const lines = (payload && payload.lines) || [];
      if (!lines.length) return fallback();
      // Some baked context keys already begin with the speaker's (older)
      // name, e.g. "Q. Vox · Pilot Cradle" — drop that so the attribution
      // reads "Quenby Vox · Pilot Cradle", not the name twice.
      const ownNames = key === 'q-vox' ? ['Q. Vox', 'Quenby Vox'] : [vname];
      const place = (ctx) => {
        let c = ctx || '';
        ownNames.forEach((n) => { if (c.startsWith(n + ' · ')) c = c.slice(n.length + 3); else if (c === n) c = ''; });
        return c;
      };
      return withExtras(lines.map((l) => ({
        perspective: key,
        who: key === 'nova' ? novaWho(l.context_key) : vname + (place(l.context_key) ? ' · ' + place(l.context_key) : ''),
        text: l.text,
      })));
    }).catch(fallback);
  }

  // Size the Listening block once for every perspective's lines, so the
  // Lens only changes what is said, never the frame around it.
  function reserveAllListening() {
    if (!window.__listeningReserve || !window.Vox) return;
    const keys = Vox.selectableKeys ? Vox.selectableKeys() : Vox.keys();
    keys.forEach((k) => {
      window.__listeningReserve(offlineListening(k));
      storeListening(k).then(window.__listeningReserve, () => {});
    });
  }

  // Nova is selectable by name now, so every entry in her stream is shown as
  // "Nova · <place>". The older "Unknown Signal · …" / "Unregistered Signal · …"
  // labels stay as written in the sources; only the displayed name changes.
  function novaWho(label) {
    const place = String(label || '').replace(/^(Unknown|Unregistered) Signal(\s*·\s*|$)/i, '').replace(/^Nova(\s*·\s*|$)/, '');
    const name = (window.Vox && Vox.get('nova') && Vox.get('nova').name) || 'Nova';
    return place ? name + ' · ' + place : name;
  }
  const asNova = (l) => ({ perspective: 'nova', who: novaWho(l.who), text: l.text });

  // Nova's share of the former interruptions: the store's "unknown-signal"
  // view, or the UNKNOWN_LISTENING fallback.
  function novaUnknownLines() {
    const fb = () => UNKNOWN_LISTENING.map(asNova);
    if (!window.VoxMemory) return Promise.resolve(fb());
    return VoxMemory.lines('unknown-signal', 'listen-section').then((p) => {
      const ls = (p && p.lines) || [];
      return ls.length
        ? ls.map((l) => asNova({ who: l.context_key, text: l.text }))
        : fb();
    }).catch(fb);
  }

  function apply(key) {
    rebuildDispatch(key);
    updateCaptain(key);
    updateListening(key);
    updateQueueLens(key);
  }

  reserveAllListening();

  // Sync with the current perspective on load, then on every change.
  apply(window.VoxPerspective ? window.VoxPerspective.get() : 'q-vox');
  window.addEventListener('perspectivechange', (e) => apply(e.detail.perspective));
})();
