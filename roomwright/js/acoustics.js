// Sound and privacy model for the Wild Huntress.
//
// Three channels, per the design log's acoustics reference:
//  - airborne: shortest path through open volumes (walls block; doors leak
//    by state; stair and ladder wells are chimneys between decks)
//  - structure-borne: through the metal frame — words die fast, rhythm and
//    machinery don't; distance is straight-line through structure
//  - duct-borne: rooms on the same vent branch hear each other faintly at
//    night in drift (PROVISIONAL branch table until ducting is routed)
//
// Budgets are in "corridor-meter" units, tuned so the canonical prose facts
// hold (see the sound-and-privacy habit test). Flight mode sets the noise
// floor: burn masks nearly everything; drift at night masks nothing.
import * as THREE from 'three';
import { state } from './state.js';
import { editor } from './editor.js';

export const SOUND_KINDS = {
  speech:    { air: 19.5, structTone: 0.8, structPresence: 2.6, label: 'conversation' },
  intimacy:  { air: 12, structTone: 1.6, structPresence: 8.0, label: 'intimacy / bunk rhythm' },
  impact:    { air: 15, structTone: 3.0, structPresence: 12,  label: 'impact / dropped tool' },
  machinery: { air: 26, structTone: 5.5, structPresence: 16,  label: 'running machinery' },
};
export const FLIGHT_MODES = { 'drift-night': 0, 'drift-day': 3, 'burn': 9 };

const WALL_TYPES = ['wall', 'doorway', 'viewport', 'domeShell'];
const MASKING_ROOMS = new Set(['engine', 'work-spine', 'skiffbay', 'wet-service', 'freight-lock']);
const DOOR_CLOSED_COST = 15;   // a shut pressure-rated hatch (leak only)
const DOOR_OPEN_COST = 1;      // an open doorway still funnels
const DOOR_AJAR_COST = 6;      // half-angle / drifted-open

// PROVISIONAL vent branches (by layoutKey of the room's floor) — replace
// when the ducting pass routes real runs. Medbay's filtered loop is silent.
const DUCT_BRANCHES = [
  ['residential A (cabins 1–4)', ['cab1Floor', 'cab2Floor', 'cab3Floor', 'cab4Floor', 'resApproachFloor']],
  ['residential B (quiet run / wet core)', ['cab5Floor', 'cab6Floor', 'quietRunFloor', 'gardenFloor', 'wetCoreFloor']],
  ['domestic (galley / hygiene)', ['galFloor', 'hygBranchFloor', 'hygVestFloor', 'hygToiletFloor', 'hygShowerFloor', 'domServiceFloor']],
  ['operations (bay / spine)', ['opLandingFloor', 'sbFloor', 'workSpineFloor', 'workHeadFloor', 'flexFloor']],
];

const deckOf = rec => Math.round(((rec.pos[1] || 0)) * 10) / 10;

function floorRect(f) {
  const fw = f.params.width ?? 6, fd = f.params.depth ?? 5;
  const rot = Math.abs(Math.sin(f.rotY || 0)) > 0.5;
  const hw = (rot ? fd : fw) / 2, hd = (rot ? fw : fd) / 2;
  return { minX: f.pos[0] - hw, maxX: f.pos[0] + hw, minZ: f.pos[2] - hd, maxZ: f.pos[2] + hd };
}

// wall-class AABBs for one deck, skipping door leaves (sound leaks by the
// door's state, not by where its leaf happens to be parked)
function acousticBlockers(deckY) {
  const out = [];
  for (const [id, g] of editor.objectGroups) {
    const rec = state.getObject(id);
    if (!rec || !WALL_TYPES.includes(rec.type)) continue;
    g.updateMatrixWorld(true);
    g.traverse(node => {
      if (!node.isMesh) return;
      let p = node;
      while (p && p !== g) { if (p.userData.isDoorLeaf) return; p = p.parent; }
      const bb = new THREE.Box3().setFromObject(node);
      if (bb.isEmpty()) return;
      if (bb.max.y < deckY + 0.25 || bb.min.y > deckY + 1.85) return;
      out.push(bb);
    });
  }
  return out;
}

