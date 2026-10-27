// voices.js
// ─────────────────────────────────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH for every character "lens" on the site.
//
// Everything that makes a character feel different — accent color, logo,
// the Captain's-Dispatch article, and the "listening" rotator lines — lives
// here and ONLY here. Edit one character in one place and every page that
// loads this file (homepage, chapters, world pages) stays in sync.
//
// This file is plain data + tiny helpers. It contains NO page logic. The
// behavior that consumes it lives in page-chrome.js (chrome/switcher) and
// home.js (homepage-only modules). Keeping data and behavior separate is
// what lets you add or edit a voice without touching any logic.
//
// ── HOW TO ADD OR EDIT A CHARACTER ──────────────────────────────────────
//   1. Add/modify an entry in VOICES below.
//   2. That's it. Colors, logo, dispatch article, and listening lines all
//      flow from this single object.
//
// ── PATH NOTE ───────────────────────────────────────────────────────────
//   Logos are stored as paths *relative to the site root* (e.g.
//   "assets/vox-logo-bob.png"). Pages nested in subfolders (chapters/…,
//   world/…) set a base prefix once via:
//       <body data-asset-base="../../../">
//   and Vox.logo(key) prepends it automatically. The homepage needs no
//   attribute (base defaults to "").
//
// ── FUTURE: PREMIUM "AUTHOR" LAYER ──────────────────────────────────────
//   The gated author overlay is intentionally NOT in this file, because
//   anything shipped to the browser here is public. When you build Phase 2,
//   premium content is fetched from a server function and merged at runtime.
//   The shape is reserved as `premium: null` on each voice (and a top-level
//   AUTHOR_LAYER stub) so the data model doesn't change when you add it.
// ─────────────────────────────────────────────────────────────────────────

