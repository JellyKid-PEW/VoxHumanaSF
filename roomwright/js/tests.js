// Habit tests: reusable spatial checks with green/amber/red results.
// All measurements are taken from the live 3D geometry, not from the data.
import * as THREE from 'three';
import { state } from './state.js';
import { editor, objectAABB, collectAABBs, castSight, circleHitsColliders, clearSightLines, drawSightLine } from './editor.js';
import { CHARACTERS, eyeHeight } from './mannequin.js';
import { fmt } from './util.js';

// ---------- navigation grid ----------
export function computeNavGrid(radius = 0.24, extraObstacles = []) {
  const floorRec = state.project.objects.find(o => o.type === 'floor');
  if (!floorRec) return null;
  // true walkable bounds from the floor's own parameters (its meshes are
  // non-collidable, so an AABB query would come back empty)
  const fw = floorRec.params.width ?? 6, fd = floorRec.params.depth ?? 5;
  const rot = Math.abs(Math.sin(floorRec.rotY || 0)) > 0.5;
  const hw = (rot ? fd : fw) / 2, hd = (rot ? fw : fd) / 2;
  const fb = new THREE.Box3(
    new THREE.Vector3(floorRec.pos[0] - hw, 0, floorRec.pos[2] - hd),
    new THREE.Vector3(floorRec.pos[0] + hw, 0, floorRec.pos[2] + hd));
  const cell = 0.1;
  const ox = fb.min.x + cell / 2, oz = fb.min.z + cell / 2;
  const nx = Math.max(1, Math.floor((fb.max.x - fb.min.x) / cell));
  const nz = Math.max(1, Math.floor((fb.max.z - fb.min.z) / cell));

  // pre-collect blocker AABBs (skip floor/ceiling/bolts and door leaves)
  const blockers = [];
  for (const [id, g] of editor.objectGroups) {
    const rec = state.getObject(id);
    if (!rec || ['floor', 'ceiling', 'bolts'].includes(rec.type)) continue;
    for (const bb of collectAABBs(g, true)) {
      if (bb.max.y < 0.12 || bb.min.y > 1.85) continue; // sills / overhead don't block
      blockers.push(bb);
    }
  }
  const walkable = new Uint8Array(nx * nz).fill(1);
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const x = ox + i * cell, z = oz + j * cell;
      let blocked = false;
      for (const bb of blockers) {
        const cx = Math.max(bb.min.x, Math.min(x, bb.max.x));
        const cz = Math.max(bb.min.z, Math.min(z, bb.max.z));
        if ((cx - x) ** 2 + (cz - z) ** 2 < radius * radius) { blocked = true; break; }
      }
      if (!blocked) {
        for (const ob of extraObstacles) {
          if ((ob.x - x) ** 2 + (ob.z - z) ** 2 < (ob.r + radius) ** 2) { blocked = true; break; }
        }
      }
      if (blocked) walkable[i * nz + j] = 0;
    }
  }
  return { ox, oz, nx, nz, cell, walkable };
}

