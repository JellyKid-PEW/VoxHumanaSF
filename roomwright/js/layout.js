// Generates ship geometry from the constraint database + rulings.
// Every generated object records WHICH constraints determined it (evidenceRefs)
// and an honest evidence level. Values not pinned by prose are assumptions.
//
// Coordinates: meters, floor at y=0, forward (viewport) = -Z, aft = +Z,
// starboard = +X, port = -X. The bridge is centered on the origin; the
// corridor and galley extend aft from the bridge hatch.
import { state } from './state.js';
import { bus, status } from './util.js';

// Bridge shell parameters. Width/depth are assumptions chosen inside the
// evidenced bounds (narrow-space max, crossable-room min, aft-panel-cross).
export const BRIDGE = { W: 4.8, D: 4.6, H: 2.25 };

// ---- frame grid: ring frames every 1.2 m, numbered from the bow ----
// Frame 1 sits at the nose (z0); every space, pocket, and panel aboard can
// be addressed as "frame N, port/starboard". Working numbers, not canon.
export const FRAME = { z0: -4.2, spacing: 1.2, count: 38 };
export const frameOf = z => Math.max(1, Math.min(FRAME.count, 1 + Math.round((z - FRAME.z0) / FRAME.spacing)));
export const frameSpan = (zMin, zMax) => {
  const a = frameOf(zMin), b = frameOf(zMax);
  return a === b ? `F${String(a).padStart(2, '0')}` : `F${String(a).padStart(2, '0')}–F${String(b).padStart(2, '0')}`;
};

// ---- hull envelope sketch (default door ruling; visual test only) ----
// ~44.5 m long, ~18.8 m max beam, hull centerline near x = -2. Levels are
// drawn as outline loops in the editor's Hull overlay; the massing objects
// below reserve the honest masses inside it. NOT a locked exterior.
export const HULL_LEVELS = [
  { y: -6.2, pts: [[-7, 2], [3, 2], [5.2, 6], [5.2, 26], [3, 32], [-1, 36], [-3.5, 36], [-7.5, 32], [-9.5, 26], [-9.5, 6]] },
  { y: -3.05, pts: [[-4.5, -3.6], [0.5, -3.6], [2.6, -1], [7.2, 4.5], [7.2, 14], [5.5, 20], [4.6, 29.5], [2.5, 36], [-1, 40.3], [-3.6, 40.3], [-7.5, 36], [-9, 29.5], [-11.6, 20], [-11.6, 8], [-8, -0.5]] },
  { y: 0.05, pts: [[-3.2, -4.2], [1.2, -4.2], [3, -1.5], [7.2, 5], [7.2, 13], [5, 19], [4, 27], [1.5, 31], [-4.5, 31], [-6.8, 27], [-8, 19], [-6.5, 8], [-5.5, 2], [-4.2, -2.5]] },
  { y: 3.1, pts: [[-2.6, -1], [1.4, -1], [2.2, 4], [2.2, 26], [0, 30], [-3.5, 30], [-4.5, 26], [-4.5, 4]] },
];
export const DECK2Y = -3.0;                  // lower deck base height; 3.0 m floor-to-floor leaves real structure/service depth under occupied main-deck spaces
const COR = { W: 1.1, LEN: 4.6, H: 2.15 };   // corridor: narrow, lower overhead
// One galley size: the six-crew commercial scale (author ruling). The
// galley conflict's rulings are interpretive — they change no geometry.
const GALLEY_SIZES = { lived: [3.4, 4.8] };

