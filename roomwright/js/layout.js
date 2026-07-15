// Generates the bridge geometry from the constraint database + rulings.
// Every generated object records WHICH constraints determined it (evidenceRefs)
// and an honest evidence level. Values not pinned by prose are assumptions.
//
// Coordinates: meters, floor at y=0, forward (viewport) = -Z, aft (door) = +Z,
// starboard = +X, port = -X.
import { state } from './state.js';
import { bus, status } from './util.js';

// Bridge shell parameters. Width/depth are assumptions chosen inside the
// evidenced bounds (narrow-space max, crossable-room min, aft-panel-cross).
export const BRIDGE = { W: 4.8, D: 4.6, H: 2.25 };

// layoutKey → builder. Regeneration replaces only objects whose layoutKey is
// affected, so manual edits elsewhere survive ruling changes.
function defs(rulings) {
  const W = BRIDGE.W, D = BRIDGE.D, H = BRIDGE.H;
  const doorRuling = rulings['declared:door-behind~throttle']?.choice || null;
  const railRuling = rulings['declared:knees-touch~rail-between']?.choice || null;

  // door placement
  let doorX = 1.5, doorWallRot = 0, doorOnSideWall = false;
  let doorProvisional = !doorRuling;
  if (doorRuling === 'aft-center') doorX = 0;
  else if (doorRuling === 'aft-corner') doorX = 1.5;
  else if (doorRuling === 'side-door') { doorOnSideWall = true; }

  const list = [];
  const add = (layoutKey, o) => list.push({ layoutKey, ...o });

  // ---------- shell ----------
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

  // ---------- aft wall + door ----------
  if (!doorOnSideWall) {
    add('doorway', {
      type: 'doorway', name: 'Bridge hatch',
      params: { length: 1.8, height: H, thickness: 0.16, doorWidth: 0.85, doorHeight: 1.95, kind: 'sliding', slideDir: doorX > 0 ? -1 : 1, open: 0 },
      pos: [doorX, 0, D / 2], rotY: 0, locked: false,
      evidence: doorProvisional ? 'assumption' : 'decision',
      evidenceRefs: ['door-behind', 'throttle', 'door-palm', 'door-grind-slide', 'doorframe-lean', 'doors-wait'],
      note: doorProvisional
        ? '⚠ Provisional position — the door-placement conflict is unresolved (aft of the pilot vs. profile view from the door). Currently placed in the aft-starboard corner as a compromise.'
        : `Position fixed by your ruling (${doorRuling}). Palm-plate, manual sliding hatch that grinds open slowly.`,
    });
    // filler walls either side of the doorway segment
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
    // side-door ruling: full aft wall, door in the starboard wall
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
    add('wallStbd', {
      type: 'wall', name: 'Starboard bulkhead (fwd)', params: { length: D / 2 - 0.9, height: H, thickness: 0.16 },
      pos: [W / 2, 0, -(D / 2 - (D / 2 - 0.9) / 2)], rotY: Math.PI / 2, locked: true,
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

  // ---------- stations ----------
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

  // ---------- rails ----------
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
          : 'Your ruling: short rail segment at the console line between helm and auxiliary station — the datapad shelf.'),
    });
  }

  // ---------- furniture ----------
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
  add('boltsScatter', {
    type: 'bolts', name: 'Nova’s bolts',
    params: { count: 9, spread: 0.75 },
    pos: [1.0, 0, 0.95], rotY: 0, locked: false,
    evidence: 'explicit', evidenceRefs: ['nova-bolts', 'bolts-scatter', 'bolts-source'],
    note: 'Stripped bolts and washers from the galley mug, strewn where Nova sits cross-legged on the deck.',
  });

  return list;
}

// Regenerate: create objects that don't exist yet; replace objects whose
// layoutKey is in `replaceKeys` (used after a ruling changes the geometry).
export function generateLayout({ replaceKeys = null, fresh = false } = {}) {
  const rulings = {};
  for (const r of state.project.rulings) rulings[r.conflictKey] = r;
  const wanted = defs(rulings);

  if (fresh) state.project.objects = [];

  // drop replaced/no-longer-generated keys
  const wantedKeys = new Set(wanted.map(w => w.layoutKey));
  state.project.objects = state.project.objects.filter(o => {
    if (!o.layoutKey) return true;                       // user-added object
    if (replaceKeys && replaceKeys.includes(o.layoutKey)) return false;
    if (replaceKeys && !wantedKeys.has(o.layoutKey)) return false; // e.g. stationRail removed by ruling
    return true;
  });

  const existing = new Set(state.project.objects.map(o => o.layoutKey).filter(Boolean));
  let added = 0;
  for (const w of wanted) {
    if (existing.has(w.layoutKey)) continue;
    state.addObject(w);
    added++;
  }
  bus.emit('objects:changed');
  if (added) status(`Layout: ${added} object${added > 1 ? 's' : ''} generated from constraints`);
  return added;
}

// Keys affected by each curated conflict — regenerated when a ruling lands.
export const CONFLICT_LAYOUT_KEYS = {
  'declared:door-behind~throttle': ['doorway', 'aftWallL', 'aftWallR', 'wallStbd', 'doorSill'],
  'declared:knees-touch~rail-between': ['stationRail'],
};
