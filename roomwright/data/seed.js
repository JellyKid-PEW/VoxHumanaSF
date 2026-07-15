// Seed data for the Wild Huntress bridge prototype.
// Every constraint quotes its source passage verbatim; the bundled excerpt
// documents are assembled from the same strings so passages always resolve.
//
// evidence levels: 'explicit' (direct textual), 'inference' (from passages),
// 'decision' (user ruling), 'assumption' (temporary default).

// ---- constraint entries -------------------------------------------------
// {key, source, quote, category, subject, interpretation, evidence, claims}
export const SEED_CONSTRAINTS = [
  // ======== the room itself ========
  {
    key: 'narrow-space', source: 'Presence-09',
    quote: 'Every collapse rang sharp in the narrow space.',
    category: 'dimension', subject: 'bridge size',
    interpretation: 'The bridge is explicitly a narrow space with hard, ringing acoustics.',
    evidence: 'explicit',
    claims: [{ kind: 'dimension', target: 'bridge.width', max: 5.5 }],
  },
  {
    key: 'crossable-room', source: 'Next-10',
    quote: 'She crossed the room without hesitation, without slowing down or speeding up, and stopped beside the status console.',
    category: 'dimension', subject: 'bridge size',
    interpretation: 'The bridge is a genuinely crossable room, not a cockpit — several strides across.',
    evidence: 'explicit',
    claims: [{ kind: 'dimension', target: 'bridge.width', min: 3.4 }],
  },
  {
    key: 'aft-panel-cross', source: 'Presence-05',
    quote: 'Quenby crossed to the aft panel and pulled it open. The wires were tired enough to look honest.',
    category: 'console', subject: 'aft wiring panel',
    interpretation: 'An openable wiring access panel sits in the aft bulkhead, a few steps from the pilot cradle.',
    evidence: 'explicit',
    claims: [{ kind: 'presence', target: 'aftPanel' }, { kind: 'dimension', target: 'bridge.depth', min: 3.0, max: 5.2 }],
  },
  {
    key: 'deck-plating', source: 'Presence-09',
    quote: 'Iri-Six stepped in. Gait even. Shirt wrong. Her boots carried weight enough the deck hummed tighter under them.',
    category: 'floor', subject: 'bridge deck',
    interpretation: 'The bridge deck is thin, resonant metal plating that transmits footfalls.',
    evidence: 'explicit',
    claims: [{ kind: 'presence', target: 'floor' }],
  },
  {
    key: 'deck-warm', source: 'Presence-05',
    quote: 'She stepped in, bare feet marking the heat.',
    category: 'floor', subject: 'bridge deck temperature',
    interpretation: 'The deck is bare metal, walked barefoot; it conducts heat from ducting below.',
    evidence: 'explicit', claims: [],
  },
  {
    key: 'overhead-voice', source: 'Presence-02',
    quote: 'B.O.B. hummed from the overhead with the modest self-importance of a system trying not to intrude.',
    category: 'other', subject: 'ceiling / overhead',
    interpretation: 'The ship AI speaks from overhead — the bridge has a low ceiling with speakers and fittings.',
    evidence: 'explicit',
    claims: [{ kind: 'presence', target: 'ceiling' }],
  },

  // ======== forward glass / viewport ========
  {
    key: 'forward-glass', source: 'Presence-02',
    quote: 'The bridge had cooled two degrees, because Iri-Six told it to. The lights trimmed themselves to work, not mood. The forward glass held a felt black that wasn’t empty.',
    category: 'window', subject: 'forward glass',
    interpretation: 'A large forward viewport ("forward glass") dominates the front of the bridge; lighting is voice-adjustable.',
    evidence: 'explicit',
    claims: [{ kind: 'presence', target: 'viewport' }],
  },
  {
    key: 'viewport-real-glass', source: 'Next-10',
    quote: 'The main display wasn’t active. The stars outside the viewport barely moved.',
    category: 'window', subject: 'viewport vs displays',
    interpretation: 'The viewport is true exterior glass, separate from the display screens.',
    evidence: 'inference', claims: [],
  },
  {
    key: 'glass-reflects', source: 'Presence-02',
    quote: 'The pad didn’t show her face. The glass did.',
    category: 'sightline', subject: 'forward glass',
    interpretation: 'From the helm seat the forward glass is close and angled enough to reflect the pilot’s face.',
    evidence: 'explicit',
    claims: [{ kind: 'relation', a: 'pilotCradle', b: 'viewport', rel: 'facing' }],
  },
  {
    key: 'glass-standing-room', source: 'Next-07',
    quote: 'Quenby stood at the forward viewport, arms folded, watching it all float past.',
    category: 'movement', subject: 'space at the glass',
    interpretation: 'There is standing room directly at the forward viewport, forward of the seats.',
    evidence: 'explicit',
    claims: [],
  },
  {
    key: 'viewport-frame-low', source: 'Presence-05',
    quote: 'Quenby’s head found the bulkhead and stayed there. Iri’s found the viewport frame, a slow lean, the angle wrong for her neck but not corrected.',
    category: 'window', subject: 'viewport sill height',
    interpretation: 'A person sitting on the deck by the bench can lean a head against the viewport frame — the sill is low.',
    evidence: 'inference',
    claims: [{ kind: 'dimension', target: 'viewport.sillHeight', max: 1.1 }],
  },

  // ======== pilot cradle ========
  {
    key: 'cradle-slide', source: 'Presence-05',
    quote: 'Quenby slid into the pilot’s cradle and set a curve toward the nearest port that still sold parts to ships that didn’t ask questions.',
    category: 'seating', subject: 'pilot cradle',
    interpretation: 'The helm seat is a low, enclosing "cradle" you slide into.',
    evidence: 'explicit',
    claims: [{ kind: 'presence', target: 'pilotCradle' }],
  },
  {
    key: 'cradle-armrests-rail', source: 'Presence-08',
    quote: 'She slid into the cradle cold, one boot hooking the rail, hands flat on the armrests. The forward black met her stare and didn’t blink.',
    category: 'railing', subject: 'cradle + forward rail',
    interpretation: 'The cradle has armrests and a rail within leg reach of the seated pilot (boot-hooking distance), facing the glass.',
    evidence: 'explicit',
    claims: [
      { kind: 'presence', target: 'forwardRail' },
      { kind: 'relation', a: 'pilotCradle', b: 'forwardRail', rel: 'reachable-from' },
    ],
  },
  {
    key: 'cradle-sleep', source: 'Presence-09',
    quote: 'Quenby woke in the cradle, neck stiff, coin pressed into her thigh where it had lived all night.',
    category: 'character-behavior', subject: 'pilot cradle recline',
    interpretation: 'The cradle reclines enough to sleep a whole night in — Quenby uses it instead of her cabin.',
    evidence: 'explicit', claims: [],
  },
  {
    key: 'chair-swivel', source: 'VH1_B3_05',
    quote: 'She turned the chair slightly. Her knee came within an inch of Iri’s leg. Iri did not step',
    category: 'seating', subject: 'pilot chair swivel',
    interpretation: 'The pilot chair swivels; a slight turn puts the sitter’s knee within an inch of a person at the secondary console.',
    evidence: 'explicit',
    claims: [{ kind: 'relation', a: 'pilotCradle', b: 'auxConsole', rel: 'near' }],
  },
  {
    key: 'chair-notch', source: 'Next-10',
    quote: 'On the bridge, Quenby had moved the chair back a finger’s width from its usual notch. Not a statement. Just the distance it took to feel different.',
    category: 'seating', subject: 'pilot chair floor notch',
    interpretation: 'The helm chair seats into a floor notch/detent at a fixed position.',
    evidence: 'explicit', claims: [],
  },
  {
    key: 'chair-sideways', source: 'Next-01',
    quote: 'Quenby dropped into the captain’s chair, half‑turning so her legs hooked over the side.',
    category: 'seating', subject: 'pilot chair size',
    interpretation: 'The chair is open enough to sit sideways with legs hooked over an armrest.',
    evidence: 'explicit', claims: [],
  },
  {
    key: 'console-under-hands', source: 'Presence-02',
    quote: 'Quenby slid into the helm like you sit down in a familiarity you don’t name. The console warmed under her hands because it always did.',
    category: 'console', subject: 'helm console',
    interpretation: 'The main console sits directly under the seated pilot’s hands.',
    evidence: 'explicit',
    claims: [
      { kind: 'presence', target: 'helmConsole' },
      { kind: 'relation', a: 'pilotCradle', b: 'helmConsole', rel: 'reachable-from' },
    ],
  },
  {
    key: 'throttle', source: 'Presence-06',
    quote: 'The bridge door gave her Quenby’s profile first: bent forward in the cradle, one hand steady on the console, the other flexing tension into the throttle.',
    category: 'console', subject: 'physical throttle',
    interpretation: 'The helm has a physical throttle beside the console — and from the door, the first view of the pilot is her PROFILE.',
    evidence: 'explicit',
    claims: [
      { kind: 'clashes-with', target: 'door-behind',
        explanation: 'From this doorway you see the seated pilot in profile (from the side). But VH1_B3_05 has the bridge door opening directly behind the seated pilot. A single door cannot be both dead-aft of a forward-facing seat (you would see the back of her head) and abeam of it (profile view).',
        options: [
          { id: 'aft-corner', label: 'Door in the aft corner (recommended)', detail: 'Place the single door at the aft-starboard corner, angled. Approaching it is still "behind her", and a person entering sees her three-quarter/profile first. Satisfies both passages approximately.' },
          { id: 'aft-center', label: 'Door dead aft', detail: 'Keep the door centered behind the cradle. Treat "profile first" as loose phrasing (she was bent forward and turned). Marks the Presence-06 line as tension.' },
          { id: 'side-door', label: 'Door on the side wall', detail: 'Put the door abeam of the cradle. Treat "behind her" as loose phrasing for "out of view". Marks the VH1_B3_05 line as tension.' },
        ] },
    ],
  },
  {
    key: 'console-mug-rim', source: 'Next-10',
    quote: 'She rested the mug on the console rim. Didn’t drink.',
    category: 'console', subject: 'console rim',
    interpretation: 'The console rim is wide and flat enough to hold a mug.',
    evidence: 'explicit', claims: [],
  },
  {
    key: 'console-kneehole', source: 'Next-01',
    quote: 'She crouched beside an open panel beneath the bridge console, sleeves pushed past her elbows, wire casing peeled back with the confidence of someone who’d stopped asking permission long ago.',
    category: 'console', subject: 'console access panel',
    interpretation: 'The main console has a removable access panel beneath it with crouch-height clearance.',
    evidence: 'explicit', claims: [],
  },

  // ======== second seat / copilot ========
  {
    key: 'copilot-chair', source: 'Presence-08',
    quote: 'The hatch ground open slow, admitting her presence like it had to think first. Bare feet padded to the copilot’s chair. She dropped into it, the creak too loud for how slight she was.',
    category: 'seating', subject: 'copilot chair',
    interpretation: 'A copilot chair sits a few padding steps from the hatch; the hatch grinds open slowly.',
    evidence: 'explicit',
    claims: [
      { kind: 'presence', target: 'copilotChair' },
      { kind: 'relation', a: 'bridgeDoor', b: 'copilotChair', rel: 'near' },
    ],
  },
  {
    key: 'copilot-sprawl', source: 'Presence-09',
    quote: 'Nova sprawled in the co-pilot’s chair, legs over one armrest, head tilted to the ceiling. Screens hummed idle: fuel reports, static logs, a weather scan from a planet they weren’t landing on.',
    category: 'console', subject: 'copilot chair + screens',
    interpretation: 'Multiple idle status screens face the copilot chair; the chair has armrests and room to sprawl sideways.',
    evidence: 'explicit',
    claims: [
      { kind: 'presence', target: 'copilotConsole' },
      { kind: 'relation', a: 'copilotChair', b: 'copilotConsole', rel: 'facing' },
    ],
  },
  {
    key: 'jump-seat', source: 'Next-05',
    quote: 'Iri‑Six moved to the jump seat beside her. She didn’t sit.',
    category: 'seating', subject: 'jump seat',
    interpretation: 'A jump seat is mounted directly beside the captain’s chair.',
    evidence: 'explicit',
    claims: [{ kind: 'relation', a: 'copilotChair', b: 'pilotCradle', rel: 'beside' }],
  },
  {
    key: 'three-config', source: 'Presence-11',
    quote: 'Iri-Six stood near the console, pale gaze fixed on the nothing between stars. Nova lingered in the hatch, arms crossed, jaw set.',
    category: 'movement', subject: 'three-person bridge',
    interpretation: 'Three people fit at once: one in the cradle, one standing at a console with a view out, one in the hatchway.',
    evidence: 'explicit',
    claims: [{ kind: 'count', target: 'bridge.stations', value: 3 }],
  },

  // ======== auxiliary / secondary console ========
  {
    key: 'aux-console', source: 'Presence-02',
    quote: 'Iri-Six was already at the auxiliary console.',
    category: 'console', subject: 'auxiliary console',
    interpretation: 'The bridge has an auxiliary console — Iri’s habitual station.',
    evidence: 'explicit',
    claims: [{ kind: 'presence', target: 'auxConsole' }],
  },
  {
    key: 'aux-named-position', source: 'Presence-06',
    quote: 'Captain is in the bridge. Auxiliary console.',
    category: 'console', subject: 'auxiliary console',
    interpretation: 'The auxiliary console is a distinct named position the ship AI uses to locate people.',
    evidence: 'explicit', claims: [],
  },
  {
    key: 'aux-shelf-top', source: 'VH1_B3_05',
    quote: 'Iri set the slate on the secondary console and opened a station response field. No',
    category: 'console', subject: 'secondary console top',
    interpretation: 'The secondary console has a flat top usable as a shelf; it handles station comms.',
    evidence: 'explicit', claims: [],
  },
  {
    key: 'aux-cable-brush', source: 'VH1_B3_05',
    quote: 'stopped beside the secondary console. The cable brushed the back of Quenby’s chair',
    category: 'adjacency', subject: 'secondary console position',
    interpretation: 'The walking path from the door to the secondary console passes within a cable’s brush of the back of the pilot chair.',
    evidence: 'explicit',
    claims: [{ kind: 'relation', a: 'auxConsole', b: 'pilotCradle', rel: 'near' }],
  },
  {
    key: 'boots-on-secondary', source: 'Next-05',
    quote: 'Quenby sat with her boots on the secondary console, mug in hand, steam drifting toward her lashes.',
    category: 'seating', subject: 'secondary console reach',
    interpretation: 'The secondary console is within leg reach of the captain’s chair and low enough to prop boots on.',
    evidence: 'explicit',
    claims: [{ kind: 'dimension', target: 'auxConsole.height', max: 1.15 }],
  },
  {
    key: 'rail-between', source: 'Presence-02',
    quote: 'Iri-Six took the auxiliary station without the performative glance; she didn’t have to look to claim it. The datapad sat on the rail between them.',
    category: 'railing', subject: 'rail between stations',
    interpretation: 'A rail runs between the helm and the auxiliary station, close enough to both to serve as a shared shelf.',
    evidence: 'explicit',
    claims: [
      { kind: 'presence', target: 'stationRail' },
      { kind: 'clashes-with', target: 'knees-touch',
        explanation: 'A rail "between" the two stations implies they sit side by side with a barrier element sharing reach. But VH1_B3_05 has the two crew turning toward each other until their knees nearly touch — no rail could stand in that gap. Both cannot be literally true of the same pair of stations.',
        options: [
          { id: 'short-rail', label: 'Short rail segment behind the consoles (recommended)', detail: 'Keep a short shared rail at the console line between the two stations, but leave the gap between the CHAIRS open. The datapad rests on the rail; knees still meet when the chairs turn.' },
          { id: 'no-between-rail', label: 'No rail between stations', detail: 'Treat "the rail between them" as the forward rail, loosely phrased. Removes the station rail; marks the Presence-02 line as tension.' },
          { id: 'stations-apart', label: 'Stations separated by a full rail', detail: 'Keep a full rail between the stations and treat the knees-almost-touch scene as the copilot chair instead. Marks the VH1_B3_05 line as tension.' },
        ] },
    ],
  },
  {
    key: 'knees-touch', source: 'VH1_B3_05',
    quote: 'Iri turned. Fully enough that the cable at the console edge moved with her. Their knees',
    category: 'dimension', subject: 'station separation',
    interpretation: 'Turning at their stations, the two crew are close enough for knees to nearly touch — conversational, sub-meter spacing.',
    evidence: 'explicit',
    claims: [{ kind: 'dimension', target: 'stationGap', max: 1.1 }],
  },

  // ======== rails ========
  {
    key: 'forward-rail-lights', source: 'Next-01',
    quote: 'Lights along the forward rail blinked green, then held.',
    category: 'railing', subject: 'forward rail',
    interpretation: 'A forward rail carries embedded status lights — a railing stands between the seats and the viewport.',
    evidence: 'explicit',
    claims: [{ kind: 'relation', a: 'forwardRail', b: 'viewport', rel: 'near' }],
  },
  {
    key: 'two-rail-sets', source: 'Presence-02',
    quote: 'Quenby’s hand found the rail. Iri’s found the other set. The ship leaned into the first nothing.',
    category: 'railing', subject: 'rail count',
    interpretation: 'At least two separate sets of grab rails exist, one reachable from each station.',
    evidence: 'explicit',
    claims: [{ kind: 'count', target: 'bridge.rails', value: 2 }],
  },
  {
    key: 'rail-worn', source: 'Next-01',
    quote: 'She ran one hand along the edge of the bridge railing. Smooth, worn. Not her wear. Someone else’s hand had done this before.',
    category: 'railing', subject: 'rail finish',
    interpretation: 'The bridge railing is hand-height and worn smooth from long use.',
    evidence: 'explicit', claims: [],
  },

  // ======== viewport bench ========
  {
    key: 'viewport-bench', source: 'Presence-05',
    quote: 'Iri-Six had taken the floor by the viewport bench. Shirt pulled aside, medpatch peeled back, her kit open.',
    category: 'furniture', subject: 'viewport bench',
    interpretation: 'A bench sits by the viewport with enough open floor beside it for a person to sit and work.',
    evidence: 'explicit',
    claims: [
      { kind: 'presence', target: 'viewportBench' },
      { kind: 'relation', a: 'viewportBench', b: 'viewport', rel: 'near' },
    ],
  },

  // ======== the door ========
  {
    key: 'door-behind', source: 'VH1_B3_05',
    quote: 'Behind her, the bridge door opened.',
    category: 'door', subject: 'bridge door position',
    interpretation: 'The bridge has one door, aft of the seated pilot — the seat faces away from the entrance.',
    evidence: 'explicit',
    claims: [
      { kind: 'presence', target: 'bridgeDoor' },
      { kind: 'relation', a: 'bridgeDoor', b: 'pilotCradle', rel: 'aft-of' },
    ],
  },
  {
    key: 'door-palm', source: 'Presence-08',
    quote: 'The bridge opened when she pressed her palm. She didn’t ask for lights. The dark was honest.',
    category: 'door', subject: 'door mechanism',
    interpretation: 'The bridge door is palm-activated — manually commanded, never automatic.',
    evidence: 'explicit',
    claims: [{ kind: 'property', target: 'bridgeDoor', key: 'operation', value: 'manual (palm plate)' }],
  },
  {
    key: 'door-grind-slide', source: 'Presence-08',
    quote: 'The hatch ground open slow, admitting her presence like it had to think first.',
    category: 'door', subject: 'door mechanism',
    interpretation: 'The hatch grinds open slowly — a sliding mechanism on old tracks.',
    evidence: 'inference',
    claims: [{ kind: 'property', target: 'bridgeDoor', key: 'kind', value: 'sliding' }],
  },
  {
    key: 'door-lip', source: 'Next-10',
    quote: 'Carried it to the doorway. Set it on the lip where the corridor began, a marker just shy of a threshold.',
    category: 'floor', subject: 'door sill',
    interpretation: 'A raised lip/sill runs across the bridge doorway where the corridor floor begins.',
    evidence: 'explicit',
    claims: [{ kind: 'presence', target: 'doorSill' }],
  },
  {
    key: 'doorframe-lean', source: 'Presence-07',
    quote: 'Nova leaned on the inner frame, hands in pockets like they’d always been meant to be there.',
    category: 'character-behavior', subject: 'door inner frame',
    interpretation: 'The doorway has an inner frame a person habitually leans on — Nova’s default position before claiming the copilot chair.',
    evidence: 'explicit', claims: [],
  },
  {
    key: 'doors-wait', source: 'Presence-09',
    quote: 'Everything here waits to be told.',
    category: 'door', subject: 'ship-wide door policy',
    interpretation: 'Ship systems, doors and lights included, run in manual mode and act only on instruction.',
    evidence: 'explicit',
    claims: [{ kind: 'property', target: 'ship.doors', key: 'automation', value: 'manual' }],
  },

  // ======== Nova, bolts, floor space ========
  {
    key: 'nova-bolts', source: 'Presence-09',
    quote: 'Nova, cross-legged on the deck, was building towers from stripped bolts and washers.',
    category: 'object', subject: 'open deck space + bolts',
    interpretation: 'There is open deck space on the bridge where Nova sits cross-legged; her recurring toys are stripped bolts and washers.',
    evidence: 'explicit',
    claims: [{ kind: 'presence', target: 'playSpace' }],
  },
  {
    key: 'bolts-scatter', source: 'Presence-09',
    quote: 'The bolts scattered across the deck.',
    category: 'object', subject: 'bolts',
    interpretation: 'Loose bolts end up strewn across the bridge deck plating.',
    evidence: 'explicit', claims: [],
  },
  {
    key: 'bolts-source', source: 'Presence-06',
    quote: 'A drawer: two spoons, one bent. A cabinet: bolts stored in a mug that should’ve held tea.',
    category: 'object', subject: 'origin of the bolts',
    interpretation: 'The bolts come from a mug in the galley cabinet — they migrate to the bridge floor with Nova.',
    evidence: 'explicit', claims: [],
  },

  // ======== supply rack / storage ========
  {
    key: 'supply-rack', source: 'Next-05',
    quote: 'She crossed to the supply rack: rations, medpack, a barely functional stunner. Nothing elegant.',
    category: 'furniture', subject: 'supply rack',
    interpretation: 'A grab-and-go supply rack sits within a short walk of the bridge consoles.',
    evidence: 'explicit',
    claims: [{ kind: 'presence', target: 'supplyRack' }],
  },

  // ======== sightlines & occupancy ========
  {
    key: 'cradle-view-out', source: 'Presence-11',
    quote: 'She leaned forward in the cradle, elbows on her knees, eyes on the drift outside.',
    category: 'sightline', subject: 'cradle → glass',
    interpretation: 'From the cradle the pilot looks straight out the forward glass.',
    evidence: 'explicit',
    claims: [{ kind: 'relation', a: 'pilotCradle', b: 'viewport', rel: 'visible-from' }],
  },
  {
    key: 'exits-visible', source: 'VH1_B3_02',
    quote: '“I like exits visible,” she said.',
    category: 'character-behavior', subject: 'Quenby’s positioning rule',
    interpretation: 'Quenby positions herself so the exit stays in view — her stations should allow a sightline to the door.',
    evidence: 'explicit',
    claims: [{ kind: 'relation', a: 'bridgeDoor', b: 'pilotCradle', rel: 'visible-from' }],
  },
  {
    key: 'occupancy-strip', source: 'VH1_B3_04',
    quote: 'A small light glowed on the auxiliary occupancy strip.',
    category: 'console', subject: 'occupancy strip',
    interpretation: 'A strip display on the bridge shows which compartments are occupied, readable from the pilot position.',
    evidence: 'explicit', claims: [],
  },
  {
    key: 'standing-behind-chair', source: 'VH1_B3_04',
    quote: 'She stood behind the pilot’s chair.',
    category: 'movement', subject: 'space behind the chair',
    interpretation: 'There is standing room behind the pilot’s chair — a circulation lane crosses the bridge behind the seats.',
    evidence: 'explicit',
    claims: [{ kind: 'presence', target: 'aftLane' }],
  },
  {
    key: 'lean-bulkhead', source: 'Presence-06',
    quote: 'Nova leaned against the bulkhead, content to watch the silence prove her point.',
    category: 'character-behavior', subject: 'standing room at bulkhead',
    interpretation: 'There is leaning room at a bridge bulkhead within conversation range of both seats.',
    evidence: 'explicit', claims: [],
  },

  // ======== light & sound ========
  {
    key: 'lights-hum', source: 'Presence-11',
    quote: 'Later, the bridge lights hummed steady against the dark.',
    category: 'lighting', subject: 'bridge lights',
    interpretation: 'Bridge lighting audibly hums — powered fixtures in a quiet compartment.',
    evidence: 'explicit', claims: [],
  },
  {
    key: 'lights-low', source: 'Next-05',
    quote: 'The bridge lights were dimmed, more from neglect than mood.',
    category: 'lighting', subject: 'habitual light level',
    interpretation: 'Bridge lighting is dimmable and habitually kept low.',
    evidence: 'explicit', claims: [],
  },
  {
    key: 'galley-sounds', source: 'Presence-08',
    quote: 'From the galley: a clang. Metal set down too hard. A drawer yanked. The slam of a hatch that stuck and didn’t hurry.',
    category: 'adjacency', subject: 'galley adjacency',
    interpretation: 'Small galley sounds are clearly audible from the pilot cradle — the galley is one compartment aft.',
    evidence: 'inference',
    claims: [{ kind: 'relation', a: 'galley', b: 'bridge', rel: 'adjacent' }],
  },
  {
    key: 'galley-aft', source: 'Next-11',
    quote: 'Somewhere aft, a spoon wobbled and held.',
    category: 'adjacency', subject: 'galley direction',
    interpretation: 'The galley (where the spoons stand) lies aft of the bridge — the bridge is the forward compartment.',
    evidence: 'inference', claims: [],
  },
];

