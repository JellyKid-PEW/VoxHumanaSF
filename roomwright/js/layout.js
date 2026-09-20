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
export const DECK2Y = -2.7;                  // lower deck base height
const COR = { W: 1.1, LEN: 4.6, H: 2.15 };   // corridor: narrow, lower overhead
const GALLEY_SIZES = { tiny: [2.6, 2.4], compact: [3.0, 2.8], roomy: [3.6, 3.2] };

function defs(rulings) {
  const W = BRIDGE.W, D = BRIDGE.D, H = BRIDGE.H;
  const doorRuling = rulings['declared:door-behind~throttle']?.choice || null;
  const railRuling = rulings['declared:knees-touch~rail-between']?.choice || null;
  const galleyRuling = rulings['declared:galley-island~galley-tiny']?.choice || null;
  const iriRuling = rulings['declared:iri-cabin-lower~iri-quarters-route']?.choice || null;
  const iriProvisional = !iriRuling;

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
        : `Position fixed by your ruling (${doorRuling}). Palm-plate, manual sliding hatch that grinds open slowly.`,
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
          : 'Your ruling: short rail segment at the console line between helm and auxiliary station — the datapad shelf.'),
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
  add('boltsScatter', {
    type: 'bolts', name: 'Nova’s bolts',
    params: { count: 9, spread: 0.75 },
    pos: [1.0, 0, 0.95], rotY: 0, locked: false,
    evidence: 'explicit', evidenceRefs: ['nova-bolts', 'bolts-scatter', 'bolts-source'],
    note: 'Stripped bolts and washers from the galley mug, strewn where Nova sits cross-legged on the deck.',
  });

  // ================= CORRIDOR =================
  // The corridor runs aft from the bridge hatch. With the side-door ruling it
  // first runs a short leg to starboard, then bends aft.
  const cx = doorOnSideWall ? 3.05 : doorX;   // centerline x of the aft run
  const corStartZ = doorOnSideWall ? 1.45 : D / 2;
  const corEndZ = D / 2 + COR.LEN;            // galley face
  const corLen = corEndZ - corStartZ;
  const corCz = (corStartZ + corEndZ) / 2;
  const spineZ = D / 2 + COR.LEN / 2;         // "halfway to the galley"

  const corNote = 'Narrow ship corridor — "the corridor pressed narrow". The port wall carries the widened leaning section with Quenby’s pencil marks (VH1_B3_04).';
  add('corFloor', {
    room: 'corridor', type: 'floor', name: 'Corridor deck', params: { width: COR.W, depth: corLen },
    pos: [cx, 0, corCz], rotY: 0, locked: true,
    evidence: 'explicit', evidenceRefs: ['corridor-route', 'corridor-narrow'],
    note: `Corridor ${COR.W} m wide — inside the "pressed narrow" bound. Runs bridge → galley.`,
  });
  add('corCeiling', {
    room: 'corridor', type: 'ceiling', name: 'Corridor overhead', params: { width: COR.W, depth: corLen, height: COR.H },
    pos: [cx, 0, corCz], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: 'Lower than the bridge overhead (assumption).',
  });
  // port wall split by the stairwell opening and the medbay hatch
  const medHatchZ = 5.75;
  const stairZ = 3.65;
  const portSeg0 = (stairZ - 0.55) - corStartZ;
  const portSeg1 = (medHatchZ - 0.6) - (stairZ + 0.55);
  const portSeg2 = corEndZ - (medHatchZ + 0.6);
  add('corWallPort', {
    room: 'corridor', type: 'wall', name: 'Corridor wall (port fwd)', params: { length: portSeg0, height: COR.H, thickness: 0.12 },
    pos: [cx - COR.W / 2, 0, corStartZ + portSeg0 / 2], rotY: Math.PI / 2, locked: true,
    evidence: 'explicit', evidenceRefs: ['corridor-narrow', 'corridor-widened', 'corridor-smell'],
    note: corNote,
  });
  add('stairDoor', {
    room: 'stairwell', type: 'doorway', name: 'Stairwell opening',
    params: { length: 1.1, height: COR.H, thickness: 0.12, doorWidth: 0.9, doorHeight: 1.95, kind: 'sliding', slideDir: -1, open: 1 },
    pos: [cx - COR.W / 2, 0, stairZ], rotY: Math.PI / 2, locked: true,
    evidence: 'explicit', evidenceRefs: ['stair-lights', 'deck-three'],
    note: 'The stairwell down to the lower deck — its lights blink in pairs. The opening stands open; the door stays parked in its pocket.',
  });
  add('corWallPortMid', {
    room: 'corridor', type: 'wall', name: 'Corridor wall (port mid)', params: { length: portSeg1, height: COR.H, thickness: 0.12 },
    pos: [cx - COR.W / 2, 0, (stairZ + 0.55) + portSeg1 / 2], rotY: Math.PI / 2, locked: true,
    evidence: 'explicit', evidenceRefs: ['corridor-narrow'], note: 'Corridor wall between the stairwell and the medbay.',
  });
  add('medHatch', {
    room: 'medbay', type: 'doorway', name: 'Medbay hatch',
    params: { length: 1.2, height: COR.H, thickness: 0.12, doorWidth: 0.8, doorHeight: 1.9, kind: 'sliding', slideDir: 1, open: 0 },
    pos: [cx - COR.W / 2, 0, medHatchZ], rotY: Math.PI / 2, locked: false,
    evidence: 'explicit', evidenceRefs: ['med-corridor', 'med-deeper', 'doors-wait'],
    note: 'The cycling medbay door — its soft confirm is audible from the bridge. Opens off the main corridor.',
  });
  add('corWallPort2', {
    room: 'corridor', type: 'wall', name: 'Corridor wall (port aft)', params: { length: portSeg2, height: COR.H, thickness: 0.12 },
    pos: [cx - COR.W / 2, 0, corEndZ - portSeg2 / 2], rotY: Math.PI / 2, locked: true,
    evidence: 'explicit', evidenceRefs: ['corridor-narrow', 'med-corridor'], note: 'Corridor wall between the medbay and the galley junction.',
  });
  // starboard wall: split first by the airlock inner door ("two steps past
  // the bridge"), then by the storage-spine hatch at the midpoint
  const alkZ = 3.2;
  const seg1aLen = (alkZ - 0.45) - corStartZ;
  const seg1bLen = (spineZ - 0.5) - (alkZ + 0.45);
  const seg2Len = corEndZ - (spineZ + 0.5);
  add('corWallStbd1', {
    room: 'corridor', type: 'wall', name: 'Corridor wall (starboard fwd)', params: { length: seg1aLen, height: COR.H, thickness: 0.12 },
    pos: [cx + COR.W / 2, 0, corStartZ + seg1aLen / 2], rotY: Math.PI / 2, locked: true,
    evidence: 'explicit', evidenceRefs: ['corridor-route'], note: 'Corridor wall up to the main hatch.',
  });
  add('alkInnerDoor', {
    room: 'airlock', type: 'doorway', name: 'Airlock inner hatch',
    params: { length: 0.9, height: COR.H, thickness: 0.12, doorWidth: 0.7, doorHeight: 1.85, kind: 'sliding', slideDir: -1, open: 0 },
    pos: [cx + COR.W / 2, 0, alkZ], rotY: Math.PI / 2, locked: false,
    evidence: 'explicit',
    evidenceRefs: ['alk-main-hatch', 'alk-two-steps', 'alk-two-stage', 'alk-inner-release', 'doors-wait'],
    note: 'The inner lock of the main hatch — powered, opened by a wall-mounted release, two steps past the bridge.',
  });
  add('corWallStbd1b', {
    room: 'corridor', type: 'wall', name: 'Corridor wall (starboard mid)', params: { length: seg1bLen, height: COR.H, thickness: 0.12 },
    pos: [cx + COR.W / 2, 0, (alkZ + 0.45) + seg1bLen / 2], rotY: Math.PI / 2, locked: true,
    evidence: 'explicit', evidenceRefs: ['corridor-route'], note: 'Corridor wall between the main hatch and the storage-spine turn.',
  });
  add('spineHatch', {
    room: 'corridor', type: 'doorway', name: 'Storage spine hatch',
    params: { length: 1.0, height: COR.H, thickness: 0.12, doorWidth: 0.62, doorHeight: 1.85, kind: 'hinged', hinge: 'left', swing: 'out', open: 0 },
    pos: [cx + COR.W / 2, 0, spineZ], rotY: Math.PI / 2, locked: false,
    evidence: 'explicit', evidenceRefs: ['corridor-route', 'spine-hatch', 'galley-junction-cup'],
    note: '“Halfway to the galley, she passed the turn toward the storage spine.” Narrow manual hatch with a recessed grip; starboard pocket three lies two turns beyond (future rooms).',
  });
  add('corWallStbd2', {
    room: 'corridor', type: 'wall', name: 'Corridor wall (starboard aft)', params: { length: seg2Len, height: COR.H, thickness: 0.12 },
    pos: [cx + COR.W / 2, 0, corEndZ - seg2Len / 2], rotY: Math.PI / 2, locked: true,
    evidence: 'explicit', evidenceRefs: ['corridor-route'], note: 'Corridor wall from the spine turn to the galley.',
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
  const domeZ = spineZ + 4.1;                        // dome arch, off the outboard wall

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
    note: 'The frame Quenby leans on, mug set on the deck plate within reach. The spine ends at the heat’s center.',
  });
  add('spnLeg2W', {
    room: 'spine', type: 'wall', name: 'Spine wall (inboard)', params: { length: leg2z1 - (spineZ + SPW / 2), height: SPH, thickness: 0.1 },
    pos: [leg1x0 + leg1Len, 0, (spineZ + SPW / 2 + leg2z1) / 2], rotY: Math.PI / 2, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: '',
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
  const galleyProvisional = !galleyRuling;
  const gSize = GALLEY_SIZES[galleyRuling] || GALLEY_SIZES.compact;
  const [gw, gd] = gSize;
  const GH = 2.15;
  const gx = cx + 0.55 - gw / 2;            // starboard galley wall flush with the corridor wall
  const gz = corEndZ + gd / 2;
  const rel = (dx, dz) => [gx + dx, 0, gz + dz];

  const galleyShellNote = galleyProvisional
    ? `⚠ Provisional ${gw} × ${gd} m — the galley-size conflict ("tiny galley" vs. central prep island) is unresolved. Compact compromise shown.`
    : `${gw} × ${gd} m per your ruling (${galleyRuling}).`;
  add('galFloor', {
    room: 'galley', type: 'floor', name: 'Galley deck', params: { width: gw, depth: gd },
    pos: [gx, 0, gz], rotY: 0, locked: true,
    evidence: galleyProvisional ? 'assumption' : 'decision',
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
    pos: [cx, 0, corEndZ], rotY: 0, locked: false,
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

  // galley furniture — placed to keep a walkable lane from the hatch (which
  // sits at the starboard end of the forward wall) down the starboard side
  // and along the counter on the port side.
  const tiny = galleyRuling === 'tiny';
  const tableX = tiny ? -0.05 : 0.3;        // table/bench cluster, south side
  add('galCounter', {
    room: 'galley', type: 'counter', name: 'Galley counter + sink',
    params: { width: tiny ? 1.2 : Math.min(1.6, gd - 0.7), depth: 0.55, height: 0.9, sink: true },
    pos: rel(-gw / 2 + 0.36, 0.05), rotY: -Math.PI / 2, locked: false,
    evidence: 'explicit',
    evidenceRefs: ['galley-sink-light', 'galley-index-card', 'galley-counter-lean', 'galley-drawer-cabinet'],
    note: 'Sink with the blinking status light; the index card taped above it; the spoon drawer; the under-sink cabinet with its badly folded rag.',
  });
  add('galShelf', {
    room: 'galley', type: 'shelf', name: 'Tin shelf',
    params: { width: 1.0, depth: 0.24, mountHeight: 1.32, tins: 3 },
    pos: rel(-gw / 2 + 0.16, 0.05), rotY: -Math.PI / 2, locked: false,
    evidence: 'explicit', evidenceRefs: ['galley-tins-shelf'],
    note: 'Three battered tins in their row: Regret, Dead Reckoning, Victory Speech — later, Sugar.',
  });
  add('galTable', {
    room: 'galley', type: 'table', name: 'Galley table',
    params: { width: 0.85, depth: 0.6, height: 0.74 },
    pos: rel(tableX, gd / 2 - 0.85), rotY: 0, locked: false,
    evidence: 'explicit', evidenceRefs: ['galley-table', 'galley-tabletop-nova'],
    note: 'Where the medkit sat for the stitching; Nova watches from here, chin on folded arms.',
  });
  add('galBench', {
    room: 'galley', type: 'bench', name: 'Galley bench',
    params: { width: 1.2, height: 0.42, depth: 0.42 },
    pos: rel(tableX, gd / 2 - 0.3), rotY: 0, locked: false,
    evidence: 'explicit', evidenceRefs: ['galley-bench', 'galley-bench-wall'],
    note: '“Bench too narrow. Edges that caught.” Leather-covered, creaks; set against the aft wall.',
  });
  add('galCabinet', {
    room: 'galley', type: 'storage', name: 'Galley cabinet',
    params: { width: tiny ? 0.7 : 0.8, height: 1.6, depth: 0.36 },
    pos: tiny ? rel(-0.75, -gd / 2 + 0.26) : rel(gw / 2 - 0.25, -0.15),
    rotY: tiny ? 0 : -Math.PI / 2, locked: false,
    evidence: 'explicit', evidenceRefs: ['galley-drawer-cabinet', 'bolts-source'],
    note: 'The cabinet where bolts live in a mug that should’ve held tea.',
  });
  add('galFan', {
    room: 'galley', type: 'crate', name: 'Corner fan',
    params: { width: 0.24, height: 0.3, depth: 0.24 },
    pos: tiny ? rel(gw / 2 - 0.2, gd / 2 - 0.2) : rel(-gw / 2 + 0.24, -gd / 2 + 0.24),
    rotY: 0.4, locked: false,
    evidence: 'explicit', evidenceRefs: ['galley-fan'],
    note: '“The fan in the corner ticked once, then went patient.”',
  });
  add('galPlants', {
    room: 'galley', type: 'crate', name: 'Potted plants',
    params: { width: 0.45, height: 0.34, depth: 0.4 },
    pos: rel(-gw / 2 + 0.35, gd / 2 - 0.32), rotY: 0.15, locked: false,
    evidence: 'explicit', evidenceRefs: ['galley-plants'],
    note: 'The new plants from the garden, soil still damp, in the corner.',
  });
  if (!tiny) {
    add('galIsland', {
      room: 'galley', type: 'table', name: 'Central prep counter',
      params: { width: galleyRuling === 'roomy' ? 1.1 : 0.7, depth: galleyRuling === 'roomy' ? 0.6 : 0.45, height: 0.92 },
      pos: rel(0.1, -0.35), rotY: 0, locked: false,
      evidence: galleyProvisional ? 'assumption' : 'decision',
      evidenceRefs: ['galley-island', 'galley-tiny'],
      note: (galleyProvisional ? '⚠ Provisional — part of the unresolved galley-size conflict. ' : '') +
        'The central prep counter Quenby leans an elbow on; the water generator sits here. Rounding it is deliberately shoulder-tight.',
    });
    add('galCooler', {
      room: 'galley', type: 'crate', name: 'Cooling unit',
      params: { width: 0.5, height: 0.55, depth: 0.45 },
      pos: rel(gw / 2 - 0.33, gd / 2 - 0.35), rotY: 0, locked: false,
      evidence: 'explicit', evidenceRefs: ['galley-across'],
      note: 'Floor-level cooling unit across the room from the prep counter.',
    });
  }

  // ================= OBSERVATION DOME =================
  // Off the spine's outboard wall — "not listed on primary pathing".
  const DR = 1.25;
  const dcx = pktWx + DR + 0.11, dcz = domeZ;
  add('domeFloor', {
    room: 'dome', type: 'floor', name: 'Dome deck', params: { width: DR * 2 + 0.2, depth: DR * 2 + 0.2 },
    pos: [dcx + 0.01, 0, dcz], rotY: 0, locked: true,
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

  // ================= ENGINE BAY =================
  const engRuling = rulings['declared:eng-belowdeck~eng-walkin']?.choice || null;
  const engProvisional = !engRuling;
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
      note: 'Your ruling: the ladder down to the underdeck crawl runs beneath this hatch — rungs that ring, oil and dust. The crawl itself arrives with the lower deck.',
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
    // door through to Iri's quarters (her ruling puts them past the galley)
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
    note: 'The workbench with the dented toolbox and the cracked datapad on top; the tap she runs over her wrists; the empty spot where gloves would’ve lived. Clearances tight enough that a passing hip brushes it.',
  });
  add('engManifold', {
    room: 'engine', type: 'storage', name: 'Cooling manifold (open)',
    params: { width: 1.2, height: 1.5, depth: 0.3 },
    pos: erel(EBW / 2 - 0.22, -0.1), rotY: -Math.PI / 2, locked: false,
    evidence: 'explicit', evidenceRefs: ['eng-manifold'],
    note: 'Where Iri works waist-deep, half the paneling stripped — "like ribs laid open."',
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
  const bedsRuling = rulings['declared:med-cot~med-two-beds']?.choice || null;
  const bedsProvisional = !bedsRuling;
  const MW = 2.6, MD = 2.4, MH = 2.1;
  const mE = cx - COR.W / 2;             // shared wall with the corridor
  const mx = mE - MW / 2, mz = medHatchZ; // room centered on its hatch (z 4.7–6.8 for default)
  const mrel = (dx, dz) => [mx + dx, 0, mz + dz];

  add('medFloor', {
    room: 'medbay', type: 'floor', name: 'Medbay deck', params: { width: MW, depth: MD },
    pos: [mx, 0, mz], rotY: 0, locked: true,
    evidence: 'explicit', evidenceRefs: ['med-two-beds', 'med-reach', 'med-corridor'],
    note: `Medbay ${MW} × ${MD} m — compact enough that supplies are within blind arm’s reach one step inside the door.`,
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
  // the cot (and, per ruling, a second recessed bed above it)
  add('medCot', {
    room: 'medbay', type: 'bench', name: bedsRuling === 'two-beds' ? 'Lower wall bed' : 'Medbay cot',
    params: { width: 0.7, height: 0.52, depth: 1.5 },
    pos: mrel(-MW / 2 + 0.42, 0), rotY: 0, locked: false,
    evidence: bedsProvisional ? 'assumption' : 'decision',
    evidenceRefs: ['med-cot', 'med-two-beds', 'med-telemetry'],
    note: (bedsProvisional ? '⚠ Provisional — the bed-count conflict (two recessed wall beds vs. the single cot) is unresolved. ' : '') +
      'Reclines "at an angle designed by someone who believed recovery worked better if the body had nowhere useful to go." The telemetry projection hovers past its foot.',
  });
  if (bedsRuling === 'two-beds' || bedsRuling === 'cot-plus-folded') {
    // wall-mounted (legless) upper bunk — a shelf, structurally
    add('medUpperBed', {
      room: 'medbay', type: 'shelf',
      name: bedsRuling === 'two-beds' ? 'Upper wall bed' : 'Folded upper bunk',
      params: {
        width: 1.5, tins: 0,
        depth: bedsRuling === 'two-beds' ? 0.6 : 0.2,
        mountHeight: bedsRuling === 'two-beds' ? 1.3 : 1.25,
      },
      pos: mrel(-MW / 2 + (bedsRuling === 'two-beds' ? 0.36 : 0.18), 0), rotY: Math.PI / 2, locked: false,
      evidence: 'decision', evidenceRefs: ['med-two-beds', 'med-cot'],
      note: bedsRuling === 'two-beds'
        ? 'Your ruling: both recessed wall beds modeled — the upper folds down over the cot.'
        : 'Your ruling: the second recessed bed exists but stays folded flat against the wall.',
    });
  }
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
    pos: mrel(0.0, -0.15), rotY: Math.PI - 0.4, locked: false,
    evidence: 'explicit', evidenceRefs: ['med-chair', 'med-chair-hook'],
    note: 'The one chair — hooked into position beside the console, within reach of the tea, angled toward both telemetry and cot.',
  });
  add('medShelf', {
    room: 'medbay', type: 'storage', name: 'Storage shelf',
    params: { width: 0.8, height: 1.5, depth: 0.34 },
    pos: mrel(0.35, MD / 2 - 0.15), rotY: Math.PI, locked: false,
    evidence: 'explicit', evidenceRefs: ['med-shelf', 'med-reach'],
    note: 'Where Nova stands with her borrowed blanket — supplies within blind reach of the door.',
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
    pos: mrel(0.8, -MD / 2 + 0.35), rotY: 0, locked: false,
    evidence: 'explicit', evidenceRefs: ['med-two-beds'],
    note: 'Sterilizer unit with its blinking diagnostic loop.',
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
    params: { width: 1.05, rise: 0.18, run: 0.2, steps: 15 },
    pos: [mEp - 1.5, D2, stairZ], rotY: Math.PI / 2, locked: true,
    evidence: 'explicit', evidenceRefs: ['stair-lights', 'deck-three', 'lower-corridor'],
    note: 'Fifteen treads down to the lower operations deck. The stairwell lights blink in pairs.',
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
  const opWorkHalf = WORKW / 2;
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
    note: 'Immediate side branch from Lower Operations. It can isolate / open to space without becoming through-circulation.',
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
    note: 'Palm-activated hatch opening directly off the forward side of Lower Operations. The stair approaches from starboard, so skiff traffic and stair traffic do not occupy the same opening.',
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
    pos: [sbx - 0.7, D2, sbz + SBD / 2 - 0.38], rotY: Math.PI, locked: false,
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
  const workHeadGap = [whz - 0.5, whz + 0.5];
  const resGap = [RESZ0 - RESW / 2, RESZ0 + RESW / 2];
  const flexGap = [fbz - 0.775, fbz + 0.775];
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
    params: { width: OPX - RESX, depth: RESW },
    pos: [(OPX + RESX) / 2, D2, RESZ0], rotY: 0, locked: true,
    evidence: 'decision', evidenceRefs: ['lower-corridor', 'cabin-row'],
    note: 'A conscious turn away from the work spine. Standing at the stair foot does not give a direct sightline down the cabin hall.',
  });
  add('resApproachFloor', {
    room: 'residential', type: 'floor', name: 'Residential approach deck',
    params: { width: RESW, depth: RESZ1 - RESZ0 },
    pos: [RESX, D2, (RESZ0 + RESZ1) / 2], rotY: 0, locked: true,
    evidence: 'explicit', evidenceRefs: ['lower-corridor', 'cabin-row'],
    note: 'Coolant lines, forgotten tags, and the first four cabins. Nav sits at the threshold rather than inside the cabin cluster.',
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
  function addLowerCabin({ key, name, x, z, w = 2.0, d = 1.85, doorX, doorZ = z, open = 0, evidence = 'assumption', refs = [], note = '' }) {
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
      note: key === 'cab6' ? 'Standard low bunk; tight-cornered, sheet pulled taut.' : 'Standard crew bunk.',
    });
  }

  // ---------- Cabins One through Four: accessible / passenger-capable approach ----------
  const resWestDoorX = RESX - RESW / 2;
  const resEastDoorX = RESX + RESW / 2;
  addLowerCabin({
    key: 'cab1', name: 'Cabin One', x: resWestDoorX - 1.0, z: 7.65, doorX: resWestDoorX, open: 0,
    evidence: 'decision', refs: ['cabin-row'], note: 'One of the four accessible approach cabins; suitable for crew, passengers, or contractors as circumstances require.',
  });
  addLowerCabin({
    key: 'cab2', name: 'Cabin Two', x: resEastDoorX + 1.0, z: 9.05, doorX: resEastDoorX, open: 0.35,
    evidence: 'decision', refs: ['cabin-row'], note: 'Staggered opposite Cabin One; the approach should not read as a hotel corridor.',
  });
  addLowerCabin({
    key: 'cab3', name: 'Cabin Three', x: resWestDoorX - 1.0, z: 10.25, doorX: resWestDoorX, open: 0,
    evidence: 'decision', refs: ['cabin-row'], note: 'Legacy door hardware may stick; exact present occupant remains open.',
  });
  addLowerCabin({
    key: 'cab4', name: 'Cabin Four', x: resEastDoorX + 1.0, z: 11.15, doorX: resEastDoorX, open: 0,
    evidence: 'decision', refs: ['cabin-row'], note: 'Fourth approach cabin. Nova may eventually choose any Cabin One through Four; geometry does not choose for her.',
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
  addResWallSeg('resWallW1', resWestDoorX, RESZ0, 7.15);
  addResWallSeg('resWallW2', resWestDoorX, 8.15, 9.75);
  addResWallSeg('resWallW3', resWestDoorX, 10.75, RESZ1);
  addResWallSeg('resWallE1', resEastDoorX, RESZ0, 8.55);
  addResWallSeg('resWallE2', resEastDoorX, 9.55, 10.65);
  addResWallSeg('resWallE3', resEastDoorX, 11.65, RESZ1);

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
  add('quietRunFloor', {
    room: 'residential', type: 'floor', name: 'Quiet cabin run deck',
    params: { width: RESW, depth: 5.4 },
    pos: [QUIETX, D2, 15.1], rotY: 0, locked: true,
    evidence: 'decision', evidenceRefs: ['cabin-bend', 'cabin-six'],
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
    note: 'Pumps, filters, valves, heat exchange, environmental and habitation-loop service access. The corridor bends because this fixed utility volume is in the way.',
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
    note: 'Accessible from lived-in space: thermal / water / environmental service rather than machinery hidden on a remote engineering deck.',
  });
  add('secondaryLadder', {
    room: 'wet-service', type: 'step', name: 'Secondary ship ladder',
    params: { width: 0.68, rise: 0.18, run: 0.10, steps: 15 },
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
  addQuietWallSeg('quietWallW1', 'west', quietWallStart, 13.95);
  addQuietWallSeg('quietWallW2', 'west', 14.95, 15.95);
  addQuietWallSeg('quietWallW3', 'west', 16.95, quietWallEnd);
  addQuietWallSeg('quietWallE', 'east', quietWallStart, quietWallEnd);

  // ---------- domestic / habitation stores; later garden nook ----------
  // The compartment opens from the dogleg itself rather than facing either
  // Cabin Five or Cabin Six. This keeps it close to the wet-service core while
  // making the later garden feel like a small place deliberately entered.
  const GARDW = 2.0, GARDD = 2.55;
  const gardx = RESX - 0.5;
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
  [-0.78, 0, 0.78].forEach((dz, i) => add('gardenStore' + (i + 1), {
    room: 'domestic-stores', type: 'storage', name: 'Low side-opening domestic store ' + (i + 1),
    params: { width: 0.72, height: 0.72, depth: 0.72 },
    pos: [gardx - 0.55, D2, gardz + dz], rotY: Math.PI / 2, locked: false,
    evidence: 'decision', evidenceRefs: [],
    note: 'Frequently used linens, cleaning / hygiene consumables, filters, waste bags, water-test supplies, or small environmental spares. Future grow beds can sit above these stores.',
  }));

  // ---------- Cabins Five and Six: quiet run ----------
  const quietWestDoorX = QUIETX - RESW / 2;
  addLowerCabin({
    key: 'cab5', name: 'Cabin Five — Iri', x: quietWestDoorX - 1.05, z: 14.45, w: 2.1, d: 2.0,
    doorX: quietWestDoorX, open: 0.45, evidence: 'decision', refs: ['iri-cabin-lower'],
    note: 'Iri’s cabin. Door often held at a half-angle. Shares a structural wall with Cabin Six.',
  });
  addLowerCabin({
    key: 'cab6', name: 'Cabin Six — Quenby', x: quietWestDoorX - 1.2, z: 16.45, w: 2.4, d: 2.0,
    doorX: quietWestDoorX, open: 0, evidence: 'decision',
    refs: ['cabin-six', 'cabin-six-room', 'cabin-bunk', 'cabin-mirror', 'cabin-door-catch'],
    note: 'One of the larger cabins. Plain, quiet, a quarter heavy near the far bulkhead; last numbered cabin, but not the end of the passage.',
  });
  add('cab5Table', {
    room: 'cabin', type: 'table', name: 'Iri’s worktable',
    params: { width: 0.85, depth: 0.5, height: 0.78 },
    pos: [quietWestDoorX - 1.35, D2, 14.9], rotY: Math.PI, locked: false,
    evidence: 'decision', evidenceRefs: ['iri-worktable'],
    note: 'Where she lays found pieces out with both hands.',
  });
  add('cab5Hatch', {
    room: 'cabin', type: 'shelf', name: 'Iri’s sealed storage hatch',
    params: { width: 0.7, depth: 0.26, mountHeight: 1.2, tins: 0 },
    pos: [quietWestDoorX - 2.0, D2, 14.55], rotY: Math.PI / 2, locked: false,
    evidence: 'decision', evidenceRefs: ['iri-storage-hatch'], note: 'Soft-wrapped, layered, sealed.',
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

  // ---------- configurable commercial mission / flex bay ----------
  const FBW = 5.2, FBD = 6.0;
  const fbx = OPX + WORKW / 2 + FBW / 2, fbz = 10.55;
  add('flexFloor', {
    room: 'flex-bay', type: 'floor', name: 'Configurable mission / flex bay deck',
    params: { width: FBW, depth: FBD },
    pos: [fbx, D2, fbz], rotY: 0, locked: true,
    evidence: 'decision', evidenceRefs: [],
    note: 'Commercially useful configurable volume: ordinary freight, workshop, survey gear, contract module, secure load, or other operator-specific fit-out.',
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
    evidence: 'decision', evidenceRefs: [], note: 'Cargo-capable opening directly from the work spine.',
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
    note: 'Distributed maintenance: local isolation, power, coolant, and service access where the work happens.',
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
  const ftx = OPX + 3.2, ftz = AFZ;
  add('freightLockFloor', {
    room: 'freight-lock', type: 'floor', name: 'Freight transfer lock deck',
    params: { width: FTW, depth: FTD },
    pos: [ftx, D2, ftz], rotY: 0, locked: true,
    evidence: 'decision', evidenceRefs: [],
    note: 'Side-loading commercial cargo lock. Major ports can mate cargo infrastructure here; fringe loading can use sleds, tugs, winches, or improvised support.',
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
    room: 'cargo-bay', type: 'floor', name: 'Main cargo / flex bay deck',
    params: { width: CBW, depth: CBD },
    pos: [cbx, D2, cbz], rotY: 0, locked: true,
    evidence: 'decision', evidenceRefs: [],
    note: 'Primary large paying-cargo volume. When empty or lightly loaded, the same clear floor becomes training, projects, and oversized ordinary-life space.',
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
// The door ruling moves the whole aft wing (corridor, spine, pocket, medbay,
// and galley all follow the hatch).
export const CONFLICT_LAYOUT_KEYS = {
  'declared:door-behind~throttle': ['doorway', 'aftWallL', 'aftWallR', 'wallStbd*', 'doorSill', 'cor*', 'spine*', 'spn*', 'pkt*', 'med*', 'gal*', 'alk*', 'eng*', 'dome*', 'stw*', 'stairDoor', 'op*', 'work*', 'res*', 'nav*', 'cab*', 'sb*', 'dogleg*', 'quiet*', 'wet*', 'secondaryLadder', 'garden*', 'aftService*', 'aftReconnect*', 'flex*', 'parts*', 'engAccess*', 'aftFreight*', 'freight*', 'cargo*', 'lowerAft*', 'novaCrawl*', 'aftEng*'],
  'declared:knees-touch~rail-between': ['stationRail'],
  'declared:galley-island~galley-tiny': ['gal*'],
  'declared:med-cot~med-two-beds': ['medCot', 'medUpperBed'],
  'declared:eng-belowdeck~eng-walkin': ['engFloor', 'engCeil', 'engWall*', 'engFloorHatch'],
};

// Layout-format migrations: when a generated object's DEFINITION changed
// between app versions, these keys are force-regenerated on old projects
// (user-added objects and rulings are untouched).
export const LAYOUT_VERSION = 7;
export const LAYOUT_MIGRATION_KEYS = {
  3: ['corWallPort', 'spineStub*'],   // port wall split for the medbay hatch; spine stub became the real spine
  4: ['corWallStbd1', 'spnLeg2*'],    // starboard wall split for the airlock; spine extended to the engine bay
  5: ['corWallPort'],                 // port wall split again for the stairwell down to the lower deck
  6: ['stw*', 'low*', 'qtr*', 'sb*', 'cab*', 'iriQ*', 'op*', 'work*', 'res*', 'nav*', 'dogleg*', 'quiet*', 'wet*', 'secondaryLadder', 'garden*', 'aftService*', 'aftReconnect*', 'flex*', 'parts*', 'engAccess*', 'aftFreight*', 'freight*', 'cargo*', 'lowerAft*', 'novaCrawl*', 'aftEng*'], // lower deck rebuilt around commercial + residential dual routes
  7: ['sb*', 'op*', 'workWall*', 'resWall*', 'quietWall*', 'aftServiceWall*', 'lowerAft*', 'novaCrawl*'], // enclose lower corridors and separate stair / skiff traffic after walk-path review
};