function defs(rulings) {
  const W = BRIDGE.W, D = BRIDGE.D, H = BRIDGE.H;
  // Author rulings — all six declared conflicts are resolved canon. The
  // choices are fixed here; rulings stored in older saves are superseded.
  //   bridge door: single hatch, aft-starboard corner, angled approach
  //     (two doors would both cut the same aft pressure wall two meters
  //     apart — hull on the other three sides — so one door it is)
  //   station rail: short shared segment at the console line, chairs open
  //   galley: sized for six, crowded by habit (interpretive; no geometry)
  //   engine bay: walk-in bay plus underdeck crawl below a deck hatch
  //   Hold Two hatch: automation is an era, not a fixture (interpretive)
  //   Iri's quarters: Cabin Five on the quiet run, beside Quenby
  const doorRuling = 'aft-corner';
  const railRuling = 'short-rail';
  const iriRuling = 'cabin-row';
  const iriProvisional = false;

  // door placement
  let doorX = 1.5, doorOnSideWall = false;
  const doorProvisional = !doorRuling;
  if (doorRuling === 'aft-center') doorX = 0;
  else if (doorRuling === 'aft-corner') doorX = 1.5;
  else if (doorRuling === 'side-door') doorOnSideWall = true;

  const list = [];
  const add = (layoutKey, o) => list.push({ layoutKey, room: o.room || 'bridge', ...o });

  // ================= BRIDGE =================
  add('floor', {
    type: 'floor', name: 'Bridge deck', params: { width: W, depth: D },
    pos: [0, 0, 0], rotY: 0, locked: true,
    evidence: 'inference',
    evidenceRefs: ['narrow-space', 'crossable-room', 'deck-plating', 'deck-warm'],
    note: `Deck ${W} × ${D} m — size chosen inside the evidenced bounds (a "narrow space" that is still a crossable room).`,
  });
  add('ceiling', {
    type: 'ceiling', name: 'Overhead', params: { width: W, depth: D, height: H },
    pos: [0, 0, 0], rotY: 0, locked: true,
    evidence: 'inference', evidenceRefs: ['overhead-voice'],
    note: 'Low overhead with light channels and B.O.B.’s speakers. Height 2.25 m is an assumption.',
  });
  add('viewportWall', {
    type: 'viewport', name: 'Forward glass',
    params: { length: W, height: H, thickness: 0.18, sillHeight: 0.55, windowHeight: 1.05 },
    pos: [0, 0, -D / 2], rotY: 0, locked: true,
    evidence: 'explicit',
    evidenceRefs: ['forward-glass', 'viewport-real-glass', 'glass-reflects', 'viewport-frame-low', 'glass-standing-room'],
    note: 'The "forward glass" — true exterior viewport. Low sill (a seated person on the deck can lean a head on the frame).',
  });
  add('wallPort', {
    type: 'wall', name: 'Port bulkhead', params: { length: D, height: H, thickness: 0.16 },
    pos: [-W / 2, 0, 0], rotY: Math.PI / 2, locked: true,
    evidence: 'assumption', evidenceRefs: ['lean-bulkhead'],
    note: 'Hull bulkhead. Position follows the room envelope (assumed dimensions).',
  });

  // ---------- aft wall + bridge hatch ----------
  if (!doorOnSideWall) {
    add('doorway', {
      type: 'doorway', name: 'Bridge hatch',
      params: { length: 1.8, height: H, thickness: 0.16, doorWidth: 0.85, doorHeight: 1.95, kind: 'sliding', slideDir: doorX > 0 ? -1 : 1, open: 0 },
      pos: [doorX, 0, D / 2], rotY: 0, locked: false,
      evidence: doorProvisional ? 'assumption' : 'decision',
      evidenceRefs: ['door-behind', 'throttle', 'door-palm', 'door-grind-slide', 'doorframe-lean', 'doors-wait'],
      note: doorProvisional
        ? '⚠ Provisional position — the door-placement conflict is unresolved (aft of the pilot vs. profile view from the door). Currently placed in the aft-starboard corner as a compromise.'
        : 'Position fixed by author ruling: the single hatch sits in the aft-starboard corner, angled — approaching is still "behind her," and someone entering sees her three-quarter profile first. Palm-plate, manual sliding hatch that grinds open slowly.',
    });
    const segL = 1.8;
    const leftLen = (doorX - segL / 2) - (-W / 2);
    const rightLen = (W / 2) - (doorX + segL / 2);
    if (leftLen > 0.05) add('aftWallL', {
      type: 'wall', name: 'Aft bulkhead (port)', params: { length: leftLen, height: H, thickness: 0.16 },
      pos: [-W / 2 + leftLen / 2, 0, D / 2], rotY: 0, locked: true,
      evidence: 'inference', evidenceRefs: ['aft-panel-cross'],
      note: 'Aft bulkhead — carries the wiring access panel.',
    });
    if (rightLen > 0.05) add('aftWallR', {
      type: 'wall', name: 'Aft bulkhead (starboard)', params: { length: rightLen, height: H, thickness: 0.16 },
      pos: [doorX + segL / 2 + rightLen / 2, 0, D / 2], rotY: 0, locked: true,
      evidence: 'inference', evidenceRefs: ['aft-panel-cross'], note: 'Aft bulkhead.',
    });
    add('wallStbd', {
      type: 'wall', name: 'Starboard bulkhead', params: { length: D, height: H, thickness: 0.16 },
      pos: [W / 2, 0, 0], rotY: Math.PI / 2, locked: true,
      evidence: 'assumption', evidenceRefs: [], note: 'Hull bulkhead (assumed envelope).',
    });
  } else {
    add('aftWallL', {
      type: 'wall', name: 'Aft bulkhead', params: { length: W, height: H, thickness: 0.16 },
      pos: [0, 0, D / 2], rotY: 0, locked: true,
      evidence: 'inference', evidenceRefs: ['aft-panel-cross'], note: 'Aft bulkhead — carries the wiring access panel.',
    });
    add('doorway', {
      type: 'doorway', name: 'Bridge hatch',
      params: { length: 1.8, height: H, thickness: 0.16, doorWidth: 0.85, doorHeight: 1.95, kind: 'sliding', open: 0 },
      pos: [W / 2, 0, 0.9], rotY: Math.PI / 2, locked: false,
      evidence: 'decision',
      evidenceRefs: ['throttle', 'door-palm', 'door-grind-slide', 'doorframe-lean', 'doors-wait'],
      note: 'Position fixed by your ruling (side door — profile view of the pilot from the doorway).',
    });
    // starboard wall segments either side of the door (door spans z 0.0 – 1.8)
    add('wallStbd', {
      type: 'wall', name: 'Starboard bulkhead (fwd)', params: { length: D / 2, height: H, thickness: 0.16 },
      pos: [W / 2, 0, -D / 4], rotY: Math.PI / 2, locked: true,
      evidence: 'assumption', evidenceRefs: [], note: 'Hull bulkhead (assumed envelope).',
    });
    add('wallStbdAft', {
      type: 'wall', name: 'Starboard bulkhead (aft)', params: { length: D / 2 - 1.8, height: H, thickness: 0.16 },
      pos: [W / 2, 0, 1.8 + (D / 2 - 1.8) / 2], rotY: Math.PI / 2, locked: true,
      evidence: 'assumption', evidenceRefs: [], note: 'Hull bulkhead (assumed envelope).',
    });
  }
  add('doorSill', {
    type: 'step', name: 'Hatch sill (raised lip)',
    params: { width: 1.0, rise: 0.045, run: 0.32, steps: 1 },
    pos: doorOnSideWall ? [W / 2 - 0.2, 0, 0.9] : [doorX, 0, D / 2 - 0.2],
    rotY: doorOnSideWall ? Math.PI / 2 : 0, locked: false,
    evidence: 'explicit', evidenceRefs: ['door-lip'],
    note: 'The raised lip at the doorway "where the corridor began".',
  });

  // ---------- bridge stations ----------
  add('helmConsole', {
    type: 'console', name: 'Helm console',
    params: { width: 1.15, depth: 0.72, height: 0.92, screens: 2, lit: true },
    pos: [0.1, 0, -1.5], rotY: 0, locked: false,
    evidence: 'explicit',
    evidenceRefs: ['console-under-hands', 'throttle', 'console-mug-rim', 'console-kneehole', 'occupancy-strip'],
    note: 'Main console under the pilot’s hands: physical throttle, mug-wide rim, occupancy strip, access panel beneath.',
  });
  add('pilotCradle', {
    type: 'seat', name: 'Pilot cradle',
    params: { seatHeight: 0.42, width: 0.58, hasArms: true },
    pos: [0, 0, -0.72], rotY: Math.PI, locked: false,
    evidence: 'explicit',
    evidenceRefs: ['cradle-slide', 'cradle-armrests-rail', 'cradle-sleep', 'chair-swivel', 'chair-notch', 'chair-sideways'],
    note: 'Quenby’s cradle — swivels, slides, reclines enough to sleep in, seats into a floor notch.',
  });
  add('copilotConsole', {
    type: 'console', name: 'Copilot console',
    params: { width: 1.05, depth: 0.68, height: 0.92, screens: 3, lit: true },
    pos: [1.35, 0, -1.42], rotY: -0.12, locked: false,
    evidence: 'explicit', evidenceRefs: ['copilot-sprawl'],
    note: 'Idle status screens (fuel reports, static logs, weather scans) facing the copilot chair.',
  });
  add('copilotChair', {
    type: 'seat', name: 'Copilot chair',
    params: { seatHeight: 0.44, width: 0.55, hasArms: true },
    pos: [1.32, 0, -0.66], rotY: Math.PI - 0.12, locked: false,
    evidence: 'explicit', evidenceRefs: ['copilot-chair', 'copilot-sprawl', 'jump-seat', 'three-config'],
    note: 'The creaking copilot chair Nova claims — a few steps from the hatch, beside the cradle.',
  });
  add('auxConsole', {
    type: 'console', name: 'Auxiliary console',
    params: { width: 1.05, depth: 0.65, height: 0.9, screens: 2, lit: true },
    pos: [-1.35, 0, -1.12], rotY: 0.35, locked: false,
    evidence: 'explicit',
    evidenceRefs: ['aux-console', 'aux-named-position', 'aux-shelf-top', 'aux-cable-brush', 'boots-on-secondary', 'knees-touch'],
    note: 'Iri’s station (the "secondary console"). Flat shelf top; low enough to prop boots on; a step from the cradle.',
  });

  // ---------- bridge rails ----------
  add('forwardRail', {
    type: 'rail', name: 'Forward rail',
    params: { length: 2.6, height: 0.82, midRail: true },
    pos: [0.35, 0, -1.92], rotY: 0, locked: false,
    evidence: 'explicit',
    evidenceRefs: ['forward-rail-lights', 'cradle-armrests-rail', 'two-rail-sets', 'rail-worn'],
    note: 'Worn-smooth rail between the stations and the glass; status lights along it; Quenby hooks a boot / puts feet up here.',
  });
  const railProvisional = !railRuling;
  if (railRuling !== 'no-between-rail') {
    const full = railRuling === 'stations-apart';
    add('stationRail', {
      type: 'rail', name: 'Station rail',
      params: { length: full ? 1.6 : 0.44, height: 0.86, midRail: false },
      pos: full ? [-0.72, 0, -0.7] : [-0.45, 0, -1.08],
      rotY: full ? Math.PI / 2 : 0.2, locked: false,
      evidence: railProvisional ? 'assumption' : 'decision',
      evidenceRefs: ['rail-between', 'two-rail-sets', 'knees-touch'],
      note: railProvisional
        ? '⚠ Provisional — the rail-between-stations conflict is unresolved. Shown as a short segment at the console line (datapad shelf) so the chairs can still meet knees.'
        : (full
          ? 'Your ruling: full rail separates the two stations.'
          : 'Author ruling: short rail segment at the console line between helm and auxiliary station — the datapad shelf. The gap between the chairs stays open; knees still meet when they turn.'),
    });
  }

  // ---------- bridge furniture ----------
  add('viewportBench', {
    type: 'bench', name: 'Viewport bench',
    params: { width: 1.25, height: 0.42, depth: 0.45 },
    pos: [-1.62, 0, -1.95], rotY: 0, locked: false,
    evidence: 'explicit', evidenceRefs: ['viewport-bench', 'viewport-frame-low'],
    note: 'The bench by the forward glass. Open deck beside it — where Iri sat on the floor and leaned on the viewport frame.',
  });
  add('supplyRack', {
    type: 'storage', name: 'Supply rack',
    params: { width: 1.05, height: 1.75, depth: 0.42 },
    pos: [-1.72, 0, 1.98], rotY: Math.PI, locked: false,
    evidence: 'explicit', evidenceRefs: ['supply-rack'],
    note: 'Rations, medpack, a barely functional stunner. Nothing elegant.',
  });
  add('aftPanel', {
    type: 'storage', name: 'Aft wiring panel',
    params: { width: 0.9, height: 1.5, depth: 0.1 },
    pos: [-0.7, 0, 2.16], rotY: Math.PI, locked: false,
    evidence: 'explicit', evidenceRefs: ['aft-panel-cross'],
    note: 'The openable panel Quenby crosses to — "the wires were tired enough to look honest."',
  });
  add('navLockBank', {
    type: 'crate', name: 'Nav lock lever bank',
    params: { width: 0.3, height: 0.82, depth: 0.24 },
    pos: [0.48, 0, -1.0], rotY: 0, locked: false,
    evidence: 'explicit', evidenceRefs: ['nav-locks-helm'],
    note: 'Physical course-hold levers at the pilot’s right hand — "The nav locks clicked. The forward vector tightened like a belt." Helm hardware; the nav compartment below is the plotting room, not these.',
  });
  add('boltsScatter', {
    type: 'bolts', name: 'Nova’s bolts',
    params: { count: 9, spread: 0.75 },
    pos: [1.0, 0, 0.95], rotY: 0, locked: false,
    evidence: 'explicit', evidenceRefs: ['nova-bolts', 'bolts-scatter', 'bolts-source'],
    note: 'Stripped bolts and washers from the galley mug, strewn where Nova sits cross-legged on the deck.',
  });

  // ================= MAIN COMMERCIAL CORRIDOR =================
  // The primary route is deliberately not one straight sightline from the
  // personnel airlock to medbay. It runs aft from the bridge, then offsets
  // inboard before reaching the medical / domestic end of the deck.
  const cx = doorOnSideWall ? 3.05 : doorX;   // forward-run centerline
  const corStartZ = doorOnSideWall ? 1.45 : D / 2;
  const bendZ = 5.05;
  const aftCx = cx - 1.15;                    // aft run shifts port/inboard
  const corEndZ = 7.80;                       // galley face / domestic junction
  const spineZ = 4.35;                        // storage-spine turn before the bend
  const stairZ = 3.65;
  const medHatchZ = 5.80;
  const hygBranchZ = 7.25;
  const alkZ = 3.15;

  const corNote = 'Primary commercial circulation. The forward run is narrow and practical; the offset before medbay prevents a direct airlock-to-medical sightline.';

  // ---------- forward corridor run ----------
  add('corFloor', {
    room: 'corridor', type: 'floor', name: 'Main corridor deck (forward run)',
    params: { width: COR.W, depth: bendZ - corStartZ },
    pos: [cx, 0, (corStartZ + bendZ) / 2], rotY: 0, locked: true,
    evidence: 'explicit', evidenceRefs: ['corridor-route', 'corridor-narrow'],
    note: corNote,
  });
  add('corCeiling', {
    room: 'corridor', type: 'ceiling', name: 'Main corridor overhead (forward run)',
    params: { width: COR.W, depth: bendZ - corStartZ, height: COR.H },
    pos: [cx, 0, (corStartZ + bendZ) / 2], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: 'Low working overhead.',
  });

  // Port wall: primary stair only. Medbay belongs beyond the bend.
  // The port wall stops at the offset's forward edge (bendZ - COR.W/2) so the
  // jog crosses inboard through the full elbow, not through a wall.
  const fwdPortA = (stairZ - 0.55) - corStartZ;
  const fwdPortB = (bendZ - COR.W / 2) - (stairZ + 0.55);
  if (fwdPortA > 0.05) add('corWallPort', {
    room: 'corridor', type: 'wall', name: 'Main corridor port wall (forward)',
    params: { length: fwdPortA, height: COR.H, thickness: 0.12 },
    pos: [cx - COR.W / 2, 0, corStartZ + fwdPortA / 2], rotY: Math.PI / 2, locked: true,
    evidence: 'explicit', evidenceRefs: ['corridor-narrow', 'corridor-widened', 'corridor-smell'], note: corNote,
  });
  add('stairDoor', {
    room: 'stairwell', type: 'doorway', name: 'Primary stair opening',
    params: { length: 1.1, height: COR.H, thickness: 0.12, doorWidth: 0.9, doorHeight: 1.95, kind: 'sliding', slideDir: -1, open: 1 },
    pos: [cx - COR.W / 2, 0, stairZ], rotY: Math.PI / 2, locked: true,
    evidence: 'explicit', evidenceRefs: ['stair-lights', 'deck-three'],
    note: 'Primary stair down to Lower Operations. Its opening stays parked clear of routine corridor traffic.',
  });
  if (fwdPortB > 0.05) add('corWallPortMid', {
    room: 'corridor', type: 'wall', name: 'Main corridor port wall (to bend)',
    params: { length: fwdPortB, height: COR.H, thickness: 0.12 },
    pos: [cx - COR.W / 2, 0, stairZ + 0.55 + fwdPortB / 2], rotY: Math.PI / 2, locked: true,
    evidence: 'explicit', evidenceRefs: ['corridor-narrow'], note: 'Forward-run wall after the stair.',
  });

  // Starboard wall: airlock, then legacy storage-spine branch.
  const airHalf = 0.45, spineHalf = 0.50;
  const eastA = (alkZ - airHalf) - corStartZ;
  const eastB = (spineZ - spineHalf) - (alkZ + airHalf);
  const eastC = bendZ - (spineZ + spineHalf);
  if (eastA > 0.05) add('corWallStbd1', {
    room: 'corridor', type: 'wall', name: 'Main corridor starboard wall (forward)',
    params: { length: eastA, height: COR.H, thickness: 0.12 },
    pos: [cx + COR.W / 2, 0, corStartZ + eastA / 2], rotY: Math.PI / 2, locked: true,
    evidence: 'explicit', evidenceRefs: ['corridor-route'], note: 'Forward corridor wall up to the personnel airlock.',
  });
  add('alkInnerDoor', {
    room: 'airlock', type: 'doorway', name: 'Airlock inner hatch',
    params: { length: 0.9, height: COR.H, thickness: 0.12, doorWidth: 0.7, doorHeight: 1.85, kind: 'sliding', slideDir: -1, open: 0 },
    pos: [cx + COR.W / 2, 0, alkZ], rotY: Math.PI / 2, locked: false,
    evidence: 'explicit',
    evidenceRefs: ['alk-main-hatch', 'alk-two-steps', 'alk-two-stage', 'alk-inner-release', 'doors-wait'],
    note: 'The personnel / EVA airlock remains near the bridge. The corridor bend farther aft blocks a direct view into medbay. THE INTAKE RULE: this is a people door, not a parts door — quick clean EVAs only. Anything carried, and anyone dirty, comes in low through the bay or the freight lock. Salvage never walks through home.',
  });
  if (eastB > 0.05) add('corWallStbd1b', {
    room: 'corridor', type: 'wall', name: 'Main corridor starboard wall (mid)',
    params: { length: eastB, height: COR.H, thickness: 0.12 },
    pos: [cx + COR.W / 2, 0, alkZ + airHalf + eastB / 2], rotY: Math.PI / 2, locked: true,
    evidence: 'explicit', evidenceRefs: ['corridor-route'], note: 'Between the airlock and storage-spine turn.',
  });
  add('spineHatch', {
    room: 'corridor', type: 'doorway', name: 'Storage spine hatch',
    params: { length: 1.0, height: COR.H, thickness: 0.12, doorWidth: 0.62, doorHeight: 1.85, kind: 'hinged', hinge: 'left', swing: 'out', open: 0 },
    pos: [cx + COR.W / 2, 0, spineZ], rotY: Math.PI / 2, locked: false,
    evidence: 'explicit', evidenceRefs: ['corridor-route', 'spine-hatch', 'galley-junction-cup'],
    note: 'The old storage / utility spine leaves the primary route before the corridor offset.',
  });
  if (eastC > 0.05) add('corWallStbd2', {
    room: 'corridor', type: 'wall', name: 'Main corridor starboard wall (to bend)',
    params: { length: eastC, height: COR.H, thickness: 0.12 },
    pos: [cx + COR.W / 2, 0, spineZ + spineHalf + eastC / 2], rotY: Math.PI / 2, locked: true,
    evidence: 'explicit', evidenceRefs: ['corridor-route'], note: 'Forward run ends at the offset.',
  });

  // ---------- offset / bend ----------
  const bendW = Math.abs(cx - aftCx) + COR.W;
  add('corBendFloor', {
    room: 'corridor', type: 'floor', name: 'Main corridor offset deck',
    params: { width: bendW, depth: COR.W },
    pos: [(cx + aftCx) / 2, 0, bendZ], rotY: 0, locked: true,
    evidence: 'decision', evidenceRefs: ['med-corridor', 'med-deeper'],
    note: 'A deliberate offset in ordinary circulation. It keeps boarding traffic from looking directly into the medical zone.',
  });
  add('corBendCeil', {
    room: 'corridor', type: 'ceiling', name: 'Main corridor offset overhead',
    params: { width: bendW, depth: COR.W, height: COR.H },
    pos: [(cx + aftCx) / 2, 0, bendZ], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: '',
  });
  // The elbow's enclosure: the forward edge closes only where the forward run
  // is NOT above it (west of the forward run's port wall), and the aft edge
  // closes only where the aft run is NOT below it (east of the aft run's
  // starboard wall). Short end caps close the two open edges of the elbow.
  add('corBendN', {
    room: 'corridor', type: 'wall', name: 'Offset forward bulkhead',
    params: { length: Math.abs(cx - aftCx), height: COR.H, thickness: 0.12 },
    pos: [(cx + aftCx) / 2 - COR.W / 2, 0, bendZ - COR.W / 2], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: 'Closes the inside of the turn; the forward run stays open into the elbow.',
  });
  add('corBendS', {
    room: 'corridor', type: 'wall', name: 'Offset aft bulkhead',
    params: { length: Math.abs(cx - aftCx), height: COR.H, thickness: 0.12 },
    pos: [(cx + aftCx) / 2 + COR.W / 2, 0, bendZ + COR.W / 2], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: 'Closes the outside of the turn; the aft run begins on the inboard side.',
  });
  add('corBendW', {
    room: 'corridor', type: 'wall', name: 'Offset port end cap',
    params: { length: COR.W / 2, height: COR.H, thickness: 0.12 },
    pos: [aftCx - COR.W / 2, 0, bendZ - COR.W / 4], rotY: Math.PI / 2, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: 'Closes the elbow west of the aft run mouth.',
  });
  add('corBendE', {
    room: 'corridor', type: 'wall', name: 'Offset starboard end cap',
    params: { length: COR.W / 2, height: COR.H, thickness: 0.12 },
    pos: [cx + COR.W / 2, 0, bendZ + COR.W / 4], rotY: Math.PI / 2, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: 'Closes the elbow south of the forward run mouth.',
  });

  // ---------- aft corridor run ----------
  add('corAftFloor', {
    room: 'corridor', type: 'floor', name: 'Main corridor deck (aft run)',
    params: { width: COR.W, depth: corEndZ - bendZ },
    pos: [aftCx, 0, (bendZ + corEndZ) / 2], rotY: 0, locked: true,
    evidence: 'decision', evidenceRefs: ['med-corridor', 'med-deeper', 'galley-junction-cup'],
    note: 'Aft run serving medbay and the domestic junction.',
  });
  add('corAftCeil', {
    room: 'corridor', type: 'ceiling', name: 'Main corridor overhead (aft run)',
    params: { width: COR.W, depth: corEndZ - bendZ, height: COR.H },
    pos: [aftCx, 0, (bendZ + corEndZ) / 2], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: '',
  });

  const medHalf = 0.6;
  const hygHalf = 0.50;
  const aftPortA = (medHatchZ - medHalf) - bendZ;
  const aftPortB = (hygBranchZ - hygHalf) - (medHatchZ + medHalf);
  const aftPortC = corEndZ - (hygBranchZ + hygHalf);
  if (aftPortA > 0.05) add('corAftWallPort1', {
    room: 'corridor', type: 'wall', name: 'Aft corridor port wall (forward)',
    params: { length: aftPortA, height: COR.H, thickness: 0.12 },
    pos: [aftCx - COR.W / 2, 0, bendZ + aftPortA / 2], rotY: Math.PI / 2, locked: true,
    evidence: 'assumption', evidenceRefs: ['med-corridor'], note: 'Wall before the medical hatch.',
  });
  add('medHatch', {
    room: 'medbay', type: 'doorway', name: 'Medbay hatch',
    params: { length: 1.2, height: COR.H, thickness: 0.12, doorWidth: 0.8, doorHeight: 1.9, kind: 'sliding', slideDir: -1, open: 0 },
    pos: [aftCx - COR.W / 2, 0, medHatchZ], rotY: Math.PI / 2, locked: false,
    evidence: 'explicit', evidenceRefs: ['med-corridor', 'med-deeper', 'doors-wait'],
    note: 'Medbay opens from the aft run after the corridor offset; routine boarders cannot see directly into it from the airlock.',
  });
  if (aftPortB > 0.05) add('corAftWallPort2', {
    room: 'corridor', type: 'wall', name: 'Aft corridor port wall (between medical and domestic branch)',
    params: { length: aftPortB, height: COR.H, thickness: 0.12 },
    pos: [aftCx - COR.W / 2, 0, medHatchZ + medHalf + aftPortB / 2], rotY: Math.PI / 2, locked: true,
    evidence: 'assumption', evidenceRefs: ['med-corridor'], note: 'Short wall separating the medbay hatch from the dry domestic branch.',
  });
  add('hygBranchDoor', {
    room: 'hygiene', type: 'doorway', name: 'Dry hygiene branch opening',
    params: { length: 1.0, height: COR.H, thickness: 0.12, doorWidth: 0.82, doorHeight: 1.92, kind: 'sliding', slideDir: -1, open: 1 },
    pos: [aftCx - COR.W / 2, 0, hygBranchZ], rotY: Math.PI / 2, locked: true,
    evidence: 'decision', evidenceRefs: [],
    note: 'Separate dry access toward hygiene and the secondary ladder. The galley remains a different closable room.',
  });
  if (aftPortC > 0.05) add('corAftWallPort3', {
    room: 'corridor', type: 'wall', name: 'Aft corridor port wall (domestic junction)',
    params: { length: aftPortC, height: COR.H, thickness: 0.12 },
    pos: [aftCx - COR.W / 2, 0, hygBranchZ + hygHalf + aftPortC / 2], rotY: Math.PI / 2, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: 'Final wall segment before the galley hatch.',
  });
  add('corAftWallStbd', {
    room: 'corridor', type: 'wall', name: 'Aft corridor starboard wall',
    params: { length: corEndZ - (bendZ + COR.W / 2), height: COR.H, thickness: 0.12 },
    pos: [aftCx + COR.W / 2, 0, (bendZ + COR.W / 2 + corEndZ) / 2], rotY: Math.PI / 2, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: 'Starts at the elbow’s aft edge; the legacy storage spine is already outboard of this shifted run.',
  });

  // ================= STORAGE SPINE =================
  // "Two turns down": turn one off the main corridor at the spine hatch,
  // turn two where the spine bends aft. Pocket three opens off the aft leg.
  const SPW = 1.0, SPH = 2.05;           // spine width / height — narrow and low
  const leg1x0 = cx + COR.W / 2;         // spine hatch wall plane
  const leg1Len = 1.2;
  const leg2x = leg1x0 + leg1Len + SPW / 2;         // centerline of the aft leg
  const leg2z0 = spineZ - SPW / 2, leg2z1 = spineZ + 5.7;  // runs aft to the engine bay
  const pktHatchZ = spineZ + 1.7;
  const domeZ = spineZ + 4.1;
  const s4HatchZ = domeZ + 0.55;                        // dome arch, off the outboard wall

  add('spnLeg1Floor', {
    room: 'spine', type: 'floor', name: 'Storage spine deck (first turn)', params: { width: leg1Len, depth: SPW },
    pos: [leg1x0 + leg1Len / 2, 0, spineZ], rotY: 0, locked: true,
    evidence: 'explicit', evidenceRefs: ['corridor-route', 'spine-hatch', 'spine-narrow-dim'],
    note: 'First leg of the storage spine, off the main corridor.',
  });
  add('spnLeg1Ceil', {
    room: 'spine', type: 'ceiling', name: 'Spine overhead', params: { width: leg1Len, depth: SPW, height: SPH },
    pos: [leg1x0 + leg1Len / 2, 0, spineZ], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: 'Low service overhead (assumption).',
  });
  add('spnLeg1N', {
    room: 'spine', type: 'wall', name: 'Spine wall', params: { length: leg1Len, height: SPH, thickness: 0.1 },
    pos: [leg1x0 + leg1Len / 2, 0, spineZ - SPW / 2], rotY: 0, locked: true,
    evidence: 'explicit', evidenceRefs: ['spine-narrow-dim'], note: 'Narrow and dim.',
  });
  add('spnLeg1S', {
    room: 'spine', type: 'wall', name: 'Spine wall', params: { length: leg1Len, height: SPH, thickness: 0.1 },
    pos: [leg1x0 + leg1Len / 2, 0, spineZ + SPW / 2], rotY: 0, locked: true,
    evidence: 'explicit', evidenceRefs: ['spine-narrow-dim'], note: 'Narrow and dim.',
  });
  add('spnLeg2Floor', {
    room: 'spine', type: 'floor', name: 'Storage spine deck (second turn)', params: { width: SPW, depth: leg2z1 - leg2z0 },
    pos: [leg2x, 0, (leg2z0 + leg2z1) / 2], rotY: 0, locked: true,
    evidence: 'explicit', evidenceRefs: ['spine-narrow-dim', 'pocket-inbetween'],
    note: 'The aft leg — pocket three opens off its starboard side.',
  });
  add('spnLeg2Ceil', {
    room: 'spine', type: 'ceiling', name: 'Spine overhead', params: { width: SPW, depth: leg2z1 - leg2z0, height: SPH },
    pos: [leg2x, 0, (leg2z0 + leg2z1) / 2], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: '',
  });
  add('spnLeg2N', {
    room: 'spine', type: 'wall', name: 'Spine wall (fwd)', params: { length: SPW, height: SPH, thickness: 0.1 },
    pos: [leg2x, 0, leg2z0], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: '',
  });
  add('spnLeg2S', {
    room: 'spine', type: 'doorway', name: 'Engine bay doorway',
    params: { length: SPW, height: SPH, thickness: 0.1, doorWidth: 0.72, doorHeight: 1.9, kind: 'hinged', hinge: 'left', swing: 'in', open: 0.35 },
    pos: [leg2x, 0, leg2z1], rotY: 0, locked: false,
    evidence: 'explicit', evidenceRefs: ['eng-walkin', 'eng-spat-heat', 'doors-wait'],
    note: 'The frame Quenby leans on, mug set on the deck plate within reach. The spine ends at the heat’s center. THERMAL BIND: while the manifold is open and the bay runs hot, this door’s frame sits in the thermal break — it physically binds until the seals cool. Nobody locks anyone in; the ship does it, every time. The crew knows to sit down.',
  });
  const spineInboardX = leg1x0 + leg1Len;
  const s4Half = 0.45;
  const spineInStart = spineZ + SPW / 2;
  const spineInA = (s4HatchZ - s4Half) - spineInStart;
  const spineInB = leg2z1 - (s4HatchZ + s4Half);
  if (spineInA > 0.05) add('spnLeg2W1', {
    room: 'spine', type: 'wall', name: 'Spine wall (inboard forward)',
    params: { length: spineInA, height: SPH, thickness: 0.1 },
    pos: [spineInboardX, 0, spineInStart + spineInA / 2], rotY: Math.PI / 2, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: 'Legacy wall broken by old storage access.',
  });
  add('s4Hatch', {
    room: 'storage-four', type: 'doorway', name: 'Storage Four hatch',
    params: { length: 0.9, height: SPH, thickness: 0.1, doorWidth: 0.66, doorHeight: 1.82, kind: 'hinged', hinge: 'right', swing: 'in', open: 0 },
    pos: [spineInboardX, 0, s4HatchZ], rotY: Math.PI / 2, locked: false,
    evidence: 'decision', evidenceRefs: [],
    note: 'Older manual storage hatch on the longer legacy route beyond Pocket Three and near the observation-dome geography.',
  });
  if (spineInB > 0.05) add('spnLeg2W2', {
    room: 'spine', type: 'wall', name: 'Spine wall (inboard aft)',
    params: { length: spineInB, height: SPH, thickness: 0.1 },
    pos: [spineInboardX, 0, s4HatchZ + s4Half + spineInB / 2], rotY: Math.PI / 2, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: 'Deep storage / machinery end of the spine.',
  });

  add('spnShoulderFloor', {
    room: 'spine', type: 'floor', name: 'Legacy service shoulder',
    params: { width: 0.62, depth: 1.45 },
    pos: [spineInboardX - 0.31, 0, spineZ + 3.05], rotY: 0, locked: true,
    evidence: 'decision', evidenceRefs: [],
    note: 'Localized widening in the old utility spine: enough to step around an open panel or let someone pass, not a destination room.',
  });
  add('spnShoulderPanel', {
    room: 'spine', type: 'storage', name: 'Legacy utility panel',
    params: { width: 0.72, height: 1.25, depth: 0.16 },
    pos: [spineInboardX - 0.56, 0, spineZ + 3.05], rotY: Math.PI / 2, locked: false,
    evidence: 'assumption', evidenceRefs: [],
    note: 'Old manual service access and refit archaeology make the spine change width rather than read as a uniform hallway.',
  });

  // pocket three hatch splits the outboard wall of the aft leg
  const pktWx = leg2x + SPW / 2;
  const segA = (pktHatchZ - 0.45) - leg2z0;
  const segB = leg2z1 - (pktHatchZ + 0.45);
  add('spnLeg2E1', {
    room: 'spine', type: 'wall', name: 'Spine wall (outboard fwd)', params: { length: segA, height: SPH, thickness: 0.1 },
    pos: [pktWx, 0, leg2z0 + segA / 2], rotY: Math.PI / 2, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: '',
  });
  // (outboard aft wall — split around the dome's low arch — is added below)
  add('pktHatch', {
    room: 'pocket', type: 'doorway', name: 'Pocket three hatch',
    params: { length: 0.9, height: SPH, thickness: 0.1, doorWidth: 0.62, doorHeight: 1.8, kind: 'hinged', hinge: 'left', swing: 'in', open: 0 },
    pos: [pktWx, 0, pktHatchZ], rotY: Math.PI / 2, locked: false,
    evidence: 'explicit',
    evidenceRefs: ['spine-hatch', 'pocket-grip', 'pocket-hatch-manual', 'pocket-seam-light'],
    note: 'Narrow manual hatch with a recessed grip — it sticks if pulled at the wrong angle, closes without a slam, and leaks lamplight at the seam. An amber occupancy indicator sits above it.',
  });
  // outboard aft wall in two segments around the dome's low arch
  const e2aLen = (domeZ - 0.45) - (pktHatchZ + 0.45);
  const e2bLen = leg2z1 - (domeZ + 0.45);
  add('spnLeg2E2', {
    room: 'spine', type: 'wall', name: 'Spine wall (outboard mid)', params: { length: e2aLen, height: SPH, thickness: 0.1 },
    pos: [pktWx, 0, (pktHatchZ + 0.45) + e2aLen / 2], rotY: Math.PI / 2, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: '',
  });
  add('spnLeg2E3', {
    room: 'spine', type: 'wall', name: 'Spine wall (outboard aft)', params: { length: e2bLen, height: SPH, thickness: 0.1 },
    pos: [pktWx, 0, leg2z1 - e2bLen / 2], rotY: Math.PI / 2, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: '',
  });

  // ---------- starboard pocket three ----------
  const PKW = 1.25, PKD = 1.6;           // depth (x) “too shallow for staging”, width (z)
  const pkx = pktWx + PKW / 2, pkz = pktHatchZ;
  add('pktFloor', {
    room: 'pocket', type: 'floor', name: 'Pocket three deck', params: { width: PKW, depth: PKD },
    pos: [pkx, 0, pkz], rotY: 0, locked: true,
    evidence: 'explicit',
    evidenceRefs: ['pocket-inbetween', 'pocket-crowded', 'pocket-choose-stand', 'pocket-nova-crate', 'pocket-threshold'],
    note: `Pocket three, ${PKW} × ${PKD} m — too shallow for equipment staging, too deep for a locker. Two people make it crowded; a third stays at the hatch line.`,
  });
  add('pktCeil', {
    room: 'pocket', type: 'ceiling', name: 'Pocket overhead', params: { width: PKW, depth: PKD, height: SPH },
    pos: [pkx, 0, pkz], rotY: 0, locked: true, evidence: 'assumption', evidenceRefs: [], note: '',
  });
  add('pktWallN', {
    room: 'pocket', type: 'wall', name: 'Pocket wall (fwd)', params: { length: PKW, height: SPH, thickness: 0.1 },
    pos: [pkx, 0, pkz - PKD / 2], rotY: 0, locked: true,
    evidence: 'explicit', evidenceRefs: ['pocket-hum'], note: 'The ship hums through this wall — structure sits directly behind it.',
  });
  add('pktWallS', {
    room: 'pocket', type: 'wall', name: 'Pocket wall (aft)', params: { length: PKW, height: SPH, thickness: 0.1 },
    pos: [pkx, 0, pkz + PKD / 2], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: '',
  });
  add('pktWallE', {
    room: 'pocket', type: 'wall', name: 'Pocket wall (outboard)', params: { length: PKD, height: SPH, thickness: 0.1 },
    pos: [pkx + PKW / 2, 0, pkz], rotY: Math.PI / 2, locked: true,
    evidence: 'explicit', evidenceRefs: ['pocket-hum'], note: 'Hull side.',
  });
  add('pktShelf', {
    room: 'pocket', type: 'shelf', name: 'Narrow shelf',
    params: { width: 0.9, depth: 0.22, mountHeight: 1.15, tins: 0 },
    pos: [pkx + PKW / 2 - 0.13, 0, pkz - 0.15], rotY: Math.PI / 2, locked: false,
    evidence: 'explicit', evidenceRefs: ['pocket-shelf'],
    note: 'The narrow shelf Quenby settles beside, cup in hand.',
  });
  add('pktBox', {
    room: 'pocket', type: 'crate', name: 'Low storage box',
    params: { width: 0.46, height: 0.34, depth: 0.36 },
    pos: [pkx - 0.3, 0, pkz + 0.6], rotY: 0.2, locked: false,
    evidence: 'explicit', evidenceRefs: ['pocket-box'],
    note: 'The low box Nova dragged near the crate — the only seat in storage. Iri sits down on it, not all at once, not easily.',
  });
  add('pktCrate', {
    room: 'pocket', type: 'crate', name: 'R. Vale’s crate',
    params: { width: 0.56, height: 0.5, depth: 0.44 },
    pos: [pkx + 0.32, 0, pkz + 0.52], rotY: 0, locked: false,
    evidence: 'explicit', evidenceRefs: ['pocket-slates', 'pocket-nova-crate'],
    note: 'The crate from starboard pocket three — stills, the throat-pickup case, pause-notation pages. Slates spread across the floor around it; a utility lamp angled away from the door.',
  });

  // ---------- Storage Four ----------
  const S4W = 1.55, S4D = 1.85;
  const s4x = spineInboardX - S4W / 2, s4z = s4HatchZ;
  add('s4Floor', {
    room: 'storage-four', type: 'floor', name: 'Storage Four deck',
    params: { width: S4W, depth: S4D },
    pos: [s4x, 0, s4z], rotY: 0, locked: true,
    evidence: 'decision', evidenceRefs: [],
    note: 'Established numbered storage room on the deeper legacy route. More ordinary and useful than Pocket Three, but still part of older ship fabric.',
  });
  add('s4Ceil', {
    room: 'storage-four', type: 'ceiling', name: 'Storage Four overhead',
    params: { width: S4W, depth: S4D, height: SPH },
    pos: [s4x, 0, s4z], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: '',
  });
  add('s4WallW', {
    room: 'storage-four', type: 'wall', name: 'Storage Four inboard wall',
    params: { length: S4D, height: SPH, thickness: 0.1 },
    pos: [s4x - S4W / 2, 0, s4z], rotY: Math.PI / 2, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: 'Older pressure / structural wall.',
  });
  for (const s of [-1, 1]) add(s < 0 ? 's4WallN' : 's4WallS', {
    room: 'storage-four', type: 'wall', name: 'Storage Four wall',
    params: { length: S4W, height: SPH, thickness: 0.1 },
    pos: [s4x, 0, s4z + s * S4D / 2], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: '',
  });
  add('s4Rack', {
    room: 'storage-four', type: 'storage', name: 'Storage Four rack',
    params: { width: 0.92, height: 1.55, depth: 0.38 },
    pos: [s4x - 0.45, 0, s4z - 0.2], rotY: Math.PI / 2, locked: false,
    evidence: 'assumption', evidenceRefs: [],
    note: 'Ordinary ship stores: bulky enough to justify a room, mundane enough not to become a mystery.',
  });

  // ---------- airlock chamber (starboard of the corridor) ----------
  const AKW = 1.4, AKD = 1.3;                       // chamber width (x) × depth (z)
  const akx = cx + COR.W / 2 + AKW / 2, akz = alkZ; // centered on the inner door
  add('alkFloor', {
    room: 'airlock', type: 'floor', name: 'Airlock deck', params: { width: AKW, depth: AKD },
    pos: [akx, 0, akz], rotY: 0, locked: true,
    evidence: 'explicit', evidenceRefs: ['alk-two-stage', 'alk-hatch-line', 'alk-cold-floor'],
    note: `Airlock chamber ${AKW} × ${AKD} m — bare cold metal, cramped for two suited people; pressure returns in stages.`,
  });
  add('alkCeil', {
    room: 'airlock', type: 'ceiling', name: 'Airlock overhead', params: { width: AKW, depth: AKD, height: COR.H },
    pos: [akx, 0, akz], rotY: 0, locked: true, evidence: 'assumption', evidenceRefs: [], note: '',
  });
  add('alkWallN', {
    room: 'airlock', type: 'wall', name: 'Airlock wall (fwd)', params: { length: AKW, height: COR.H, thickness: 0.12 },
    pos: [akx, 0, akz - AKD / 2], rotY: 0, locked: true, evidence: 'assumption', evidenceRefs: [], note: '',
  });
  add('alkWallS', {
    room: 'airlock', type: 'wall', name: 'Airlock wall (aft)', params: { length: AKW, height: COR.H, thickness: 0.12 },
    pos: [akx, 0, akz + AKD / 2], rotY: 0, locked: true, evidence: 'assumption', evidenceRefs: [], note: '',
  });
  add('alkOuterDoor', {
    room: 'airlock', type: 'doorway', name: 'Airlock outer hatch',
    params: { length: AKD, height: COR.H, thickness: 0.14, doorWidth: 0.75, doorHeight: 1.85, kind: 'sliding', slideDir: 1, open: 0 },
    pos: [akx + AKW / 2, 0, akz], rotY: Math.PI / 2, locked: false,
    evidence: 'explicit',
    evidenceRefs: ['alk-two-stage', 'alk-cycle', 'alk-tether'],
    note: 'The outer lock — opens to space. Tether anchor points inside; the seal closes before pressure returns in stages.',
  });
  add('alkLocker', {
    room: 'airlock', type: 'storage', name: 'Exterior kit locker',
    params: { width: 0.7, height: 1.5, depth: 0.3 },
    pos: [akx, 0, akz - AKD / 2 + 0.17], rotY: 0, locked: false,
    evidence: 'explicit', evidenceRefs: ['alk-kit-locker'],
    note: 'Tether clips, manual lock spanner, plate key, suit seals — tools where they belong.',
  });
  add('alkRail', {
    room: 'airlock', type: 'rail', name: 'Suit-up side rail',
    params: { length: 1.0, height: 0.95, midRail: false },
    pos: [akx, 0, akz + AKD / 2 - 0.1], rotY: 0, locked: false,
    evidence: 'explicit', evidenceRefs: ['alk-side-rail'],
    note: 'The side rail Iri leans on, glove cuffs half-clipped to her belt.',
  });

  // side-door configuration: the short east leg from the bridge to the aft run
  if (doorOnSideWall) {
    add('corLegFloor', {
      room: 'corridor', type: 'floor', name: 'Corridor deck (bridge leg)', params: { width: 1.2, depth: 1.1 },
      pos: [W / 2 + 0.6, 0, 0.9], rotY: 0, locked: true,
      evidence: 'decision', evidenceRefs: ['corridor-route'], note: 'Short leg from the side hatch, bending aft.',
    });
    add('corLegCeil', {
      room: 'corridor', type: 'ceiling', name: 'Corridor overhead (leg)', params: { width: 1.2, depth: 1.1, height: COR.H },
      pos: [W / 2 + 0.6, 0, 0.9], rotY: 0, locked: true, evidence: 'assumption', evidenceRefs: [], note: '',
    });
    add('corLegN', {
      room: 'corridor', type: 'wall', name: 'Corridor wall (leg fwd)', params: { length: 1.2, height: COR.H, thickness: 0.12 },
      pos: [W / 2 + 0.6, 0, 0.35], rotY: 0, locked: true, evidence: 'decision', evidenceRefs: ['corridor-route'], note: '',
    });
    add('corLegE', {
      room: 'corridor', type: 'wall', name: 'Corridor wall (east)', params: { length: corStartZ - 0.35, height: COR.H, thickness: 0.12 },
      pos: [cx + COR.W / 2, 0, (0.35 + corStartZ) / 2], rotY: Math.PI / 2, locked: true,
      evidence: 'decision', evidenceRefs: ['corridor-route'], note: '',
    });
    add('corLegS', {
      room: 'corridor', type: 'wall', name: 'Corridor wall (leg aft)', params: { length: cx - COR.W / 2 - W / 2, height: COR.H, thickness: 0.12 },
      pos: [(W / 2 + cx - COR.W / 2) / 2, 0, 1.45], rotY: 0, locked: true,
      evidence: 'decision', evidenceRefs: ['corridor-route'], note: '',
    });
  }

  // ================= GALLEY =================
  const galleyProvisional = false;
  const gSize = GALLEY_SIZES.lived;
  const [gw, gd] = gSize;
  const GH = 2.15;
  const gx = aftCx + 0.55 - gw / 2;         // starboard galley wall flush with the aft corridor wall
  const gz = corEndZ + gd / 2;
  const rel = (dx, dz) => [gx + dx, 0, gz + dz];

  const galleyShellNote = `${gw} × ${gd} m implementation assumption serving the locked occupancy target: five comfortable, seven crowded. Longitudinal proportions create a working half and a sitting / lingering half.`;
  add('galFloor', {
    room: 'galley', type: 'floor', name: 'Galley deck', params: { width: gw, depth: gd },
    pos: [gx, 0, gz], rotY: 0, locked: true,
    evidence: 'decision',
    evidenceRefs: ['galley-tiny', 'galley-island', 'galley-grates'],
    note: galleyShellNote + ' Deck plating with open grates; Iri’s sprout grows at the warm wall vent.',
  });
  add('galCeiling', {
    room: 'galley', type: 'ceiling', name: 'Galley overhead', params: { width: gw, depth: gd, height: GH },
    pos: [gx, 0, gz], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: 'Low overhead (assumption).',
  });
  // north wall: hatch aligned with the corridor + port-side filler
  const hatchSegLen = 1.1;
  const fillerLen = gw - hatchSegLen;
  add('galHatch', {
    room: 'galley', type: 'doorway', name: 'Galley hatch',
    params: { length: hatchSegLen, height: GH, thickness: 0.14, doorWidth: 0.8, doorHeight: 1.9, kind: 'sliding', slideDir: 1, open: 0 },
    pos: [aftCx, 0, corEndZ], rotY: 0, locked: false,
    evidence: 'explicit', evidenceRefs: ['galley-hatch-quiet', 'galley-hatch-sticks', 'doors-wait'],
    note: 'Quiet sliding hatch that sticks and doesn’t hurry. Manual, like every door on the ship.',
  });
  if (fillerLen > 0.05) add('galWallN', {
    room: 'galley', type: 'wall', name: 'Galley wall (fwd)', params: { length: fillerLen, height: GH, thickness: 0.14 },
    pos: [gx - gw / 2 + fillerLen / 2, 0, corEndZ], rotY: 0, locked: true,
    evidence: 'inference', evidenceRefs: ['galley-tiny'], note: 'Forward galley wall.',
  });
  add('galWallS', {
    room: 'galley', type: 'wall', name: 'Galley wall (aft)', params: { length: gw, height: GH, thickness: 0.14 },
    pos: [gx, 0, gz + gd / 2], rotY: 0, locked: true,
    evidence: 'inference', evidenceRefs: ['galley-tiny', 'galley-bench-wall'],
    note: 'Aft galley wall — the bench stands against it.',
  });
  add('galWallW', {
    room: 'galley', type: 'wall', name: 'Galley wall (port)', params: { length: gd, height: GH, thickness: 0.14 },
    pos: [gx - gw / 2, 0, gz], rotY: Math.PI / 2, locked: true,
    evidence: 'inference', evidenceRefs: ['galley-tiny'], note: 'Port galley wall — the counter and tin shelf run along it.',
  });
  add('galWallE', {
    room: 'galley', type: 'wall', name: 'Galley wall (starboard)', params: { length: gd, height: GH, thickness: 0.14 },
    pos: [gx + gw / 2, 0, gz], rotY: Math.PI / 2, locked: true,
    evidence: 'inference', evidenceRefs: ['galley-tiny'], note: 'Starboard galley wall.',
  });

  // Galley furniture: a longitudinal work half near the hatch and an aft
  // eating / lingering half. The room can seat / hold five comfortably while
  // seven makes circulation visibly crowded.
  add('galCounter', {
    room: 'galley', type: 'counter', name: 'Galley counter run + sink',
    params: { width: 2.75, depth: 0.58, height: 0.9, sink: true },
    pos: rel(-gw / 2 + 0.36, -0.35), rotY: -Math.PI / 2, locked: false,
    evidence: 'explicit',
    evidenceRefs: ['galley-sink-light', 'galley-index-card', 'galley-counter-lean', 'galley-drawer-cabinet', 'galley-island'],
    note: 'One long integrated counter run — sink, status light, taped index card, spoon drawer, under-sink cabinet, and the central prep stretch with the water generator at its working heart (author ruling: prep is part of the counter, not a separate island).',
  });
  add('galShelf', {
    room: 'galley', type: 'shelf', name: 'Tin shelf',
    params: { width: 1.1, depth: 0.24, mountHeight: 1.32, tins: 3 },
    pos: rel(-gw / 2 + 0.15, -0.15), rotY: -Math.PI / 2, locked: false,
    evidence: 'explicit', evidenceRefs: ['galley-tins-shelf'],
    note: 'Battered tins in their row: Regret, Dead Reckoning, Victory Speech — later, Sugar.',
  });
  add('galHeatUnit', {
    room: 'galley', type: 'storage', name: 'Heating / hydration unit',
    params: { width: 0.72, height: 1.45, depth: 0.42 },
    pos: rel(gw / 2 - 0.24, -1.15), rotY: Math.PI / 2, locked: false,
    evidence: 'assumption', evidenceRefs: [],
    note: 'Food heating / hydration / synthesis hardware grouped into the working half. Exact technology remains open.',
  });
  add('galCooler', {
    room: 'galley', type: 'crate', name: 'Cooling unit',
    params: { width: 0.58, height: 0.62, depth: 0.5 },
    pos: rel(gw / 2 - 0.34, gd / 2 - 0.50), rotY: 0, locked: false,
    evidence: 'explicit', evidenceRefs: ['galley-across'],
    note: 'Floor-level cooling unit across the room from the working counter.',
  });
  add('galTable', {
    room: 'galley', type: 'table', name: 'Galley table',
    params: { width: 1.25, depth: 0.78, height: 0.74 },
    pos: rel(0.15, gd / 2 - 1.15), rotY: 0, locked: false,
    evidence: 'explicit', evidenceRefs: ['galley-table', 'galley-tabletop-nova'],
    note: 'The everyday table: stitching, slates, meals, waiting, and arguments that are not called arguments.',
  });
  add('galBench', {
    room: 'galley', type: 'bench', name: 'Galley bench',
    params: { width: 1.85, height: 0.42, depth: 0.44 },
    pos: rel(-0.15, gd / 2 - 0.28), rotY: 0, locked: false,
    evidence: 'explicit', evidenceRefs: ['galley-bench', 'galley-bench-wall'],
    note: 'Leather-covered bench against the aft wall. Long enough to seat several, still too narrow to be a good bed.',
  });
  add('galStool1', {
    room: 'galley', type: 'seat', name: 'Galley stool one',
    params: { seatHeight: 0.46, width: 0.38, hasArms: false },
    pos: rel(gw / 2 - 0.55, gd / 2 - 1.38), rotY: Math.PI / 2, locked: false,
    evidence: 'assumption', evidenceRefs: [], note: 'Compact movable seating; exact final chair / stool count remains open.',
  });
  add('galStool2', {
    room: 'galley', type: 'seat', name: 'Galley stool two',
    params: { seatHeight: 0.46, width: 0.38, hasArms: false },
    pos: rel(0.7, gd / 2 - 2.02), rotY: 0, locked: false,
    evidence: 'assumption', evidenceRefs: [], note: 'Second movable seat. Can be pulled clear when the galley is being used as a workroom.',
  });
  add('galCabinet', {
    room: 'galley', type: 'storage', name: 'Galley cabinet',
    params: { width: 0.82, height: 1.6, depth: 0.36 },
    pos: rel(gw / 2 - 0.23, -0.05), rotY: -Math.PI / 2, locked: false,
    evidence: 'explicit', evidenceRefs: ['galley-drawer-cabinet', 'bolts-source'],
    note: 'The cabinet where bolts live in a mug that should have held tea.',
  });
  add('galFan', {
    room: 'galley', type: 'crate', name: 'Corner fan',
    params: { width: 0.24, height: 0.3, depth: 0.24 },
    pos: rel(-gw / 2 + 0.25, -gd / 2 + 0.28), rotY: 0.4, locked: false,
    evidence: 'explicit', evidenceRefs: ['galley-fan'],
    note: 'The fan in the corner ticks once, then goes patient.',
  });
  add('galPlants', {
    room: 'galley', type: 'crate', name: 'Potted plants',
    params: { width: 0.45, height: 0.34, depth: 0.4 },
    pos: rel(-gw / 2 + 0.38, gd / 2 - 0.35), rotY: 0.15, locked: false,
    evidence: 'explicit', evidenceRefs: ['galley-plants'],
    note: 'Later plants from the garden, soil still damp, occupying one corner without becoming the room’s purpose.',
  });

  // ================= DOMESTIC HYGIENE / WET-SERVICE ZONE =================
  // Hygiene is adjacent to the galley in infrastructure but not in ordinary
  // experience. It has its own dry access route, and the ladder from the
  // residential dogleg arrives in that dry zone rather than a shower or galley.
  const HYGX = cx - 6.00;
  const HYGZ0 = hygBranchZ, HYGSTART = 10.65, HYGZ1 = 14.25;
  const HYGW = 1.10;
  const hygBranchW = (aftCx - COR.W / 2) - HYGX + HYGW / 2;

  add('hygBranchFloor', {
    room: 'hygiene', type: 'floor', name: 'Dry hygiene access deck',
    params: { width: hygBranchW, depth: 0.8 },
    pos: [(aftCx - COR.W / 2 + (HYGX - HYGW / 2)) / 2, 0, HYGZ0], rotY: 0, locked: true,
    evidence: 'decision', evidenceRefs: [],
    note: 'A dry offset route leaving the domestic junction separately from the galley. No toilet or shower is visible from the galley hatch.',
  });
  add('hygBranchCeil', {
    room: 'hygiene', type: 'ceiling', name: 'Dry hygiene access overhead',
    params: { width: hygBranchW, depth: 0.8, height: 2.10 },
    pos: [(aftCx - COR.W / 2 + (HYGX - HYGW / 2)) / 2, 0, HYGZ0], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: '',
  });
  add('domServiceFloor', {
    room: 'domestic-service', type: 'floor', name: 'Domestic service passage deck',
    params: { width: HYGW, depth: HYGSTART - HYGZ0 },
    pos: [HYGX, 0, (HYGZ0 + HYGSTART) / 2], rotY: 0, locked: true,
    evidence: 'decision', evidenceRefs: [],
    note: 'Dry service passage running beside the galley wet zone. It carries ordinary maintenance access rather than reading as part of the bathroom.',
  });
  add('domServiceCeil', {
    room: 'domestic-service', type: 'ceiling', name: 'Domestic service passage overhead',
    params: { width: HYGW, depth: HYGSTART - HYGZ0, height: 2.10 },
    pos: [HYGX, 0, (HYGZ0 + HYGSTART) / 2], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: '',
  });
  add('hygVestFloor', {
    room: 'hygiene', type: 'floor', name: 'Dry hygiene / ladder vestibule deck',
    params: { width: HYGW, depth: HYGZ1 - HYGSTART },
    pos: [HYGX, 0, (HYGSTART + HYGZ1) / 2], rotY: 0, locked: true,
    evidence: 'decision', evidenceRefs: [],
    note: 'The actual hygiene vestibule begins aft of the galley-service passage and contains the toilet / shower doors and secondary-ladder landing.',
  });
  add('hygVestCeil', {
    room: 'hygiene', type: 'ceiling', name: 'Dry hygiene / ladder vestibule overhead',
    params: { width: HYGW, depth: HYGZ1 - HYGSTART, height: 2.10 },
    pos: [HYGX, 0, (HYGSTART + HYGZ1) / 2], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: '',
  });

  // Enclose the transverse dry branch while leaving its east end open to the
  // main corridor and west end open into the long service vestibule.
  const hygBranchEast = aftCx - COR.W / 2;
  const hygBranchWest = HYGX - HYGW / 2;
  add('hygBranchWallN', {
    room: 'hygiene', type: 'wall', name: 'Dry hygiene branch forward wall',
    params: { length: hygBranchEast - hygBranchWest, height: 2.10, thickness: 0.10 },
    pos: [(hygBranchEast + hygBranchWest) / 2, 0, HYGZ0 - 0.40], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: 'Dry separation from medbay / adjacent service volume.',
  });
  add('hygBranchWallS', {
    room: 'hygiene', type: 'wall', name: 'Dry hygiene branch aft wall',
    params: { length: hygBranchEast - hygBranchWest, height: 2.10, thickness: 0.10 },
    pos: [(hygBranchEast + hygBranchWest) / 2, 0, HYGZ0 + 0.40], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: 'The galley is beyond this wall / junction rather than visible through the hygiene route.',
  });
  add('hygVestWallW', {
    room: 'hygiene', type: 'wall', name: 'Domestic service / hygiene outer wall',
    params: { length: HYGZ1 - HYGZ0, height: 2.10, thickness: 0.10 },
    pos: [HYGX - HYGW / 2, 0, (HYGZ0 + HYGZ1) / 2], rotY: Math.PI / 2, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: '',
  });
  // East wall is segmented around toilet and shower doors.
  const hygDoorHalf = 0.50;
  const toiletZ = 11.30, showerZ = 13.00;
  const vestSegs = [
    ['hygVestWallE1', HYGZ0 + 0.50, toiletZ - hygDoorHalf],
    ['hygVestWallE2', toiletZ + hygDoorHalf, showerZ - hygDoorHalf],
    ['hygVestWallE3', showerZ + hygDoorHalf, HYGZ1],
  ];
  for (const [key, a, b] of vestSegs) {
    if (b - a < 0.05) continue;
    add(key, {
      room: 'hygiene', type: 'wall', name: 'Dry hygiene vestibule service wall',
      params: { length: b - a, height: 2.10, thickness: 0.10 },
      pos: [HYGX + HYGW / 2, 0, (a + b) / 2], rotY: Math.PI / 2, locked: true,
      evidence: 'assumption', evidenceRefs: [],
      note: 'Shared domestic wet-service side; access panels and compartment doors break the wall.',
    });
  }
  add('hygVestEnd', {
    room: 'hygiene', type: 'wall', name: 'Dry hygiene vestibule aft wall',
    params: { length: HYGW, height: 2.10, thickness: 0.10 },
    pos: [HYGX, 0, HYGZ1], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: 'The ladder hatch / landing is just forward of this end wall.',
  });

  // Wet/service core lies between galley and hygiene compartments.
  const galleyPortX = gx - gw / 2;
  const WETW = 0.24, WETX = galleyPortX - WETW / 2, WETZ = 11.45, WETD = 4.55;
  add('mainWetCore', {
    room: 'wet-service', type: 'storage', name: 'Main-deck domestic wet-service core',
    params: { width: WETW, height: 1.8, depth: WETD },
    pos: [WETX, 0, WETZ], rotY: 0, locked: false,
    evidence: 'decision', evidenceRefs: [],
    note: 'Service volume carrying domestic water, drainage, thermal loops, pumps, valves, filters, and environmental distribution between galley and hygiene spaces.',
  });
  add('mainWetPanel', {
    room: 'wet-service', type: 'storage', name: 'Domestic service manifold',
    params: { width: 0.82, height: 1.35, depth: 0.18 },
    pos: [HYGX + HYGW / 2 - 0.08, 0, 9.65], rotY: Math.PI / 2, locked: false,
    evidence: 'decision', evidenceRefs: [],
    note: 'Routine-access panel in lived-in circulation: filters, isolation valves, thermal trim, and service diagnostics.',
  });

  const HW = 1.20, HD = 1.55, hx = HYGX + HYGW / 2 + HW / 2;
  add('hygToiletFloor', {
    room: 'hygiene', type: 'floor', name: 'Primary toilet deck',
    params: { width: HW, depth: HD },
    pos: [hx, 0, 11.30], rotY: 0, locked: true,
    evidence: 'decision', evidenceRefs: [], note: 'Primary domestic toilet, separate from shower / wash compartment.',
  });
  add('hygToiletDoor', {
    room: 'hygiene', type: 'doorway', name: 'Primary toilet door',
    params: { length: 1.0, height: 2.05, thickness: 0.1, doorWidth: 0.72, doorHeight: 1.9, kind: 'sliding', slideDir: 1, open: 0 },
    pos: [HYGX + HYGW / 2, 0, 11.30], rotY: Math.PI / 2, locked: false,
    evidence: 'decision', evidenceRefs: [], note: 'Opens from the dry vestibule, never directly from the galley.',
  });

  add('hygToiletDoorWallN', {
    room: 'hygiene', type: 'wall', name: 'Primary toilet doorway wall (forward)',
    params: { length: HD / 2 - 0.5, height: 2.05, thickness: 0.10 },
    pos: [HYGX + HYGW / 2, 0, 11.30 - (0.5 + (HD / 2 - 0.5) / 2)], rotY: Math.PI / 2, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: '',
  });
  add('hygToiletDoorWallS', {
    room: 'hygiene', type: 'wall', name: 'Primary toilet doorway wall (aft)',
    params: { length: HD / 2 - 0.5, height: 2.05, thickness: 0.10 },
    pos: [HYGX + HYGW / 2, 0, 11.30 + (0.5 + (HD / 2 - 0.5) / 2)], rotY: Math.PI / 2, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: '',
  });
  add('hygToiletOuter', {
    room: 'hygiene', type: 'wall', name: 'Primary toilet outer wall',
    params: { length: HD, height: 2.05, thickness: 0.1 },
    pos: [hx + HW / 2, 0, 11.30], rotY: Math.PI / 2, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: '',
  });
  for (const s of [-1,1]) add(s < 0 ? 'hygToiletN' : 'hygToiletS', {
    room: 'hygiene', type: 'wall', name: 'Primary toilet wall',
    params: { length: HW, height: 2.05, thickness: 0.1 },
    pos: [hx, 0, 11.30 + s * HD / 2], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: '',
  });

  const SHW = 1.10, SHD = 1.75, shx = HYGX + HYGW / 2 + SHW / 2;
  add('hygShowerFloor', {
    room: 'hygiene', type: 'floor', name: 'Shower / wash compartment deck',
    params: { width: SHW, depth: SHD },
    pos: [shx, 0, 13.00], rotY: 0, locked: true,
    evidence: 'decision', evidenceRefs: [], note: 'Separate bathing / wash compartment with its own drainage and ventilation.',
  });
  add('hygShowerDoor', {
    room: 'hygiene', type: 'doorway', name: 'Shower / wash door',
    params: { length: 1.0, height: 2.08, thickness: 0.1, doorWidth: 0.74, doorHeight: 1.92, kind: 'sliding', slideDir: -1, open: 0 },
    pos: [HYGX + HYGW / 2, 0, 13.00], rotY: Math.PI / 2, locked: false,
    evidence: 'decision', evidenceRefs: [], note: 'Separate from the toilet and screened from ordinary domestic circulation.',
  });

  add('hygShowerDoorWallN', {
    room: 'hygiene', type: 'wall', name: 'Shower doorway wall (forward)',
    params: { length: SHD / 2 - 0.5, height: 2.08, thickness: 0.10 },
    pos: [HYGX + HYGW / 2, 0, 13.00 - (0.5 + (SHD / 2 - 0.5) / 2)], rotY: Math.PI / 2, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: '',
  });
  add('hygShowerDoorWallS', {
    room: 'hygiene', type: 'wall', name: 'Shower doorway wall (aft)',
    params: { length: SHD / 2 - 0.5, height: 2.08, thickness: 0.10 },
    pos: [HYGX + HYGW / 2, 0, 13.00 + (0.5 + (SHD / 2 - 0.5) / 2)], rotY: Math.PI / 2, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: '',
  });
  add('hygShowerOuter', {
    room: 'hygiene', type: 'wall', name: 'Shower / wash outer wall',
    params: { length: SHD, height: 2.08, thickness: 0.1 },
    pos: [shx + SHW / 2, 0, 13.00], rotY: Math.PI / 2, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: '',
  });
  for (const s of [-1,1]) add(s < 0 ? 'hygShowerN' : 'hygShowerS', {
    room: 'hygiene', type: 'wall', name: 'Shower / wash wall',
    params: { length: SHW, height: 2.08, thickness: 0.1 },
    pos: [shx, 0, 13.00 + s * SHD / 2], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: '',
  });

  // Upper landing for the single ladder generated from the lower wet-service
  // core. Do not duplicate the stair geometry here.
  add('hygLadderHatch', {
    room: 'hygiene', type: 'crate', name: 'Secondary ladder upper hatch',
    params: { width: 0.78, height: 0.035, depth: 0.78 },
    pos: [HYGX, 0, 13.70], rotY: 0, locked: false,
    evidence: 'decision', evidenceRefs: [],
    note: 'Upper hatch / landing of the steep secondary ladder. It opens into the dry hygiene / service vestibule, not into the galley, toilet, or shower.',
  });
  add('hygWash', {
    room: 'hygiene', type: 'counter', name: 'Vestibule wash / utility sink',
    params: { width: 0.72, depth: 0.38, height: 0.86, sink: true },
    pos: [HYGX - 0.28, 0, 11.05], rotY: -Math.PI / 2, locked: false,
    evidence: 'assumption', evidenceRefs: [], note: 'Dry-zone handwash / utility point outside the shower and toilet rooms.',
  });

  // ================= OBSERVATION DOME =================
  // Off the spine's outboard wall — "not listed on primary pathing".
  const DR = 1.25;
  const dcx = pktWx + DR + 0.11, dcz = domeZ;
  // The deck reaches back to overlap the spine floor at the arch, so the
  // walking surface is one continuous union with no hairline seam (a seam
  // exactly on a nav-grid column would cut the dome off under some rulings).
  add('domeFloor', {
    room: 'dome', type: 'floor', name: 'Dome deck', params: { width: DR * 2 + 0.4, depth: DR * 2 + 0.2 },
    pos: [dcx - 0.09, 0, dcz], rotY: 0, locked: true,
    evidence: 'explicit', evidenceRefs: ['dome-hidden', 'dome-curve', 'dome-rim-dust', 'dome-warm-plating'],
    note: 'The dome deck — its plating keeps a little warmth from the outer heat-sink loop; dust gathers at the rim.',
  });
  add('domeShell', {
    room: 'dome', type: 'domeShell', name: 'Observation dome',
    params: { radius: DR, wallHeight: 1.0, glassHeight: 0.95, archWidth: 0.85, archHeight: 1.78, ledgeHeight: 0.4 },
    pos: [dcx, 0, dcz], rotY: -Math.PI / 2, locked: true,
    evidence: 'explicit',
    evidenceRefs: ['dome-hidden', 'dome-arch', 'dome-ledge', 'dome-curve', 'dome-autodim', 'dome-rim-dust'],
    note: 'Round observation dome with real glass and its own starfield view. The entry arch dips to 1.78 m — low enough to scrape anyone who walks too proud. Interior lighting auto-dims to keep the stars sharp.',
  });


  add('domeShutterHousing', {
    room: 'dome', type: 'storage', name: 'Observation viewport shutter housing',
    params: { width: 0.34, height: 1.35, depth: 0.86 },
    pos: [dcx + DR + 0.08, 0, dcz], rotY: Math.PI / 2, locked: true,
    evidence: 'decision', evidenceRefs: [],
    note: 'Structural housing for the cupola’s protective cover / shutter. Exact deployment mechanism remains open.',
  });

  // ================= ENGINE BAY =================
  const engRuling = 'bay-plus-crawl';   // author ruling — see the canon block at the top of defs()
  const engProvisional = false;
  const EBW = 2.7, EBD = 2.4;
  const EBH = engRuling === 'low-bay' ? 1.85 : 2.15;
  const ebx = leg2x, ebz = leg2z1 + EBD / 2;
  const erel = (dx, dz) => [ebx + dx, 0, ebz + dz];
  add('engFloor', {
    room: 'engine', type: 'floor', name: 'Engine bay deck', params: { width: EBW, depth: EBD },
    pos: [ebx, 0, ebz], rotY: 0, locked: true,
    evidence: engProvisional ? 'assumption' : 'decision',
    evidenceRefs: ['eng-walkin', 'eng-two-steps', 'eng-tap', 'eng-spat-heat', 'eng-belowdeck'],
    note: (engProvisional ? '⚠ Provisional — the engineering-location conflict (walk-in bay vs. belowdeck crawl) is unresolved. ' : '') +
      `Engine bay ${EBW} × ${EBD} m at the aft end of the spine — two steps cross it; the void forward of it, behind the galley, is the tank space Quenby once slept behind.`,
  });
  add('engCeil', {
    room: 'engine', type: 'ceiling', name: 'Engine bay overhead', params: { width: EBW, depth: EBD, height: EBH },
    pos: [ebx, 0, ebz], rotY: 0, locked: true,
    evidence: engRuling === 'low-bay' ? 'decision' : (engProvisional ? 'assumption' : 'decision'),
    evidenceRefs: ['eng-walkin', 'eng-belowdeck'],
    note: engRuling === 'low-bay'
      ? 'Your ruling: low overhead (1.85 m) — the bay keeps the belowdeck crouch; adults stoop.'
      : 'Stand-up overhead.',
  });
  if (engRuling === 'bay-plus-crawl') {
    add('engFloorHatch', {
      room: 'engine', type: 'crate', name: 'Deck access hatch',
      params: { width: 0.7, height: 0.03, depth: 0.7 },
      pos: erel(-0.75, -0.55), rotY: 0, locked: false,
      evidence: 'decision', evidenceRefs: ['eng-belowdeck', 'eng-galley-above'],
      note: 'Author ruling: the walk-in bay AND the belowdeck are both true. The ladder down to the underdeck crawl runs beneath this hatch — rungs that ring, then dull; oil and dust — joining the crawl-height service layer above the lower deck (the work spine’s underdeck engineering access reaches the same fabric from below). Presence leans on the doorframe; Next climbs down through here.',
    });
  }
  const engWallSeg = (EBW - SPW) / 2;
  for (const s of [-1, 1]) {
    add(s < 0 ? 'engWallNW' : 'engWallNE', {
      room: 'engine', type: 'wall', name: 'Engine bay wall (fwd)', params: { length: engWallSeg, height: EBH, thickness: 0.12 },
      pos: [ebx + s * (SPW / 2 + engWallSeg / 2), 0, leg2z1], rotY: 0, locked: true,
      evidence: 'assumption', evidenceRefs: [], note: '',
    });
  }
  add('engWallS', {
    room: 'engine', type: 'wall', name: 'Engine bay wall (aft)', params: { length: EBW, height: EBH, thickness: 0.12 },
    pos: [ebx, 0, ebz + EBD / 2], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: 'The drive lives beyond — "a complaining purr."',
  });
  if (iriRuling === 'aft-room') {
    // door through to Iri's quarters (her ruling puts them past the galley,
    // in the tank void between the galley's starboard wall and the engine bay)
    const iqDoorZ = ebz - 0.25;
    const wSegA = (iqDoorZ - 0.45) - (ebz - EBD / 2);
    const wSegB = (ebz + EBD / 2) - (iqDoorZ + 0.45);
    add('engWallW1', {
      room: 'engine', type: 'wall', name: 'Engine bay wall (port fwd)', params: { length: wSegA, height: EBH, thickness: 0.12 },
      pos: [ebx - EBW / 2, 0, ebz - EBD / 2 + wSegA / 2], rotY: Math.PI / 2, locked: true,
      evidence: 'assumption', evidenceRefs: ['eng-behind-tanks'], note: 'The galley tanks stand beyond this wall.',
    });
    add('engWallWDoor', {
      room: 'quarters', type: 'doorway', name: 'Iri’s quarters door',
      params: { length: 0.9, height: EBH, thickness: 0.12, doorWidth: 0.72, doorHeight: 1.9, kind: 'sliding', slideDir: 1, open: 0.45 },
      pos: [ebx - EBW / 2, 0, iqDoorZ], rotY: Math.PI / 2, locked: false,
      evidence: 'decision', evidenceRefs: ['iri-quarters-route', 'iri-cabin-lower'],
      note: 'Your ruling: her quarters past the galley. The door holds at half-angle. Half-invite.',
    });
    add('engWallW2', {
      room: 'engine', type: 'wall', name: 'Engine bay wall (port aft)', params: { length: wSegB, height: EBH, thickness: 0.12 },
      pos: [ebx - EBW / 2, 0, ebz + EBD / 2 - wSegB / 2], rotY: Math.PI / 2, locked: true,
      evidence: 'assumption', evidenceRefs: [], note: '',
    });
    // the room itself: flush between the galley's starboard wall and the
    // engine bay's port wall, south of Storage Four
    const iqW = 1.5, iqD = 2.0;
    const iqx = ebx - EBW / 2 - iqW / 2, iqz = ebz + 0.2;
    add('iriQFloor', {
      room: 'quarters', type: 'floor', name: 'Iri’s quarters deck', params: { width: iqW, depth: iqD },
      pos: [iqx, 0, iqz], rotY: 0, locked: true,
      evidence: 'decision', evidenceRefs: ['iri-quarters-route', 'eng-behind-tanks'],
      note: 'Your ruling: her quarters sit past the galley, tucked against the tank space, entered through the engine bay.',
    });
    add('iriQCeil', {
      room: 'quarters', type: 'ceiling', name: 'Iri’s quarters overhead', params: { width: iqW, depth: iqD, height: 2.05 },
      pos: [iqx, 0, iqz], rotY: 0, locked: true, evidence: 'assumption', evidenceRefs: [], note: '',
    });
    add('iriQWallN', {
      room: 'quarters', type: 'wall', name: 'Iri’s quarters wall', params: { length: iqW, height: 2.05, thickness: 0.1 },
      pos: [iqx, 0, iqz - iqD / 2], rotY: 0, locked: true, evidence: 'assumption', evidenceRefs: [], note: '',
    });
    add('iriQWallS', {
      room: 'quarters', type: 'wall', name: 'Iri’s quarters wall', params: { length: iqW, height: 2.05, thickness: 0.1 },
      pos: [iqx, 0, iqz + iqD / 2], rotY: 0, locked: true, evidence: 'assumption', evidenceRefs: [], note: '',
    });
    add('iriQWallW', {
      room: 'quarters', type: 'wall', name: 'Iri’s quarters wall (tanks)', params: { length: iqD, height: 2.05, thickness: 0.1 },
      pos: [iqx - iqW / 2, 0, iqz], rotY: Math.PI / 2, locked: true,
      evidence: 'assumption', evidenceRefs: ['eng-behind-tanks'], note: 'The galley tanks stand beyond.',
    });
    add('iriQBunk', {
      room: 'quarters', type: 'bench', name: 'Iri’s bunk',
      params: { width: 0.65, height: 0.4, depth: 1.35 },
      pos: [iqx - iqW / 2 + 0.38, 0, iqz - 0.2], rotY: 0, locked: false,
      evidence: 'decision', evidenceRefs: ['iri-quarters-route'], note: 'The cabin she keeps and rarely sleeps in.',
    });
    add('iriQTable', {
      room: 'quarters', type: 'table', name: 'Iri’s worktable',
      params: { width: 0.7, depth: 0.45, height: 0.78 },
      pos: [iqx + 0.35, 0, iqz + iqD / 2 - 0.28], rotY: Math.PI, locked: false,
      evidence: 'decision', evidenceRefs: ['iri-worktable'], note: 'Where she lays the found pieces out with both hands.',
    });
    add('iriQHatch', {
      room: 'quarters', type: 'shelf', name: 'Sealed storage hatch',
      params: { width: 0.7, depth: 0.26, mountHeight: 1.2, tins: 0 },
      pos: [iqx - iqW / 2 + 0.14, 0, iqz - 0.2], rotY: Math.PI / 2, locked: false,
      evidence: 'decision', evidenceRefs: ['iri-storage-hatch'],
      note: 'A wall hatch above the bunk — soft-wrapped, layered, sealed.',
    });
  } else {
    add('engWallW', {
      room: 'engine', type: 'wall', name: 'Engine bay wall (port)', params: { length: EBD, height: EBH, thickness: 0.12 },
      pos: [ebx - EBW / 2, 0, ebz], rotY: Math.PI / 2, locked: true,
      evidence: 'assumption', evidenceRefs: ['eng-behind-tanks'], note: 'The galley tanks stand beyond this wall.',
    });
  }
  add('engWallE', {
    room: 'engine', type: 'wall', name: 'Engine bay wall (starboard)', params: { length: EBD, height: EBH, thickness: 0.12 },
    pos: [ebx + EBW / 2, 0, ebz], rotY: Math.PI / 2, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: '',
  });
  add('engBench', {
    room: 'engine', type: 'counter', name: 'Workbench + tap',
    params: { width: 1.6, depth: 0.55, height: 0.92, sink: true },
    pos: erel(-0.25, EBD / 2 - 0.32), rotY: Math.PI, locked: false,
    evidence: 'explicit',
    evidenceRefs: ['eng-bench-cross', 'eng-toolbox', 'eng-tap', 'eng-glove-spot'],
    note: 'The workbench with the tap she runs over her wrists, and the empty spot where gloves would’ve lived. Clearances tight enough that a passing hip brushes it.',
  });
  add('engToolbox', {
    room: 'engine', type: 'crate', name: 'Dented toolbox + cracked datapad',
    params: { width: 0.42, height: 0.24, depth: 0.28, secured: 'mag-pad' },
    // rides the bench top, not the deck (y = bench height)
    pos: [erel(0.2, EBD / 2 - 0.3)[0], 0.92, erel(0.2, EBD / 2 - 0.3)[2]], rotY: 0.12, locked: false,
    evidence: 'explicit', evidenceRefs: ['eng-toolbox'],
    note: 'The dented toolbox, datapad on top, crack thin as a scar — it has lived on this bench since they found it in the dead pocket aft. A wear-polished mag-pad under it holds it through burns; the datapad rides on top, unsecured, which may be how the crack happened. Her knuckle nudges the pad on the way past. (Promoted to a real object by the scene-review workbench, which noticed the prose kept reaching for things the model did not hold — and the rig-for-burn test immediately demanded to know what keeps it on the bench.)',
  });
  add('engManifold', {
    room: 'engine', type: 'storage', name: 'Cooling manifold (open)',
    params: { width: 1.2, height: 1.5, depth: 0.3 },
    pos: erel(EBW / 2 - 0.22, -0.1), rotY: -Math.PI / 2, locked: false,
    evidence: 'inference', evidenceRefs: ['eng-spat-heat', 'eng-bench-cross'],
    note: 'The bay’s own manifold run, serviced at the bench. The Presence-01 waist-deep scene lives at the corridor elbow’s coolant riser (author ruling) — the cooling system is distributed, and its most dramatic access point is in the hallway.',
  });
  add('engPanels', {
    room: 'engine', type: 'crate', name: 'Stripped paneling, stacked',
    params: { width: 0.5, height: 0.4, depth: 0.45 },
    pos: erel(0.55, 0.15), rotY: 0.25, locked: false,
    evidence: 'explicit', evidenceRefs: ['eng-manifold'],
    note: 'Stacked by her knee.',
  });

  // ================= MEDBAY =================
  // Port side of the main corridor, "deeper in the ship" than the bridge,
  // its hatch just forward of the galley junction.
  // Bed count is author-ruled: one real bed plus one cot. The prose's "the
  // cot" is the lower, real recovery bed; the second "recessed wall bed" of
  // Next-01 survives as a lighter fold-down cot above it.
  const MW = 2.6, MD = 2.0, MH = 2.1;
  const mE = aftCx - COR.W / 2;          // shared wall with the offset aft corridor
  const mx = mE - MW / 2, mz = medHatchZ;
  const mrel = (dx, dz) => [mx + dx, 0, mz + dz];

  add('medFloor', {
    room: 'medbay', type: 'floor', name: 'Medbay deck', params: { width: MW, depth: MD },
    pos: [mx, 0, mz], rotY: 0, locked: true,
    evidence: 'explicit', evidenceRefs: ['med-two-beds', 'med-reach', 'med-corridor'],
    note: `Medbay ${MW} × ${MD} m — compact enough that supplies are within blind arm’s reach one step inside the door. In procedure mode the bed deploys off the wall on its rails and the room converts: chair on its wall hook, upper cot latched flat, two people working shoulder to shoulder around the patient.`,
  });
  add('medCeil', {
    room: 'medbay', type: 'ceiling', name: 'Medbay overhead', params: { width: MW, depth: MD, height: MH },
    pos: [mx, 0, mz], rotY: 0, locked: true,
    evidence: 'inference', evidenceRefs: ['med-lights-low'], note: 'Low overhead; recovery lighting dims.',
  });
  add('medWallN', {
    room: 'medbay', type: 'wall', name: 'Medbay wall (fwd)', params: { length: MW, height: MH, thickness: 0.14 },
    pos: [mx, 0, mz - MD / 2], rotY: 0, locked: true, evidence: 'assumption', evidenceRefs: [], note: '',
  });
  add('medWallS', {
    room: 'medbay', type: 'wall', name: 'Medbay wall (aft)', params: { length: MW, height: MH, thickness: 0.14 },
    pos: [mx, 0, mz + MD / 2], rotY: 0, locked: true, evidence: 'assumption', evidenceRefs: [], note: '',
  });
  add('medWallW', {
    room: 'medbay', type: 'wall', name: 'Medbay wall (port)', params: { length: MD, height: MH, thickness: 0.14 },
    pos: [mx - MW / 2, 0, mz], rotY: Math.PI / 2, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: 'The cot wall.',
  });
  // the real bed — "the cot" of Presence and Book 3, and secretly the most
  // over-spec piece of hardware aboard: a rated procedure bed on rails
  add('medCot', {
    room: 'medbay', type: 'bench', name: 'Procedure bed — "the cot" (stowed)',
    params: { width: 0.72, height: 0.52, depth: 1.5 },
    pos: mrel(-MW / 2 + 0.43, 0), rotY: 0, locked: false,
    evidence: 'decision',
    evidenceRefs: ['med-cot', 'med-two-beds', 'med-telemetry'],
    note: 'The real bed (author ruling): a certified medical procedure bed on recessed deployment rails — unlatch it and it slides clear of the wall, casters lock, and the medic gets both sides of the patient; the umbilical boom follows from overhead. Stowed against the wall it is simply "the cot," reclined "at an angle designed by someone who believed recovery worked better if the body had nowhere useful to go." Probably the single most over-spec fitting aboard — from whichever refit era certified her for crewed long-haul work — which is exactly why a century of owners who sold everything else never sold this. The telemetry projection hovers past its foot.',
  });
  add('medRailHead', {
    room: 'medbay', type: 'rail', name: 'Bed deployment track (head)',
    params: { length: 1.15, height: 0.015, midRail: false },
    pos: mrel(-MW / 2 + 0.645, -0.55), rotY: Math.PI / 2, locked: false,
    evidence: 'decision', evidenceRefs: ['med-two-beds'],
    note: 'Recessed channel track flush with the deck — the head-end rail the procedure bed rides when it deploys. Collects grit; cleaning it out is a one-knee, ten-minute job nobody schedules alone.',
  });
  add('medRailFoot', {
    room: 'medbay', type: 'rail', name: 'Bed deployment track (foot)',
    params: { length: 1.15, height: 0.015, midRail: false },
    pos: mrel(-MW / 2 + 0.645, 0.55), rotY: Math.PI / 2, locked: false,
    evidence: 'decision', evidenceRefs: ['med-two-beds'],
    note: 'Foot-end deployment track, recessed flush. The deploy latch lives at this end, at knee height on the bed frame.',
  });
  add('medBoom', {
    room: 'medbay', type: 'shelf', name: 'Umbilical boom (power / med-gas / telemetry)',
    params: { width: 0.9, depth: 0.28, mountHeight: 1.95, tins: 0 },
    pos: mrel(-MW / 2 + 0.16, -0.45), rotY: Math.PI / 2, locked: false,
    evidence: 'decision', evidenceRefs: ['med-two-beds', 'med-telemetry'],
    note: 'Articulated overhead boom above the bed head: power, med-gas, and telemetry umbilicals that follow the bed out on deployment and fold flat against the wall when it stows. The joint creaks on the first pull — always the first pull.',
  });
  // the second recessed wall bed of Next-01: a lighter fold-down cot above it
  add('medUpperBed', {
    room: 'medbay', type: 'shelf', name: 'Fold-down cot (upper)',
    params: { width: 1.5, tins: 0, depth: 0.58, mountHeight: 1.34 },
    pos: mrel(-MW / 2 + 0.35, 0), rotY: Math.PI / 2, locked: false,
    evidence: 'decision', evidenceRefs: ['med-two-beds', 'med-cot'],
    note: 'The second recessed wall bed (author ruling): a lighter fold-down cot above the real bed, for the rare two-patient day. Kept latched flat between uses; the singular "the cot" of later books is the real bed below it.',
  });
  add('medConsole', {
    room: 'medbay', type: 'console', name: 'Medbay console',
    params: { width: 0.9, depth: 0.55, height: 0.95, screens: 1, lit: true },
    pos: mrel(0.1, -MD / 2 + 0.37), rotY: 0, locked: false,
    evidence: 'explicit', evidenceRefs: ['med-console', 'med-telemetry', 'med-drawer'],
    note: 'Standing-height console with a braceable edge; drives the telemetry projection; the drawer where patches live.',
  });
  add('medChair', {
    room: 'medbay', type: 'seat', name: 'Medbay chair',
    params: { seatHeight: 0.45, width: 0.46, hasArms: false },
    pos: mrel(0.0, -0.06), rotY: Math.PI - 0.4, locked: false,
    evidence: 'explicit', evidenceRefs: ['med-chair', 'med-chair-hook'],
    note: 'The one chair — hooked into position beside the console, within reach of the tea, angled toward both telemetry and cot. It unhooks and hangs on the aft wall when the bed deploys; its floor position sits astride the recessed rails.',
  });
  add('medShelf', {
    room: 'medbay', type: 'storage', name: 'Storage shelf',
    params: { width: 0.7, height: 1.5, depth: 0.34 },
    pos: mrel(0.95, -MD / 2 + 0.17), rotY: 0, locked: false,
    evidence: 'explicit', evidenceRefs: ['med-shelf', 'med-reach'],
    note: 'Where Nova stands with her borrowed blanket — supplies within blind reach of the door, beside the console.',
  });
  add('medSideConsole', {
    room: 'medbay', type: 'console', name: 'Side console',
    params: { width: 0.7, depth: 0.3, height: 0.85, screens: 1, lit: true },
    pos: mrel(-0.8, MD / 2 - 0.2), rotY: Math.PI, locked: false,
    evidence: 'explicit', evidenceRefs: ['med-side-console'],
    note: 'The side console that hums beside the cot while she recovers.',
  });
  add('medSterilizer', {
    room: 'medbay', type: 'crate', name: 'Sterilizer unit',
    params: { width: 0.38, height: 0.95, depth: 0.4 },
    pos: mrel(0.95, MD / 2 - 0.2), rotY: 0, locked: false,
    evidence: 'explicit', evidenceRefs: ['med-two-beds'],
    note: 'Sterilizer unit with its blinking diagnostic loop, in the aft corner clear of the door lane.',
  });

  // ================= LOWER DECK =================
  // The lower deck is the seam between three uses of the Huntress:
  // commercial work, ordinary habitation, and older aft service fabric.
  // Geometry here is a relational first pass. Exact dimensions / port-starboard
  // placements remain assumptions unless the prose or design log says otherwise.
  const D2 = DECK2Y;
  const mEp = cx - COR.W / 2;            // main-deck corridor port wall plane
  const LH = 2.15;

  // ---------- primary stair + lower operations landing ----------
  add('stwSteps', {
    room: 'stairwell', type: 'step', name: 'Primary stairwell',
    params: { width: 1.05, rise: 3 / 17, run: 0.2, steps: 17 },
    pos: [mEp - 1.5, D2, stairZ], rotY: Math.PI / 2, locked: true,
    evidence: 'explicit', evidenceRefs: ['stair-lights', 'deck-three', 'lower-corridor'],
    note: 'Seventeen compact treads down to the lower operations deck. The 3.0 m floor-to-floor gap leaves real structure / service depth between occupied decks.',
  });
  for (const s of [-1, 1]) {
    add(s < 0 ? 'stwWallN' : 'stwWallS', {
      room: 'stairwell', type: 'wall', name: 'Primary stairwell wall',
      params: { length: 3.0, height: 4.85, thickness: 0.12 },
      pos: [mEp - 1.5, D2, stairZ + s * 0.55], rotY: 0, locked: true,
      evidence: 'assumption', evidenceRefs: [], note: '',
    });
  }
  add('stwCeil', {
    room: 'stairwell', type: 'ceiling', name: 'Primary stairwell overhead',
    params: { width: 3.0, depth: 1.1, height: 4.85 },
    pos: [mEp - 1.5, D2, stairZ], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: '',
  });

  const OPX = mEp - 3.55;
  const OPZ = stairZ;
  add('opLandingFloor', {
    room: 'operations', type: 'floor', name: 'Lower Operations landing',
    params: { width: 3.0, depth: 2.7 },
    pos: [OPX, D2, OPZ], rotY: 0, locked: true,
    evidence: 'decision', evidenceRefs: ['lower-corridor', 'bay-medbay-near'],
    note: 'A widened working landing, not a lobby. The primary stair arrives in work territory first; the skiff branch, work spine, and quieter residential turn all begin here.',
  });
  add('opLandingCeil', {
    room: 'operations', type: 'ceiling', name: 'Lower Operations overhead',
    params: { width: 3.0, depth: 2.7, height: LH },
    pos: [OPX, D2, OPZ], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: '',
  });
  add('opDamageLocker', {
    room: 'operations', type: 'storage', name: 'Damage-control locker',
    params: { width: 0.8, height: 1.65, depth: 0.35 },
    pos: [OPX - 1.25, D2, OPZ - 0.65], rotY: Math.PI / 2, locked: false,
    evidence: 'assumption', evidenceRefs: [],
    note: 'A practical use of the landing wall: emergency and damage-control gear rather than social furniture.',
  });


  // Bulkheads make the landing read as a compact working intersection rather
  // than an unbounded patch of deck.
  add('opWallW', {
    room: 'operations', type: 'wall', name: 'Lower Operations port bulkhead',
    params: { length: 2.7, height: LH, thickness: 0.12 },
    pos: [OPX - 1.5, D2, OPZ], rotY: Math.PI / 2, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: 'Solid working bulkhead; habitation is reached farther aft via the residential turn.',
  });
  const opStairHalf = 0.58;
  add('opWallE1', {
    room: 'operations', type: 'wall', name: 'Lower Operations starboard bulkhead (forward)',
    params: { length: (2.7 / 2) - opStairHalf, height: LH, thickness: 0.12 },
    pos: [OPX + 1.5, D2, OPZ - (opStairHalf + ((2.7 / 2) - opStairHalf) / 2)], rotY: Math.PI / 2, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: 'Flanks the primary-stair mouth.',
  });
  add('opWallE2', {
    room: 'operations', type: 'wall', name: 'Lower Operations starboard bulkhead (aft)',
    params: { length: (2.7 / 2) - opStairHalf, height: LH, thickness: 0.12 },
    pos: [OPX + 1.5, D2, OPZ + (opStairHalf + ((2.7 / 2) - opStairHalf) / 2)], rotY: Math.PI / 2, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: 'Flanks the primary-stair mouth.',
  });
  const opSkiffHalf = 0.6;
  add('opWallN1', {
    room: 'operations', type: 'wall', name: 'Lower Operations forward bulkhead (port)',
    params: { length: 1.5 - opSkiffHalf, height: LH, thickness: 0.12 },
    pos: [OPX - (opSkiffHalf + (1.5 - opSkiffHalf) / 2), D2, OPZ - 1.35], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: 'Flanks the skiff-bay branch.',
  });
  add('opWallN2', {
    room: 'operations', type: 'wall', name: 'Lower Operations forward bulkhead (starboard)',
    params: { length: 1.5 - opSkiffHalf, height: LH, thickness: 0.12 },
    pos: [OPX + (opSkiffHalf + (1.5 - opSkiffHalf) / 2), D2, OPZ - 1.35], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: 'Flanks the skiff-bay branch.',
  });
  const opWorkHalf = 0.725; // matches the current 1.45 m work-spine width
  add('opWallS1', {
    room: 'operations', type: 'wall', name: 'Lower Operations aft bulkhead (port)',
    params: { length: 1.5 - opWorkHalf, height: LH, thickness: 0.12 },
    pos: [OPX - (opWorkHalf + (1.5 - opWorkHalf) / 2), D2, OPZ + 1.35], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: 'Flanks the cargo-rated work-spine continuation.',
  });
  add('opWallS2', {
    room: 'operations', type: 'wall', name: 'Lower Operations aft bulkhead (starboard)',
    params: { length: 1.5 - opWorkHalf, height: LH, thickness: 0.12 },
    pos: [OPX + (opWorkHalf + (1.5 - opWorkHalf) / 2), D2, OPZ + 1.35], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: 'Flanks the cargo-rated work-spine continuation.',
  });

  // ---------- skiff / mission bay: immediate side branch ----------
  const SBW = 5.0, SBD = 4.4;
  const sbx = OPX, sbz = OPZ - 3.55;
  add('sbFloor', {
    room: 'skiffbay', type: 'floor', name: 'Skiff / mission bay deck',
    params: { width: SBW, depth: SBD },
    pos: [sbx, D2, sbz], rotY: 0, locked: true,
    evidence: 'explicit', evidenceRefs: ['skiff-cradle', 'bay-lights-low', 'bay-medbay-near'],
    note: 'Immediate side branch from Lower Operations. It can isolate / open to space without becoming through-circulation. This is the ship’s mudroom: suits, wash-down, hoist, and the intake rule — everything the job drags home comes through here first.',
  });
  add('sbCeil', {
    room: 'skiffbay', type: 'ceiling', name: 'Skiff / mission bay overhead',
    params: { width: SBW, depth: SBD, height: 2.55 },
    pos: [sbx, D2, sbz], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: 'Taller than ordinary corridors for skiff and equipment clearance.',
  });
  add('sbWallN', {
    room: 'skiffbay', type: 'wall', name: 'Skiff bay forward wall',
    params: { length: SBW, height: 2.55, thickness: 0.14 },
    pos: [sbx, D2, sbz - SBD / 2], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: '',
  });
  const sbHatchHalf = 0.6;
  add('sbWallS1', {
    room: 'skiffbay', type: 'wall', name: 'Skiff bay aft wall (port)',
    params: { length: SBW / 2 - sbHatchHalf, height: 2.55, thickness: 0.14 },
    pos: [sbx - (sbHatchHalf + (SBW / 2 - sbHatchHalf) / 2), D2, sbz + SBD / 2], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: '',
  });
  add('sbWallS2', {
    room: 'skiffbay', type: 'wall', name: 'Skiff bay aft wall (starboard)',
    params: { length: SBW / 2 - sbHatchHalf, height: 2.55, thickness: 0.14 },
    pos: [sbx + (sbHatchHalf + (SBW / 2 - sbHatchHalf) / 2), D2, sbz + SBD / 2], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: '',
  });
  add('sbWallW', {
    room: 'skiffbay', type: 'wall', name: 'Skiff bay port wall',
    params: { length: SBD, height: 2.55, thickness: 0.14 },
    pos: [sbx - SBW / 2, D2, sbz], rotY: Math.PI / 2, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: '',
  });
  add('sbLaunchDoor', {
    room: 'skiffbay', type: 'doorway', name: 'Launch aperture',
    params: { length: SBD, height: 2.55, thickness: 0.16, doorWidth: 2.35, doorHeight: 2.25, kind: 'sliding', slideDir: 1, open: 0 },
    pos: [sbx + SBW / 2, D2, sbz], rotY: Math.PI / 2, locked: true,
    evidence: 'explicit', evidenceRefs: ['bay-launch-dark'],
    note: 'Outboard launch aperture. When the skiff leaves, black cuts into the room.',
  });
  add('sbHatch', {
    room: 'skiffbay', type: 'doorway', name: 'Skiff bay hatch',
    params: { length: 1.2, height: 2.55, thickness: 0.14, doorWidth: 0.9, doorHeight: 1.95, kind: 'sliding', slideDir: -1, open: 0 },
    pos: [sbx, D2, sbz + SBD / 2], rotY: 0, locked: false,
    evidence: 'explicit', evidenceRefs: ['bay-palm-hatch', 'bay-medbay-near', 'doors-wait'],
    note: 'Palm-activated hatch opening directly off the forward side of Lower Operations. The stair approaches from starboard, so skiff traffic and stair traffic do not occupy the same opening. PARTICULATE SCRUB: after a dirty return — salvage aboard, or suits in from exterior work — this hatch holds while the ops loop scrubs the bay air, ten to twenty minutes. The crew spends it getting each other out of suits at the bench. Every salvage job ends locked in together. It is procedure.',
  });
  add('sbSkiff', {
    room: 'skiffbay', type: 'crate', name: 'Skiff in its cradle',
    params: { width: 2.6, height: 1.35, depth: 1.5 },
    pos: [sbx + 0.55, D2, sbz - 0.45], rotY: 0.06, locked: false,
    evidence: 'explicit', evidenceRefs: ['skiff-cradle', 'cradle-clunk'],
    note: 'Sour and ready. The cradle release transmits through the structure.',
  });
  add('sbRig', {
    room: 'skiffbay', type: 'console', name: 'Rig station',
    params: { width: 1.05, depth: 0.58, height: 0.95, screens: 1, lit: true },
    pos: [sbx - 1.15, D2, sbz + SBD / 2 - 0.38], rotY: Math.PI, locked: false,
    evidence: 'explicit', evidenceRefs: ['rig-station'], note: 'Clamps aligned. Seals checked.',
  });
  add('sbGrid', {
    room: 'skiffbay', type: 'shelf', name: 'Loadout grid',
    params: { width: 1.35, depth: 0.28, mountHeight: 1.25, tins: 0 },
    pos: [sbx - 1.7, D2, sbz - SBD / 2 + 0.16], rotY: 0, locked: false,
    evidence: 'explicit', evidenceRefs: ['loadout-grid'], note: 'Rig and mission loadout wall.',
  });
  add('sbLocker', {
    room: 'skiffbay', type: 'storage', name: 'Rig locker',
    params: { width: 0.95, height: 1.8, depth: 0.42 },
    pos: [sbx - 1.65, D2, sbz + 0.75], rotY: Math.PI / 2, locked: false,
    evidence: 'explicit', evidenceRefs: ['rig-locker'], note: 'Packed rig; sealed, not locked.',
  });

  // ---------- primary commercial work spine ----------
  const WORKW = 1.45, WORKZ0 = OPZ + 1.0, WORKZ1 = 20.0;
  add('workSpineFloor', {
    room: 'work-spine', type: 'floor', name: 'Primary work spine deck',
    params: { width: WORKW, depth: WORKZ1 - WORKZ0 },
    pos: [OPX, D2, (WORKZ0 + WORKZ1) / 2], rotY: 0, locked: true,
    evidence: 'decision', evidenceRefs: ['lower-corridor'],
    note: 'The default continuation from the stair: cargo-rated circulation with floor guides, protected corners, utility panels, and maintenance access threaded through ordinary working space.',
  });
  add('workSpineCeil', {
    room: 'work-spine', type: 'ceiling', name: 'Primary work spine overhead',
    params: { width: WORKW, depth: WORKZ1 - WORKZ0, height: 2.25 },
    pos: [OPX, D2, (WORKZ0 + WORKZ1) / 2], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: '',
  });

  const workE = OPX + WORKW / 2;
  const workW = OPX - WORKW / 2;
  // Opening extents mirror the currently assumed downstream room geometry.
  // They are literals here because these corridor walls are generated before
  // the individual side rooms are declared below.
  const workHeadGap = [6.25, 7.25];
  const resGap = [5.375, 6.525];
  const flexGap = [9.775, 11.325];
  const partsGap = [14.4, 16.4];
  const engGap = [15.6, 17.7];
  const nodeGapStart = 18.6;

  const addWorkWallSeg = (key, side, a, b) => {
    if (b - a < 0.05) return;
    add(key, {
      room: 'work-spine', type: 'wall', name: `Work spine ${side} bulkhead`,
      params: { length: b - a, height: 2.25, thickness: 0.12 },
      pos: [side === 'starboard' ? workE : workW, D2, (a + b) / 2],
      rotY: Math.PI / 2, locked: true,
      evidence: 'assumption', evidenceRefs: [],
      note: 'Segmented around functional openings so the work spine remains a real corridor rather than an unbounded floor strip.',
    });
  };

  // Starboard / commercial side.
  addWorkWallSeg('workWallE1', 'starboard', WORKZ0, workHeadGap[0]);
  addWorkWallSeg('workWallE2', 'starboard', workHeadGap[1], flexGap[0]);
  addWorkWallSeg('workWallE3', 'starboard', flexGap[1], partsGap[0]);
  addWorkWallSeg('workWallE4', 'starboard', partsGap[1], nodeGapStart);

  // Port / service-residential side.
  addWorkWallSeg('workWallW1', 'port', WORKZ0, resGap[0]);
  addWorkWallSeg('workWallW2', 'port', resGap[1], engGap[0]);
  addWorkWallSeg('workWallW3', 'port', engGap[1], nodeGapStart);

  add('workGuideA', {
    room: 'work-spine', type: 'rail', name: 'Cargo floor guide (port)',
    params: { length: 10.5, height: 0.045, midRail: false },
    pos: [OPX - 0.42, D2, 13.5], rotY: Math.PI / 2, locked: true,
    evidence: 'assumption', evidenceRefs: [],
    note: 'Flush / low cargo-sled guide representing the commercial character of the spine.',
  });
  add('workGuideB', {
    room: 'work-spine', type: 'rail', name: 'Cargo floor guide (starboard)',
    params: { length: 10.5, height: 0.045, midRail: false },
    pos: [OPX + 0.42, D2, 13.5], rotY: Math.PI / 2, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: 'Paired low cargo guide.',
  });

  // ---------- secondary work head ----------
  const WHW = 1.5, WHD = 1.55;
  const whx = OPX + WORKW / 2 + WHW / 2, whz = 6.75;
  add('workHeadFloor', {
    room: 'work-head', type: 'floor', name: 'Secondary work head deck',
    params: { width: WHW, depth: WHD },
    pos: [whx, D2, whz], rotY: 0, locked: true,
    evidence: 'decision', evidenceRefs: [],
    note: 'Compact secondary toilet / handwash for skiff, cargo, engineering, and freight work. No shower.',
  });
  add('workHeadCeil', {
    room: 'work-head', type: 'ceiling', name: 'Secondary work head overhead',
    params: { width: WHW, depth: WHD, height: 2.05 },
    pos: [whx, D2, whz], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: '',
  });
  add('workHeadDoor', {
    room: 'work-head', type: 'doorway', name: 'Work head door',
    params: { length: 1.0, height: 2.05, thickness: 0.1, doorWidth: 0.7, doorHeight: 1.9, kind: 'sliding', slideDir: 1, open: 0 },
    pos: [OPX + WORKW / 2, D2, whz], rotY: Math.PI / 2, locked: false,
    evidence: 'decision', evidenceRefs: [], note: 'Recessed off the work route rather than opening into a bay.',
  });
  add('workHeadOuter', {
    room: 'work-head', type: 'wall', name: 'Work head outer wall',
    params: { length: WHD, height: 2.05, thickness: 0.1 },
    pos: [whx + WHW / 2, D2, whz], rotY: Math.PI / 2, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: '',
  });
  for (const s of [-1, 1]) add(s < 0 ? 'workHeadN' : 'workHeadS', {
    room: 'work-head', type: 'wall', name: 'Work head wall',
    params: { length: WHW, height: 2.05, thickness: 0.1 },
    pos: [whx, D2, whz + s * WHD / 2], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: '',
  });
  add('workHeadWash', {
    room: 'work-head', type: 'counter', name: 'Handwash / utility basin',
    params: { width: 0.62, depth: 0.34, height: 0.86, sink: true },
    pos: [whx + 0.22, D2, whz - 0.45], rotY: 0, locked: false,
    evidence: 'assumption', evidenceRefs: [], note: 'Tiny work-side wash point.',
  });

  // ---------- residential turn + nav threshold ----------
  const RESX = OPX - 3.6;
  const RESW = 1.15;
  const RESZ0 = 5.95, RESZ1 = 12.05;
  add('resTurnFloor', {
    room: 'residential', type: 'floor', name: 'Residential turn deck',
    params: { width: OPX - (RESX - RESW / 2), depth: RESW },
    pos: [(OPX + (RESX - RESW / 2)) / 2, D2, RESZ0], rotY: 0, locked: true,
    evidence: 'decision', evidenceRefs: ['lower-corridor', 'cabin-row'],
    note: 'A conscious turn away from the work spine. Standing at the stair foot does not give a direct sightline down the cabin hall.',
  });

  const resTurnWest = RESX - RESW / 2;
  const resTurnEast = OPX;
  add('resTurnCeil', {
    room: 'residential', type: 'ceiling', name: 'Residential turn overhead',
    params: { width: resTurnEast - resTurnWest, depth: RESW, height: 2.1 },
    pos: [(resTurnEast + resTurnWest) / 2, D2, RESZ0], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: 'A compact transverse passage, not another room.',
  });
  // North wall is interrupted by nav; east end remains open to the work spine.
  add('resTurnWallN', {
    room: 'residential', type: 'wall', name: 'Residential turn forward bulkhead',
    params: { length: (OPX - WORKW / 2) - (RESX + 0.5), height: 2.1, thickness: 0.1 },
    pos: [((RESX + 0.5) + (OPX - WORKW / 2)) / 2, D2, RESZ0 - RESW / 2], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [],
    note: 'Runs between the nav opening and the work-spine opening; the west end remains open into the cabin approach.',
  });
  add('resTurnWallS', {
    room: 'residential', type: 'wall', name: 'Residential turn aft bulkhead',
    params: { length: 2.3, height: 2.1, thickness: 0.1 },
    pos: [(RESX + RESW / 2 + (OPX - WORKW / 2)) / 2, D2, RESZ0 + RESW / 2], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [],
    note: 'Leaves the full residential-approach opening clear at the port end and the work-spine opening clear at the starboard end.',
  });

  add('resApproachFloor', {
    room: 'residential', type: 'floor', name: 'Residential approach deck',
    params: { width: RESW, depth: RESZ1 - RESZ0 },
    pos: [RESX, D2, (RESZ0 + RESZ1) / 2], rotY: 0, locked: true,
    evidence: 'explicit', evidenceRefs: ['lower-corridor', 'cabin-row', 'crew-quarters', 'quarters-loop'],
    note: 'Coolant lines, forgotten tags, and the first four cabins. Nav sits at the threshold rather than inside the cabin cluster. This whole residential area is what B.O.B. began calling "Crew quarters" — a name that arrived with the crew.',
  });
  add('resApproachCeil', {
    room: 'residential', type: 'ceiling', name: 'Residential approach overhead',
    params: { width: RESW, depth: RESZ1 - RESZ0, height: 2.1 },
    pos: [RESX, D2, (RESZ0 + RESZ1) / 2], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: 'Utility lines remain visible enough that habitation never fully hides the ship.',
  });

  const NAVW = 2.35, NAVD = 1.9;
  const navx = RESX, navz = 4.425;
  add('navFloor', {
    room: 'nav', type: 'floor', name: 'Nav compartment deck',
    params: { width: NAVW, depth: NAVD },
    pos: [navx, D2, navz], rotY: 0, locked: true,
    evidence: 'explicit', evidenceRefs: ['lower-corridor'],
    note: 'Dedicated long-range plotting / route-analysis compartment on the seam between operations and habitation. It sits just off the residential turn rather than occupying the work spine.',
  });
  add('navCeil', {
    room: 'nav', type: 'ceiling', name: 'Nav compartment overhead',
    params: { width: NAVW, depth: NAVD, height: 2.1 },
    pos: [navx, D2, navz], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: '',
  });
  add('navDoor', {
    room: 'nav', type: 'doorway', name: 'Nav hatch',
    params: { length: 1.0, height: 2.1, thickness: 0.1, doorWidth: 0.75, doorHeight: 1.9, kind: 'sliding', slideDir: 1, open: 0 },
    pos: [navx, D2, navz + NAVD / 2], rotY: 0, locked: false,
    evidence: 'inference', evidenceRefs: [],
    note: 'The residential turn passes nav before the cabin approach; crew do not walk through nav to reach the cabins.',
  });
  add('navWallN', {
    room: 'nav', type: 'wall', name: 'Nav forward wall',
    params: { length: NAVW, height: 2.1, thickness: 0.1 },
    pos: [navx, D2, navz - NAVD / 2], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: '',
  });
  add('navWallW', {
    room: 'nav', type: 'wall', name: 'Nav port wall',
    params: { length: NAVD, height: 2.1, thickness: 0.1 },
    pos: [navx - NAVW / 2, D2, navz], rotY: Math.PI / 2, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: '',
  });
  add('navWallE', {
    room: 'nav', type: 'wall', name: 'Nav starboard wall',
    params: { length: NAVD, height: 2.1, thickness: 0.1 },
    pos: [navx + NAVW / 2, D2, navz], rotY: Math.PI / 2, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: '',
  });
  const navDoorHalf = 0.5;
  add('navWallS1', {
    room: 'nav', type: 'wall', name: 'Nav aft wall (port)',
    params: { length: NAVW / 2 - navDoorHalf, height: 2.1, thickness: 0.1 },
    pos: [navx - (navDoorHalf + (NAVW / 2 - navDoorHalf) / 2), D2, navz + NAVD / 2], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: '',
  });
  add('navWallS2', {
    room: 'nav', type: 'wall', name: 'Nav aft wall (starboard)',
    params: { length: NAVW / 2 - navDoorHalf, height: 2.1, thickness: 0.1 },
    pos: [navx + (navDoorHalf + (NAVW / 2 - navDoorHalf) / 2), D2, navz + NAVD / 2], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: '',
  });
  add('navConsole', {
    room: 'nav', type: 'console', name: 'Long-range nav console',
    params: { width: 1.25, depth: 0.58, height: 0.92, screens: 3, lit: true },
    pos: [navx, D2, navz - 0.58], rotY: 0, locked: false,
    evidence: 'inference', evidenceRefs: [],
    note: 'Slow-route work, fringe navigation, sensor comparison, and the sort of place Quenby once chose to sleep rather than use a cabin.',
  });
  add('navPerch', {
    room: 'nav', type: 'bench', name: 'Nav fold-down perch',
    params: { width: 1.0, height: 0.43, depth: 0.42 },
    pos: [navx - 0.55, D2, navz + 0.28], rotY: Math.PI / 2, locked: false,
    evidence: 'assumption', evidenceRefs: [], note: 'Useful enough to become a bad sleeping choice.',
  });

  // ---------- cabin helper ----------
  // Doors sit 0.3 m aft of each cabin's centre so the bunk wall (forward)
  // keeps a clear person-width beside the doorway clearance zone.
  function addLowerCabin({ key, name, x, z, w = 2.0, d = 1.85, doorX, doorZ = z + 0.3, open = 0, evidence = 'assumption', refs = [], note = '', locker = true, desk = true }) {
    add(key + 'Floor', {
      room: 'cabin', type: 'floor', name: name + ' deck',
      params: { width: w, depth: d }, pos: [x, D2, z], rotY: 0, locked: true,
      evidence, evidenceRefs: refs, note,
    });
    add(key + 'Ceil', {
      room: 'cabin', type: 'ceiling', name: name + ' overhead',
      params: { width: w, depth: d, height: 2.05 }, pos: [x, D2, z], rotY: 0, locked: true,
      evidence: 'assumption', evidenceRefs: [], note: '',
    });
    for (const s of [-1, 1]) add(key + (s < 0 ? 'WallN' : 'WallS'), {
      room: 'cabin', type: 'wall', name: name + ' wall',
      params: { length: w, height: 2.05, thickness: 0.1 },
      pos: [x, D2, z + s * d / 2], rotY: 0, locked: true,
      evidence: 'assumption', evidenceRefs: [], note: '',
    });
    const outerX = x < doorX ? x - w / 2 : x + w / 2;
    add(key + 'OuterWall', {
      room: 'cabin', type: 'wall', name: name + ' outer wall',
      params: { length: d, height: 2.05, thickness: 0.1 },
      pos: [outerX, D2, z], rotY: Math.PI / 2, locked: true,
      evidence: 'assumption', evidenceRefs: [], note: '',
    });
    add(key + 'Door', {
      room: 'cabin', type: 'doorway', name: name + ' door',
      params: { length: 1.0, height: 2.05, thickness: 0.1, doorWidth: 0.75, doorHeight: 1.9, kind: 'sliding', slideDir: x < doorX ? -1 : 1, open },
      pos: [doorX, D2, doorZ], rotY: Math.PI / 2, locked: false,
      evidence, evidenceRefs: refs, note,
    });
    add(key + 'Bunk', {
      room: 'cabin', type: 'bench', name: name + ' bunk',
      params: { width: 1.82, height: 0.4, depth: 0.68 },
      pos: [x, D2, z - d / 2 + 0.38], rotY: 0, locked: false,
      evidence: key === 'cab6' ? 'explicit' : 'inference',
      evidenceRefs: key === 'cab6' ? ['cabin-bunk'] : ['cabin-row'],
      note: (key === 'cab6' ? 'Standard low bunk; tight-cornered, sheet pulled taut.' : 'Standard crew bunk.') +
        ' Two flat drawers ride underneath — bedding and the things that live closest.',
    });
    // Every cabin ships with the same three fittings (author direction):
    // clothing/personal storage, a work surface, and something to sit on.
    // They line the aft wall, clear of the door sweep and the bunk lane.
    const inward = x < doorX ? 1 : -1;               // +x direction from outer wall toward the door wall
    const outX = x - inward * (w / 2);               // outer (hull-side) wall plane
    const aftZ = z + d / 2;
    if (locker) add(key + 'Locker', {
      room: 'cabin', type: 'storage', name: name + ' locker',
      params: { width: 0.55, height: 1.78, depth: 0.42 },
      pos: [outX + inward * 0.30, D2, aftZ - 0.23], rotY: 0, locked: false,
      evidence: 'decision', evidenceRefs: ['cabin-row', 'crew-quarters'],
      note: 'Full-height crew locker in the aft outer corner — hanging clothes above, personal effects below, a lip shelf at eye height for the small things that matter.',
    });
    if (desk) {
      add(key + 'Desk', {
        room: 'cabin', type: 'table', name: name + ' fold-down desk',
        params: { width: 0.6, depth: 0.4, height: 0.74 },
        pos: [outX + inward * 0.97, D2, aftZ - 0.21], rotY: 0, locked: false,
        evidence: 'decision', evidenceRefs: ['cabin-row', 'crew-quarters'],
        note: 'Wall-hinged fold-down desk on the aft bulkhead — big enough for a slate, a mug, and one project. Folds flat when the cabin needs to be a bedroom instead of an office.',
      });
      add(key + 'Stool', {
        room: 'cabin', type: 'seat', name: name + ' stool',
        params: { seatHeight: 0.44, width: 0.38, hasArms: false },
        pos: [outX + inward * 0.90, D2, aftZ - 0.78], rotY: Math.PI, locked: false,
        evidence: 'decision', evidenceRefs: ['cabin-row', 'crew-quarters'],
        note: 'Low stool pulled up to the desk. Every cabin has one; no two have aged the same way.',
      });
    }
  }

  // ---------- Cabins One through Four: accessible / passenger-capable approach ----------
  const resWestDoorX = RESX - RESW / 2;
  const resEastDoorX = RESX + RESW / 2;
  addLowerCabin({
    key: 'cab1', name: 'Cabin One', x: resWestDoorX - 1.0, z: 7.65, doorX: resWestDoorX, open: 0,
    evidence: 'decision', refs: ['cabin-row'],
    note: 'The catalog cabin: closest to the residential turn, most traffic noise, utterly standard — the untouched baseline against which the others’ quirks read. Unchosen for a reason.',
  });
  addLowerCabin({
    key: 'cab2', name: 'Cabin Two', x: resEastDoorX + 1.0, z: 9.05, doorX: resEastDoorX, open: 0.35, locker: false,
    evidence: 'decision', refs: ['cabin-row'],
    note: 'The door ajar, the room too orderly — a previous crew member’s habits fossilized. Drawer labels in an unfamiliar hand; a mirror polished by someone else’s routine. Nobody quite wants to overwrite a stranger.',
  });
  addLowerCabin({
    key: 'cab3', name: 'Cabin Three', x: resWestDoorX - 1.0, z: 10.25, doorX: resWestDoorX, open: 0,
    evidence: 'decision', refs: ['cabin-row'],
    note: 'Legacy door hardware sticks, and a junction box behind the wall panel clicks whenever the midline bus settles — annoying to anyone who doesn’t love the ship’s voice.',
  });
  addLowerCabin({
    key: 'cab4', name: 'Cabin Four — Nova', x: resEastDoorX + 1.0, z: 11.15, doorX: resEastDoorX, open: 0,
    evidence: 'decision', refs: ['cabin-row', 'crew-quarters'],
    note: 'Nova’s cabin (author lock): the one where the ship never stops talking. Its work-spine bulkhead carries the coolant line’s pulse — lay a palm on it and feel the aft pump run two beats late — and an automation-era cableway cover plate sits in the ceiling, four fasteners from an entire hidden geography. She chose it the way she chooses everything: by listening first.',
  });
  add('cab2Drawers', {
    room: 'cabin', type: 'storage', name: 'Labeled drawer unit (Cabin Two)',
    params: { width: 0.8, height: 0.9, depth: 0.32 },
    pos: [resEastDoorX + 1.62, D2, 9.6], rotY: -Math.PI / 2, locked: false,
    evidence: 'inference', evidenceRefs: ['cabin-row'],
    note: 'Drawer labels in an unfamiliar hand, contents squared away by someone who is not aboard anymore. Too orderly. This dresser IS the cabin’s clothing storage — which is half of why nobody moves in: you would have to relabel it.',
  });
  add('cab4CablewayPlate', {
    room: 'cabin', type: 'shelf', name: 'Cableway cover plate (Cabin Four ceiling)',
    params: { width: 0.6, depth: 0.35, mountHeight: 1.92, tins: 0 },
    pos: [resEastDoorX + 1.1, D2, 11.55], rotY: Math.PI, locked: false,
    evidence: 'inference', evidenceRefs: ['cabin-row'],
    note: 'An automation-refit cableway runs through the overhead service volume here; the cover plate opens with four fasteners. Exactly the sort of thing a scavenger with a bolt habit notices on the first visit.',
  });


  // Corridor-side walls between the staggered Cabin One–Four doors.
  const addResWallSeg = (key, x, a, b) => {
    if (b - a < 0.05) return;
    add(key, {
      room: 'residential', type: 'wall', name: 'Residential approach bulkhead',
      params: { length: b - a, height: 2.1, thickness: 0.1 },
      pos: [x, D2, (a + b) / 2], rotY: Math.PI / 2, locked: true,
      evidence: 'assumption', evidenceRefs: ['cabin-row'],
      note: 'Staggered cabin-facing wall; door rhythm is intentionally irregular.',
    });
  };
  addResWallSeg('resWallW1', resWestDoorX, RESZ0, 7.45);
  addResWallSeg('resWallW2', resWestDoorX, 8.45, 10.05);
  addResWallSeg('resWallW3', resWestDoorX, 11.05, RESZ1);
  addResWallSeg('resWallE1', resEastDoorX, RESZ0, 8.85);
  addResWallSeg('resWallE2', resEastDoorX, 9.85, 10.95);
  addResWallSeg('resWallE3', resEastDoorX, 11.95, RESZ1);

  // ---------- wet/service core + dogleg ----------
  const QUIETX = RESX - 2.0;
  const DOGZ = 12.45;
  add('doglegFloor', {
    room: 'residential', type: 'floor', name: 'Wet-core dogleg deck',
    params: { width: RESX - QUIETX + RESW, depth: 1.15 },
    pos: [(RESX + QUIETX) / 2, D2, DOGZ], rotY: 0, locked: true,
    evidence: 'decision', evidenceRefs: ['cabin-bend'],
    note: 'The residential corridor bends around the fixed wet / service core, breaking sightlines before the Cabin Five / Six run.',
  });

  add('doglegCeil', {
    room: 'residential', type: 'ceiling', name: 'Wet-core dogleg overhead',
    params: { width: RESX - QUIETX + RESW, depth: 1.15, height: 2.08 },
    pos: [(RESX + QUIETX) / 2, D2, DOGZ], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: ['cabin-bend'],
    note: 'The ceiling follows the bend rather than opening into a larger hall.',
  });

  add('quietRunFloor', {
    room: 'residential', type: 'floor', name: 'Quiet cabin run deck',
    params: { width: RESW, depth: 5.4 },
    pos: [QUIETX, D2, 15.1], rotY: 0, locked: true,
    evidence: 'decision', evidenceRefs: ['cabin-bend', 'cabin-six', 'crew-quarters'],
    note: 'Short quiet run beyond the dogleg. Cabins Five and Six share a wall here; the passage continues beyond Cabin Six into service territory.',
  });
  add('quietRunCeil', {
    room: 'residential', type: 'ceiling', name: 'Quiet cabin run overhead',
    params: { width: RESW, depth: 5.4, height: 2.08 },
    pos: [QUIETX, D2, 15.1], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: '',
  });

  const COREW = 1.8, CORED = 2.5;
  const corex = RESX + 1.5, corez = 13.45;
  add('wetCoreFloor', {
    room: 'wet-service', type: 'floor', name: 'Residential wet / service core deck',
    params: { width: COREW, depth: CORED },
    pos: [corex, D2, corez], rotY: 0, locked: true,
    evidence: 'decision', evidenceRefs: ['quarters-loop'],
    note: 'Pumps, filters, valves, heat exchange, environmental and habitation-loop service access. The corridor bends because this fixed utility volume is in the way. Two adults fit inside — barely, deliberately: wet-compartment work is a two-body job in an arm’s-length room, and while the loop is open the hatch holds shut until reseat.',
  });
  add('wetCoreCeil', {
    room: 'wet-service', type: 'ceiling', name: 'Wet / service core overhead',
    params: { width: COREW, depth: CORED, height: 2.15 },
    pos: [corex, D2, corez], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: '',
  });
  for (const s of [-1, 1]) add(s < 0 ? 'wetCoreN' : 'wetCoreS', {
    room: 'wet-service', type: 'wall', name: 'Wet / service core wall',
    params: { length: COREW, height: 2.15, thickness: 0.12 },
    pos: [corex, D2, corez + s * CORED / 2], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: '',
  });
  add('wetCoreW', {
    room: 'wet-service', type: 'wall', name: 'Wet / service core corridor wall',
    params: { length: CORED, height: 2.15, thickness: 0.12 },
    pos: [corex - COREW / 2, D2, corez], rotY: Math.PI / 2, locked: true,
    evidence: 'assumption', evidenceRefs: [],
    note: 'Service-facing wall beside the dogleg; routine maintenance panels remain reachable from lived-in circulation.',
  });
  add('wetCoreE', {
    room: 'wet-service', type: 'wall', name: 'Wet / service core outer wall',
    params: { length: CORED, height: 2.15, thickness: 0.12 },
    pos: [corex + COREW / 2, D2, corez], rotY: Math.PI / 2, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: '',
  });
  add('wetCorePanel', {
    room: 'wet-service', type: 'storage', name: 'Habitation service manifold',
    params: { width: 0.95, height: 1.35, depth: 0.18 },
    pos: [corex - COREW / 2 + 0.1, D2, corez], rotY: Math.PI / 2, locked: false,
    evidence: 'decision', evidenceRefs: ['quarters-loop'],
    note: 'Accessible from lived-in space: thermal / water / environmental service rather than machinery hidden on a remote engineering deck. INTERLOCK: when the loop is opened for work, the core seals for drain-down and reseat — twenty to forty minutes, hatch held shut, released only from the isolation panel out on the dogleg. Two-person rule: one inside, one at the panel. Choose your panel-watcher carefully.',
  });
  add('secondaryLadder', {
    room: 'wet-service', type: 'step', name: 'Secondary ship ladder',
    params: { width: 0.68, rise: 3 / 17, run: 0.10, steps: 17 },
    pos: [corex + 0.2, D2, corez + 0.25], rotY: 0, locked: true,
    evidence: 'decision', evidenceRefs: [],
    note: 'Steep crew shortcut beside the service chase, rising to the dry hygiene / service vestibule on the main deck.',
  });


  const quietW = QUIETX - RESW / 2;
  const quietE = QUIETX + RESW / 2;
  const quietWallStart = DOGZ + 1.15 / 2;
  const quietWallEnd = 17.8;
  const addQuietWallSeg = (key, side, a, b) => {
    if (b - a < 0.05) return;
    add(key, {
      room: 'residential', type: 'wall', name: `Quiet run ${side} bulkhead`,
      params: { length: b - a, height: 2.08, thickness: 0.1 },
      pos: [side === 'east' ? quietE : quietW, D2, (a + b) / 2],
      rotY: Math.PI / 2, locked: true,
      evidence: 'assumption', evidenceRefs: ['cabin-bend', 'cabin-six'],
      note: 'The quiet run is enclosed enough to feel residential while preserving ordinary ship-service texture.',
    });
  };
  addQuietWallSeg('quietWallW1', 'west', quietWallStart, 14.25);
  addQuietWallSeg('quietWallW2', 'west', 15.25, 16.25);
  addQuietWallSeg('quietWallW3', 'west', 17.25, quietWallEnd);
  addQuietWallSeg('quietWallE', 'east', quietWallStart, quietWallEnd);

  // ---------- domestic / habitation stores; later garden nook ----------
  // The compartment opens from the dogleg itself rather than facing either
  // Cabin Five or Cabin Six. This keeps it close to the wet-service core while
  // making the later garden feel like a small place deliberately entered.
  const GARDW = 2.0, GARDD = 2.55;
  const gardx = ((QUIETX + RESW / 2) + (corex - COREW / 2)) / 2;
  const gardz = DOGZ + 1.15 / 2 + GARDD / 2;
  add('gardenFloor', {
    room: 'domestic-stores', type: 'floor', name: 'Domestic stores deck',
    params: { width: GARDW, depth: GARDD },
    pos: [gardx, D2, gardz], rotY: 0, locked: true,
    evidence: 'decision', evidenceRefs: [],
    note: 'Factory domestic / habitation stores. After Garden Station, this becomes the small onboard garden without surrendering a freight bay.',
  });
  add('gardenCeil', {
    room: 'domestic-stores', type: 'ceiling', name: 'Domestic stores overhead',
    params: { width: GARDW, depth: GARDD, height: 2.1 },
    pos: [gardx, D2, gardz], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: '',
  });
  add('gardenHatch', {
    room: 'domestic-stores', type: 'doorway', name: 'Domestic stores hatch / future garden hatch',
    params: { length: 1.15, height: 2.1, thickness: 0.1, doorWidth: 0.8, doorHeight: 1.9, kind: 'sliding', slideDir: -1, open: 0 },
    pos: [gardx, D2, gardz - GARDD / 2], rotY: 0, locked: false,
    evidence: 'decision', evidenceRefs: [],
    note: 'Dedicated hatch opening from the dogleg, not directly opposite a cabin door. Someone can stand or lean in the threshold while speaking into the room.',
  });
  add('gardenWallS', {
    room: 'domestic-stores', type: 'wall', name: 'Domestic stores aft wall',
    params: { length: GARDW, height: 2.1, thickness: 0.1 },
    pos: [gardx, D2, gardz + GARDD / 2], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: '',
  });
  for (const s of [-1, 1]) add(s < 0 ? 'gardenWallW' : 'gardenWallE', {
    room: 'domestic-stores', type: 'wall', name: 'Domestic stores side wall',
    params: { length: GARDD, height: 2.1, thickness: 0.1 },
    pos: [gardx + s * GARDW / 2, D2, gardz], rotY: Math.PI / 2, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: '',
  });
  const gardenDoorHalf = 0.575;
  add('gardenWallN1', {
    room: 'domestic-stores', type: 'wall', name: 'Domestic stores forward wall (port)',
    params: { length: GARDW / 2 - gardenDoorHalf, height: 2.1, thickness: 0.1 },
    pos: [gardx - (gardenDoorHalf + (GARDW / 2 - gardenDoorHalf) / 2), D2, gardz - GARDD / 2], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: '',
  });
  add('gardenWallN2', {
    room: 'domestic-stores', type: 'wall', name: 'Domestic stores forward wall (starboard)',
    params: { length: GARDW / 2 - gardenDoorHalf, height: 2.1, thickness: 0.1 },
    pos: [gardx + (gardenDoorHalf + (GARDW / 2 - gardenDoorHalf) / 2), D2, gardz - GARDD / 2], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: '',
  });
  // Two stores along the port wall aft of the hatch clearance, one on the
  // starboard wall — the threshold itself stays clear for someone leaning in.
  [[-0.55, 0.10, Math.PI / 2], [-0.55, 0.85, Math.PI / 2], [0.55, 0.40, -Math.PI / 2]].forEach(([dx, dz, ry], i) => add('gardenStore' + (i + 1), {
    room: 'domestic-stores', type: 'storage', name: 'Low side-opening domestic store ' + (i + 1),
    params: { width: 0.72, height: 0.72, depth: 0.72 },
    pos: [gardx + dx, D2, gardz + dz], rotY: ry, locked: false,
    evidence: 'decision', evidenceRefs: [],
    note: 'Frequently used linens, cleaning / hygiene consumables, filters, waste bags, water-test supplies, or small environmental spares. Future grow beds can sit above these stores.',
  }));

  // ---------- Cabins Five and Six: quiet run ----------
  const quietWestDoorX = QUIETX - RESW / 2;
  addLowerCabin({
    key: 'cab5',
    name: iriRuling === 'aft-room' ? 'Cabin Five (blank)' : 'Cabin Five — Iri',
    x: quietWestDoorX - 1.05, z: 14.45, w: 2.1, d: 2.0, desk: false, locker: false,
    doorX: quietWestDoorX, open: iriRuling === 'aft-room' ? 0 : 0.45,
    evidence: iriRuling ? 'decision' : 'assumption', refs: ['iri-cabin-lower'],
    note: iriRuling === 'aft-room'
      ? 'Your ruling: Iri’s quarters are the aft room past the galley; this cabin stands blank.'
      : (iriRuling ? '' : '⚠ Provisional — the Iri’s-quarters conflict is unresolved. ') +
        'Iri’s cabin. Door often held at a half-angle. Shares a structural wall with Cabin Six.',
  });
  addLowerCabin({
    key: 'cab6', name: 'Cabin Six — Quenby', x: quietWestDoorX - 1.2, z: 16.45, w: 2.4, d: 2.0,
    doorX: quietWestDoorX, open: 0, evidence: 'decision',
    refs: ['cabin-six', 'cabin-six-room', 'cabin-bunk', 'cabin-mirror', 'cabin-door-catch'],
    note: 'One of the larger cabins. Plain, quiet, a quarter heavy near the far bulkhead — ordinary refit-era gravity-calibration drift where the enlarged cabin crosses an old field-plating boundary, not the ship taking an interest. Last numbered cabin, but not the end of the passage.',
  });
  add('cab5Table', {
    room: 'cabin', type: 'table', name: 'Iri’s worktable',
    params: { width: 0.85, depth: 0.5, height: 0.78 },
    pos: [quietWestDoorX - 1.22, D2, 15.10], rotY: Math.PI, locked: false,
    evidence: 'decision', evidenceRefs: ['iri-worktable'],
    note: 'Where she lays found pieces out with both hands. Doubles as her desk — the standard fold-down was the first thing she unbolted.',
  });
  add('cab5Stool', {
    room: 'cabin', type: 'seat', name: 'Iri’s stool',
    params: { seatHeight: 0.44, width: 0.38, hasArms: false },
    pos: [quietWestDoorX - 1.10, D2, 14.51], rotY: 0, locked: false,
    evidence: 'decision', evidenceRefs: ['iri-worktable'],
    note: 'Pulled up to the worktable more evenings than not — the lane between bunk and table is exactly one stool wide.',
  });
  add('cab5Hatch', {
    room: 'cabin', type: 'shelf', name: 'Iri’s sealed storage hatch',
    params: { width: 0.7, depth: 0.26, mountHeight: 1.2, tins: 0 },
    pos: [quietWestDoorX - 2.0, D2, 14.45], rotY: Math.PI / 2, locked: false,
    evidence: 'decision', evidenceRefs: ['iri-storage-hatch'], note: 'Soft-wrapped, layered, sealed.',
  });
  add('cab5Locker', {
    room: 'cabin', type: 'storage', name: 'Cabin Five — Iri locker',
    params: { width: 0.55, height: 1.78, depth: 0.42 },
    pos: [quietWestDoorX - 1.89, D2, 15.12], rotY: Math.PI / 2, locked: false,
    evidence: 'decision', evidenceRefs: ['cabin-row', 'crew-quarters'],
    note: 'Iri’s locker stands against the outer wall in the aft corner, turned sideways to leave the worktable its light — clothes above, and the lower shelf given over to labeled tins of sorted salvage.',
  });

  // ---------- aft service passage: habitation gives way to old ship ----------
  add('aftServiceFloor', {
    room: 'aft-service', type: 'floor', name: 'Aft service passage deck',
    params: { width: RESW, depth: 3.2 },
    pos: [QUIETX, D2, 19.0], rotY: 0, locked: true,
    evidence: 'decision', evidenceRefs: ['lower-corridor'],
    note: 'Beyond Cabin Six, habitation finishes give way to older panels, conduit, inspection hatches, cargo markings, and utilitarian lighting.',
  });
  add('aftServiceCeil', {
    room: 'aft-service', type: 'ceiling', name: 'Aft service passage overhead',
    params: { width: RESW, depth: 3.2, height: 2.05 },
    pos: [QUIETX, D2, 19.0], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: '',
  });

  add('aftServiceWallW', {
    room: 'aft-service', type: 'wall', name: 'Aft service passage port bulkhead',
    params: { length: 2.8, height: 2.05, thickness: 0.1 },
    pos: [QUIETX - RESW / 2, D2, 19.2], rotY: Math.PI / 2, locked: true,
    evidence: 'assumption', evidenceRefs: [],
    note: 'Older service fabric begins to dominate beyond Cabin Six.',
  });
  add('aftServiceWallE', {
    room: 'aft-service', type: 'wall', name: 'Aft service passage starboard bulkhead',
    params: { length: 1.6, height: 2.05, thickness: 0.1 },
    pos: [QUIETX + RESW / 2, D2, 18.6], rotY: Math.PI / 2, locked: true,
    evidence: 'assumption', evidenceRefs: [],
    note: 'Stops before the aft reconnection opens toward the commercial / freight side.',
  });

  add('aftReconnectFloor', {
    room: 'aft-service', type: 'floor', name: 'Aft reconnection deck',
    params: { width: OPX - QUIETX, depth: 1.2 },
    pos: [(OPX + QUIETX) / 2, D2, 20.0], rotY: 0, locked: true,
    evidence: 'decision', evidenceRefs: [],
    note: 'The quiet route reconnects with the commercial / freight side without passing through the main cargo bay.',
  });


  add('aftReconnectCeil', {
    room: 'aft-service', type: 'ceiling', name: 'Aft reconnection overhead',
    params: { width: OPX - QUIETX, depth: 1.2, height: 2.1 },
    pos: [(OPX + QUIETX) / 2, D2, 20.0], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [],
    note: 'Low working passage joining the quiet aft route to freight/service circulation.',
  });

  // ---------- configurable commercial mission / flex bay ----------
  const FBW = 5.2, FBD = 6.0;
  const fbx = OPX + WORKW / 2 + FBW / 2, fbz = 10.55;
  add('flexFloor', {
    room: 'flex-bay', type: 'floor', name: 'Hold Two — configurable mission / flex bay deck',
    params: { width: FBW, depth: FBD },
    pos: [fbx, D2, fbz], rotY: 0, locked: true,
    evidence: 'decision', evidenceRefs: ['hold2-hatch'],
    note: 'Registry designation Hold Two: commercially useful configurable volume — ordinary freight, workshop, survey gear, contract module, secure load, or other operator-specific fit-out. The skiff/gear complex is a third freight-capable area but was never a numbered hold.',
  });
  add('flexCeil', {
    room: 'flex-bay', type: 'ceiling', name: 'Mission / flex bay overhead',
    params: { width: FBW, depth: FBD, height: 2.6 },
    pos: [fbx, D2, fbz], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: 'Higher than the corridor, but not the main bay’s clear-span volume.',
  });
  add('flexDoor', {
    room: 'flex-bay', type: 'doorway', name: 'Mission / flex bay cargo hatch',
    params: { length: 1.55, height: 2.6, thickness: 0.14, doorWidth: 1.25, doorHeight: 2.15, kind: 'sliding', slideDir: -1, open: 0 },
    pos: [OPX + WORKW / 2, D2, fbz], rotY: Math.PI / 2, locked: false,
    evidence: 'decision', evidenceRefs: ['hold2-hatch'],
    note: 'Cargo-capable opening directly from the work spine. Author ruling: the hatch carries a powered assist that B.O.B. drove in the early days — "slid open at her approach" — and after the Manual-mode order it waits to be told, like every other door. Same hardware, different authority; door behavior dates a scene.',
  });
  add('flexOuter', {
    room: 'flex-bay', type: 'wall', name: 'Mission / flex bay outer wall',
    params: { length: FBD, height: 2.6, thickness: 0.14 },
    pos: [fbx + FBW / 2, D2, fbz], rotY: Math.PI / 2, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: '',
  });
  for (const s of [-1, 1]) add(s < 0 ? 'flexWallN' : 'flexWallS', {
    room: 'flex-bay', type: 'wall', name: 'Mission / flex bay wall',
    params: { length: FBW, height: 2.6, thickness: 0.14 },
    pos: [fbx, D2, fbz + s * FBD / 2], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: '',
  });
  add('flexUtility', {
    room: 'flex-bay', type: 'console', name: 'Modular utility panel',
    params: { width: 1.15, depth: 0.28, height: 1.0, screens: 1, lit: true },
    pos: [fbx + FBW / 2 - 0.18, D2, fbz - 1.45], rotY: -Math.PI / 2, locked: false,
    evidence: 'decision', evidenceRefs: [],
    note: 'Standardized power / data / environmental tie-ins for commercial module changes.',
  });
  add('flexRail', {
    room: 'flex-bay', type: 'rail', name: 'Module mounting rail',
    params: { length: 3.8, height: 0.12, midRail: false },
    pos: [fbx, D2, fbz + FBD / 2 - 0.25], rotY: 0, locked: false,
    evidence: 'decision', evidenceRefs: [], note: 'One visible remnant of the class’s factory modularity.',
  });

  // ---------- distributed service / repair recesses ----------
  add('partsRecessFloor', {
    room: 'work-spine', type: 'floor', name: 'Parts / repair recess deck',
    params: { width: 1.7, depth: 2.0 },
    pos: [OPX + 1.55, D2, 15.4], rotY: 0, locked: true,
    evidence: 'decision', evidenceRefs: [],
    note: 'A local maintenance nook off ordinary working space rather than a remote machine deck.',
  });
  add('partsStorage', {
    room: 'work-spine', type: 'storage', name: 'Parts lockers',
    params: { width: 1.2, height: 1.65, depth: 0.4 },
    pos: [OPX + 2.15, D2, 15.6], rotY: Math.PI / 2, locked: false,
    evidence: 'assumption', evidenceRefs: [], note: 'Frequently used repair stock.',
  });
  add('partsBench', {
    room: 'work-spine', type: 'counter', name: 'Fold-down repair surface',
    params: { width: 1.05, depth: 0.42, height: 0.9, sink: false },
    pos: [OPX + 1.55, D2, 14.7], rotY: 0, locked: false,
    evidence: 'assumption', evidenceRefs: [], note: 'A place to work without blocking the freight lane.',
  });

  add('engAccessFloor', {
    room: 'engineering-access', type: 'floor', name: 'Underdeck engineering access recess',
    params: { width: 1.9, depth: 2.1 },
    pos: [OPX - 1.55, D2, 16.65], rotY: 0, locked: true,
    evidence: 'decision', evidenceRefs: ['eng-belowdeck'],
    note: 'Principal lower-deck engineering access, deliberately recessed so an open hatch and tools do not block cargo movement.',
  });
  add('engAccessHatch', {
    room: 'engineering-access', type: 'step', name: 'Engineering hatch + rungs',
    params: { width: 0.72, rise: 0.24, run: 0.16, steps: 6 },
    pos: [OPX - 1.55, D2 - 1.44, 16.65], rotY: 0, locked: true,
    evidence: 'explicit', evidenceRefs: ['eng-belowdeck'],
    note: 'Rung access down into layered underdeck machinery / crawl geography. Not a public stair.',
  });
  add('engAccessPanel', {
    room: 'engineering-access', type: 'storage', name: 'Local isolation / service panel',
    params: { width: 0.85, height: 1.25, depth: 0.18 },
    pos: [OPX - 2.35, D2, 16.8], rotY: Math.PI / 2, locked: false,
    evidence: 'decision', evidenceRefs: [],
    note: 'Distributed maintenance: local isolation, power, coolant, and service access where the work happens. TWO-PERSON RULE: with the crawl below isolated for live work, the hatch interlock releases from this panel only — one crew below, one standing here, and the one standing here owns the clock. The controls sit low. A twelve-year-old can work them.',
  });

  // ---------- aft freight / service junction ----------
  const AFZ = 20.0;
  add('aftFreightFloor', {
    room: 'aft-freight', type: 'floor', name: 'Aft Freight / Service junction deck',
    params: { width: 3.2, depth: 2.8 },
    pos: [OPX, D2, AFZ], rotY: 0, locked: true,
    evidence: 'decision', evidenceRefs: [],
    note: 'Commercial maneuvering node: work spine forward, freight transfer outboard, main cargo bay aft, and old service geography to port.',
  });
  add('aftFreightCeil', {
    room: 'aft-freight', type: 'ceiling', name: 'Aft Freight / Service overhead',
    params: { width: 3.2, depth: 2.8, height: 2.55 },
    pos: [OPX, D2, AFZ], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: '',
  });

  // ---------- dedicated freight transfer vestibule / cargo lock ----------
  const FTW = 3.4, FTD = 2.8;
  const ftx = OPX + 3.2, ftz = AFZ - 0.4;
  add('freightLockFloor', {
    room: 'freight-lock', type: 'floor', name: 'Freight transfer lock deck',
    params: { width: FTW, depth: FTD },
    pos: [ftx, D2, ftz], rotY: 0, locked: true,
    evidence: 'decision', evidenceRefs: [],
    note: 'Side-loading commercial cargo lock. Major ports can mate cargo infrastructure here; fringe loading can use sleds, tugs, winches, or improvised support. SEAL-TEST CYCLE: during an integrity test both lock doors dog shut for the duration, released from the panel at the freight junction when the cycle completes. With cargo staged, it is a close room to share for the length of a test.',
  });
  add('freightLockCeil', {
    room: 'freight-lock', type: 'ceiling', name: 'Freight transfer lock overhead',
    params: { width: FTW, depth: FTD, height: 2.7 },
    pos: [ftx, D2, ftz], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: '',
  });
  for (const s of [-1, 1]) add(s < 0 ? 'freightLockN' : 'freightLockS', {
    room: 'freight-lock', type: 'wall', name: 'Freight lock wall',
    params: { length: FTW, height: 2.7, thickness: 0.16 },
    pos: [ftx, D2, ftz + s * FTD / 2], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: '',
  });
  add('freightInnerDoor', {
    room: 'freight-lock', type: 'doorway', name: 'Freight lock inner cargo door',
    params: { length: 2.2, height: 2.7, thickness: 0.16, doorWidth: 1.85, doorHeight: 2.35, kind: 'sliding', slideDir: -1, open: 0 },
    pos: [ftx - FTW / 2, D2, ftz], rotY: Math.PI / 2, locked: false,
    evidence: 'decision', evidenceRefs: [], note: 'Opens into the Aft Freight junction rather than directly into one bay.',
  });
  add('freightOuterDoor', {
    room: 'freight-lock', type: 'doorway', name: 'Freight lock outer cargo hatch',
    params: { length: FTD, height: 2.7, thickness: 0.18, doorWidth: 2.15, doorHeight: 2.35, kind: 'sliding', slideDir: 1, open: 0 },
    pos: [ftx + FTW / 2, D2, ftz], rotY: Math.PI / 2, locked: true,
    evidence: 'decision', evidenceRefs: [], note: 'Commercial exterior freight interface. Not a hangar.',
  });
  add('freightGuide', {
    room: 'freight-lock', type: 'rail', name: 'Freight sled alignment guide',
    params: { length: 2.7, height: 0.05, midRail: false },
    pos: [ftx, D2, ftz], rotY: Math.PI / 2, locked: true,
    evidence: 'decision', evidenceRefs: [], note: 'Flush alignment / sled guide through the lock.',
  });

  // ---------- main large cargo / flex bay ----------
  const CBW = 7.0, CBD = 8.0, CBH = 3.2;
  const cbx = OPX, cbz = 25.0;
  add('cargoFloor', {
    room: 'cargo-bay', type: 'floor', name: 'Hold One ("the forward hold") — main cargo / training bay deck',
    params: { width: CBW, depth: CBD },
    pos: [cbx, D2, cbz], rotY: 0, locked: true,
    evidence: 'decision', evidenceRefs: ['forward-hold-route'],
    note: 'Primary large paying-cargo volume — registry designation Hold One, still called "the forward hold" from an earlier deck plan that no longer matches her position (Hold Two now sits forward of her). When empty or lightly loaded, the same clear floor becomes training, projects, and oversized ordinary-life space. Old labels aboard the Huntress are history, not directions.',
  });
  add('cargoCeil', {
    room: 'cargo-bay', type: 'ceiling', name: 'Main cargo / flex bay overhead',
    params: { width: CBW, depth: CBD, height: CBH },
    pos: [cbx, D2, cbz], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: 'Generous clear height for freight and full-length staff work.',
  });
  // aft wall and side walls; forward wall is mostly represented by the freight doorway
  add('cargoWallS', {
    room: 'cargo-bay', type: 'wall', name: 'Main cargo bay aft wall',
    params: { length: CBW, height: CBH, thickness: 0.16 },
    pos: [cbx, D2, cbz + CBD / 2], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: 'Old freight scars, rails, and protective structure remain visible.',
  });
  add('cargoWallE', {
    room: 'cargo-bay', type: 'wall', name: 'Main cargo bay starboard wall',
    params: { length: CBD, height: CBH, thickness: 0.16 },
    pos: [cbx + CBW / 2, D2, cbz], rotY: Math.PI / 2, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: '',
  });
  const cargoPersonnelZ = 24.65;
  const cargoWestNLen = (cargoPersonnelZ - 0.5) - (cbz - CBD / 2);
  const cargoWestSLen = (cbz + CBD / 2) - (cargoPersonnelZ + 0.5);
  add('cargoWallW1', {
    room: 'cargo-bay', type: 'wall', name: 'Main cargo bay port wall (forward)',
    params: { length: cargoWestNLen, height: CBH, thickness: 0.16 },
    pos: [cbx - CBW / 2, D2, cbz - CBD / 2 + cargoWestNLen / 2], rotY: Math.PI / 2, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: 'Old freight structure along the lower-aft service side.',
  });
  add('cargoWallW2', {
    room: 'cargo-bay', type: 'wall', name: 'Main cargo bay port wall (aft)',
    params: { length: cargoWestSLen, height: CBH, thickness: 0.16 },
    pos: [cbx - CBW / 2, D2, cbz + CBD / 2 - cargoWestSLen / 2], rotY: Math.PI / 2, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: 'Old freight structure along the lower-aft service side.',
  });
  const cargoDoorHalf = 1.4;
  add('cargoWallN1', {
    room: 'cargo-bay', type: 'wall', name: 'Main cargo bay forward wall (port)',
    params: { length: CBW / 2 - cargoDoorHalf, height: CBH, thickness: 0.16 },
    pos: [cbx - (cargoDoorHalf + (CBW / 2 - cargoDoorHalf) / 2), D2, cbz - CBD / 2], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: 'Forward freight wall flanking the large bay door.',
  });
  add('cargoWallN2', {
    room: 'cargo-bay', type: 'wall', name: 'Main cargo bay forward wall (starboard)',
    params: { length: CBW / 2 - cargoDoorHalf, height: CBH, thickness: 0.16 },
    pos: [cbx + (cargoDoorHalf + (CBW / 2 - cargoDoorHalf) / 2), D2, cbz - CBD / 2], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: 'Forward freight wall flanking the large bay door.',
  });
  add('cargoFreightDoor', {
    room: 'cargo-bay', type: 'doorway', name: 'Main bay freight door',
    params: { length: 2.8, height: CBH, thickness: 0.16, doorWidth: 2.4, doorHeight: 2.6, kind: 'sliding', slideDir: 1, open: 0 },
    pos: [cbx, D2, cbz - CBD / 2], rotY: 0, locked: false,
    evidence: 'decision', evidenceRefs: [], note: 'Large freight-facing access from the Aft Freight node.',
  });
  add('cargoPersonnelDoor', {
    room: 'cargo-bay', type: 'doorway', name: 'Main bay personnel / service hatch',
    params: { length: 1.0, height: 2.2, thickness: 0.12, doorWidth: 0.75, doorHeight: 1.95, kind: 'sliding', slideDir: -1, open: 0 },
    pos: [cbx - CBW / 2, D2, cargoPersonnelZ], rotY: Math.PI / 2, locked: false,
    evidence: 'decision', evidenceRefs: [], note: 'Quieter access from the lower-aft service route; training use does not require walking through the freight interface.',
  });
  for (const xoff of [-2.4, 0, 2.4]) add('cargoTie' + String(xoff).replace('-', 'm').replace('.', '_'), {
    room: 'cargo-bay', type: 'rail', name: 'Recessed cargo tie / floor track',
    params: { length: 5.8, height: 0.045, midRail: false },
    pos: [cbx + xoff, D2, cbz], rotY: Math.PI / 2, locked: true,
    evidence: 'decision', evidenceRefs: [], note: 'Freight hardware remains visible when the bay is being used for training.',
  });

  // ---------- lower aft spine: older service geography ----------
  const LASX = cbx - CBW / 2 - 0.575;
  const LASZ0 = 20.0, LASZ1 = 29.4;
  add('lowerAftFloor', {
    room: 'lower-aft-spine', type: 'floor', name: 'Lower aft spine deck',
    params: { width: 1.15, depth: LASZ1 - LASZ0 },
    pos: [LASX, D2, (LASZ0 + LASZ1) / 2], rotY: 0, locked: true,
    evidence: 'decision', evidenceRefs: [],
    note: 'Older service geography around the rear commercial bay and machinery. It is not a synonym for the primary work spine.',
  });
  add('lowerAftCeil', {
    room: 'lower-aft-spine', type: 'ceiling', name: 'Lower aft spine overhead',
    params: { width: 1.15, depth: LASZ1 - LASZ0, height: 2.0 },
    pos: [LASX, D2, (LASZ0 + LASZ1) / 2], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: 'Lower, older, more manual service fabric.',
  });

  const lowerAftW = LASX - 1.15 / 2;
  const lowerAftE = LASX + 1.15 / 2;
  add('lowerAftWallW1', {
    room: 'lower-aft-spine', type: 'wall', name: 'Lower aft spine port bulkhead (forward)',
    params: { length: 5.3, height: 2.0, thickness: 0.1 },
    pos: [lowerAftW, D2, (20.0 + 25.3) / 2], rotY: Math.PI / 2, locked: true,
    evidence: 'assumption', evidenceRefs: [],
    note: 'Old service bulkhead; manual and refitted rather than polished commercial finish.',
  });
  add('lowerAftWallW2', {
    room: 'lower-aft-spine', type: 'wall', name: 'Lower aft spine port bulkhead (aft)',
    params: { length: 3.2, height: 2.0, thickness: 0.1 },
    pos: [lowerAftW, D2, (26.2 + 29.4) / 2], rotY: Math.PI / 2, locked: true,
    evidence: 'assumption', evidenceRefs: [],
    note: 'Gap between wall segments is Nova’s manual equipment-crawl hatch.',
  });
  add('lowerAftEnd', {
    room: 'lower-aft-spine', type: 'wall', name: 'Lower aft spine end bulkhead',
    params: { length: 1.15, height: 2.0, thickness: 0.1 },
    pos: [LASX, D2, LASZ1], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [],
    note: 'The formal passage ends here; deeper machinery access continues through hatches / crawls rather than another public corridor.',
  });

  add('lowerAftPanel', {
    room: 'lower-aft-spine', type: 'storage', name: 'Legacy service panel',
    params: { width: 0.85, height: 1.25, depth: 0.15 },
    pos: [LASX - 0.45, D2, 22.8], rotY: Math.PI / 2, locked: false,
    evidence: 'assumption', evidenceRefs: [], note: 'One of many local maintenance points threaded through the ship.',
  });

  // Nova's draft-text signal-listening nest: explicitly port-side, lower aft spine.
  const NCW = 1.8, NCD = 1.45;
  const ncx = LASX - 0.575 - NCW / 2, ncz = 25.75;
  add('novaCrawlFloor', {
    room: 'equipment-crawl', type: 'floor', name: 'Port-side equipment crawl deck',
    params: { width: NCW, depth: NCD },
    pos: [ncx, D2, ncz], rotY: 0, locked: true,
    evidence: 'explicit', evidenceRefs: [],
    note: 'DRAFT TEXT EVIDENCE: lower-aft port-side equipment crawl. Two steps in, one sideways; later appropriated by Nova as a listening nest.',
  });
  add('novaCrawlCeil', {
    room: 'equipment-crawl', type: 'ceiling', name: 'Equipment crawl overhead',
    params: { width: NCW, depth: NCD, height: 1.65 },
    pos: [ncx, D2, ncz], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: 'Not a proper room; low service-pocket scale.',
  });
  add('novaCrawlHatch', {
    room: 'equipment-crawl', type: 'doorway', name: 'Equipment crawl hatch',
    params: { length: 0.9, height: 1.75, thickness: 0.1, doorWidth: 0.65, doorHeight: 1.55, kind: 'hinged', hinge: 'left', swing: 'out', open: 0 },
    pos: [LASX - 0.575, D2, ncz], rotY: Math.PI / 2, locked: false,
    evidence: 'explicit', evidenceRefs: [],
    note: 'Manual hatch. Closing it with two occupants is possible but awkward.',
  });
  add('novaCrawlDesk', {
    room: 'equipment-crawl', type: 'counter', name: 'Repurposed cargo-panel desk',
    params: { width: 0.9, depth: 0.35, height: 0.64, sink: false },
    pos: [ncx - 0.3, D2, ncz - 0.35], rotY: 0, locked: false,
    evidence: 'explicit', evidenceRefs: [], note: 'Mismatched receivers, cable loops, slates, and improvised listening equipment live here in the current Book 3 draft.',
  });
  add('novaCrawlPad', {
    room: 'equipment-crawl', type: 'bench', name: 'Folded insulation pad',
    params: { width: 0.8, height: 0.08, depth: 0.55 },
    pos: [ncx + 0.28, D2, ncz + 0.28], rotY: 0, locked: false,
    evidence: 'explicit', evidenceRefs: [], note: 'Nova sits cross-legged here to listen.',
  });

  add('aftEngHatch', {
    room: 'lower-aft-spine', type: 'storage', name: 'Aft machinery access hatch',
    params: { width: 0.9, height: 1.2, depth: 0.18 },
    pos: [LASX + 0.45, D2, 28.4], rotY: -Math.PI / 2, locked: false,
    evidence: 'decision', evidenceRefs: [],
    note: 'Secondary access into deeper machinery / crawl geography. Not every service route connects through.',
  });

  // ================= HULL MASSING & FRAME-ERA SYSTEMS =================
  // The honest masses around the walkable interior: drive section, tankage,
  // gear bays, the Deck Three ventral layer, the ventral chute trunk — plus
  // the utility trunks the prose can hear and the older unmapped harness.
  // Massing volumes are translucent, non-colliding, and shown only when the
  // Hull overlay is on. Working geometry per the vertical-hull study; the
  // exterior remains OPEN. Everything shifts with the bridge-door ruling.
  const HX = cx - 1.5;                    // hull anchor follows the interior
  const hm = (key, name, x, baseY, z, w, d, h, note, extra = {}) => add(key, {
    room: 'hull', type: 'massing', name,
    params: { width: w, depth: d, height: h, lift: 0, ...extra },
    pos: [x + HX, baseY, z], rotY: 0, locked: true,
    evidence: 'decision', evidenceRefs: [],
    note,
  });
  hm('mhNose', 'Nose — sensor & avionics bay', -1.0, -0.6, -3.3, 3.6, 1.85, 2.6,
    'Forward of the bridge glass: sensors, avionics, docking hardware in the narrow forward quarters.');
  hm('mhDorsal', 'Dorsal spine girder', -1.0, 2.35, 14.0, 3.4, 30, 0.9,
    'The long back: the primary longitudinal structure the whole ship hangs from. Frame rings tie into it.');
  hm('mhTankW1', 'Water cells (forward band)', 0.8, -5.3, 8.0, 3.4, 6, 1.9,
    'Multiple water cells rather than one great tank — main reclaimed-water mass low and inboard (mass study).');
  hm('mhTankW2', 'Water cells (aft band)', 0.8, -5.3, 16.0, 3.4, 6, 1.9,
    'Second inboard water band. Domestic day-buffers live nearer the wet-service stack.');
  hm('mhDeck3', 'Deck Three — ventral service / reserve layer', -4.4, -5.5, 12.5, 6.4, 15, 2.2,
    'The partial third level, down: deep stores, tank access, heavy-service connections, old freight infrastructure, pieces of the power/thermal backbone. Walkable in some regions, crawl and tank volume in others. The cold unused storage room lost its environmental loop in a refit while the old power route stayed uncomfortably close. Footprint OPEN.');
  hm('mhGearNose', 'Nose gear bay', -2.6, -5.3, 0.2, 2.2, 2.6, 1.9,
    'Retractable nose gear. She lands on her belly structure — prepared pads and rough commercial ground alike.');
  hm('mhGearPort', 'Main gear bay (port)', -9.2, -5.6, 17.5, 2.2, 3.2, 2.2,
    'Port main gear. On the ground the Huntress settles into a low, stable crouch.');
  hm('mhGearStbd', 'Main gear bay (starboard)', 3.4, -5.6, 17.5, 2.2, 3.2, 2.2,
    'Starboard main gear.');
  hm('mhChute', 'Ventral cargo chute trunk', 0.6, -5.4, 19.6, 2.6, 2.2, 2.3,
    'The belly drop path under the freight lock: sled-aligned ground loading, and the "low clunk from the underdeck" of a cargo sled meeting its chute.');
  hm('mhDrive', 'Drive core & power plant', -2.2, -3.4, 33.4, 5.4, 7.2, 5.2,
    'The dense aft third begins here: compact high-energy feedstock plant and drive core. The walk-in engine bay forward of it is a frequent-service room, not the whole plant.');
  hm('mhRmTankP', 'Reaction-mass tankage (port)', -7.2, -4.2, 32.5, 3.6, 6, 4.2,
    'Split reaction-mass tankage, aft and inboard. Loading here moves the center of mass — B.O.B. cares where you put things.');
  hm('mhRmTankS', 'Reaction-mass tankage (starboard)', 2.8, -4.2, 32.5, 3.6, 6, 4.2,
    'Starboard reaction-mass tankage.');
  hm('mhAccum', 'Thermal accumulator / phase-change buffer', -2.2, 1.9, 34.5, 3.0, 4.0, 1.6,
    'Short high-power events bank heat here as "thermal debt", shed later through the radiator vanes on a long drift.');
  hm('mhVaneP', 'Aft radiator vane (port)', -5.2, 2.0, 38.2, 0.3, 3.6, 3.4,
    'High-temperature radiator vane — retractable/shutterable for docking, debris, and rough work.');
  hm('mhVaneC', 'Aft radiator vane (center)', -2.2, 2.0, 38.2, 0.3, 3.6, 3.4,
    'Center radiator vane, rooted to the dorsal girder.');
  hm('mhVaneS', 'Aft radiator vane (starboard)', 0.8, 2.0, 38.2, 0.3, 3.6, 3.4,
    'Starboard radiator vane.');
  hm('mhNozzle', 'Drive nozzle assembly', -2.2, -2.4, 38.6, 3.6, 3.4, 3.6,
    'The stern: nozzle and thrust structure. The effective thrust line follows the loaded center-of-mass corridor, not the bridge centerline.');
  hm('mhVoidP2', 'Unaccounted volume — "Pocket Two?"', -3.4, 0, 5.8, 1.0, 2.0, 2.05,
    'The schematic says a service pocket exists behind the medbay’s port bulkhead. Walking the deck finds a doubled bulkhead and about two cubic meters that cannot be reached from anywhere. Pocket One was absorbed for a mundane reason; this absence is genuinely suspicious.', { tint: 'anomaly' });

  // ---------- the systems the prose can hear ----------
  add('cdMidlineBus', {
    room: 'hull', type: 'conduit', name: 'Midline power bus',
    params: { length: 10.4, lines: 3, gauge: 0.07, mountHeight: 2.0, era: 'modern' },
    pos: [-0.5 + HX, 0, 7.5], rotY: 0, locked: true,
    evidence: 'explicit', evidenceRefs: ['sys-midline-bus'],
    note: '"Midline bus settled." The main power spine along the overheads — its note changes as segments load and shed.',
  });
  add('cdPortDuct', {
    room: 'hull', type: 'conduit', name: 'Port air trunk (the duct seam)',
    params: { length: 9.4, lines: 1, gauge: 0.24, mountHeight: 1.92, era: 'modern', branch: 'domestic' },
    pos: [-4.5 + HX, 0, 9.1], rotY: 0, locked: true,
    evidence: 'explicit', evidenceRefs: ['sys-port-duct'],
    note: '"Port duct seam whispered its lie." The port-side air trunk; its seam gasket has never quite told the truth.',
  });
  add('cdCoolLower', {
    room: 'lower-corridor', type: 'conduit', name: 'Coolant lines (residential approach)',
    params: { length: 6.0, lines: 2, gauge: 0.09, mountHeight: 1.95, era: 'modern' },
    pos: [-6.55 + HX, DECK2Y, 9.0], rotY: 0, locked: true,
    evidence: 'explicit', evidenceRefs: ['lower-corridor'],
    note: '"Lower corridor. Coolant lines, forgotten tags." Exposed runs along the approach overhead — Cabin Four’s bulkhead carries their pulse.',
  });
  add('aftPump', {
    room: 'lower-aft-spine', type: 'crate', name: 'Aft transfer pump',
    params: { width: 0.55, height: 0.75, depth: 0.5 },
    pos: [LASX + 0.25, D2, 21.9], rotY: 0, locked: false,
    evidence: 'explicit', evidenceRefs: ['sys-aft-pump'],
    note: '"Aft pump ran two beats late." The coolant/water transfer pump in the old aft service fabric — its lag is the ship’s heartbeat murmur.',
  });

  // ---------- the older harness (not on B.O.B.'s schematics) ----------
  const oldNote = 'Dark, verdigrised conduit in pre-refit lay. It appears on no schematic B.O.B. holds, and it is older than every legible refit era. It does not seem to do anything. It is not disconnected.';
  add('oldHz1', {
    room: 'hull', type: 'conduit', name: 'Unmapped harness (bridge run)',
    params: { length: 4.2, lines: 2, gauge: 0.05, mountHeight: 0.1, era: 'ancient' },
    pos: [0.5 + HX, 0, 0.2], rotY: 0, locked: true,
    evidence: 'decision', evidenceRefs: [], note: oldNote + ' This run passes beneath the helm console’s access panel.',
  });
  add('oldHz2', {
    room: 'spine', type: 'conduit', name: 'Unmapped harness (spine run)',
    params: { length: 6.0, lines: 2, gauge: 0.05, mountHeight: 0.14, era: 'ancient' },
    pos: [3.35 + HX, 0, 7.2], rotY: 0, locked: true,
    evidence: 'decision', evidenceRefs: [], note: oldNote,
  });
  add('oldHz3', {
    room: 'lower-aft-spine', type: 'conduit', name: 'Unmapped harness (lower aft run)',
    params: { length: 8.0, lines: 2, gauge: 0.05, mountHeight: 0.12, era: 'ancient' },
    pos: [LASX - 0.42, D2, 24.5], rotY: 0, locked: true,
    evidence: 'decision', evidenceRefs: [], note: oldNote + ' Nova’s crawl sits against this run; her receivers face it.',
  });

  // ================= AIR SYSTEM (the ducting pass) =================
  // Four loops, per canon: a DOMESTIC loop on the main deck (bridge,
  // corridor, galley, hygiene); a HABITATION loop on the lower residential
  // side ("Crew quarters loop at minimal" — it has its own loop to downshift);
  // an OPERATIONS loop through the work deck and bays; and the medbay's own
  // small filtered loop, isolated from everything. The engine bay breathes
  // through its own thermal ventilation and is on no comfort loop; the
  // airlock has its cycle system; pocket three and the dome are poorly
  // served — old spaces off the primary pathing. Duct runs are real routed
  // geometry: the acoustics duct channel derives its branches from these
  // objects, so moving a duct changes who overhears whom.
  const duct = (key, name, branch, x, deckY, z, rotY, length, gauge, mount, note = '') => add(key, {
    room: 'hull', type: 'conduit', name,
    params: { length, lines: 1, gauge, mountHeight: mount, era: 'modern', branch },
    pos: [x + HX, deckY, z], rotY, locked: true,
    evidence: 'decision', evidenceRefs: branch === 'habitation' ? ['quarters-loop'] : [],
    note: note || `${branch} air loop.`,
  });
  // domestic loop (the port air trunk is its supply spine — tagged below)
  duct('ductDomCorridor', 'Domestic loop — corridor header', 'domestic', -1.5, 0, 4.5, Math.PI / 2, 6.0, 0.2, 1.98,
    'Domestic supply header crossing to the forward run, clear of the medbay bulkhead.');
  // (anchored to the bridge itself, which never moves with the door ruling)
  duct('ductDomBridge', 'Domestic loop — bridge run', 'domestic', 1.2 - HX, 0, 0.8, 0, 2.8, 0.16, 2.05,
    'The bridge breathes off the domestic loop — which is why galley air (and galley sounds) reach the cradle when doors stand open.');
  duct('ductDomGalley', 'Domestic loop — galley run', 'domestic', -2.65, 0, 10.2, Math.PI / 2, 3.7, 0.2, 1.98);
  duct('ductDomToilet', 'Domestic loop — toilet extract', 'domestic', -3.5, 0, 11.9, Math.PI / 2, 2.0, 0.14, 1.95);
  duct('ductDomShower', 'Domestic loop — shower extract', 'domestic', -3.75, 0, 13.0, Math.PI / 2, 1.5, 0.14, 1.95);
  // habitation loop (lower residential; its own loop, canon)
  duct('ductHabTrunk', 'Habitation loop — approach trunk', 'habitation', -6.0, D2, 8.75, 0, 7.7, 0.22, 1.95,
    'The crew-quarters loop trunk. Nav sits on this loop too — the plotting room breathes with the cabins.');
  duct('ductHabCore', 'Habitation loop — wet-core tie', 'habitation', -5.2, D2, 12.45, Math.PI / 2, 1.6, 0.22, 1.95,
    'The loop plant lives in the wet-service core; this is its supply tie.');
  duct('ductHabWest', 'Habitation loop — west cabin header', 'habitation', -7.9, D2, 9.0, 0, 4.4, 0.16, 1.8,
    'Serves Cabins One and Three. At night in drift, the header carries more than air.');
  duct('ductHabEast', 'Habitation loop — east cabin header', 'habitation', -4.0, D2, 10.1, 0, 4.6, 0.16, 1.8,
    'Serves Cabins Two and Four, running beside the old cableway.');
  duct('ductHabDogleg', 'Habitation loop — dogleg crossing', 'habitation', -8.0, D2, 12.45, Math.PI / 2, 2.6, 0.18, 1.9);
  duct('ductHabElbow', 'Habitation loop — quiet-run elbow', 'habitation', -9.4, D2, 12.9, 0, 1.2, 0.18, 1.85);
  duct('ductHabQuiet', 'Habitation loop — quiet-run header', 'habitation', -9.4, D2, 15.4, 0, 4.0, 0.16, 1.8,
    'Serves Cabins Five and Six. The pump noise of the wet core rides this branch as masking — part of why the quiet run is quiet.');
  duct('ductHabGarden', 'Habitation loop — stores spur', 'habitation', -6.6, D2, 14.2, 0, 1.6, 0.14, 1.9,
    'A generous spur for a stores room — sized, perhaps, for the day the room grows things.');
  // operations loop (work deck and bays)
  duct('ductOpsTrunk', 'Operations loop — work-spine trunk', 'ops', -2.6, D2, 11.8, 0, 14.4, 0.26, 1.95,
    'The big commercial air run, Lower Operations to the aft freight node.');
  duct('ductOpsSkiff', 'Operations loop — skiff bay spur', 'ops', -3.6, D2, 2.6, 0, 2.4, 0.18, 1.95);
  duct('ductOpsHead', 'Operations loop — work-head spur', 'ops', -1.5, D2, 6.75, Math.PI / 2, 1.8, 0.14, 1.95);
  duct('ductOpsFlex', 'Operations loop — Hold Two spur', 'ops', -0.9, D2, 10.55, Math.PI / 2, 2.4, 0.18, 1.98);
  duct('ductOpsCargo', 'Operations loop — Hold One run', 'ops', -2.6, D2, 22.5, 0, 5.0, 0.22, 2.1);
  duct('ductOpsLock', 'Operations loop — freight lock spur', 'ops', 0.3, D2, 19.8, Math.PI / 2, 2.2, 0.16, 2.1);
  duct('ductOpsCrawl', 'Operations loop — crawl tap (Iri’s)', 'ops', -7.9, D2, 25.75, Math.PI / 2, 1.6, 0.1, 1.35,
    'The small filtered tap Iri ran when she made Nova’s nest safe: support, filtering, thermal management, proper power routing.');
  // medbay isolated loop
  duct('ductMedLoop', 'Medbay filtered loop', 'med-iso', -1.5, 0, 5.8, Math.PI / 2, 1.4, 0.14, 1.95,
    'A closed, filtered medical loop. It shares air — and sound — with nothing.');
  // plant / distribution units
  add('ahuDomestic', {
    room: 'domestic-service', type: 'shelf', name: 'Domestic air-handling unit',
    params: { width: 1.2, depth: 0.42, mountHeight: 1.78, tins: 0 },
    pos: [-4.84 + HX, 0, 9.9], rotY: -Math.PI / 2, locked: false,
    evidence: 'decision', evidenceRefs: [],
    note: 'Overhead AHU in the domestic service passage — filters, fans, and the click the galley heater makes when its cycle ends.',
  });
  add('ahuHabitation', {
    room: 'domestic-stores', type: 'shelf', name: 'Habitation-loop filter / distribution unit',
    params: { width: 1.1, depth: 0.45, mountHeight: 1.78, tins: 0 },
    pos: [-6.6 + HX, D2, 15.3], rotY: Math.PI, locked: false,
    evidence: 'explicit', evidenceRefs: ['quarters-loop'],
    note: '"Crew quarters loop at minimal." The residential loop’s filter and distribution stage; the plant proper sits in the wet-service core next door.',
  });
  add('ahuOps', {
    room: 'aft-freight', type: 'shelf', name: 'Operations air-handling unit',
    params: { width: 1.2, depth: 0.45, mountHeight: 1.78, tins: 0 },
    pos: [-4.0 + HX, D2, 20.9], rotY: Math.PI / 2, locked: false,
    evidence: 'decision', evidenceRefs: [],
    note: 'Overhead AHU at the freight junction, where the commercial loop’s air is dustiest and its filters earn their keep.',
  });
  add('medAirUnit', {
    room: 'medbay', type: 'shelf', name: 'Medbay filter unit',
    params: { width: 0.5, depth: 0.3, mountHeight: 1.79, tins: 0 },
    pos: [-2.0 + HX, 0, 6.63], rotY: Math.PI, locked: false,
    evidence: 'decision', evidenceRefs: ['med-reach'],
    note: 'The medbay’s own small filtered loop unit — recovery air, and the room’s acoustic isolation. A filter swap runs a purge cycle, and the hatch holds until it completes: the one room aboard where a locked-in conversation is also a soundproof one.',
  });
  // the secondary vent grid — and what runs behind it
  add('ventGridPanel', {
    room: 'cargo-bay', type: 'storage', name: 'Secondary vent grid',
    params: { width: 1.3, height: 1.5, depth: 0.08 },
    pos: [0.84 + HX, D2, 24.0], rotY: Math.PI / 2, locked: false,
    evidence: 'explicit', evidenceRefs: ['vent-grid'],
    note: 'The secondary vent grid on Hold One’s starboard wall. Something runs behind it that B.O.B. never mapped.',
  });
  hm('mhUnlisted', 'Unlisted service corridor (unmapped)', 1.4, -3.0, 25.15, 0.6, 7.7, 2.0,
    'The narrow passage behind the secondary vent grid — too narrow for B.O.B.’s standard access routines, absent from every schematic. The underfloor cache is somewhere along it. Reserved as massing; walkable modeling is future work.', { tint: 'anomaly' });

  // ---------- pocket archaeology ----------
  add('p1Panel', {
    room: 'hygiene', type: 'storage', name: 'Blanked panel — painted-over stencil "P-1"',
    params: { width: 0.8, height: 1.1, depth: 0.08 },
    pos: [-3.4 + HX, 0, 6.92], rotY: 0, locked: false,
    evidence: 'decision', evidenceRefs: [],
    note: 'Pocket One, absorbed: when the domestic wet zone was partitioned in, the old service pocket behind this wall was consumed. The stencil is half under paint. Mundane refit archaeology — unlike Pocket Two.',
  });

  // ================= SERVICE POINTS, RIBS & STOLEN CORNERS =================
  // Distributed maintenance made physical: opened-and-reclosed panels
  // wherever the routed runs detour through lived space ("Important
  // equipment is reachable. Panels can be opened."). Exposed ring-frame
  // ribs break the long sightlines in working corridors. And three
  // corners of the ship earn their second purpose: not private — private
  // ENOUGH for three minutes.
  const svc = (key, room, name, x, deckY, z, rotY, w, h, d, note, refs = []) => add(key, {
    room, type: 'storage', name,
    params: { width: w, height: h, depth: d },
    pos: [x + HX, deckY, z], rotY, locked: false,
    evidence: 'decision', evidenceRefs: refs, note,
  });
  add('svcKneehole', {
    // anchored to the bridge, which never moves with the door ruling
    room: 'bridge', type: 'storage', name: 'Helm kneehole access panel (open)',
    params: { width: 0.7, height: 0.45, depth: 0.05 },
    pos: [0.1, 0, -1.11], rotY: 0, locked: false,
    evidence: 'explicit', evidenceRefs: ['console-kneehole'],
    note: 'The panel beneath the helm console, more often off than on — wire casing peeled back with the confidence of someone who stopped asking permission. The old harness passes right beneath it.',
  });
  svc('svcCorMidline', 'corridor', 'Corridor service panel — power distribution', 1.0, 0, 2.75, Math.PI / 2, 0.6, 1.0, 0.09,
    'A distribution pull-panel where the midline bus taps down into the forward run. Opened and reclosed by three generations of owners; the fasteners no longer match.');
  svc('svcCorBend', 'corridor', 'Coolant riser access (elbow corner)', 2.0, 0, 5.32, Math.PI / 2, 0.5, 1.3, 0.1,
    'THE Presence-01 site (author ruling): Iri waist-deep in the cooling manifold, half the paneling stripped and stacked by her knee like ribs laid open — in the hallway, because that is where the run detours around the offset. Maintenance erupting into lived space is not an accident aboard this ship; it is the architecture.', ['eng-manifold']);
  svc('svcGalleyHeater', 'galley', 'Galley heater service panel', 0.84, 0, 8.35, -Math.PI / 2, 0.7, 1.2, 0.08,
    'The heater’s working guts, one panel deep into a lived-in room — the click at the end of its cycle is audible belowdeck through the frame.');
  svc('svcLowerCool', 'residential', 'Coolant valve set (residential approach)', -6.73, DECK2Y, 6.3, Math.PI / 2, 0.6, 1.1, 0.09,
    '"Coolant lines, forgotten tags." The tags hang here, on a valve set the residential run was never supposed to need — a refit rerouted the lines through habitation and nobody rerouted them back.', ['lower-corridor']);
  svc('svcOpsTrunk', 'work-spine', 'Work-spine service panel', -1.92, DECK2Y, 8.6, -Math.PI / 2, 0.7, 1.2, 0.09,
    'Air-trunk and power access on the commercial run, placed where a cart can stand beside open paneling without blocking the spine.');
  svc('svcOpsLanding', 'operations', 'Lower Operations junction panel', -4.04, DECK2Y, 4.4, Math.PI / 2, 0.8, 1.3, 0.1,
    'Where the operations loop, the stair chase, and the bay circuits meet — the busiest junction box on the lower deck.');
  svc('svcQuietJunction', 'residential', 'Quiet-run junction box', -7.67, DECK2Y, 13.55, -Math.PI / 2, 0.5, 0.9, 0.09,
    'A small junction on the quiet run’s east wall. Its indicator blinks once when the habitation loop cycles — the cabins’ own heartbeat.');
  svc('svcHoldOne', 'cargo-bay', 'Old freight-handling junction (Hold One)', -4.55, DECK2Y, 21.12, 0, 0.8, 1.4, 0.08,
    'Freight-era power and control junction from the hold’s cargo days — kept live because the tie-down tracks still draw from it.');
  add('cab3JunctionBox', {
    room: 'cabin', type: 'shelf', name: 'Junction box (Cabin Three)',
    params: { width: 0.35, depth: 0.22, mountHeight: 1.5, tins: 0 },
    pos: [-7.4 + HX, DECK2Y, 9.42], rotY: 0, locked: false,
    evidence: 'inference', evidenceRefs: ['cabin-row', 'sys-midline-bus'],
    note: 'The box behind Cabin Three’s wall panel that clicks whenever the midline bus settles. Maddening, unless you love the ship’s voice.',
  });
  svc('svcDoglegManifold', 'residential', 'Habitation-loop isolation panel (dogleg)', -5.72, DECK2Y, 12.6, Math.PI / 2, 0.7, 1.25, 0.1,
    'THE two-person-rule panel: when the wet-service core is opened for work, the loop isolates from here, and the core hatch releases from here — from OUTSIDE, when the person at this panel confirms the reseat. Its controls sit low enough for a twelve-year-old to work them. Nobody thought about that when they mounted it. Somebody noticed.', ['quarters-loop']);
  svc('freightLockPanel', 'aft-freight', 'Freight lock seal-test panel', -3.0, DECK2Y, 18.68, 0, 0.55, 1.15, 0.12,
    'Runs the lock’s seal-integrity cycle: both lock doors dog shut for the duration of the test, and this panel — outside the lock — releases them when the cycle completes.');
  // the support rail and its too-deep bracket (VH1_B3_02)
  add('spnSupportRail', {
    room: 'spine', type: 'rail', name: 'Spine support rail',
    params: { length: 1.6, height: 0.95, midRail: false },
    pos: [3.32 + HX, 0, 6.4], rotY: Math.PI / 2, locked: false,
    evidence: 'explicit', evidenceRefs: ['spine-support-rail'],
    note: 'The support rail along the spine wall — a handhold in the narrow dark, and Quenby’s old lean spot two turns from anywhere.',
  });
  svc('svcSpineBracket', 'spine', 'Recessed equipment bracket (behind the rail line)', 3.31, 0, 7.7, Math.PI / 2, 0.6, 0.9, 0.1,
    '"The access angle forced her elbow high. The lower bracket sat too deep behind the support rail." Refit archaeology: the rail came later than the bracket, and no one has ever moved either.', ['spine-support-rail']);
  // exposed ring-frame ribs: the frame grid, felt in the corridors
  const rib = (key, room, x, deckY, z, note) => add(key, {
    room, type: 'strut', name: 'Exposed ring-frame rib',
    params: { width: 0.24, height: 2.05, depth: 0.2 },
    pos: [x + HX, deckY, z], rotY: 0, locked: true,
    evidence: 'decision', evidenceRefs: [],
    note: note || 'A ring frame the corridor lining was never rebuilt to hide. Long halls aboard the Huntress are never one straight sightline — the structure keeps interrupting.',
  });
  rib('ribCorAft', 'corridor', 0.78, 0, 6.55);
  rib('ribSpine1', 'work-spine', -3.2, DECK2Y, 9.0);
  rib('ribSpine2', 'work-spine', -3.2, DECK2Y, 14.6);
  rib('ribApproach', 'residential', -6.66, DECK2Y, 6.9,
    'The rib you learn to angle your shoulder past on the way to your own door. It breaks the corridor’s sightline at chest height — you hear someone on the approach before you see them.');
  // the stolen corners: handholds where three minutes happen
  add('nookElbowRail', {
    room: 'corridor', type: 'rail', name: 'Grab rail (elbow blind corner)',
    params: { length: 0.5, height: 1.02, midRail: false },
    pos: [1.55 + HX, 0, 5.52], rotY: 0, locked: false,
    evidence: 'decision', evidenceRefs: ['med-corridor'],
    note: 'The offset’s outside corner: invisible from the galley, the medbay, and the whole aft run — only the forward corridor can see in, and boots on the deck give ten seconds’ warning. Not private. Private enough.',
  });
  add('nookDoglegRail', {
    room: 'residential', type: 'rail', name: 'Grab rail (dogleg, warm wall)',
    params: { length: 0.6, height: 1.02, midRail: false },
    pos: [-8.5 + HX, DECK2Y, 11.93], rotY: 0, locked: false,
    evidence: 'decision', evidenceRefs: ['quarters-loop'],
    note: 'The dogleg’s north wall, warm off the wet-service core, pump-masked, sight-broken from the approach and the work deck both. Only the quiet run can see in — and the quiet run is family. The ship’s best three minutes.',
  });

  // ================= SALVAGE & STOWAGE (the mudroom pass) =================
  // The Huntress converts like a working RV: home above, job below, and a
  // ritual seam between them. THE INTAKE RULE (canon): salvage comes in
  // LOW — the skiff bay and freight lock are the mudroom; the personnel
  // airlock is a people door, not a parts door. Suited crew come in low
  // too: post-EVA decon is a two-person procedure (nobody can reach their
  // own back seals), and after a dirty return the bay runs a particulate
  // scrub with the hatch held — the most routine lock-in aboard, earned
  // at the end of every exterior job.
  add('suitRack', {
    room: 'skiffbay', type: 'storage', name: 'EVA suit rack — two heavy, one light',
    params: { width: 1.3, height: 1.9, depth: 0.45 },
    pos: [-4.85 + HX, D2, -0.6], rotY: Math.PI / 2, locked: false,
    evidence: 'decision', evidenceRefs: ['alk-kit-locker'],
    note: 'Two heavy work suits and one light one, racked by size. A family portrait in equipment. Suit checks are buddy checks; the rack faces the bench for a reason.',
  });
  add('svcScrub', {
    room: 'skiffbay', type: 'counter', name: 'Wash-down / decon point',
    params: { width: 1.0, depth: 0.5, height: 0.9, sink: true },
    pos: [-1.1 + HX, D2, -1.85], rotY: 0, locked: false,
    evidence: 'decision', evidenceRefs: ['bay-palm-hatch'],
    note: 'Grit, coolant film, and vacuum-baked dust come off here — off the parts, and off the people. Helmet seals get inspected wet, close, and by someone else’s hands.',
  });
  add('buddyBench', {
    room: 'skiffbay', type: 'bench', name: 'Suit-up bench',
    params: { width: 1.0, height: 0.42, depth: 0.4 },
    pos: [-4.78 + HX, D2, 0.95], rotY: Math.PI / 2, locked: false,
    evidence: 'decision', evidenceRefs: ['alk-side-rail'],
    note: '"Sit still — seals." Boots, cuffs, and back closures are two-person work in both directions. The bench seats two exactly, which is the number the procedure requires and the number the procedure excuses.',
  });
  add('hoistRailBay1', {
    room: 'skiffbay', type: 'conduit', name: 'Overhead hoist rail (bay run)',
    params: { length: 4.4, lines: 1, gauge: 0.16, mountHeight: 2.3, era: 'modern' },
    pos: [-2.5 + HX, D2, 0.35], rotY: Math.PI / 2, locked: true,
    evidence: 'decision', evidenceRefs: ['loadout-grid'],
    note: 'Trolley hoist from the launch aperture across the bay — awkward masses come inboard on the rail, one crew steadying, one driving. Two-person work by design.',
  });
  add('hoistRailBay2', {
    room: 'skiffbay', type: 'conduit', name: 'Overhead hoist rail (hatch spur)',
    params: { length: 2.0, lines: 1, gauge: 0.16, mountHeight: 2.3, era: 'modern' },
    pos: [-2.6 + HX, D2, 1.35], rotY: 0, locked: true,
    evidence: 'decision', evidenceRefs: [],
    note: 'Carries loads to the bay hatch, where the cart takes over.',
  });
  add('hoistRailFreight', {
    room: 'aft-freight', type: 'conduit', name: 'Overhead hoist rail (freight node)',
    params: { length: 2.6, lines: 1, gauge: 0.16, mountHeight: 2.4, era: 'modern' },
    pos: [-2.0 + HX, D2, 20.0], rotY: Math.PI / 2, locked: true,
    evidence: 'decision', evidenceRefs: [],
    note: 'Spans the junction from the freight lock’s mouth toward Hold One’s door.',
  });
  add('stagingRack', {
    room: 'aft-freight', type: 'storage', name: 'Salvage staging rack — "incoming, uncleared"',
    params: { width: 1.4, height: 1.6, depth: 0.5 },
    pos: [-3.95 + HX, D2, 20.1], rotY: Math.PI / 2, locked: false,
    evidence: 'decision', evidenceRefs: ['rig-locker'],
    note: 'Everything that comes aboard sits here until Iri clears it: inspected, tagged, and only then released to the bench, the holds, Nova’s crate, or the sealed hatch. Nothing uncleared goes past the freight node — and nothing of the job’s ever goes upstairs.',
  });
  // deck tie-down anchors: the put-away ritual, bolted to the floor
  const anchor = (key, room, x, z, deckY = D2) => add(key, {
    room, type: 'strut', name: 'Deck tie-down anchor',
    params: { width: 0.16, height: 0.06, depth: 0.16 },
    pos: [x + HX, deckY, z], rotY: 0, locked: false,
    evidence: 'decision', evidenceRefs: [],
    note: 'Rigged-for-burn: everything loose on the work decks gets a home before the drive lights. The ritual is domestic as much as it is procedural.',
  });
  anchor('anchorSB1', 'skiffbay', -1.6, 1.6);
  anchor('anchorSB2', 'skiffbay', -2.7, -0.9);
  anchor('anchorFN1', 'aft-freight', -3.4, 19.5);
  anchor('anchorFN2', 'aft-freight', -1.9, 19.3);
  anchor('anchorEng', 'engine', 4.0, 11.1, 0);
  anchor('anchorLAS', 'lower-aft-spine', -6.45, 21.35);
  // lived-in stowage the prose already gave us
  add('ceilHooks', {
    room: 'work-spine', type: 'shelf', name: 'Ceiling hooks, draped cables',
    params: { width: 1.4, depth: 0.12, mountHeight: 1.98, tins: 0 },
    pos: [-2.2 + HX, D2, 17.4], rotY: 0, locked: false,
    evidence: 'explicit', evidenceRefs: ['ceiling-hooks'],
    note: '"Cables draped in lazy curves from ceiling hooks." Overhead stowage on the work run — the ship’s ceilings carry what her floors shouldn’t.',
  });
  add('coatRow', {
    room: 'domestic-service', type: 'shelf', name: 'Locker row — coat hooks',
    params: { width: 1.2, depth: 0.18, mountHeight: 1.62, tins: 0 },
    pos: [-4.03 + HX, 0, 8.2], rotY: -Math.PI / 2, locked: false,
    evidence: 'explicit', evidenceRefs: ['locker-row-hooks'],
    note: 'The locker row past the galley: the jacket that fits her too well hangs here — and the empty hook beside it, which is a different kind of invitation.',
  });

  return list;
}