// door opening zones on one deck, with a traversal surcharge by door state
function doorZones(deckY) {
  const zones = [];
  for (const o of state.project.objects) {
    if (o.type !== 'doorway') continue;
    if (Math.abs((o.pos[1] || 0) - deckY) > 0.4) continue;
    const open = o.params.open ?? 0;
    const total = open >= 0.6 ? DOOR_OPEN_COST : open >= 0.12 ? DOOR_AJAR_COST : DOOR_CLOSED_COST;
    const dw = (o.params.doorWidth ?? 0.85) / 2 + 0.1;
    const rot = Math.abs(Math.sin(o.rotY || 0)) > 0.5;
    zones.push({
      minX: o.pos[0] - (rot ? 0.35 : dw), maxX: o.pos[0] + (rot ? 0.35 : dw),
      minZ: o.pos[2] - (rot ? dw : 0.35), maxZ: o.pos[2] + (rot ? dw : 0.35),
      perCell: total / 6,   // opening depth ≈ 6 cells
    });
  }
  return zones;
}

export function buildDeckField(deckY) {
  const floors = state.project.objects.filter(o => o.type === 'floor' && Math.abs(deckOf(o) - deckY) < 0.4);
  if (!floors.length) return null;
  const rects = floors.map(floorRect);
  const minX = Math.min(...rects.map(r => r.minX)), maxX = Math.max(...rects.map(r => r.maxX));
  const minZ = Math.min(...rects.map(r => r.minZ)), maxZ = Math.max(...rects.map(r => r.maxZ));
  const cell = 0.1;
  const nx = Math.max(1, Math.ceil((maxX - minX) / cell));
  const nz = Math.max(1, Math.ceil((maxZ - minZ) / cell));
  const ox = minX + cell / 2, oz = minZ + cell / 2;
  const onFloor = (x, z) => rects.some(r => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ);
  const blockers = acousticBlockers(deckY);
  const zones = doorZones(deckY);
  const open = new Uint8Array(nx * nz);
  const cost = new Float32Array(nx * nz).fill(cell);
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const x = ox + i * cell, z = oz + j * cell;
    if (!onFloor(x, z)) continue;
    let blocked = false;
    for (const bb of blockers) {
      if (x > bb.min.x - 0.02 && x < bb.max.x + 0.02 && z > bb.min.z - 0.02 && z < bb.max.z + 0.02) { blocked = true; break; }
    }
    if (blocked) continue;
    open[i * nz + j] = 1;
    for (const zn of zones) {
      if (x >= zn.minX && x <= zn.maxX && z >= zn.minZ && z <= zn.maxZ) { cost[i * nz + j] = cell + zn.perCell; break; }
    }
  }
  return { deckY, ox, oz, nx, nz, cell, open, cost };
}