// ---- documents (assembled from the same quote strings) ----
const CHAPTER_TITLES = {
  'Next-01': 'Momentum / Seeds in the Dark', 'Next-05': 'Decision Vector / For Whoever’s Left',
  'Next-07': 'Threshold / Room Tone', 'Next-10': 'Manual Mode / Location Only',
  'Next-11': 'Resonance / Resonance',
  'Presence-02': 'Both Hands / Between the Wells', 'Presence-05': 'Cleanest Filthy Lane / The Economy of Heat',
  'Presence-06': 'For, Not Against / The Arithmetic of Outcomes', 'Presence-07': 'Pending, Erased / A Market That Watches Itself',
  'Presence-08': 'Stop Letting it Write You / The Gravity of Unowned Memory',
  'Presence-09': 'Better Than Drift / On the Non-Neutrality of Names',
  'Presence-11': 'Sugar / The Coin That Keeps Counting',
  'VH1_B3_02': 'Book 3, Chapter 2', 'VH1_B3_04': 'Book 3, Chapter 4', 'VH1_B3_05': 'Book 3, Chapter 5',
};

export function buildSeedDocuments() {
  const groups = { Next: [], Presence: [], VH1_B3: [] };
  for (const c of SEED_CONSTRAINTS) {
    const arc = c.source.startsWith('Next') ? 'Next' : c.source.startsWith('Presence') ? 'Presence' : 'VH1_B3';
    groups[arc].push(c);
  }
  const docs = [];
  const meta = {
    Next: ['Vox Humana — Next (bridge excerpts)', 'Next.zip · Arc 1 chapters'],
    Presence: ['Vox Humana — Presence (bridge excerpts)', 'Presence.zip · Arc 2 chapters'],
    VH1_B3: ['Vox Humana — Book 3 (bridge excerpts)', 'VH1_B3 chapter PDFs'],
  };
  for (const [arc, cons] of Object.entries(groups)) {
    const bySource = new Map();
    for (const c of cons) {
      if (!bySource.has(c.source)) bySource.set(c.source, []);
      bySource.get(c.source).push(c);
    }
    let text = `Excerpts relevant to the bridge of the Wild Huntress.\n`;
    for (const [src, list] of [...bySource.entries()].sort()) {
      text += `\n[${src} · ${CHAPTER_TITLES[src] || src}]\n\n`;
      const seen = new Set();
      for (const c of list) {
        if (seen.has(c.quote)) continue;
        seen.add(c.quote);
        text += c.quote + '\n\n';
      }
    }
    docs.push({ key: arc, title: meta[arc][0], source: meta[arc][1], text });
  }
  return docs;
}

// ---- default scene ----
export const SEED_SCENE = {
  name: 'Three on the bridge',
  note: 'Presence-09/11 arrangement: Quenby in the cradle, Iri at the auxiliary console, Nova cross-legged on the deck with her bolts.',
  mannequins: [
    { character: 'quenby', pos: [0, 0, -0.7], rotY: Math.PI, pose: 'sit', supportHeight: 0.42, props: null },
    { character: 'iri', pos: [-1.45, 0, -0.55], rotY: Math.PI * 0.85, pose: 'stand', props: null },
    { character: 'nova', pos: [1.0, 0, 0.9], rotY: Math.PI * 1.15, pose: 'sitFloor', props: 'bolts' },
  ],
  paths: [
    { id: 'path_nova', name: 'Nova: hatch → copilot chair', character: 'nova',
      points: [[1.15, 0, 2.05], [1.3, 0, 1.2], [1.35, 0, 0.15], [1.15, 0, -0.5]] },
  ],
};