// Regenerate: create objects that don't exist yet; replace objects whose
// layoutKey matches `replaceKeys` (exact key, or 'prefix*'), used after a
// ruling changes the geometry. Keys the user deliberately deleted stay gone.
export function generateLayout({ replaceKeys = null, fresh = false } = {}) {
  const rulings = {};
  for (const r of state.project.rulings) rulings[r.conflictKey] = r;
  const wanted = defs(rulings);

  if (fresh) { state.project.objects = []; state.project.deletedLayoutKeys = []; }

  const matches = key => replaceKeys &&
    replaceKeys.some(k => k === key || (k.endsWith('*') && key.startsWith(k.slice(0, -1))));
  const wantedKeys = new Set(wanted.map(w => w.layoutKey));
  state.project.objects = state.project.objects.filter(o => {
    if (!o.layoutKey) return true;                        // user-added object
    if (matches(o.layoutKey)) return false;               // regenerate this one
    return true;
  });

  const deleted = new Set(state.project.deletedLayoutKeys || []);
  const existing = new Set(state.project.objects.map(o => o.layoutKey).filter(Boolean));
  let added = 0;
  for (const w of wanted) {
    if (existing.has(w.layoutKey) || deleted.has(w.layoutKey)) continue;
    state.addObject(w);
    added++;
  }
  bus.emit('objects:changed');
  if (added) status(`Layout: ${added} object${added > 1 ? 's' : ''} generated from constraints`);
  return added;
}