// Dijkstra from the source cell across all decks, stair/ladder chimneys
// linking them. Returns per-deck distance fields (in corridor-meters).
export function propagate(source) {
  const decks = [...new Set(state.project.objects.filter(o => o.type === 'floor').map(deckOf))].sort();
  const fields = new Map();
  for (const d of decks) { const f = buildDeckField(d); if (f) fields.set(d, f); }

  const chimneys = [];
  for (const o of state.project.objects) {
    if (o.type !== 'step' || (o.params.steps ?? 0) < 8) continue;
    const base = deckOf(o);
    const drop = (o.params.steps ?? 15) * (o.params.rise ?? 0.18);
    const upper = [...fields.keys()].find(d => Math.abs((base + drop) - d) < 0.6);
    if (upper === undefined || !fields.has(base)) continue;
    const steep = (o.params.run ?? 0.2) < 0.14;
    // the flight ascends along its local axis: foot at one end (base deck),
    // head at the other (upper deck)
    const half = ((o.params.steps ?? 15) * (o.params.run ?? 0.2)) / 2;
    const dirX = Math.sin(o.rotY || 0), dirZ = Math.cos(o.rotY || 0);
    chimneys.push({
      a: { deck: base, x: o.pos[0] - dirX * half, z: o.pos[2] - dirZ * half },
      b: { deck: upper, x: o.pos[0] + dirX * half, z: o.pos[2] + dirZ * half },
      len: steep ? 6 : 5,
    });
  }

  // float64: with float32 storage, a stored distance can round below the
  // pushed float64 key and the staleness check would kill fresh entries
  const dist = new Map();
  for (const [d, f] of fields) dist.set(d, new Float64Array(f.nx * f.nz).fill(Infinity));
  const nearOpen = (f, x, z, radius = 14) => {
    const ci = Math.round((x - f.ox) / f.cell), cj = Math.round((z - f.oz) / f.cell);
    for (let r = 0; r <= radius; r++) for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const i = ci + di, j = cj + dj;
      if (i >= 0 && j >= 0 && i < f.nx && j < f.nz && f.open[i * f.nz + j]) return [i, j];
    }
    return null;
  };

  // min-heap
  const heap = []; // [dist, deck, idx]
  const push = (d, deck, idx) => { heap.push([d, deck, idx]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0]; const last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };

  const sf = fields.get(source.deck);
  if (!sf) return { fields, dist };
  const start = nearOpen(sf, source.x, source.z);
  if (!start) return { fields, dist };
  dist.get(source.deck)[start[0] * sf.nz + start[1]] = 0;
  push(0, source.deck, start[0] * sf.nz + start[1]);

  const chimneyCells = chimneys.map(c => {
    const fa = fields.get(c.a.deck), fb = fields.get(c.b.deck);
    const ca = fa && nearOpen(fa, c.a.x, c.a.z), cb = fb && nearOpen(fb, c.b.x, c.b.z);
    return ca && cb ? { aDeck: c.a.deck, aIdx: ca[0] * fa.nz + ca[1], bDeck: c.b.deck, bIdx: cb[0] * fb.nz + cb[1], len: c.len } : null;
  }).filter(Boolean);

  while (heap.length) {
    const [d, deck, idx] = pop();
    const f = fields.get(deck), dd = dist.get(deck);
    if (d > dd[idx]) continue;
    const ci = Math.floor(idx / f.nz), cj = idx % f.nz;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const i = ci + di, j = cj + dj;
      if (i < 0 || j < 0 || i >= f.nx || j >= f.nz) continue;
      const nIdx = i * f.nz + j;
      if (!f.open[nIdx]) continue;
      const nd = d + f.cost[nIdx];
      if (nd < dd[nIdx]) { dd[nIdx] = nd; push(nd, deck, nIdx); }
    }
    for (const c of chimneyCells) {
      if (c.aDeck === deck && c.aIdx === idx) { const o = dist.get(c.bDeck); if (d + c.len < o[c.bIdx]) { o[c.bIdx] = d + c.len; push(d + c.len, c.bDeck, c.bIdx); } }
      if (c.bDeck === deck && c.bIdx === idx) { const o = dist.get(c.aDeck); if (d + c.len < o[c.aIdx]) { o[c.aIdx] = d + c.len; push(d + c.len, c.aDeck, c.aIdx); } }
    }
  }
  return { fields, dist };
}

const LEVEL_ORDER = ['silent', 'presence', 'tone', 'words'];
const maxLevel = (a, b) => LEVEL_ORDER.indexOf(a) >= LEVEL_ORDER.indexOf(b) ? a : b;

