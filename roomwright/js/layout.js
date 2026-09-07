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
  // "Lower corridor. Coolant lines, forgotten tags." Reached by the stairwell
  // whose lights blink in pairs. Everything below sits at DECK2.
  const D2 = DECK2Y;
  const mEp = cx - COR.W / 2;            // corridor port wall plane

  // ---------- stairwell ----------
  add('stwSteps', {
    room: 'stairwell', type: 'step', name: 'Stairwell',
    params: { width: 1.05, rise: 0.18, run: 0.2, steps: 15 },
    pos: [mEp - 1.5, D2, stairZ], rotY: Math.PI / 2, locked: true,
    evidence: 'explicit', evidenceRefs: ['stair-lights', 'deck-three', 'lower-corridor'],
    note: 'Fifteen treads down to the lower deck. The stairwell lights blink in pairs.',
  });
  for (const s of [-1, 1]) {
    add(s < 0 ? 'stwWallN' : 'stwWallS', {
      room: 'stairwell', type: 'wall', name: 'Stairwell wall', params: { length: 3.0, height: 4.85, thickness: 0.12 },
      pos: [mEp - 1.5, D2, stairZ + s * 0.55], rotY: 0, locked: true,
      evidence: 'assumption', evidenceRefs: [], note: '',
    });
  }
  add('stwCeil', {
    room: 'stairwell', type: 'ceiling', name: 'Stairwell overhead', params: { width: 3.0, depth: 1.1, height: 4.85 },
    pos: [mEp - 1.5, D2, stairZ], rotY: 0, locked: true, evidence: 'assumption', evidenceRefs: [], note: '',
  });

  // ---------- lower corridor ----------
  const LCX = mEp - 3.55;                 // centerline
  const LCW = 1.1;
  const lcz0 = 2.0, lcz1 = 12.1;
  add('lowFloor', {
    room: 'lower-corridor', type: 'floor', name: 'Lower corridor deck', params: { width: LCW, depth: lcz1 - lcz0 },
    pos: [LCX, D2, (lcz0 + lcz1) / 2], rotY: 0, locked: true,
    evidence: 'explicit', evidenceRefs: ['lower-corridor', 'cabin-row'],
    note: 'The lower corridor — coolant lines, forgotten tags, plates memorized without belonging. The cabin row runs along its port side.',
  });
  add('lowCeil', {
    room: 'lower-corridor', type: 'ceiling', name: 'Lower corridor overhead', params: { width: LCW, depth: lcz1 - lcz0, height: 2.1 },
    pos: [LCX, D2, (lcz0 + lcz1) / 2], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: [], note: 'Coolant lines run exposed along it.',
  });
  add('lowEndS', {
    room: 'lower-corridor', type: 'wall', name: 'Lower corridor end', params: { length: LCW, height: 2.1, thickness: 0.12 },
    pos: [LCX, D2, lcz1], rotY: 0, locked: true,
    evidence: 'assumption', evidenceRefs: ['cabin-bend'],
    note: 'The corridor bends on beyond here in the prose ("Down the bend, someone waited too") — capped for now.',
  });
  // east wall: solid except the stair-shaft mouth and the crew-quarters door
  const lcE = LCX + LCW / 2;
  const eSegs = [
    ['lowWallE1', lcz0, 3.1], ['lowWallE2', 4.2, 5.35], ['lowWallE3', 6.45, lcz1],
  ];
  for (const [key, a, b] of eSegs) {
    add(key, {
      room: 'lower-corridor', type: 'wall', name: 'Lower corridor wall (starboard)', params: { length: b - a, height: 2.1, thickness: 0.12 },
      pos: [lcE, D2, (a + b) / 2], rotY: Math.PI / 2, locked: true,
      evidence: 'assumption', evidenceRefs: ['lower-corridor'], note: '',
    });
  }
  add('qtrDoor', {
    room: 'quarters', type: 'doorway', name: 'Crew quarters door',
    params: { length: 1.1, height: 2.1, thickness: 0.12, doorWidth: 0.8, doorHeight: 1.9, kind: 'sliding', slideDir: 1, open: 0 },
    pos: [lcE, D2, 5.9], rotY: Math.PI / 2, locked: false,
    evidence: 'explicit', evidenceRefs: ['crew-quarters', 'doors-wait'],
    note: 'Where B.O.B. reports Nova sleeping — "Crew quarters."',
  });
  // west wall: segments between the cabin doors (doors sit toward the foot
  // of each cabin so the bunk wall stays clear)
  const lcWx = LCX - LCW / 2;
  const cabinCenterZ = [5.2, 7.1, 9.0, 10.9];  // cabins 1, 2, 3 (Iri's) and Cabin Six
  const cabinDoorZ = cabinCenterZ.map(z => z + 0.25);
  const wSegs = [];
  let prev = lcz0;
  for (const dz of cabinDoorZ) { wSegs.push([prev, dz - 0.45]); prev = dz + 0.45; }
  wSegs.push([prev, lcz1]);
  wSegs.forEach(([a, b], i) => {
    if (b - a < 0.05) return;
    add('lowWallW' + i, {
      room: 'lower-corridor', type: 'wall', name: 'Lower corridor wall (port)', params: { length: b - a, height: 2.1, thickness: 0.12 },
      pos: [lcWx, D2, (a + b) / 2], rotY: Math.PI / 2, locked: true,
      evidence: 'assumption', evidenceRefs: ['cabin-row'], note: '',
    });
  });

  // ---------- cabin row ----------
  const CABD = 1.9, CABW = 1.8;          // depth (x) × width (z)
  const cabX = lcWx - CABD / 2;
  const cabinDefs = [
    ['cab1', 'Cabin One (blank)', 0, 'One blank cabin — passed without a look.', ['cabin-row']],
    ['cab2', 'Cabin Two (door ajar)', 0.4, 'Door ajar, too orderly.', ['cabin-row']],
    ['cab3', iriRuling === 'aft-room' ? 'Cabin Three (blank)' : 'Iri’s cabin', 0.45,
      iriRuling === 'aft-room'
        ? 'Your ruling: Iri’s quarters are the aft room past the galley; this cabin stands empty.'
        : (iriProvisional ? '⚠ Provisional — the Iri’s-quarters conflict is unresolved. ' : '') +
          'The door held at half-angle. Half-invite. Her worktable and sealed storage hatch inside.',
      ['iri-cabin-lower', 'cabin-row', 'iri-worktable', 'iri-storage-hatch']],
    ['cab6', 'Cabin Six', 0,
      'Unmarked. Shut. No one’s — until Quenby takes it. The bunk low and tight-cornered, sheet pulled taut; the wall where the mirror isn’t; gravity a quarter heavy near the far bulkhead. The door slides its last centimeter on its own and catches.',
      ['cabin-six', 'cabin-six-room', 'cabin-bunk', 'cabin-mirror', 'cabin-door-catch']],
  ];
  cabinDefs.forEach(([key, name, doorOpen, note, refs], i) => {
    const cz = cabinCenterZ[i];
    add(key + 'Floor', {
      room: 'cabin', type: 'floor', name: name + ' deck', params: { width: CABD, depth: CABW },
      pos: [cabX, D2, cz], rotY: 0, locked: true,
      evidence: key === 'cab6' ? 'explicit' : 'inference', evidenceRefs: refs, note,
    });
    add(key + 'Ceil', {
      room: 'cabin', type: 'ceiling', name: name + ' overhead', params: { width: CABD, depth: CABW, height: 2.05 },
      pos: [cabX, D2, cz], rotY: 0, locked: true, evidence: 'assumption', evidenceRefs: [], note: '',
    });
    add(key + 'Door', {
      room: 'cabin', type: 'doorway', name: name + ' door',
      params: { length: 1.1, height: 2.05, thickness: 0.1, doorWidth: 0.75, doorHeight: 1.9, kind: 'sliding', slideDir: 1, open: doorOpen },
      pos: [lcWx, D2, cabinDoorZ[i]], rotY: Math.PI / 2, locked: false,
      evidence: key === 'cab6' || key === 'cab3' ? 'explicit' : 'inference', evidenceRefs: refs, note,
    });
    for (const s of [-1, 1]) {
      add(key + (s < 0 ? 'WallN' : 'WallS'), {
        room: 'cabin', type: 'wall', name: name + ' wall', params: { length: CABD, height: 2.05, thickness: 0.1 },
        pos: [cabX, D2, cz + s * CABW / 2], rotY: 0, locked: true, evidence: 'assumption', evidenceRefs: [], note: '',
      });
    }
    add(key + 'WallW', {
      room: 'cabin', type: 'wall', name: name + ' wall (hull)', params: { length: CABW, height: 2.05, thickness: 0.1 },
      pos: [cabX - CABD / 2, D2, cz], rotY: Math.PI / 2, locked: true,
      evidence: 'assumption', evidenceRefs: [],
      note: key === 'cab6' ? 'Gravity runs a quarter heavy near this far bulkhead. The mirror isn’t on it.' : '',
    });
    add(key + 'Bunk', {
      room: 'cabin', type: 'bench', name: name + ' bunk',
      params: { width: 1.78, height: 0.4, depth: 0.68 },
      pos: [cabX - 0.05, D2, cz - CABW / 2 + 0.39], rotY: 0, locked: false,
      evidence: key === 'cab6' ? 'explicit' : 'inference',
      evidenceRefs: key === 'cab6' ? ['cabin-bunk'] : ['cabin-row'],
      note: key === 'cab6' ? 'Standard. Low, tight-cornered. Sheet pulled taut.' : 'Standard low bunk.',
    });
  });
  if (iriRuling !== 'aft-room') {
    add('cab3Table', {
      room: 'cabin', type: 'table', name: 'Iri’s worktable',
      params: { width: 0.5, depth: 0.85, height: 0.78 },
      pos: [cabX - 0.5, D2, cabinCenterZ[2] + 0.55], rotY: 0, locked: false,
      evidence: iriProvisional ? 'assumption' : 'decision', evidenceRefs: ['iri-worktable'],
      note: (iriProvisional ? '⚠ Provisional — part of the unresolved Iri’s-quarters conflict. ' : '') + 'Where she lays the found pieces out with both hands.',
    });
    add('cab3Hatch', {
      room: 'cabin', type: 'storage', name: 'Sealed storage hatch',
      params: { width: 0.7, height: 1.1, depth: 0.28 },
      pos: [cabX + 0.5, D2, cabinCenterZ[2] + CABW / 2 - 0.15], rotY: Math.PI, locked: false,
      evidence: iriProvisional ? 'assumption' : 'decision', evidenceRefs: ['iri-storage-hatch'],
      note: 'Soft-wrapped, layered, sealed.',
    });
  }

  // ---------- crew quarters (Nova) ----------
  const QW = 2.5, QD = 2.4;
  const qx = lcE + QW / 2, qz = 5.9;
  add('qtrFloor', {
    room: 'quarters', type: 'floor', name: 'Crew quarters deck', params: { width: QW, depth: QD },
    pos: [qx, D2, qz], rotY: 0, locked: true,
    evidence: 'explicit', evidenceRefs: ['crew-quarters', 'quarters-loop'],
    note: 'Where Nova sleeps — she left it 23 minutes before being found in pocket three. Its environmental loop runs at minimal.',
  });
  add('qtrCeil', {
    room: 'quarters', type: 'ceiling', name: 'Crew quarters overhead', params: { width: QW, depth: QD, height: 2.1 },
    pos: [qx, D2, qz], rotY: 0, locked: true, evidence: 'assumption', evidenceRefs: [], note: '',
  });
  add('qtrWallN', {
    room: 'quarters', type: 'wall', name: 'Crew quarters wall', params: { length: QW, height: 2.1, thickness: 0.1 },
    pos: [qx, D2, qz - QD / 2], rotY: 0, locked: true, evidence: 'assumption', evidenceRefs: [], note: '',
  });
  add('qtrWallS', {
    room: 'quarters', type: 'wall', name: 'Crew quarters wall', params: { length: QW, height: 2.1, thickness: 0.1 },
    pos: [qx, D2, qz + QD / 2], rotY: 0, locked: true, evidence: 'assumption', evidenceRefs: [], note: '',
  });
  add('qtrWallE', {
    room: 'quarters', type: 'wall', name: 'Crew quarters wall (hull)', params: { length: QD, height: 2.1, thickness: 0.1 },
    pos: [qx + QW / 2, D2, qz], rotY: Math.PI / 2, locked: true, evidence: 'assumption', evidenceRefs: [], note: '',
  });
  add('qtrBunk', {
    room: 'quarters', type: 'bench', name: 'Nova’s bunk',
    params: { width: 1.5, height: 0.4, depth: 0.7 },
    pos: [qx + 0.3, D2, qz - QD / 2 + 0.4], rotY: 0, locked: false,
    evidence: 'inference', evidenceRefs: ['crew-quarters'],
    note: 'Sized for her; the blanket she wears like a cape lives here when it isn’t on her shoulders.',
  });
  add('qtrCrate', {
    room: 'quarters', type: 'crate', name: 'Salvage crate',
    params: { width: 0.5, height: 0.4, depth: 0.45 },
    pos: [qx + 0.55, D2, qz + QD / 2 - 0.4], rotY: 0.3, locked: false,
    evidence: 'inference', evidenceRefs: ['crew-quarters', 'bolts-source'],
    note: 'Scavenger’s stock — washers, stripped bolts, things with threads.',
  });

  // ---------- skiff / gear bay ----------
  const SBW = 5.5, SBD = 4.6;
  const sbx = mEp - 6.0 + SBW / 2, sbz = lcz0 - SBD / 2;
  add('sbFloor', {
    room: 'skiffbay', type: 'floor', name: 'Gear bay deck', params: { width: SBW, depth: SBD },
    pos: [sbx, D2, sbz], rotY: 0, locked: true,
    evidence: 'explicit', evidenceRefs: ['skiff-cradle', 'bay-lights-low', 'bay-medbay-near'],
    note: 'The gear bay — lights kept low, deck temperature neither welcome nor warning. The stairwell up to the medbay corridor makes the "short distance" of Presence-04.',
  });
  add('sbCeil', {
    room: 'skiffbay', type: 'ceiling', name: 'Gear bay overhead', params: { width: SBW, depth: SBD, height: 2.5 },
    pos: [sbx, D2, sbz], rotY: 0, locked: true, evidence: 'assumption', evidenceRefs: [], note: 'Taller than the corridors — skiff clearance.',
  });
  add('sbWallN', {
    room: 'skiffbay', type: 'wall', name: 'Gear bay wall (fwd)', params: { length: SBW, height: 2.5, thickness: 0.14 },
    pos: [sbx, D2, sbz - SBD / 2], rotY: 0, locked: true, evidence: 'assumption', evidenceRefs: [], note: '',
  });
  add('sbLaunchDoor', {
    room: 'skiffbay', type: 'doorway', name: 'Launch aperture',
    params: { length: SBD, height: 2.5, thickness: 0.16, doorWidth: 2.3, doorHeight: 2.2, kind: 'sliding', slideDir: 1, open: 0 },
    pos: [sbx - SBW / 2, D2, sbz], rotY: Math.PI / 2, locked: true,
    evidence: 'explicit', evidenceRefs: ['bay-launch-dark'],
    note: '"The skiff took the bay lights with it. Black cut into the room." The bay opens to space here.',
  });
  // south wall carries the door into the lower corridor
  const sbSeg1 = (LCX - 0.55) - (sbx - SBW / 2);
  const sbSeg2 = (sbx + SBW / 2) - (LCX + 0.55);
  add('sbWallS1', {
    room: 'skiffbay', type: 'wall', name: 'Gear bay wall (aft port)', params: { length: sbSeg1, height: 2.5, thickness: 0.14 },
    pos: [sbx - SBW / 2 + sbSeg1 / 2, D2, lcz0], rotY: 0, locked: true, evidence: 'assumption', evidenceRefs: [], note: '',
  });
  add('sbHatch', {
    room: 'skiffbay', type: 'doorway', name: 'Bay hatch',
    params: { length: 1.1, height: 2.5, thickness: 0.14, doorWidth: 0.85, doorHeight: 1.95, kind: 'sliding', slideDir: -1, open: 0 },
    pos: [LCX, D2, lcz0], rotY: 0, locked: false,
    evidence: 'explicit', evidenceRefs: ['bay-palm-hatch', 'bay-medbay-near', 'doors-wait'],
    note: 'The palm-activated bay hatch — she lets the ship choose to open rather than be told.',
  });
  add('sbWallS2', {
    room: 'skiffbay', type: 'wall', name: 'Gear bay wall (aft stbd)', params: { length: sbSeg2, height: 2.5, thickness: 0.14 },
    pos: [LCX + 0.55 + sbSeg2 / 2, D2, lcz0], rotY: 0, locked: true, evidence: 'assumption', evidenceRefs: [], note: '',
  });
  add('sbWallE', {
    room: 'skiffbay', type: 'wall', name: 'Gear bay wall (stbd)', params: { length: SBD, height: 2.5, thickness: 0.14 },
    pos: [sbx + SBW / 2, D2, sbz], rotY: Math.PI / 2, locked: true, evidence: 'assumption', evidenceRefs: [], note: '',
  });
  add('sbSkiff', {
    room: 'skiffbay', type: 'crate', name: 'Skiff in its cradle',
    params: { width: 2.6, height: 1.35, depth: 1.5 },
    pos: [sbx - 0.7, D2, sbz - 0.6], rotY: 0.06, locked: false,
    evidence: 'explicit', evidenceRefs: ['skiff-cradle', 'cradle-clunk'],
    note: 'Sour and ready. The cradle disengages with a low clunk you feel in your teeth.',
  });
  add('sbRig', {
    room: 'skiffbay', type: 'console', name: 'Rig station',
    params: { width: 1.1, depth: 0.6, height: 0.95, screens: 1, lit: true },
    pos: [sbx + 1.6, D2, sbz - SBD / 2 + 0.42], rotY: 0, locked: false,
    evidence: 'explicit', evidenceRefs: ['rig-station'],
    note: 'Clamps aligned. Seals checked.',
  });
  add('sbGrid', {
    room: 'skiffbay', type: 'shelf', name: 'Loadout grid',
    params: { width: 1.4, depth: 0.28, mountHeight: 1.25, tins: 0 },
    pos: [sbx + SBW / 2 - 0.16, D2, sbz + 0.5], rotY: Math.PI / 2, locked: false,
    evidence: 'explicit', evidenceRefs: ['loadout-grid'],
    note: 'Taken the way some people take a pulpit — leaning, not preaching.',
  });
  add('sbLocker', {
    room: 'skiffbay', type: 'storage', name: 'Rig locker',
    params: { width: 1.0, height: 1.8, depth: 0.45 },
    pos: [sbx + 1.7, D2, lcz0 - 0.28], rotY: 0, locked: false,
    evidence: 'explicit', evidenceRefs: ['rig-locker'],
    note: 'The packed rig inside — straps threaded, clamps nested, weight balanced. Sealed, not locked.',
  });

  // ---------- Iri's quarters, aft-room ruling ----------
  if (iriRuling === 'aft-room') {
    const iqW = 1.8, iqD = 1.6;
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
    add('iriQTable', {
      room: 'quarters', type: 'table', name: 'Iri’s worktable',
      params: { width: 0.85, depth: 0.5, height: 0.78 },
      pos: [iqx + 0.25, 0, iqz + 0.45], rotY: Math.PI, locked: false,
      evidence: 'decision', evidenceRefs: ['iri-worktable'], note: 'Where she lays the found pieces out with both hands.',
    });
    add('iriQHatch', {
      room: 'quarters', type: 'shelf', name: 'Sealed storage hatch',
      params: { width: 0.7, depth: 0.26, mountHeight: 1.2, tins: 0 },
      pos: [iqx - iqW / 2 + 0.14, 0, iqz + 0.1], rotY: Math.PI / 2, locked: false,
      evidence: 'decision', evidenceRefs: ['iri-storage-hatch'],
      note: 'A wall hatch above the bunk — soft-wrapped, layered, sealed.',
    });
    add('iriQBunk', {
      room: 'quarters', type: 'bench', name: 'Iri’s bunk',
      params: { width: 0.65, height: 0.4, depth: 1.35 },
      pos: [iqx - iqW / 2 + 0.35, 0, iqz], rotY: 0, locked: false,
      evidence: 'decision', evidenceRefs: ['iri-quarters-route'], note: 'The cabin she keeps and rarely sleeps in.',
    });
  }

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
  'declared:door-behind~throttle': ['doorway', 'aftWallL', 'aftWallR', 'wallStbd*', 'doorSill', 'cor*', 'spine*', 'spn*', 'pkt*', 'med*', 'gal*', 'alk*', 'eng*', 'dome*', 'stw*', 'stairDoor', 'low*', 'cab*', 'qtr*', 'sb*', 'iriQ*'],
  'declared:knees-touch~rail-between': ['stationRail'],
  'declared:galley-island~galley-tiny': ['gal*'],
  'declared:med-cot~med-two-beds': ['medCot', 'medUpperBed'],
  'declared:eng-belowdeck~eng-walkin': ['engFloor', 'engCeil', 'engWall*', 'engFloorHatch'],
  'declared:iri-cabin-lower~iri-quarters-route': ['cab3*', 'iriQ*', 'engWall*'],
};

// Layout-format migrations: when a generated object's DEFINITION changed
// between app versions, these keys are force-regenerated on old projects
// (user-added objects and rulings are untouched).
export const LAYOUT_VERSION = 5;
export const LAYOUT_MIGRATION_KEYS = {
  3: ['corWallPort', 'spineStub*'],   // port wall split for the medbay hatch; spine stub became the real spine
  4: ['corWallStbd1', 'spnLeg2*'],    // starboard wall split for the airlock; spine extended to the engine bay
  5: ['corWallPort'],                 // port wall split again for the stairwell down to the lower deck
};