// Keys affected by each curated conflict — regenerated when a ruling lands.
// All declared conflicts are resolved by author ruling and their choices are
// baked into the generator, so no ruling regenerates geometry anymore. The
// old door-ruling key list survives below as DOOR_WING_KEYS because the v24
// migration uses it: a save that carried a contrary door ruling needs its
// whole aft wing regenerated onto the canonical aft-corner hatch.
export const CONFLICT_LAYOUT_KEYS = {};
const DOOR_WING_KEYS = ['doorway', 'aftWallL', 'aftWallR', 'wallStbd*', 'doorSill', 'cor*', 'spine*', 'spn*', 'pkt*', 'med*', 'gal*', 'hyg*', 'mainWet*', 'hygLadderHatch', 's4*', 'alk*', 'eng*', 'dome*', 'stw*', 'stairDoor', 'op*', 'work*', 'res*', 'nav*', 'cab*', 'sb*', 'dogleg*', 'quiet*', 'wet*', 'secondaryLadder', 'garden*', 'aftService*', 'aftReconnect*', 'flex*', 'parts*', 'engAccess*', 'aftFreight*', 'freight*', 'cargo*', 'lowerAft*', 'novaCrawl*', 'aftEng*', 'mh*', 'cd*', 'oldHz*', 'aftPump', 'p1Panel', 'navLockBank', 'duct*', 'ahu*', 'medAirUnit', 'ventGridPanel', 'svc*', 'rib*', 'nook*', 'anchor*', 'hoist*', 'stagingRack', 'suitRack', 'buddyBench', 'ceilHooks', 'coatRow'];