export function findPath(grid, from, to, snapRadius = 4) {
  if (!grid) return null;
  const toCell = p => [
    Math.round((p.x - grid.ox) / grid.cell),
    Math.round((p.z - grid.oz) / grid.cell),
  ];
  // snap endpoints to nearest walkable cell within snapRadius cells
  const snap = ([ci, cj]) => {
    if (ci >= 0 && cj >= 0 && ci < grid.nx && cj < grid.nz && grid.walkable[ci * grid.nz + cj]) return [ci, cj];
    for (let r = 1; r <= snapRadius; r++) {
      for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) {
        const i = ci + di, j = cj + dj;
        if (i >= 0 && j >= 0 && i < grid.nx && j < grid.nz && grid.walkable[i * grid.nz + j]) return [i, j];
      }
    }
    return null;
  };
  const a = snap(toCell(from)), b = snap(toCell(to));
  if (!a || !b) return null;
  const prev = new Int32Array(grid.nx * grid.nz).fill(-1);
  const startIdx = a[0] * grid.nz + a[1], endIdx = b[0] * grid.nz + b[1];
  const q = [startIdx];
  prev[startIdx] = startIdx;
  let found = startIdx === endIdx;
  while (q.length && !found) {
    const cur = q.shift();
    const ci = Math.floor(cur / grid.nz), cj = cur % grid.nz;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const i = ci + di, j = cj + dj;
      if (i < 0 || j < 0 || i >= grid.nx || j >= grid.nz) continue;
      const idx = i * grid.nz + j;
      if (!grid.walkable[idx] || prev[idx] !== -1) continue;
      prev[idx] = cur;
      if (idx === endIdx) { found = true; break; }
      q.push(idx);
    }
  }
  if (!found) return null;
  const path = [];
  let cur = endIdx;
  while (cur !== startIdx) {
    path.unshift([grid.ox + Math.floor(cur / grid.nz) * grid.cell, grid.oz + (cur % grid.nz) * grid.cell]);
    cur = prev[cur];
  }
  path.unshift([grid.ox + Math.floor(startIdx / grid.nz) * grid.cell, grid.oz + (startIdx % grid.nz) * grid.cell]);
  return path;
}

// ---------- geometry helpers ----------
function sitPointsWorld() {
  const out = [];
  for (const [id, g] of editor.objectGroups) {
    const rec = state.getObject(id);
    if (!rec) continue;
    g.updateWorldMatrix(true, true);
    g.traverse(o => {
      if (o.name === 'sitPoint') out.push({ id, rec, pos: o.getWorldPosition(new THREE.Vector3()) });
    });
  }
  return out;
}
function anchorsWorld(name) {
  const out = [];
  for (const [id, g] of editor.objectGroups) {
    const rec = state.getObject(id);
    if (!rec) continue;
    g.updateWorldMatrix(true, true);
    g.traverse(o => {
      if (o.name === name) out.push({ id, rec, pos: o.getWorldPosition(new THREE.Vector3()) });
    });
  }
  return out;
}
function doorRecords() { return state.project.objects.filter(o => o.type === 'doorway'); }

function doorFloorPoint(rec, side = 1) {
  // point just inside (+side) / outside (-side) of the doorway on the floor
  const v = new THREE.Vector3(0, 0, -0.45 * side);
  v.applyAxisAngle(new THREE.Vector3(0, 1, 0), rec.rotY || 0);
  return new THREE.Vector3(rec.pos[0] + v.x, 0, rec.pos[2] + v.z);
}

// door slide/swing sweep zone as world AABB
function doorSweepBox(rec) {
  const p = rec.params;
  const dw = p.doorWidth ?? 0.85, dh = p.doorHeight ?? 1.95;
  let lo, hi;
  if ((p.kind ?? 'sliding') === 'sliding') {
    const travel = dw - 0.04;
    const dir = p.slideDir ?? 1;
    lo = new THREE.Vector3(dir > 0 ? -dw / 2 : -dw / 2 - travel, 0.05, -0.09);
    hi = new THREE.Vector3(dir > 0 ? dw / 2 + travel : dw / 2, dh, 0.09);
  } else {
    const s = p.hinge === 'right' ? 1 : -1;
    // quarter-circle sweep approximated by its bounding square on the swing side
    const dir = (p.swing === 'in') ? -1 : 1;
    lo = new THREE.Vector3(Math.min(-s * dw, 0) - dw * 0.0, 0.05, Math.min(0, dir * dw));
    hi = new THREE.Vector3(Math.max(-s * dw, 0), dh, Math.max(0, dir * dw));
    lo.x = -dw / 2 - 0.02; hi.x = dw / 2 + 0.02;
  }
  const box = new THREE.Box3(lo, hi);
  // rotate/translate (rotY is 0 or ±90° in generated layouts; general enough via corners)
  const corners = [];
  for (const x of [lo.x, hi.x]) for (const y of [lo.y, hi.y]) for (const z of [lo.z, hi.z]) {
    const v = new THREE.Vector3(x, y, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), rec.rotY || 0);
    v.x += rec.pos[0]; v.y += rec.pos[1]; v.z += rec.pos[2];
    corners.push(v);
  }
  return new THREE.Box3().setFromPoints(corners);
}