(function () {
  "use strict";

  const STORAGE_KEY = "voxhumana-perspective";
  const DEFAULT_VOICE = "q-vox";

  // The canonical character table. Order here is display order.
  const VOICES = {
    "q-vox": {
      key: "q-vox",
      name: "Quenby Vox",
      role: "Captain",
      buttonLabel: "Quenby Vox",
      selectable: true,
      // Lens chrome
      signal: "#E05A4F",
      signalDim: "rgba(224, 90, 79, 0.55)",
      logo: "assets/vox-logo-q-vox.png",
      // Homepage Captain's-Dispatch article (shown when this lens is active)
      dispatch: {
        label: "Captain's Dispatch",
        channel: "Bridge",
        title: "Transmission",
        ts: "22:17 · Ship Time",
        lines: [
          "Coolant lines holding. Galley quiet.",
          "Manifest reads green, even where it shouldn't.",
          "We keep moving anyway.",
        ],
        sign: "— Quenby Vox",
      },
      // Reserved for the future per-character premium layer (Phase 2+).
      premium: null,
    },

    "iri-six": {
      key: "iri-six",
      name: "Iri-Six",
      role: "Navigation",
      buttonLabel: "Iri-Six",
      selectable: true,
      signal: "#7FD6A3",
      signalDim: "rgba(127, 214, 163, 0.55)",
      logo: "assets/vox-logo-iri-six.png",
      dispatch: {
        label: "Navigation Dispatch",
        channel: "Navigation",
        title: "Transmission",
        ts: "22:17 · Ship Time",
        lines: [
          "Vector holding within tolerance.",
          "Drift noted at the seam · uncorrected.",
          "Forward works. Forward remains.",
        ],
        sign: "— Iri-Six",
      },
      premium: null,
    },

    "bob": {
      key: "bob",
      name: "B.O.B.",
      role: "Archive",
      buttonLabel: "B.O.B.",
      selectable: true,
      signal: "#7FD7FF",
      signalDim: "rgba(127, 215, 255, 0.55)",
      logo: "assets/vox-logo-bob.png",
      dispatch: {
        label: "Archive Dispatch",
        channel: "Archive",
        title: "Transmission",
        ts: "22:17 · Ship Time",
        lines: [
          "Atmospheric normals holding. Two aboard, both moving.",
          "Captain's vitals reading at deeply impolite.",
          "Archive continues. Recommendation withheld.",
        ],
        sign: "— B.O.B.",
      },
      premium: null,
    },

    // Nova is selectable from launch, alongside the other three. (Set
    // `selectable: false` and add `disabled` back on the page buttons to
    // reserve a voice again.)
    "nova": {
      key: "nova",
      name: "Nova",
      role: "Crew",
      buttonLabel: "Nova",
      selectable: true,
      signal: "#8C82FF",
      signalDim: "rgba(140, 130, 255, 0.55)",
      logo: "assets/vox-logo-nova.png",
      dispatch: null, // no homepage dispatch article until activated
      premium: null,
    },
  };

  // ── Listening rotator lines ────────────────────────────────────────────
  // Homepage-only. Each line is tagged with the voice it belongs to; home.js
  // filters to the active voice. Moved here from home.js so all of a
  // character's content lives in one file.
  const LISTENING = [
    // ── B.O.B. ──
    { voice: "bob", who: "B.O.B. · Archive", text: "Archive note: logged and idle." },
    { voice: "bob", who: "B.O.B. · Bridge Feed", text: "Recommendation withheld." },
    { voice: "bob", who: "B.O.B. · Medbay Monitor", text: "Crew vitals remain technically discouraging." },
    { voice: "bob", who: "B.O.B. · Environmental Control", text: "Atmospheric normals holding. Emotional normals unavailable." },
    { voice: "bob", who: "B.O.B. · Cargo Manifest", text: "Manifest reads green. Crew judgment pending." },
    { voice: "bob", who: "B.O.B. · Galley Feed", text: "Kettle cycled twice. No one claimed responsibility." },
    { voice: "bob", who: "B.O.B. · Helm Subroutine", text: "Manual mode persists. Ship irritation measurable." },
    { voice: "bob", who: "B.O.B. · Registry Cache", text: "Registry mismatch ignored by mutual consent." },
    { voice: "bob", who: "B.O.B. · Environmental Control", text: "Comfort loops reduced. Complaint likelihood elevated." },
    { voice: "bob", who: "B.O.B. · Crew Log", text: "Crew designation update deferred." },
    { voice: "bob", who: "B.O.B. · Corridor Routing", text: "Local pathways narrowing. Haste advised." },
    { voice: "bob", who: "B.O.B. · Docking Collar", text: "Dock seal cooperative. I am choosing optimism." },
    { voice: "bob", who: "B.O.B. · Risk Assessment", text: "The pessimistic subsystem has been outvoted." },
    { voice: "bob", who: "B.O.B. · Debt Ledger", text: "Debt flag present. Status: inconveniently alive." },
    { voice: "bob", who: "B.O.B. · Relay Feed", text: "Signal bleed detected. Politeness level: poor." },
    { voice: "bob", who: "B.O.B. · Medbay Monitor", text: "Hydration recommended before the next argument." },
    { voice: "bob", who: "B.O.B. · Engine Crawl", text: "The ship is not sulking. The ship is registering disagreement." },
    { voice: "bob", who: "B.O.B. · Cooling Manifold", text: "Cooling patch window recalculating. Please enjoy uncertainty." },
    { voice: "bob", who: "B.O.B. · Bridge Lights", text: "Bridge lights trimmed. Drama level remains externally generated." },
    { voice: "bob", who: "B.O.B. · Rest Cycle Log", text: "Archive note: nobody aboard sleeps correctly." },
    { voice: "bob", who: "B.O.B. · View Dome", text: "Crew proximity increasing. Comment withheld under duress." },
    { voice: "bob", who: "B.O.B. · Pilot Cradle", text: "Captain ignored advisory. Advisory remains emotionally available." },
    { voice: "bob", who: "B.O.B. · Internal Comms", text: "Internal comms quiet. This is rarely a good sign." },
    { voice: "bob", who: "B.O.B. · Tea Rack", text: "Galley temperature stable. Tea morale inconclusive." },
    { voice: "bob", who: "B.O.B. · Port Registry", text: "Port registry ping declined to become useful." },
    { voice: "bob", who: "B.O.B. · Archive", text: "Archive query returned seventeen rumors and no apology." },
    { voice: "bob", who: "B.O.B. · Medbay Door", text: "Crew status: upright. This is not the same as fine." },
    { voice: "bob", who: "B.O.B. · Environmental Control", text: "Environmental loop trimmed by captain request. Regret probable." },
    { voice: "bob", who: "B.O.B. · Maintenance Bay", text: "Diagnostic result: ship remains stubborn." },
    { voice: "bob", who: "B.O.B. · Hull Skin", text: "Unregistered signal brushed hull. No handshake accepted." },
    { voice: "bob", who: "B.O.B. · Bridge Feed", text: "Captain tone suggests further questions would be poorly received." },
    { voice: "bob", who: "B.O.B. · Legacy File", text: "Legacy file opened itself. I did not appreciate that." },
    { voice: "bob", who: "B.O.B. · Internal Comms", text: "Observation: captain uses silence as punctuation." },
    { voice: "bob", who: "B.O.B. · Auxiliary Console", text: "Observation: Iri-Six uses silence as infrastructure." },
    { voice: "bob", who: "B.O.B. · Archive", text: "Archive note: Vox references remain culturally unstable." },
    { voice: "bob", who: "B.O.B. · Docking Collar", text: "Docking request accepted under suspiciously casual terms." },
    { voice: "bob", who: "B.O.B. · Cooling Manifold", text: "Thermal drift inside tolerance. Barely." },
    { voice: "bob", who: "B.O.B. · Rest Cycle Log", text: "Crew rest recommendation filed. Crew ignored filing." },
    { voice: "bob", who: "B.O.B. · Surface Relay", text: "Signal mirror active. Surface contamination low." },

    // ── Iri-Six ──
    { voice: "iri-six", who: "Iri-Six · Navigation Well", text: "Forward works." },
    { voice: "iri-six", who: "Iri-Six · Maintenance Bay", text: "Margin used." },
    { voice: "iri-six", who: "Iri-Six · Cooling Manifold", text: "Enough holds until it doesn't." },
    { voice: "iri-six", who: "Iri-Six · Auxiliary Console", text: "No correction yet." },
    { voice: "iri-six", who: "Iri-Six · Docking Collar", text: "The line opens once. Take it." },
    { voice: "iri-six", who: "Iri-Six · Portside Corridor", text: "Noise is not movement." },
    { voice: "iri-six", who: "Iri-Six · Garden Feed", text: "Two clicks open. Close on the breath after." },
    { voice: "iri-six", who: "Iri-Six · View Dome", text: "Do not make drift sentimental." },
    { voice: "iri-six", who: "Iri-Six · Engine Crawl", text: "The ship listens better when no one flatters it." },
    { voice: "iri-six", who: "Iri-Six · Skiff Bay", text: "I can ride the well." },
    { voice: "iri-six", who: "Iri-Six · Dockside Approach", text: "Not clean. Possible." },
    { voice: "iri-six", who: "Iri-Six · Common Bench", text: "Rest is maintenance." },
    { voice: "iri-six", who: "Iri-Six · Cargo Alcove", text: "A closed hatch still tells you where the room ends." },
    { voice: "iri-six", who: "Iri-Six · Maintenance Bay", text: "If it rattles, shut it down." },
    { voice: "iri-six", who: "Iri-Six · Airlock", text: "We leave before luck remembers us." },
    { voice: "iri-six", who: "Iri-Six · Bridge Rail", text: "Both hands." },
    { voice: "iri-six", who: "Iri-Six · Garden Feed", text: "Schedule. Not orders." },
    { voice: "iri-six", who: "Iri-Six · Skiff Locker", text: "Don\u2019t carry weight you don\u2019t need." },
    { voice: "iri-six", who: "Iri-Six · Maintenance Bay", text: "Check the seal twice. Trust it once." },
    { voice: "iri-six", who: "Iri-Six · Training Chamber", text: "Angle wrong. Try again." },
    { voice: "iri-six", who: "Iri-Six · Skiff Bay", text: "Less drag. More room." },
    { voice: "iri-six", who: "Iri-Six · Auxiliary Console", text: "The map is lying by omission." },
    { voice: "iri-six", who: "Iri-Six · Gravity Well Plot", text: "Bad is a moral term. Gravity doesn\u2019t care." },
    { voice: "iri-six", who: "Iri-Six · Airlock", text: "Door first. Then corridor." },
    { voice: "iri-six", who: "Iri-Six · Relay Station", text: "Watch the seam." },
    { voice: "iri-six", who: "Iri-Six · Dockside Approach", text: "No. The other left." },
    { voice: "iri-six", who: "Iri-Six · Corridor Routing", text: "This route wants panic. Don\u2019t give it any." },
    { voice: "iri-six", who: "Iri-Six · Engine Crawl", text: "The ship is compensating. Badly." },
    { voice: "iri-six", who: "Iri-Six · Medbay Door", text: "Useful damage is still damage." },
    { voice: "iri-six", who: "Iri-Six · Relay Station", text: "Keep the exit behind your shoulder." },
    { voice: "iri-six", who: "Iri-Six · Pressure Readout", text: "Count pressure, not seconds." },
    { voice: "iri-six", who: "Iri-Six · Station Threshold", text: "The first alarm is rarely the problem." },
    { voice: "iri-six", who: "Iri-Six · Maintenance Bay", text: "Your hand is too loud." },
    { voice: "iri-six", who: "Iri-Six · Cooling Manifold", text: "It holds because I told it to." },
    { voice: "iri-six", who: "Iri-Six · Training Chamber", text: "No wasted motion." },
    { voice: "iri-six", who: "Iri-Six · Relay Station", text: "Move when the room commits." },
    { voice: "iri-six", who: "Iri-Six · Airlock", text: "A clean cut still costs." },
    { voice: "iri-six", who: "Iri-Six · Cabin Hatch", text: "Names matter. Later." },
    { voice: "iri-six", who: "Iri-Six · Bridge Rail", text: "Forward. Then argue." },

    // ── Quenby Vox ──
    { voice: "q-vox", who: "Quenby Vox · Pilot Cradle", text: "We run quiet until we don't." },
    { voice: "q-vox", who: "Quenby Vox · Bridge", text: "No banners. Just the lane." },
    { voice: "q-vox", who: "Quenby Vox · Navigation Well", text: "Plot me the cleanest filthy lane." },
    { voice: "q-vox", who: "Quenby Vox · Debt Ledger", text: "Debt lingers. Don\u2019t give it a chair." },
    { voice: "q-vox", who: "Quenby Vox · Environmental Control", text: "Comfort is expensive. Cut it." },
    { voice: "q-vox", who: "Quenby Vox · View Dome", text: "Forward is not the same as safe." },
    { voice: "q-vox", who: "Quenby Vox · Maintenance Bay", text: "I\u2019ve rented worse." },
    { voice: "q-vox", who: "Quenby Vox · Relay Station", text: "We look. We don\u2019t promise." },
    { voice: "q-vox", who: "Quenby Vox · View Dome", text: "The trick is knowing when quiet turns into a trap." },
    { voice: "q-vox", who: "Quenby Vox · Pilot Cradle", text: "Don\u2019t make drift a philosophy." },
    { voice: "q-vox", who: "Quenby Vox · Skiff Bay", text: "We\u2019re not taking banners. We\u2019re taking exits." },
    { voice: "q-vox", who: "Quenby Vox · Archive Terminal", text: "Sounds fade. People just hate noticing." },
    { voice: "q-vox", who: "Quenby Vox · Dockside Market", text: "Let the room think we\u2019re smaller than we are." },
    { voice: "q-vox", who: "Quenby Vox · Tea Rack", text: "Don\u2019t confuse craving with feeling." },
    { voice: "q-vox", who: "Quenby Vox · Common Bench", text: "We breathe. Then we decide." },
    { voice: "q-vox", who: "Quenby Vox · Maintenance Bay", text: "I\u2019m careful with different things." },
    { voice: "q-vox", who: "Quenby Vox · View Dome", text: "Don\u2019t sell silence back to me like it\u2019s peace." },
    { voice: "q-vox", who: "Quenby Vox · Engine Crawl", text: "Keep the ship ugly and moving." },
    { voice: "q-vox", who: "Quenby Vox · Docking Collar", text: "If it wants ceremony, disappoint it." },
    { voice: "q-vox", who: "Quenby Vox · Airlock", text: "I don\u2019t trust friendly docks." },
    { voice: "q-vox", who: "Quenby Vox · Skiff Bay", text: "Make the exit boring." },
    { voice: "q-vox", who: "Quenby Vox · Medbay Door", text: "Nothing heroic. Just useful." },
    { voice: "q-vox", who: "Quenby Vox · Relay Station", text: "The room wants a show. Don\u2019t give it one." },
    { voice: "q-vox", who: "Quenby Vox · Archive Terminal", text: "If the myth knocks, don\u2019t answer fast." },
    { voice: "q-vox", who: "Quenby Vox · Registry Cache", text: "Old names open bad doors." },
    { voice: "q-vox", who: "Quenby Vox · Bridge Lights", text: "No stage lights. Not today." },
    { voice: "q-vox", who: "Quenby Vox · Debt Ledger", text: "We can be broke after we\u2019re alive." },
    { voice: "q-vox", who: "Quenby Vox · Internal Comms", text: "Good news should make less noise." },
    { voice: "q-vox", who: "Quenby Vox · Relay Station", text: "Keep your hands where the ship can see them." },
    { voice: "q-vox", who: "Quenby Vox · Archive Feed", text: "If I start performing, cut the feed." },
    { voice: "q-vox", who: "Quenby Vox · Skiff Bay", text: "That\u2019s not a plan. That\u2019s a dare wearing boots." },
    { voice: "q-vox", who: "Quenby Vox · Pilot Cradle", text: "The Huntress hates being begged." },
    { voice: "q-vox", who: "Quenby Vox · Maintenance Bay", text: "Ugly counts if it flies." },
    { voice: "q-vox", who: "Quenby Vox · Dockside Approach", text: "I don\u2019t need clean. I need through." },
    { voice: "q-vox", who: "Quenby Vox · View Dome", text: "A quiet room is still a room with teeth." },
    { voice: "q-vox", who: "Quenby Vox · Engine Crawl", text: "Don\u2019t make me call that luck." },
    { voice: "q-vox", who: "Quenby Vox · Airlock", text: "We leave before the station gets sentimental." },
    { voice: "q-vox", who: "Quenby Vox · Registry Cache", text: "Names travel badly." },
    { voice: "q-vox", who: "Quenby Vox · Job Board", text: "If they wanted honest work, they\u2019d pay honest money." },
    { voice: "q-vox", who: "Quenby Vox · Pilot Cradle", text: "The chair\u2019s warm. That\u2019s not loyalty." },

    // ── Nova (Early Book 2 bleed; uses "Unregistered Signal" then "Nova") ──
    { voice: "nova", who: "Unregistered Signal · Medbay", text: "A blanket is not a room." },
    { voice: "nova", who: "Unregistered Signal · Medbay Door", text: "Don\u2019t look at my wrists unless you\u2019re going to say something useful." },
    { voice: "nova", who: "Unregistered Signal · Galley", text: "If this is rescue, you need a better word." },
    { voice: "nova", who: "Unregistered Signal · Common Bench", text: "I don\u2019t need soft. I need true." },
    { voice: "nova", who: "Unregistered Signal · Corridor", text: "Every quiet room has a hook in it." },
    { voice: "nova", who: "Unregistered Signal · Bridge Threshold", text: "I know when people are waiting to decide what I am." },
    { voice: "nova", who: "Unregistered Signal · Galley", text: "You can\u2019t rescue someone and keep them unnamed." },
    { voice: "nova", who: "Unregistered Signal · Medbay Cot", text: "The cot\u2019s too clean. That\u2019s how I know it\u2019s lying." },
    { voice: "nova", who: "Unregistered Signal · Bridge", text: "Your ship acts like it already voted." },
    { voice: "nova", who: "Unregistered Signal · Galley", text: "Fine. I\u2019ll be the problem with a chair." },
    { voice: "nova", who: "Nova · Bridge Floor", text: "Drift is just a box of air pretending to move." },
    { voice: "nova", who: "Nova · Tea Rack", text: "Sugar isn\u2019t a feeling. Fine. Still want it." },
    { voice: "nova", who: "Nova · View Dome", text: "You two circle like the silence belongs to you." },
    { voice: "nova", who: "Nova · Cargo Alcove", text: "Funny how nobody says asset until they want something." },
    { voice: "nova", who: "Nova · Skiff Bay", text: "I hate when the ship feels right before people do." },
    { voice: "nova", who: "Nova · Relay Station", text: "I can feel it before it breaks." },
    { voice: "nova", who: "Nova · Training Chamber", text: "One block isn\u2019t a pattern. I know." },
    { voice: "nova", who: "Nova · Bridge Threshold", text: "You don\u2019t get to call me variable and then act surprised when I move." },
    { voice: "nova", who: "Nova · Garden Feed", text: "The garden smells alive. That\u2019s worse." },
    { voice: "nova", who: "Nova · Corridor", text: "Doors sound different when they\u2019re lying." },
    { voice: "nova", who: "Nova · Common Bench", text: "If you\u2019re going to keep watch, admit it." },
    { voice: "nova", who: "Nova · Archive Terminal", text: "Counting doesn\u2019t stop just because you leave the room." },
    { voice: "nova", who: "Nova · Bridge Floor", text: "I\u2019m younger. I\u2019ll outlast you." },
    { voice: "nova", who: "Nova · Medbay Door", text: "You keep acting like wanting is louder than alarms." },
    { voice: "nova", who: "Nova · Galley", text: "Don\u2019t trade me a choice and call it kindness." },
    { voice: "nova", who: "Nova · Tea Rack", text: "If I get a tin, it says Sugar." },
    { voice: "nova", who: "Nova · View Dome", text: "That wasn\u2019t silence. That was everyone choosing not to blink." },
    { voice: "nova", who: "Nova · Relay Feed", text: "I don\u2019t know the story. I know the pressure." },
    { voice: "nova", who: "Nova · Common Bench", text: "You said stay like it was a system command." },
    { voice: "nova", who: "Nova · Training Chamber", text: "Better than drift." },
    { voice: "nova", who: "Nova · Medbay Cot", text: "This ship waits before it opens. I hate that." },
    { voice: "nova", who: "Nova · Corridor", text: "Everybody here talks like doors can hear them." },
    { voice: "nova", who: "Nova · Galley", text: "You both say nothing like it means something different." },
    { voice: "nova", who: "Nova · Skiff Bay", text: "I\u2019m not cargo because you carried me." },
    { voice: "nova", who: "Nova · Corridor", text: "I asked for a name. You gave me a hallway." },
    { voice: "nova", who: "Nova · Bridge", text: "The ship hums better when no one\u2019s pretending." },
    { voice: "nova", who: "Nova · Galley", text: "I don\u2019t want comfort. I want proof." },
    { voice: "nova", who: "Nova · Common Bench", text: "If I\u2019m staying, I\u2019m not staying politely." },
    { voice: "nova", who: "Nova · Galley", text: "I don\u2019t trust food that tastes like medicine." },
  ];

  // "Unknown Signal" cards (memory-store view "unknown-signal"). Formerly
  // injected at random into every perspective while Nova was unselectable;
  // the index now shows them in Nova's stream only. Speaker attribution is
  // unconfirmed, so they keep their "Unknown Signal" label.
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

  // RESERVED for Phase 2. The single, global, gated "author" overlay that
  // sits on top of whichever voice is active. Kept null here on purpose:
  // real author content must be delivered by a server function only to
  // entitled (subscribed) visitors, never shipped in this public file.
  const AUTHOR_LAYER = null;

  // ── Slot vocabulary per surface ────────────────────────────────────────
  // Valid slot ids the memory store may place content into, per surface.
  // Only surfaces that subdivide need an entry; every other surface IS its
  // own slot.
  //   bridge         → 'signal' (the Captain's-Dispatch card).
  //   listen-section → the kind of memory, not where it happened. The room/
  //                    source label lives in the store's context_key.
  const SLOTS = {
    bridge: ["signal"],
    "listen-section": [
      "command", "systems", "threshold", "care",
      "risk", "ritual", "signal", "archive", "drift",
    ],
  };

  // ── Observation types (B.O.B.) ─────────────────────────────────────────
  // B.O.B. records ship telemetry, not perspective. His memories are
  // categorized by the kind of observation — and gain emotional weight on
  // reread — rather than by where they happened (location stays as context).
  //   operational  · current ship state
  //   pattern      · repeated behaviour
  //   deviation    · a change from the pattern
  //   correlation  · the past brushing the present
  //   consistency  · what persists across books (the heartbeat)
  //   anomaly      · rare, unexplained, evidence not answers
  const OBSERVATION_TYPES = [
    "operational", "pattern", "deviation", "correlation", "consistency", "anomaly",
  ];

  // ── Helpers ──────────────────────────────────────────────────────────
  // Resolve a root-relative asset path against the page's asset base.
  function assetBase() {
    const b = document.body && document.body.dataset
      ? document.body.dataset.assetBase
      : "";
    return b || "";
  }

  const Vox = {
    STORAGE_KEY,
    DEFAULT_VOICE,
    voices: VOICES,
    listening: LISTENING,
    unknownListening: UNKNOWN_LISTENING,
    authorLayer: AUTHOR_LAYER,
    slots: SLOTS,
    observationTypes: OBSERVATION_TYPES,

    // All voice keys in display order.
    keys() {
      return Object.keys(VOICES);
    },
    // Keys a visitor can actually switch to.
    selectableKeys() {
      return Object.keys(VOICES).filter((k) => VOICES[k].selectable);
    },
    get(key) {
      return VOICES[key] || null;
    },
    // Logo path resolved for the current page depth.
    logo(key) {
      const v = VOICES[key];
      if (!v) return "";
      return assetBase() + v.logo;
    },
    // Listening lines for a voice (falls back to all if none tagged).
    listeningFor(key) {
      const f = LISTENING.filter((l) => l.voice === key);
      return f.length ? f : LISTENING.slice();
    },
  };

  // Expose globally. Plain script (no modules) keeps GitHub Pages happy.
  window.Vox = Vox;
})();