// Layout-format migrations: when a generated object's DEFINITION changed
// between app versions, these keys are force-regenerated on old projects
// (user-added objects and rulings are untouched).
export const LAYOUT_VERSION = 26;
export const LAYOUT_MIGRATION_KEYS = {
  3: ['corWallPort', 'spineStub*'],   // port wall split for the medbay hatch; spine stub became the real spine
  4: ['corWallStbd1', 'spnLeg2*'],    // starboard wall split for the airlock; spine extended to the engine bay
  5: ['corWallPort'],                 // port wall split again for the stairwell down to the lower deck
  6: ['stw*', 'low*', 'qtr*', 'sb*', 'cab*', 'iriQ*', 'op*', 'work*', 'res*', 'nav*', 'dogleg*', 'quiet*', 'wet*', 'secondaryLadder', 'garden*', 'aftService*', 'aftReconnect*', 'flex*', 'parts*', 'engAccess*', 'aftFreight*', 'freight*', 'cargo*', 'lowerAft*', 'novaCrawl*', 'aftEng*'], // lower deck rebuilt around commercial + residential dual routes
  7: ['sb*', 'op*', 'workWall*', 'resWall*', 'quietWall*', 'aftServiceWall*', 'lowerAft*', 'novaCrawl*'], // enclose lower corridors and separate stair / skiff traffic after walk-path review
  8: ['resTurn*', 'dogleg*', 'wetCoreW', 'aftReconnect*'], // complete the residential bend and aft reconnection architecture
  9: ['garden*', 'freight*'], // clear final blockout overlaps found in top-down spatial review
  10: ['cor*', 'med*', 'gal*', 'hyg*', 'mainWet*', 'upperSecondaryLadder', 'spn*', 's4*', 'domeShutterHousing'], // main deck rebuilt around bent corridor, domestic wet zone, and complete legacy storage geography
  11: ['hyg*', 'mainWet*', 'upperSecondaryLadder'], // refine hygiene clearances and use a single secondary ladder with upper hatch
  12: ['corAft*', 'med*', 'hyg*', 's4*', 'spnLeg2W*'], // clear main-deck blockout overlaps found in top-down review
  13: ['galCooler', 'galStool2'], // clear galley furniture overlaps in the lived-in occupancy layout
  14: ['hyg*', 'domService*', 'mainWet*'], // distinguish the galley-side service passage from the actual hygiene / ladder vestibule
  15: ['hygShower*', 'hygVestWallE*'], // separate shower and toilet footprints in the final main-deck blockout
  16: ['corBend*', 'corWallPortMid', 'corAftWallStbd', 'cab1*', 'cab2*', 'cab3*', 'cab4*', 'cab5*', 'cab6*', 'resWall*', 'quietWall*', 'galStool*', 'medHatch', 'medChair', 'medShelf', 'medSterilizer', 'sbRig', 'gardenStore*', 'engWall*', 'iriQ*', 'domeFloor'], // open the corridor elbow (live-app validation found it walled), offset cabin doors clear of bunks, clear furniture / clearance-zone collisions, rebuild the aft-room option of the Iri conflict against the new main deck
  17: ['gal*', 'cab1*', 'cab2*', 'cab3*', 'cab4*', 'cab6*', 'cargoFloor', 'flexFloor', 'resApproachFloor', 'quietRunFloor'], // author-canon session: island folded into the counter run, nav lock levers at the helm, hold registry names, cabin quirks, crew-quarters naming
  19: ['cdPortDuct'], // the port air trunk becomes the domestic loop's tagged supply spine (ducting pass)
  20: ['wetCorePanel', 'wetCoreFloor', 'spnLeg2S', 'engAccessPanel', 'medAirUnit', 'freightLockFloor', 'engManifold'], // interlock and lock-in canon written onto the five maintenance venues (service-points pass)
  21: ['sbHatch', 'sbFloor', 'alkInnerDoor'], // the intake rule and the bay scrub cycle (salvage & stowage pass)
  22: ['cab4*', 'engManifold', 'svcCorBend'], // author locks: Cabin Four is Nova's; Presence-01 lives at the elbow coolant riser
  23: ['medCot', 'medUpperBed', 'cab1*', 'cab2*', 'cab3*', 'cab4*', 'cab5*', 'cab6*'], // author rulings: medbay = one real bed + one fold-down cot (conflict resolved); every cabin gets locker / fold-down desk / stool
  24: [...DOOR_WING_KEYS, 'stationRail', 'iriQ*'], // all six declared conflicts resolved by author ruling and baked in — regenerate everything a contrary stored ruling could have moved (door wing, station rail, Iri's aft-room variant), plus the new engine-bay floor hatch
  25: ['medFloor', 'medCot', 'medChair', 'medRailHead', 'medRailFoot', 'medBoom'], // author ruling: the cot is a rated procedure bed on recessed deployment rails, umbilical boom overhead
  26: ['engBench', 'engToolbox'], // the dented toolbox + cracked datapad promoted from a bench note to a real object (found by the scene-review workbench on Presence-01)
};