const FURNITURE_TYPES = ['console', 'seat', 'bench', 'storage', 'crate', 'table', 'rail', 'strut', 'step'];
function furnitureAABBs(excludeId = null) {
  const out = [];
  for (const rec of state.project.objects) {
    if (rec.id === excludeId || !FURNITURE_TYPES.includes(rec.type)) continue;
    const bb = objectAABB(rec.id, true);
    if (bb) out.push({ rec, bb });
  }
  return out;
}

// ---------- the habit tests ----------
export const HABIT_TESTS = [
  {
    id: 'three-seats',
    name: 'Three people can occupy the bridge seats simultaneously',
    basis: ['three-config', 'cradle-slide', 'copilot-chair', 'viewport-bench'],
    run() {
      const sits = sitPointsWorld();
      if (sits.length < 3) {
        return { status: 'fail', details: `Only ${sits.length} sittable place(s) exist (need 3). Add a seat or bench.` };
      }
      const problems = [];
      for (const s of sits) {
        // torso clearance: a 0.3 m circle at the sit point must clear OTHER objects
        const hit = (() => {
          for (const { rec, bb } of furnitureAABBs(s.id)) {
            const cx = Math.max(bb.min.x, Math.min(s.pos.x, bb.max.x));
            const cz = Math.max(bb.min.z, Math.min(s.pos.z, bb.max.z));
            if (bb.max.y > s.pos.y && bb.min.y < s.pos.y + 0.8 &&
                (cx - s.pos.x) ** 2 + (cz - s.pos.z) ** 2 < 0.28 ** 2) return rec;
          }
          return null;
        })();
        if (hit) problems.push(`${s.rec.name} is blocked by ${hit.name}`);
      }
      const free = sits.length - problems.length;
      if (free >= 3) return { status: 'pass', details: `${sits.length} sittable places (${sits.map(s => s.rec.name).join(', ')}); at least three are clear.` };
      if (free >= 2) return { status: 'warn', details: `Only ${free} clear seats.\n${problems.join('\n')}` };
      return { status: 'fail', details: problems.join('\n') };
    },
  },
  {
    id: 'nova-floor-play',
    name: 'Nova can sit and play on the floor without blocking a required path',
    basis: ['nova-bolts', 'bolts-scatter'],
    run() {
      const bolts = state.project.objects.find(o => o.type === 'bolts');
      if (!bolts) return { status: 'warn', details: 'No bolt scatter placed — add "Nova’s bolts" to test her play spot.' };
      const spot = { x: bolts.pos[0], z: bolts.pos[2], r: 0.55 };
      // her spot itself must be open floor
      const hit = circleHitsColliders(spot.x, spot.z, 0.4, 0.12, 1.2);
      if (hit) return { status: 'fail', details: `Her play spot overlaps ${hit.name}.` };
      // required paths must survive with Nova + bolts occupying the spot
      const grid = computeNavGrid(0.24, [spot]);
      const doors = doorRecords();
      if (!doors.length) return { status: 'warn', details: 'No door to route from.' };
      const doorPt = doorFloorPoint(doors[0], 1);
      const targets = [
        ['Pilot cradle', state.project.objects.find(o => o.layoutKey === 'pilotCradle')],
        ['Auxiliary console', state.project.objects.find(o => o.layoutKey === 'auxConsole')],
      ].filter(t => t[1]);
      const blockedRoutes = [];
      for (const [label, t] of targets) {
        // reaching within a step of the station counts as reaching it
        const path = findPath(grid, doorPt, new THREE.Vector3(t.pos[0], 0, t.pos[2]), 8);
        if (!path) blockedRoutes.push(label);
      }
      if (!blockedRoutes.length) {
        return { status: 'pass', details: `Play spot at (${fmt(spot.x)}, ${fmt(spot.z)}) leaves the hatch→cradle and hatch→console routes open around her.` };
      }
      return { status: 'fail', details: `With Nova on the floor, no clear route remains from the hatch to: ${blockedRoutes.join(', ')}.` };
    },
  },
  {
    id: 'feet-on-rail',
    name: 'Quenby can lounge with her feet on a railing',
    basis: ['cradle-armrests-rail', 'forward-rail-lights'],
    run() {
      const cradle = state.project.objects.find(o => o.layoutKey === 'pilotCradle') ||
        state.project.objects.find(o => o.type === 'seat');
      if (!cradle) return { status: 'fail', details: 'No pilot cradle in the model.' };
      const rails = anchorsWorld('footRest');
      if (!rails.length) return { status: 'fail', details: 'No railing in the model.' };
      const sit = new THREE.Vector3(cradle.pos[0], (cradle.params.seatHeight ?? 0.45), cradle.pos[2]);
      let best = null;
      for (const r of rails) {
        // distance from seat front edge to the nearest point of the rail line
        const g = editor.objectGroups.get(r.id);
        const bb = objectAABB(r.id, true);
        if (!bb) continue;
        const cx = Math.max(bb.min.x, Math.min(sit.x, bb.max.x));
        const cz = Math.max(bb.min.z, Math.min(sit.z, bb.max.z));
        const d = Math.hypot(cx - sit.x, cz - sit.z);
        if (!best || d < best.d) best = { d, r, railH: bb.max.y };
      }
      const legReach = CHARACTERS.quenby.height * 0.52 + 0.35; // extended legs from a reclined seat
      if (best.d <= legReach && best.railH <= 1.0) {
        return { status: 'pass', details: `Nearest rail (${best.r.rec.name}) is ${fmt(best.d)} m from the cradle at ${fmt(best.railH)} m high — inside her ${fmt(legReach)} m reclined leg reach.` };
      }
      if (best.d <= legReach + 0.35) {
        return { status: 'warn', details: `Nearest rail is ${fmt(best.d)} m away (reach ≈ ${fmt(legReach)} m) — she'd have to slide the cradle forward.` };
      }
      return { status: 'fail', details: `Nearest rail is ${fmt(best.d)} m from the cradle — beyond her ${fmt(legReach)} m leg reach.` };
    },
  },
  {
    id: 'pass-behind-seats',
    name: 'Someone can move behind the bridge seats',
    basis: ['standing-behind-chair', 'aux-cable-brush'],
    run() {
      const grid = computeNavGrid(0.24);
      const floor = state.project.objects.find(o => o.type === 'floor');
      if (!grid || !floor) return { status: 'warn', details: 'No floor to walk on.' };
      const w = floor.params.width, d = floor.params.depth;
      const seatZs = state.project.objects.filter(o => o.type === 'seat').map(o => o.pos[2]);
      const zLane = seatZs.length ? Math.max(...seatZs) + 0.55 : 0.4;
      const a = new THREE.Vector3(floor.pos[0] - w / 2 + 0.45, 0, floor.pos[2] + Math.min(zLane, d / 2 - 0.5));
      const b = new THREE.Vector3(floor.pos[0] + w / 2 - 0.45, 0, a.z);
      const path = findPath(grid, a, b);
      if (path) return { status: 'pass', details: `A clear lane crosses the bridge behind the seats (port↔starboard at z ≈ ${fmt(a.z)} m, ${path.length} cells).` };
      // try with a slimmer person
      const slim = findPath(computeNavGrid(0.19), a, b);
      if (slim) return { status: 'warn', details: 'Only a slim person (shoulder clearance < 0.48 m) can squeeze behind the seats.' };
      return { status: 'fail', details: 'No continuous route crosses the bridge behind the seats — furniture closes the aft lane.' };
    },
  },
  {
    id: 'doors-open',
    name: 'Every manual door can open fully',
    basis: ['door-palm', 'door-grind-slide', 'doors-wait'],
    run() {
      const doors = doorRecords();
      if (!doors.length) return { status: 'fail', details: 'No door in the model.' };
      const problems = [];
      for (const rec of doors) {
        const zone = doorSweepBox(rec);
        for (const { rec: f, bb } of furnitureAABBs()) {
          if (zone.intersectsBox(bb)) {
            const inter = zone.clone().intersect(bb);
            const vol = Math.max(0, inter.max.x - inter.min.x) * Math.max(0, inter.max.y - inter.min.y) * Math.max(0, inter.max.z - inter.min.z);
            if (vol > 0.0005) problems.push(`${rec.name}: ${f.name} intrudes into the ${rec.params.kind} sweep`);
          }
        }
        // mannequins in the way?
        const scene = state.activeScene;
        for (const m of (scene?.mannequins || [])) {
          const p = new THREE.Vector3(m.pos[0], 0.8, m.pos[2]);
          if (zone.containsPoint(p)) problems.push(`${rec.name}: ${CHARACTERS[m.character].label} is standing in the door sweep`);
        }
      }
      if (!problems.length) return { status: 'pass', details: `${doors.length} door(s) sweep fully clear.` };
      return { status: 'fail', details: problems.join('\n') };
    },
  },
  {
    id: 'consoles-reachable',
    name: 'Required consoles remain reachable',
    basis: ['console-under-hands', 'aux-console', 'copilot-sprawl'],
    run() {
      const consoles = state.project.objects.filter(o => o.type === 'console');
      if (!consoles.length) return { status: 'fail', details: 'No consoles in the model.' };
      const grid = computeNavGrid(0.22);
      const doors = doorRecords();
      const from = doors.length ? doorFloorPoint(doors[0], 1) : new THREE.Vector3(0, 0, 0);
      const problems = [];
      for (const c of consoles) {
        // operator point on the reach side (local +z); reachable = a walkable,
        // hatch-connected cell within arm-plus-lean distance (0.8 m) of it
        const v = new THREE.Vector3(0, 0, (c.params.depth ?? 0.7) / 2 + 0.35)
          .applyAxisAngle(new THREE.Vector3(0, 1, 0), c.rotY || 0);
        const op = new THREE.Vector3(c.pos[0] + v.x, 0, c.pos[2] + v.z);
        const path = findPath(grid, from, op, 8);
        if (!path) problems.push(`${c.name}: no clear route from the hatch to its operator position`);
      }
      if (!problems.length) return { status: 'pass', details: `All ${consoles.length} consoles have a clear route from the hatch to their operator position.` };
      if (problems.length < consoles.length) return { status: 'warn', details: problems.join('\n') };
      return { status: 'fail', details: problems.join('\n') };
    },
  },
  {
    id: 'sightlines',
    name: 'Important sightlines match the prose',
    basis: ['glass-reflects', 'cradle-view-out', 'exits-visible', 'throttle'],
    run() {
      const results = [];
      const cradle = state.project.objects.find(o => o.layoutKey === 'pilotCradle');
      const door = doorRecords()[0];
      const vp = state.project.objects.find(o => o.type === 'viewport');
      let anyFail = false;
      clearSightLines(); // draw the tested lines in the viewport (green/red)
      const cast = (label, from, to) => {
        const r = castSight(from, to);
        drawSightLine(from, r.clear ? to : (r.point || to), r.clear);
        results.push(`${label}: ${r.clear ? 'CLEAR' : 'BLOCKED by ' + (state.getObject(r.blocker)?.name || 'geometry')}`);
        if (!r.clear) anyFail = true;
      };
      if (cradle && vp) {
        const eye = new THREE.Vector3(cradle.pos[0], (cradle.params.seatHeight ?? 0.42) + 0.72, cradle.pos[2]);
        // aim through the middle of a pane, not a mullion
        const target = new THREE.Vector3(vp.pos[0] + 0.55, (vp.params.sillHeight ?? 0.55) + (vp.params.windowHeight ?? 1) / 2, vp.pos[2] - 3);
        cast('cradle → out the forward glass', eye, target);
      } else { results.push('cradle → glass: missing cradle or viewport'); anyFail = true; }
      if (cradle && door) {
        const eye = doorFloorPoint(door, 1); eye.y = eyeHeight('iri', 'stand');
        const head = new THREE.Vector3(cradle.pos[0], 1.15, cradle.pos[2]);
        cast('doorway → seated pilot', eye, head);
        // and the reverse: "I like exits visible" — pilot must see the door with a swivel
        cast('pilot (swivelled) → doorway', head, new THREE.Vector3(eye.x, 1.4, eye.z));
      }
      const copilot = state.project.objects.find(o => o.layoutKey === 'copilotChair');
      const cpc = state.project.objects.find(o => o.layoutKey === 'copilotConsole');
      if (copilot && cpc) {
        const eye = new THREE.Vector3(copilot.pos[0], (copilot.params.seatHeight ?? 0.44) + 0.62, copilot.pos[2]);
        const scr = new THREE.Vector3(cpc.pos[0], (cpc.params.height ?? 0.92) + 0.1, cpc.pos[2]);
        cast('copilot chair → its screens', eye, scr);
      }
      return { status: anyFail ? 'fail' : 'pass', details: results.join('\n') + '\n(sightlines drawn in the viewport)' };
    },
  },
  {
    id: 'no-overlap',
    name: 'No furniture overlaps an entrance, control surface, or circulation route',
    basis: ['standing-behind-chair', 'door-behind'],
    run() {
      const problems = [];
      // furniture–furniture overlap
      const items = furnitureAABBs();
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const a = items[i], b = items[j];
          if (a.bb.intersectsBox(b.bb)) {
            const inter = a.bb.clone().intersect(b.bb);
            const pen = Math.min(inter.max.x - inter.min.x, inter.max.z - inter.min.z);
            const vol = (inter.max.x - inter.min.x) * (inter.max.y - inter.min.y) * (inter.max.z - inter.min.z);
            if (pen > 0.03 && vol > 0.002) problems.push(`${a.rec.name} overlaps ${b.rec.name} (${fmt(pen * 100, 0)} cm deep)`);
          }
        }
      }
      // furniture in the doorway clearance zone
      for (const door of doorRecords()) {
        for (const side of [1, -1]) {
          const pt = doorFloorPoint(door, side);
          const hit = circleHitsColliders(pt.x, pt.z, 0.32, 0.12, 1.8);
          if (hit) {
            const rec = state.getObject(hit.id);
            if (rec && FURNITURE_TYPES.includes(rec.type)) problems.push(`${rec.name} crowds the ${door.name} clearance zone`);
          }
        }
      }
      // console control faces blocked?
      for (const c of state.project.objects.filter(o => o.type === 'console')) {
        const v = new THREE.Vector3(0, 0, (c.params.depth ?? 0.7) / 2 + 0.35)
          .applyAxisAngle(new THREE.Vector3(0, 1, 0), c.rotY || 0);
        const hit = circleHitsColliders(c.pos[0] + v.x, c.pos[2] + v.z, 0.2, 0.12, 1.4);
        if (hit && hit.id !== c.id) {
          const rec = state.getObject(hit.id);
          if (rec && ['storage', 'crate', 'table'].includes(rec.type)) problems.push(`${rec.name} blocks the control face of ${c.name}`);
        }
      }
      if (!problems.length) return { status: 'pass', details: 'No illegal overlaps; entrances and control faces are clear.' };
      return { status: 'fail', details: [...new Set(problems)].join('\n') };
    },
  },
];

export function runAllTests() {
  const out = [];
  for (const t of HABIT_TESTS) {
    let res;
    try { res = t.run(); }
    catch (e) { console.error('test failed to run', t.id, e); res = { status: 'warn', details: 'Test error: ' + e.message }; }
    out.push({ ...t, ...res });
  }
  return out;
}