// The report: for a source point + kind + flight mode, what does every
// room hear? Source deck is snapped to the nearest floor under the point.
export function audibilityReport(pt, kind = 'speech', mode = 'drift-night') {
  const K = SOUND_KINDS[kind] || SOUND_KINDS.speech;
  const modePen = FLIGHT_MODES[mode] ?? 0;
  const floors = state.project.objects.filter(o => o.type === 'floor');
  // snap source deck: containing floor first, else nearest
  let src = null, best = Infinity;
  for (const f of floors) {
    const r = floorRect(f);
    const inside = pt.x >= r.minX && pt.x <= r.maxX && pt.z >= r.minZ && pt.z <= r.maxZ;
    const d = inside ? 0 : Math.hypot(Math.max(r.minX - pt.x, 0, pt.x - r.maxX), Math.max(r.minZ - pt.z, 0, pt.z - r.maxZ));
    const dy = (pt.y !== undefined) ? Math.abs(deckOf(f) - pt.y) * 2 : 0;
    if (d + dy < best) { best = d + dy; src = f; }
  }
  if (!src) return { source: null, rows: [] };
  const srcDeck = deckOf(src);
  const source = { deck: srcDeck, x: pt.x, z: pt.z };
  const { fields, dist } = propagate(source);
  const srcMasked = MASKING_ROOMS.has(src.room) ? 4 : 0;

  const branchOf = f => DUCT_BRANCHES.find(([, keys]) => keys.includes(f.layoutKey))?.[0] || null;
  const srcBranch = branchOf(src);

  const rows = [];
  for (const f of floors) {
    const deck = deckOf(f);
    const fld = fields.get(deck), dd = dist.get(deck);
    let level = 'silent', channel = '';
    // airborne
    if (fld && dd) {
      const ci = Math.round((f.pos[0] - fld.ox) / fld.cell), cj = Math.round((f.pos[2] - fld.oz) / fld.cell);
      let L = Infinity;
      for (let r = 0; r <= 4 && L === Infinity; r++) for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) {
        const i = ci + di, j = cj + dj;
        if (i >= 0 && j >= 0 && i < fld.nx && j < fld.nz && dd[i * fld.nz + j] < L) L = dd[i * fld.nz + j];
      }
      if (L < Infinity) {
        const rem = K.air - L - modePen - srcMasked - (MASKING_ROOMS.has(f.room) ? 6 : 0);
        const air = rem >= 8 ? 'words' : rem >= 3 ? 'tone' : rem >= 0 ? 'presence' : 'silent';
        if (air !== 'silent') { level = air; channel = 'air'; }
      }
    }
    // structure-borne (mode softens it less: halve the penalty)
    const d3 = Math.hypot(f.pos[0] - pt.x, deck - srcDeck, f.pos[2] - pt.z);
    const sPen = (modePen + (MASKING_ROOMS.has(f.room) ? 6 : 0)) * 0.5;
    const sLevel = d3 <= Math.max(0, K.structTone - sPen * 0.2) ? 'tone'
      : d3 <= Math.max(0, K.structPresence - sPen) ? 'presence' : 'silent';
    if (LEVEL_ORDER.indexOf(sLevel) > LEVEL_ORDER.indexOf(level)) { level = sLevel; channel = 'structure'; }
    // duct (provisional): same branch, only in quiet drift
    if (srcBranch && branchOf(f) === srcBranch && f.id !== src.id && mode === 'drift-night') {
      if (LEVEL_ORDER.indexOf('presence') > LEVEL_ORDER.indexOf(level)) { level = 'presence'; channel = 'duct (provisional)'; }
    }
    if (f.id === src.id) { level = 'words'; channel = 'source room'; }
    rows.push({ name: f.name, room: f.room, layoutKey: f.layoutKey, deck, level, channel });
  }
  rows.sort((a, b) => LEVEL_ORDER.indexOf(b.level) - LEVEL_ORDER.indexOf(a.level));
  return { source: { floor: src.name, deck: srcDeck, kind, mode }, rows };
}

// convenience for tests: level heard at a named floor
export function levelAt(report, layoutKey) {
  return report.rows.find(r => r.layoutKey === layoutKey)?.level ?? 'silent';
}
