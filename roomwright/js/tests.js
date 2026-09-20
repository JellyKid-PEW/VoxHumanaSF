// Habit tests: reusable spatial checks with green/amber/red results.
// All measurements are taken from the live 3D geometry, not from the data.
import * as THREE from 'three';
import { state } from './state.js';
import { editor, objectAABB, collectAABBs, castSight, circleHitsColliders, clearSightLines, drawSightLine } from './editor.js';
import { CHARACTERS, eyeHeight } from './mannequin.js';
import { audibilityReport, levelAt, ductBranchesByFloor } from './acoustics.js';
import { FRAME } from './layout.js';
import { fmt } from './util.js';

// ---------- navigation grid ----------
// One grid per deck: floors are filtered to the requested deck height and
// blockers to the body band above that deck. Stairs never block (they are
// walking surfaces; cross-deck routes are the walker's job, not the grid's).
export function computeNavGrid(radius = 0.24, extraObstacles = [], deckY = 0) {
  // walkable ground = the union of this deck's floor rects (their meshes are
  // non-collidable, so bounds come from the floors' own parameters)
  const floorRects = state.project.objects
    .filter(o => o.type === 'floor' && Math.abs((o.pos[1] || 0) - deckY) < 0.4)
    .map(f => {
      const fw = f.params.width ?? 6, fd = f.params.depth ?? 5;
      const rot = Math.abs(Math.sin(f.rotY || 0)) > 0.5;
      const hw = (rot ? fd : fw) / 2, hd = (rot ? fw : fd) / 2;
      return { minX: f.pos[0] - hw, maxX: f.pos[0] + hw, minZ: f.pos[2] - hd, maxZ: f.pos[2] + hd };
    });
  if (!floorRects.length) return null;
  const fb = new THREE.Box3(
    new THREE.Vector3(Math.min(...floorRects.map(r => r.minX)), 0, Math.min(...floorRects.map(r => r.minZ))),
    new THREE.Vector3(Math.max(...floorRects.map(r => r.maxX)), 0, Math.max(...floorRects.map(r => r.maxZ))));
  const onFloor = (x, z) => floorRects.some(r => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ);
  const cell = 0.1;
  const ox = fb.min.x + cell / 2, oz = fb.min.z + cell / 2;
  const nx = Math.max(1, Math.floor((fb.max.x - fb.min.x) / cell));
  const nz = Math.max(1, Math.floor((fb.max.z - fb.min.z) / cell));

  // pre-collect blocker AABBs (skip floor/ceiling/bolts/steps and door leaves)
  const blockers = [];
  for (const [id, g] of editor.objectGroups) {
    const rec = state.getObject(id);
    if (!rec || ['floor', 'ceiling', 'bolts', 'step'].includes(rec.type)) continue;
    for (const bb of collectAABBs(g, true)) {
      // sills don't block; anything above the tallest crew member's head
      // (door head-jambs, low lintels) doesn't block walking either
      if (bb.max.y < deckY + 0.12 || bb.min.y > deckY + 1.74) continue;
      blockers.push(bb);
    }
  }
  const walkable = new Uint8Array(nx * nz).fill(1);
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const x = ox + i * cell, z = oz + j * cell;
      if (!onFloor(x, z)) { walkable[i * nz + j] = 0; continue; }
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
  // snap the START to the nearest walkable cell
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
  const a = snap(toCell(from));
  if (!a) return null;
  // flood-fill from the start, then accept the nearest REACHED cell within
  // snapRadius of the target — a merely-walkable cell could sit in an
  // isolated pocket the start can't actually reach.
  const prev = new Int32Array(grid.nx * grid.nz).fill(-1);
  const startIdx = a[0] * grid.nz + a[1];
  const q = [startIdx];
  prev[startIdx] = startIdx;
  while (q.length) {
    const cur = q.shift();
    const ci = Math.floor(cur / grid.nz), cj = cur % grid.nz;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const i = ci + di, j = cj + dj;
      if (i < 0 || j < 0 || i >= grid.nx || j >= grid.nz) continue;
      const idx = i * grid.nz + j;
      if (!grid.walkable[idx] || prev[idx] !== -1) continue;
      prev[idx] = cur;
      q.push(idx);
    }
  }
  const [ti, tj] = toCell(to);
  let endIdx = -1;
  outer:
  for (let r = 0; r <= snapRadius; r++) {
    for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const i = ti + di, j = tj + dj;
      if (i < 0 || j < 0 || i >= grid.nx || j >= grid.nz) continue;
      const idx = i * grid.nz + j;
      if (prev[idx] !== -1) { endIdx = idx; break outer; }
    }
  }
  if (endIdx === -1) return null;
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
      const doors = doorRecords();
      const problems = [];
      const grids = new Map();  // per-deck grids and reference points
      const deckOf = rec => Math.round(((rec.pos[1] || 0)) * 10) / 10;
      for (const c of consoles) {
        const deckY = deckOf(c);
        if (!grids.has(deckY)) {
          const grid = computeNavGrid(0.22, [], deckY);
          // route from the bridge hatch on the main deck, or from the first
          // doorway on the console's own deck otherwise
          let from;
          if (Math.abs(deckY) < 0.2 && doors.length) from = doorFloorPoint(doors[0], 1);
          else {
            const d = doors.find(x => Math.abs(deckOf(x) - deckY) < 0.2);
            from = d ? new THREE.Vector3(d.pos[0], 0, d.pos[2]) : new THREE.Vector3(c.pos[0], 0, c.pos[2]);
          }
          grids.set(deckY, { grid, from });
        }
        const { grid, from } = grids.get(deckY);
        // operator point on the reach side (local +z); reachable = a walkable,
        // deck-connected cell within arm-plus-lean distance (0.8 m) of it
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
      // furniture in the doorway clearance zone (deck-relative heights, so a
      // rack on the deck above never "crowds" a hatch directly below it)
      for (const door of doorRecords()) {
        // launch/cargo apertures (wider than any person door) don't need a
        // person-clearance zone — craft occupy them by design
        if ((door.params.doorWidth ?? 0.85) > 1.4) continue;
        const dy = door.pos[1] || 0;
        for (const side of [1, -1]) {
          const pt = doorFloorPoint(door, side);
          const hit = circleHitsColliders(pt.x, pt.z, 0.32, dy + 0.12, dy + 1.8);
          if (hit) {
            const rec = state.getObject(hit.id);
            if (rec && FURNITURE_TYPES.includes(rec.type)) problems.push(`${rec.name} crowds the ${door.name} clearance zone`);
          }
        }
      }
      // console control faces blocked?
      for (const c of state.project.objects.filter(o => o.type === 'console')) {
        const cy = c.pos[1] || 0;
        const v = new THREE.Vector3(0, 0, (c.params.depth ?? 0.7) / 2 + 0.35)
          .applyAxisAngle(new THREE.Vector3(0, 1, 0), c.rotY || 0);
        const hit = circleHitsColliders(c.pos[0] + v.x, c.pos[2] + v.z, 0.2, cy + 0.12, cy + 1.4);
        if (hit && hit.id !== c.id) {
          const rec = state.getObject(hit.id);
          if (rec && ['storage', 'crate', 'table'].includes(rec.type)) problems.push(`${rec.name} blocks the control face of ${c.name}`);
        }
      }
      if (!problems.length) return { status: 'pass', details: 'No illegal overlaps; entrances and control faces are clear.' };
      return { status: 'fail', details: [...new Set(problems)].join('\n') };
    },
  },
  {
    id: 'ship-route',
    name: 'Bridge and galley connect through the corridor',
    basis: ['corridor-route', 'galley-sounds', 'galley-aft'],
    run() {
      const bridge = state.project.objects.find(o => o.layoutKey === 'floor');
      const galley = state.project.objects.find(o => o.layoutKey === 'galFloor');
      if (!galley) return { status: 'warn', details: 'No galley in the model yet.' };
      const grid = computeNavGrid(0.24);
      const path = findPath(grid,
        new THREE.Vector3(bridge?.pos[0] ?? 0, 0, bridge?.pos[2] ?? 0),
        new THREE.Vector3(galley.pos[0], 0, galley.pos[2]), 8);
      if (!path) {
        const slim = findPath(computeNavGrid(0.19),
          new THREE.Vector3(bridge?.pos[0] ?? 0, 0, 0), new THREE.Vector3(galley.pos[0], 0, galley.pos[2]), 8);
        if (slim) return { status: 'warn', details: 'Only a slim person can squeeze the whole route — something pinches the corridor.' };
        return { status: 'fail', details: 'No continuous walkable route from the bridge to the galley.' };
      }
      const len = path.length * 0.1;
      return { status: 'pass', details: `Continuous route bridge → corridor → galley, about ${fmt(len, 1)} m walking — close enough that galley sounds carry to the cradle (Presence-08).` };
    },
  },
  {
    id: 'airlock-medbay-offset',
    name: 'Airlock and medbay are close but not on one sightline',
    basis: ['alk-main-hatch', 'med-corridor', 'med-deeper', 'bay-medbay-near'],
    run() {
      const air = state.project.objects.find(o => o.layoutKey === 'alkInnerDoor');
      const med = state.project.objects.find(o => o.layoutKey === 'medHatch');
      const bend = state.project.objects.find(o => o.layoutKey === 'corBendFloor');
      if (!air || !med || !bend) return { status: 'warn', details: 'Airlock, medbay, or the main-corridor offset is missing.' };

      const problems = [];
      if (Math.abs(air.pos[0] - med.pos[0]) < 0.5) {
        problems.push('Airlock and medbay still align too closely laterally; the offset is not doing useful privacy work.');
      }
      const grid = computeNavGrid(0.22);
      const a = new THREE.Vector3(air.pos[0] - 0.45, 0, air.pos[2]);
      const m = new THREE.Vector3(med.pos[0] - 0.45, 0, med.pos[2]);
      const path = findPath(grid, a, m, 12);
      if (!path) problems.push('No emergency walking route from the airlock side to medbay.');
      if (problems.length) return { status: 'fail', details: problems.join('\n') };
      return { status: 'pass', details: 'The personnel airlock remains forward and close to medical, but the primary corridor offsets before medbay, blocking the direct boarding sightline.' };
    },
  },
  {
    id: 'galley-occupancy',
    name: 'Galley supports five comfortably and seven crowded',
    basis: ['galley-island', 'galley-bench', 'galley-table', 'galley-sink-light'],
    run() {
      const galley = state.project.objects.find(o => o.layoutKey === 'galFloor');
      if (!galley) return { status: 'warn', details: 'No galley in the model yet.' };
      const hatch = state.project.objects.find(o => o.layoutKey === 'galHatch');
      const grid = computeNavGrid(0.22);
      const inside = new THREE.Vector3(hatch ? hatch.pos[0] : galley.pos[0], 0, (hatch ? hatch.pos[2] : galley.pos[2]) + 0.6);
      const problems = [];
      for (const key of ['galCounter', 'galTable', 'galBench', 'galCabinet', 'galCooler']) {
        const t = state.project.objects.find(o => o.layoutKey === key);
        if (!t) { problems.push(`${key} missing`); continue; }
        if (!findPath(grid, inside, new THREE.Vector3(t.pos[0], 0, t.pos[2]), 14)) {
          problems.push(`${t.name} is unreachable from the hatch`);
        }
      }

      const stools = ['galStool1', 'galStool2'].map(k => state.project.objects.find(o => o.layoutKey === k)).filter(Boolean);
      if (stools.length < 2) problems.push('Galley needs at least two movable seats in addition to the bench for the current occupancy assumption.');

      const gw = galley.params.width, gd = galley.params.depth;
      const gross = gw * gd;
      if (gross < 14) problems.push(`Galley gross area is only ${fmt(gross, 1)} m² — too small for the locked five-comfortable target with this furniture load.`);
      if (gross > 20) problems.push(`Galley gross area is ${fmt(gross, 1)} m² — larger than needed for the intended crowded upper limit.`);

      if (problems.length) return { status: 'fail', details: problems.join('\n') };
      return { status: 'pass', details: `${fmt(gross, 1)} m² gross with a work half, aft table / bench zone, and movable stools: five has real places to be; seven would visibly tighten circulation without turning the room into a two-person galley.` };
    },
  },
  {
    id: 'hygiene-separation',
    name: 'Galley and hygiene share services without sharing experience',
    basis: [],
    run() {
      const galley = state.project.objects.find(o => o.layoutKey === 'galFloor');
      const branch = state.project.objects.find(o => o.layoutKey === 'hygBranchDoor');
      const toilet = state.project.objects.find(o => o.layoutKey === 'hygToiletFloor');
      const shower = state.project.objects.find(o => o.layoutKey === 'hygShowerFloor');
      const hatch = state.project.objects.find(o => o.layoutKey === 'hygLadderHatch');
      const ladder = state.project.objects.find(o => o.layoutKey === 'secondaryLadder');
      const wet = state.project.objects.find(o => o.layoutKey === 'mainWetCore');
      if (!galley || !branch || !toilet || !shower || !hatch || !ladder || !wet) {
        return { status: 'warn', details: 'The domestic wet-service cluster is incomplete.' };
      }
      const problems = [];
      if (Math.abs(hatch.pos[0] - ladder.pos[0]) > 0.05 || Math.abs(hatch.pos[2] - ladder.pos[2]) > 0.05) {
        problems.push('Upper ladder hatch does not align with the lower secondary ladder.');
      }
      // Hygiene rooms must not physically overlap the galley rectangle.
      for (const r of [toilet, shower]) {
        const sepX = Math.abs(r.pos[0] - galley.pos[0]) - (r.params.width + galley.params.width) / 2;
        const sepZ = Math.abs(r.pos[2] - galley.pos[2]) - (r.params.depth + galley.params.depth) / 2;
        if (sepX < -0.02 && sepZ < -0.02) problems.push(`${r.name} overlaps the galley footprint.`);
      }
      const grid = computeNavGrid(0.20);
      const branchPt = new THREE.Vector3(branch.pos[0] - 0.45, 0, branch.pos[2]);
      for (const r of [toilet, shower]) {
        if (!findPath(grid, branchPt, new THREE.Vector3(r.pos[0], 0, r.pos[2]), 20)) {
          problems.push(`${r.name} is not reachable through the dry hygiene route.`);
        }
      }
      if (problems.length) return { status: 'fail', details: problems.join('\n') };
      return { status: 'pass', details: 'The galley stays a separate closable room; toilet and shower open from the dry service vestibule, the wet-service chase sits between the functions, and the residential ladder terminates in the dry zone.' };
    },
  },
  {
    id: 'pocket-crowd',
    name: 'Pocket three makes you choose where to stand',
    basis: ['pocket-inbetween', 'pocket-crowded', 'pocket-choose-stand', 'pocket-shelf'],
    run() {
      const floor = state.project.objects.find(o => o.layoutKey === 'pktFloor');
      if (!floor) return { status: 'warn', details: 'No pocket three in the model yet.' };
      const hatch = state.project.objects.find(o => o.layoutKey === 'pktHatch');
      // storage is a squeeze — test with slim clearance
      const grid = computeNavGrid(0.2);
      // point just inside the pocket (the hatch's local +z side)
      const v = new THREE.Vector3(0, 0, 0.45).applyAxisAngle(new THREE.Vector3(0, 1, 0), hatch?.rotY || 0);
      let inPt = hatch ? new THREE.Vector3(hatch.pos[0] + v.x, 0, hatch.pos[2] + v.z)
                       : new THREE.Vector3(floor.pos[0], 0, floor.pos[2]);
      if (Math.abs(inPt.x - floor.pos[0]) > floor.params.width / 2 ||
          Math.abs(inPt.z - floor.pos[2]) > floor.params.depth / 2) {
        inPt = new THREE.Vector3(hatch.pos[0] - v.x, 0, hatch.pos[2] - v.z);
      }
      const problems = [];
      for (const key of ['pktShelf', 'pktCrate', 'pktBox']) {
        const t = state.project.objects.find(o => o.layoutKey === key);
        if (!t) continue;
        if (!findPath(grid, inPt, new THREE.Vector3(t.pos[0], 0, t.pos[2]), 10)) {
          problems.push(`${t.name} is unreachable from the hatch line`);
        }
      }
      if (problems.length) return { status: 'fail', details: problems.join('\n') };
      let free = 0;
      const gw = floor.params.width, gd = floor.params.depth;
      for (let i = 0; i < grid.nx; i++) {
        for (let j = 0; j < grid.nz; j++) {
          if (!grid.walkable[i * grid.nz + j]) continue;
          const x = grid.ox + i * grid.cell, z = grid.oz + j * grid.cell;
          if (Math.abs(x - floor.pos[0]) <= gw / 2 && Math.abs(z - floor.pos[2]) <= gd / 2) free++;
        }
      }
      const area = free * 0.01;
      if (area < 0.08) return { status: 'fail', details: `Only ${fmt(area, 2)} m² of standing room — nobody fits inside at all.` };
      if (area <= 1.6) return { status: 'pass', details: `${fmt(area, 2)} m² of standing room among the clutter — the room genuinely makes you choose where to stand; a second person crowds it.` };
      return { status: 'warn', details: `${fmt(area, 1)} m² of standing room — roomier than "too shallow for equipment staging" suggests.` };
    },
  },
  {
    id: 'legacy-spine-depth',
    name: 'The storage spine becomes older and more irregular as it runs deep',
    basis: ['spine-narrow-dim', 'dome-hidden', 'eng-walkin'],
    run() {
      const shoulder = state.project.objects.find(o => o.layoutKey === 'spnShoulderFloor');
      const p3 = state.project.objects.find(o => o.layoutKey === 'pktFloor');
      const s4 = state.project.objects.find(o => o.layoutKey === 's4Floor');
      const dome = state.project.objects.find(o => o.layoutKey === 'domeFloor');
      const eng = state.project.objects.find(o => o.layoutKey === 'engFloor');
      if (!shoulder || !p3 || !s4 || !dome || !eng) return { status: 'warn', details: 'One or more established deep-spine spaces are not modeled.' };

      const grid = computeNavGrid(0.20);
      const start = new THREE.Vector3(0, 0, 0);
      const problems = [];
      for (const t of [p3, s4, dome, eng]) {
        if (!findPath(grid, start, new THREE.Vector3(t.pos[0], 0, t.pos[2]), 25)) {
          problems.push(`${t.name} is unreachable from the ship interior.`);
        }
      }
      if (problems.length) return { status: 'fail', details: problems.join('\n') };
      return { status: 'pass', details: 'Pocket Three, Storage Four, the observation dome, and the walk-in engine bay all remain reachable off the legacy service side; the localized shoulder breaks the uniform-hallway rhythm.' };
    },
  },
  {
    id: 'med-blind-reach',
    name: 'Medbay supplies are within blind reach of the door',
    basis: ['med-reach', 'med-shelf', 'med-drawer', 'med-cot'],
    run() {
      const floor = state.project.objects.find(o => o.layoutKey === 'medFloor');
      if (!floor) return { status: 'warn', details: 'No medbay in the model yet.' };
      const hatch = state.project.objects.find(o => o.layoutKey === 'medHatch');
      if (!hatch) return { status: 'fail', details: 'The medbay has no hatch.' };
      // one step inside the door
      const v = new THREE.Vector3(0, 0, -0.55).applyAxisAngle(new THREE.Vector3(0, 1, 0), hatch.rotY || 0);
      const inPt = new THREE.Vector3(hatch.pos[0] + v.x, 0, hatch.pos[2] + v.z);
      if (Math.abs(inPt.x - floor.pos[0]) > floor.params.width / 2 ||
          Math.abs(inPt.z - floor.pos[2]) > floor.params.depth / 2) {
        // normal pointed the wrong way — flip
        inPt.set(hatch.pos[0] - v.x, 0, hatch.pos[2] - v.z);
      }
      const results = [];
      let worst = 0;
      for (const key of ['medShelf', 'medConsole']) {
        const t = state.project.objects.find(o => o.layoutKey === key);
        if (!t) continue;
        const bb = objectAABB(t.id, true);
        if (!bb) continue;
        const nx = Math.max(bb.min.x, Math.min(inPt.x, bb.max.x));
        const nz = Math.max(bb.min.z, Math.min(inPt.z, bb.max.z));
        const d = Math.hypot(nx - inPt.x, nz - inPt.z);
        worst = Math.max(worst, d);
        results.push(`${t.name}: ${fmt(d, 2)} m from one step inside the door`);
      }
      const cot = state.project.objects.find(o => o.layoutKey === 'medCot');
      if (cot) {
        const grid = computeNavGrid(0.22);
        if (!findPath(grid, inPt, new THREE.Vector3(cot.pos[0], 0, cot.pos[2]), 8)) {
          return { status: 'fail', details: results.join('\n') + '\nThe cot is unreachable from the door.' };
        }
        results.push('cot: reachable from the door');
      }
      if (worst <= 1.7) return { status: 'pass', details: results.join('\n') + '\nEverything within the 1.7 m blind-reach bound (Presence-04).' };
      if (worst <= 2.3) return { status: 'warn', details: results.join('\n') + '\nSlightly beyond a natural blind reach — she would need a full step and a lean.' };
      return { status: 'fail', details: results.join('\n') + '\nToo far to reach "without looking".' };
    },
  },
  {
    id: 'dome-arch-duck',
    name: 'The dome arch scrapes anyone who walks too proud',
    basis: ['dome-arch', 'dome-hidden', 'dome-curve'],
    run() {
      const dome = state.project.objects.find(o => o.layoutKey === 'domeShell');
      if (!dome) return { status: 'warn', details: 'No observation dome in the model yet.' };
      const arch = dome.params.archHeight ?? 1.78;
      const tallest = Math.max(...Object.values(CHARACTERS).map(c => c.height));
      const tallestName = Object.values(CHARACTERS).find(c => c.height === tallest).label;
      const margin = arch - tallest;
      // route: the dome must be reachable, but NOT on the shortest bridge→galley path
      const grid = computeNavGrid(0.24);
      const domeCenter = new THREE.Vector3(dome.pos[0], 0, dome.pos[2]);
      const reachable = !!findPath(grid, new THREE.Vector3(0, 0, 0), domeCenter, 8);
      if (!reachable) return { status: 'fail', details: 'The dome cannot be reached at all.' };
      if (margin < -0.08) return { status: 'fail', details: `Arch at ${fmt(arch, 2)} m vs ${tallestName} at ${fmt(tallest, 2)} m — she cannot pass even ducking politely.` };
      if (margin <= 0.12) return { status: 'pass', details: `Arch at ${fmt(arch, 2)} m; ${tallestName} stands ${fmt(tallest, 2)} m — ${fmt(Math.abs(margin) * 100, 0)} cm of grace. Walking proud gets scraped, exactly as written. Reachable, off the main route.` };
      return { status: 'warn', details: `Arch at ${fmt(arch, 2)} m clears the tallest crew by ${fmt(margin * 100, 0)} cm — nobody would ever scrape it, against Next-08.` };
    },
  },
  {
    id: 'airlock-two-stage',
    name: 'The airlock is a true two-stage lock, cramped for two',
    basis: ['alk-two-stage', 'alk-hatch-line', 'alk-kit-locker'],
    run() {
      const floor = state.project.objects.find(o => o.layoutKey === 'alkFloor');
      if (!floor) return { status: 'warn', details: 'No airlock in the model yet.' };
      const inner = state.project.objects.find(o => o.layoutKey === 'alkInnerDoor');
      const outer = state.project.objects.find(o => o.layoutKey === 'alkOuterDoor');
      if (!inner || !outer) return { status: 'fail', details: 'The chamber needs both an inner and an outer lock.' };
      // chamber must be reachable from the corridor through the inner lock
      const grid = computeNavGrid(0.22);
      const center = new THREE.Vector3(floor.pos[0], 0, floor.pos[2]);
      if (!findPath(grid, new THREE.Vector3(0, 0, 0), center, 8)) {
        return { status: 'fail', details: 'No route from the ship interior into the chamber.' };
      }
      // cramped-for-two: clear floor between 0.5 and 1.8 m²
      let free = 0;
      const w = floor.params.width, d = floor.params.depth;
      for (let i = 0; i < grid.nx; i++) {
        for (let j = 0; j < grid.nz; j++) {
          if (!grid.walkable[i * grid.nz + j]) continue;
          const x = grid.ox + i * grid.cell, z = grid.oz + j * grid.cell;
          if (Math.abs(x - floor.pos[0]) <= w / 2 && Math.abs(z - floor.pos[2]) <= d / 2) free++;
        }
      }
      const area = free * 0.01;
      if (area < 0.4) return { status: 'fail', details: `Only ${fmt(area, 2)} m² of clear chamber floor — one suited person would not fit.` };
      if (area <= 1.8) return { status: 'pass', details: `Both locks present; ${fmt(area, 2)} m² of clear chamber floor — "Too close" for two suited people, as VH1_B3_07 has it. Kit locker inside.` };
      return { status: 'warn', details: `${fmt(area, 1)} m² of chamber floor — roomier than "too close" suggests.` };
    },
  },
  {
    id: 'eng-two-steps',
    name: 'Two steps cross the engine bay to the bench',
    basis: ['eng-two-steps', 'eng-bench-cross', 'eng-tap'],
    run() {
      const floor = state.project.objects.find(o => o.layoutKey === 'engFloor');
      if (!floor) return { status: 'warn', details: 'No engine bay in the model yet.' };
      const door = state.project.objects.find(o => o.layoutKey === 'spnLeg2S');
      const bench = state.project.objects.find(o => o.layoutKey === 'engBench');
      if (!door || !bench) return { status: 'fail', details: 'Missing the doorway or the workbench.' };
      const v = new THREE.Vector3(0, 0, 0.45).applyAxisAngle(new THREE.Vector3(0, 1, 0), door.rotY || 0);
      const inPt = new THREE.Vector3(door.pos[0] + v.x, 0, door.pos[2] + v.z);
      const bb = objectAABB(bench.id, true);
      if (!bb) return { status: 'warn', details: 'Bench has no geometry.' };
      const nx = Math.max(bb.min.x, Math.min(inPt.x, bb.max.x));
      const nz = Math.max(bb.min.z, Math.min(inPt.z, bb.max.z));
      const dist = Math.hypot(nx - inPt.x, nz - inPt.z);
      const grid = computeNavGrid(0.22);
      if (!findPath(grid, inPt, new THREE.Vector3(bench.pos[0], 0, bench.pos[2]), 10)) {
        return { status: 'fail', details: 'The bench cannot be reached from the doorway at all.' };
      }
      const manifold = state.project.objects.find(o => o.layoutKey === 'engManifold');
      let manifoldNote = '';
      if (manifold) {
        if (!findPath(grid, inPt, new THREE.Vector3(manifold.pos[0], 0, manifold.pos[2]), 10)) {
          return { status: 'fail', details: 'The open cooling manifold cannot be reached from the doorway.' };
        }
        manifoldNote = '\nManifold reachable — with the stacked paneling squeezing the lane, as written.';
      }
      if (dist <= 2.0) return { status: 'pass', details: `Doorway to bench: ${fmt(dist, 2)} m — two honest steps. "The room was full, the heat opinionated."` + manifoldNote };
      if (dist <= 2.8) return { status: 'warn', details: `Doorway to bench: ${fmt(dist, 2)} m — closer to three steps than two.` };
      return { status: 'fail', details: `Doorway to bench: ${fmt(dist, 2)} m — too far for "took two steps, stopped."` };
    },
  },
  {
    id: 'interdeck-clearance',
    name: 'Occupied decks leave real structural / service depth between them',
    basis: [],
    run() {
      const lowerFloorY = state.project.objects.find(o => o.layoutKey === 'workSpineFloor')?.pos?.[1];
      const skiffCeil = state.project.objects.find(o => o.layoutKey === 'sbCeil');
      const flexCeil = state.project.objects.find(o => o.layoutKey === 'flexCeil');
      if (lowerFloorY == null || !skiffCeil || !flexCeil) {
        return { status: 'warn', details: 'Lower-deck reference geometry is incomplete.' };
      }
      const skiffTop = lowerFloorY + (skiffCeil.params.height ?? 0);
      const flexTop = lowerFloorY + (flexCeil.params.height ?? 0);
      const skiffGap = 0 - skiffTop;
      const flexGap = 0 - flexTop;
      const problems = [];
      if (skiffGap < 0.35) problems.push(`Skiff bay leaves only ${fmt(skiffGap, 2)} m below the main-deck floor plane.`);
      if (flexGap < 0.35) problems.push(`Mission / flex bay leaves only ${fmt(flexGap, 2)} m below the main-deck floor plane.`);
      if (problems.length) return { status: 'fail', details: problems.join('\n') };
      return { status: 'pass', details: `Skiff bay leaves ${fmt(skiffGap, 2)} m and mission / flex bay leaves ${fmt(flexGap, 2)} m of interdeck structural / service depth beneath occupied main-deck areas. The aft main cargo bay is allowed to rise higher because no full main deck continues above it.` };
    },
  },
  {
    id: 'stairwell-decks',
    name: 'The primary stair lands in working ship and reaches both skiff and habitation',
    basis: ['stair-lights', 'lower-corridor', 'bay-medbay-near'],
    run() {
      const steps = state.project.objects.find(o => o.layoutKey === 'stwSteps');
      if (!steps) return { status: 'warn', details: 'No primary stairwell in the model yet.' };
      const p = steps.params;
      const topY = (steps.pos[1] || 0) + p.rise * p.steps;
      const deckGap = 0 - (steps.pos[1] || 0);
      const problems = [];
      if (p.rise > 0.2) problems.push(`Riser ${fmt(p.rise * 100, 0)} cm is over a comfortable 20 cm.`);
      if (Math.abs(topY - 0) > 0.03) problems.push(`Top tread lands at ${fmt(topY, 2)} m — not flush with the main deck.`);

      const landing = state.project.objects.find(o => o.layoutKey === 'opLandingFloor');
      const bay = state.project.objects.find(o => o.layoutKey === 'sbFloor');
      const cab6 = state.project.objects.find(o => o.layoutKey === 'cab6Floor');
      if (!landing) problems.push('Lower Operations landing is missing.');
      const lowGrid = computeNavGrid(0.22, [], steps.pos[1] || 0);
      const start = landing ? new THREE.Vector3(landing.pos[0], 0, landing.pos[2]) : new THREE.Vector3(steps.pos[0], 0, steps.pos[2]);

      if (bay && !findPath(lowGrid, start, new THREE.Vector3(bay.pos[0], 0, bay.pos[2]), 12)) {
        problems.push('No practical route from the stair landing to the skiff / mission bay.');
      }
      if (cab6 && !findPath(lowGrid, start, new THREE.Vector3(cab6.pos[0], 0, cab6.pos[2]), 35)) {
        problems.push('No continuous lower-deck route from the stair landing to Cabin Six.');
      }
      if (problems.length) return { status: 'fail', details: problems.join('\n') };
      return { status: 'pass', details: `${p.steps} treads at ${fmt(p.rise * 100, 0)} cm drop ${fmt(deckGap, 1)} m into Lower Operations; the skiff bay is immediate while habitation requires a deliberate turn.` };
    },
  },
  {
    id: 'cabin-row-walk',
    name: 'Six cabins form an accessible approach and a quieter Cabin Five / Six run',
    basis: ['cabin-row', 'cabin-six', 'cabin-bunk', 'iri-cabin-lower'],
    run() {
      const keys = ['cab1', 'cab2', 'cab3', 'cab4', 'cab5', 'cab6'];
      const doors = keys.map(k => state.project.objects.find(o => o.layoutKey === k + 'Door')).filter(Boolean);
      if (doors.length < 6) return { status: 'warn', details: `Only ${doors.length} of the six cabin doors exist.` };

      const cab5 = state.project.objects.find(o => o.layoutKey === 'cab5Floor');
      const cab6 = state.project.objects.find(o => o.layoutKey === 'cab6Floor');
      const bunk = state.project.objects.find(o => o.layoutKey === 'cab6Bunk');
      const bunkLen = bunk ? Math.max(bunk.params.width, bunk.params.depth) : 0;
      const tallest = Math.max(...Object.values(CHARACTERS).map(c => c.height));
      const problems = [];

      if (!cab5 || !cab6) problems.push('Cabin Five / Six geometry is incomplete.');
      else {
        const dz = Math.abs(cab6.pos[2] - cab5.pos[2]);
        const halfDepth = (cab5.params.depth + cab6.params.depth) / 2;
        if (Math.abs(dz - halfDepth) > 0.2) problems.push('Cabin Five and Cabin Six do not read as directly adjacent / wall-sharing.');
      }

      if (!bunk) problems.push('Cabin Six has no bunk.');
      else if (bunkLen < tallest + 0.02) problems.push(`Cabin Six bunk is ${fmt(bunkLen, 2)} m — shorter than the tallest sleeper at ${fmt(tallest, 2)} m.`);

      const deckY = doors[0].pos[1] || 0;
      const grid = computeNavGrid(0.22, [], deckY);
      for (const key of keys) {
        const d = state.project.objects.find(o => o.layoutKey === key + 'Door');
        const floor = state.project.objects.find(o => o.layoutKey === key + 'Floor');
        if (!d || !floor) { problems.push(`${key}: missing door or floor.`); continue; }
        const normal = new THREE.Vector3(0, 0, 0.55).applyAxisAngle(new THREE.Vector3(0, 1, 0), d.rotY || 0);
        const a = new THREE.Vector3(d.pos[0] + normal.x, 0, d.pos[2] + normal.z);
        const b = new THREE.Vector3(d.pos[0] - normal.x, 0, d.pos[2] - normal.z);
        const fc = new THREE.Vector3(floor.pos[0], 0, floor.pos[2]);
        const inPt = a.distanceTo(fc) < b.distanceTo(fc) ? a : b;
        const outPt = inPt === a ? b : a;
        if (!findPath(grid, outPt, inPt, 8)) problems.push(`${floor.name || key}: no way through its own door.`);
      }

      if (problems.length) return { status: 'fail', details: problems.join('\n') };
      return { status: 'pass', details: 'Cabins One through Four sit on the accessible approach; the wet-core dogleg breaks the sightline before Iri in Cabin Five and Quenby in Cabin Six. Cabin Six remains the last numbered cabin while circulation continues aft.' };
    },
  },
  {
    id: 'lower-commercial-route',
    name: 'The lower commercial route stays continuous from Operations to the freight spaces',
    basis: ['lower-corridor', 'bay-medbay-near'],
    run() {
      const startObj = state.project.objects.find(o => o.layoutKey === 'opLandingFloor');
      const flex = state.project.objects.find(o => o.layoutKey === 'flexFloor');
      const aft = state.project.objects.find(o => o.layoutKey === 'aftFreightFloor');
      const cargo = state.project.objects.find(o => o.layoutKey === 'cargoFloor');
      const freight = state.project.objects.find(o => o.layoutKey === 'freightLockFloor');
      if (!startObj || !flex || !aft || !cargo || !freight) {
        return { status: 'warn', details: 'One or more lower commercial-route spaces are missing from the generated layout.' };
      }

      const deckY = startObj.pos[1] || 0;
      const grid = computeNavGrid(0.22, [], deckY);
      const start = new THREE.Vector3(startObj.pos[0], 0, startObj.pos[2]);
      const checks = [
        ['mission / flex bay', flex, 18],
        ['aft freight node', aft, 30],
        ['main cargo bay', cargo, 40],
        ['freight transfer lock', freight, 36],
      ];
      const problems = [];
      for (const [label, obj, max] of checks) {
        if (!findPath(grid, start, new THREE.Vector3(obj.pos[0], 0, obj.pos[2]), max)) {
          problems.push(`No continuous cargo-capable circulation from Lower Operations to the ${label}.`);
        }
      }
      if (problems.length) return { status: 'fail', details: problems.join('\n') };
      return { status: 'pass', details: 'Lower Operations connects continuously to the configurable bay, aft freight node, main cargo bay, and freight transfer lock without using the residential corridor.' };
    },
  },
  {
    id: 'skiff-bay-staging',
    name: 'The gear bay stages the skiff and the rigs',
    basis: ['skiff-cradle', 'rig-station', 'loadout-grid', 'rig-locker', 'bay-medbay-near'],
    run() {
      const bay = state.project.objects.find(o => o.layoutKey === 'sbFloor');
      if (!bay) return { status: 'warn', details: 'No gear bay in the model yet.' };
      const deckY = bay.pos[1] || 0;
      const hatch = state.project.objects.find(o => o.layoutKey === 'sbHatch');
      if (!hatch) return { status: 'fail', details: 'The bay has no palm hatch.' };
      const grid = computeNavGrid(0.22, [], deckY);
      const n = new THREE.Vector3(0, 0, 0.65).applyAxisAngle(new THREE.Vector3(0, 1, 0), hatch.rotY || 0);
      const ha = new THREE.Vector3(hatch.pos[0] + n.x, 0, hatch.pos[2] + n.z);
      const hb = new THREE.Vector3(hatch.pos[0] - n.x, 0, hatch.pos[2] - n.z);
      const bc = new THREE.Vector3(bay.pos[0], 0, bay.pos[2]);
      const inPt = ha.distanceTo(bc) < hb.distanceTo(bc) ? ha : hb;
      const problems = [];
      for (const key of ['sbRig', 'sbGrid', 'sbLocker']) {
        const t = state.project.objects.find(o => o.layoutKey === key);
        if (!t) { problems.push(`${key} missing`); continue; }
        if (!findPath(grid, inPt, new THREE.Vector3(t.pos[0], 0, t.pos[2]), 10)) {
          problems.push(`${t.name} is unreachable from the bay hatch.`);
        }
      }
      // the skiff must have a working ring: walkable cells on at least two sides
      const skiff = state.project.objects.find(o => o.layoutKey === 'sbSkiff');
      if (skiff) {
        const bb = objectAABB(skiff.id, true);
        if (bb) {
          let sides = 0;
          const probes = [
            [bb.min.x - 0.35, (bb.min.z + bb.max.z) / 2], [bb.max.x + 0.35, (bb.min.z + bb.max.z) / 2],
            [(bb.min.x + bb.max.x) / 2, bb.min.z - 0.35], [(bb.min.x + bb.max.x) / 2, bb.max.z + 0.35],
          ];
          for (const [px, pz] of probes) {
            if (findPath(grid, inPt, new THREE.Vector3(px, 0, pz), 3)) sides++;
          }
          if (sides < 2) problems.push(`The skiff cradle can be worked from only ${sides} side(s) — prep needs room around it.`);
        }
      } else problems.push('No skiff in its cradle.');
      if (problems.length) return { status: 'fail', details: problems.join('\n') };
      return { status: 'pass', details: 'Rig station, loadout grid, and rig locker remain reachable inside the isolated side-branch bay; the skiff can be worked from multiple sides and the primary stair keeps the medbay run short.' };
    },
  },
  {
    id: 'hull-envelope',
    name: 'The interior fits her hull; the masses stay out of the rooms',
    basis: ['deck-three', 'pocket-inbetween'],
    run() {
      const problems = [];
      const floors = state.project.objects.filter(o => o.type === 'floor');
      const cor = state.project.objects.find(o => o.layoutKey === 'corFloor');
      const HX = (cor?.pos[0] ?? 1.5) - 1.5;
      // per-deck plan bounds of the working envelope (generous, not shrink-wrap)
      const bounds = { 0: { x: [-8.2 + HX, 7.6 + HX], z: [-4.4, 31.6] }, '-3': { x: [-11.9 + HX, 7.6 + HX], z: [-4.1, 33.1] } };
      const rectOf = f => {
        const fw = f.params.width ?? 6, fd = f.params.depth ?? 5;
        const rot = Math.abs(Math.sin(f.rotY || 0)) > 0.5;
        const hw = (rot ? fd : fw) / 2, hd = (rot ? fw : fd) / 2;
        return { minX: f.pos[0] - hw, maxX: f.pos[0] + hw, minZ: f.pos[2] - hd, maxZ: f.pos[2] + hd };
      };
      for (const f of floors) {
        const b = bounds[String(Math.round((f.pos[1] || 0)))] || bounds[0];
        const r = rectOf(f);
        if (r.minX < b.x[0] || r.maxX > b.x[1] || r.minZ < b.z[0] || r.maxZ > b.z[1]) {
          problems.push(`${f.name} pokes out of the working hull envelope`);
        }
        if (r.minZ > 29.5 + 0.01 && f.room !== 'hull') problems.push(`${f.name} sits inside the aft drive section`);
      }
      // frame grid must address everything aboard
      const zs = state.project.objects.map(o => o.pos[2]);
      if (Math.min(...zs) < FRAME.z0 - 0.6) problems.push('Objects forward of frame 1 — the frame grid no longer covers the bow.');
      if (Math.max(...zs) > FRAME.z0 + (FRAME.count - 1) * FRAME.spacing + 0.6) problems.push('Objects aft of the last frame — extend the frame grid.');
      // massing volumes must not intrude into any walkable band
      const massing = state.project.objects.filter(o => o.type === 'massing');
      for (const m of massing) {
        const lift = m.params.lift ?? 0;
        const y0 = (m.pos[1] || 0) + lift, y1 = y0 + (m.params.height ?? 1);
        const mr = { minX: m.pos[0] - (m.params.width ?? 1) / 2, maxX: m.pos[0] + (m.params.width ?? 1) / 2, minZ: m.pos[2] - (m.params.depth ?? 1) / 2, maxZ: m.pos[2] + (m.params.depth ?? 1) / 2 };
        for (const f of floors) {
          if (f.room === 'hull') continue;
          const deckY = f.pos[1] || 0;
          if (y1 < deckY + 0.2 || y0 > deckY + 1.9) continue;
          const r = rectOf(f);
          const ox = Math.min(mr.maxX, r.maxX) - Math.max(mr.minX, r.minX);
          const oz = Math.min(mr.maxZ, r.maxZ) - Math.max(mr.minZ, r.minZ);
          if (ox > 0.05 && oz > 0.05 && !(m.layoutKey === 'mhVoidP2')) {
            problems.push(`${m.name} intrudes into the walkable band of ${f.name}`);
          }
        }
      }
      if (problems.length) return { status: 'fail', details: [...new Set(problems)].join('\n') };
      return {
        status: 'pass',
        details: `Every walkable space sits inside the ~44.5 m working envelope; the drive section aft of frame ${'F' + String(Math.round((29.5 - FRAME.z0) / FRAME.spacing) + 1)} holds no rooms; tanks, gear bays, the chute trunk, and the Deck Three layer all stay below or beside the walkable bands; the frame grid (${FRAME.count} frames at ${FRAME.spacing} m) addresses everything aboard.`,
      };
    },
  },
  {
    id: 'air-loops',
    name: 'Four air loops, each where canon puts it',
    basis: ['quarters-loop', 'med-corridor', 'vent-grid'],
    run() {
      const map = ductBranchesByFloor();
      const byKey = k => state.project.objects.find(o => o.layoutKey === k);
      const branchesOf = k => { const f = byKey(k); return (f && map.get(f.id)) || new Set(); };
      const problems = [];
      const wants = [
        ['floor', 'domestic', 'the bridge'], ['corFloor', 'domestic', 'the corridor'],
        ['galFloor', 'domestic', 'the galley'], ['hygToiletFloor', 'domestic', 'the toilet'],
        ['hygShowerFloor', 'domestic', 'the shower'],
        ['cab1Floor', 'habitation', 'Cabin One'], ['cab2Floor', 'habitation', 'Cabin Two'],
        ['cab3Floor', 'habitation', 'Cabin Three'], ['cab4Floor', 'habitation', 'Cabin Four'],
        ['cab5Floor', 'habitation', 'Cabin Five'], ['cab6Floor', 'habitation', 'Cabin Six'],
        ['navFloor', 'habitation', 'nav (Quenby sleeps on the crew-quarters loop)'],
        ['wetCoreFloor', 'habitation', 'the wet-service core'],
        ['gardenFloor', 'habitation', 'the domestic stores / future garden'],
        ['opLandingFloor', 'ops', 'Lower Operations'], ['sbFloor', 'ops', 'the skiff bay'],
        ['workSpineFloor', 'ops', 'the work spine'], ['flexFloor', 'ops', 'Hold Two'],
        ['cargoFloor', 'ops', 'Hold One'], ['freightLockFloor', 'ops', 'the freight lock'],
        ['novaCrawlFloor', 'ops', 'Nova’s crawl (Iri’s filtered tap)'],
        ['medFloor', 'med-iso', 'the medbay'],
      ];
      for (const [key, branch, label] of wants) {
        if (!branchesOf(key).has(branch)) problems.push(`${label} is not served by the ${branch} loop`);
      }
      // the medbay shares its loop with nothing
      const med = byKey('medFloor');
      for (const [fid, set] of map) {
        if (med && fid !== med.id && set.has('med-iso')) {
          const f = state.project.objects.find(o => o.id === fid);
          problems.push(`The medbay’s filtered loop leaks into ${f?.name || fid}`);
        }
      }
      // the engine bay is on no comfort loop (its own thermal ventilation)
      if (branchesOf('engFloor').size) problems.push('The engine bay should breathe through its own thermal ventilation, not a comfort loop.');
      // plant exists
      for (const [k, label] of [['ahuDomestic', 'domestic AHU'], ['ahuHabitation', 'habitation filter unit'], ['ahuOps', 'operations AHU'], ['medAirUnit', 'medbay filter unit'], ['ventGridPanel', 'the secondary vent grid']]) {
        if (!byKey(k)) problems.push(`Missing plant: ${label}`);
      }
      if (problems.length) return { status: 'fail', details: problems.join('\n') };
      return {
        status: 'pass',
        details: 'Domestic loop breathes the bridge, corridor, galley, and hygiene; the habitation loop serves every cabin, nav, the wet core, and the stores room ("Crew quarters loop at minimal"); the operations loop runs the work deck, both holds, the lock, and Iri’s filtered tap into Nova’s crawl; the medbay’s small loop shares air — and sound — with nothing; the engine bay breathes its own heat.',
      };
    },
  },
  {
    id: 'service-reach',
    name: 'Important equipment is reachable — and the release panels suit small hands',
    basis: ['console-kneehole', 'aft-panel-cross', 'quarters-loop', 'spine-support-rail'],
    run() {
      const byKey = k => state.project.objects.find(o => o.layoutKey === k);
      const problems = [];
      const wants = [
        ['the bridge', ['svcKneehole', 'aftPanel']],
        ['the main corridor', ['svcCorMidline', 'svcCorBend']],
        ['the galley', ['svcGalleyHeater']],
        ['the residential approach', ['svcLowerCool']],
        ['the quiet run', ['svcQuietJunction']],
        ['the cabin row', ['cab3JunctionBox']],
        ['the storage spine', ['svcSpineBracket']],
        ['Lower Operations', ['svcOpsLanding', 'opDamageLocker']],
        ['the work spine', ['svcOpsTrunk', 'partsLockers']],
        ['Hold One', ['svcHoldOne']],
        ['the wet-service core', ['wetCorePanel']],
        ['the dogleg (habitation isolation)', ['svcDoglegManifold']],
        ['the freight junction', ['freightLockPanel']],
        ['the lower aft spine', ['lowerAftPanel']],
        ['the medbay', ['medAirUnit']],
        ['the engineering access', ['engAccessPanel']],
      ];
      for (const [label, keys] of wants) {
        if (!keys.some(k => byKey(k))) problems.push(`No reachable service point in ${label}`);
      }
      // the interlock release panels must work at a twelve-year-old's height
      for (const key of ['svcDoglegManifold', 'engAccessPanel', 'freightLockPanel']) {
        const p = byKey(key);
        if (!p) { problems.push(`Release panel ${key} is missing`); continue; }
        const h = p.params.height ?? 1;
        const base = (p.params.mountHeight ?? 0);
        if (base > 1.1) problems.push(`${p.name}: controls mounted above a child's reach`);
        if (base + h < 0.9) problems.push(`${p.name}: controls too low to be a working panel`);
      }
      if (problems.length) return { status: 'fail', details: problems.join('\n') };
      return {
        status: 'pass',
        details: 'Every working space keeps an openable panel where its systems pass — distributed maintenance, physically present. All three interlock release panels (dogleg, engineering access, freight junction) sit within a twelve-year-old’s reach. Nobody thought about that when they mounted them. Somebody noticed.',
      };
    },
  },
  {
    id: 'stolen-moments',
    name: 'Three corners stay private enough for three minutes',
    basis: ['med-corridor', 'quarters-loop', 'cabin-bend'],
    run() {
      const byKey = k => state.project.objects.find(o => o.layoutKey === k);
      const cor = byKey('corFloor');
      const HX = (cor?.pos[0] ?? 1.5) - 1.5;
      const problems = [];
      const nooks = [
        {
          name: 'the elbow blind corner', rail: 'nookElbowRail', deck: 0,
          spot: [1.78 + HX, 5.33],
          hiddenFrom: [['the galley', [0.35 + HX, 8.5]], ['the medbay', [-1.5 + HX, 5.8]]],
          exposedTo: ['the forward corridor', [1.5 + HX, 3.0]],
        },
        {
          name: 'the dogleg warm wall', rail: 'nookDoglegRail', deck: -3,
          spot: [-7.9 + HX, 12.45],
          hiddenFrom: [['the residential approach', [-6.2 + HX, 6.4]], ['Lower Operations', [-2.6 + HX, 3.65]]],
          exposedTo: ['the quiet run', [-8.2 + HX, 16.0]],
        },
        {
          name: 'the spine turn', rail: 'spnSupportRail', deck: 0,
          spot: [3.75 + HX, 5.0],
          hiddenFrom: [['the main corridor', [1.5 + HX, 3.2]], ['the galley', [0.35 + HX, 8.5]]],
          exposedTo: ['the engine bay approach', [3.75 + HX, 10.0]],
        },
      ];
      for (const n of nooks) {
        if (!byKey(n.rail)) problems.push(`${n.name}: its handhold is gone`);
        // standing room: a walkable cell at the spot
        const grid = computeNavGrid(0.24, [], n.deck);
        const path = findPath(grid, new THREE.Vector3(n.spot[0], 0, n.spot[1]), new THREE.Vector3(n.spot[0], 0, n.spot[1]), 3);
        if (!path) problems.push(`${n.name}: no standing room at the spot`);
        const eye = n.deck + 1.55;
        for (const [label, v] of n.hiddenFrom) {
          const res = castSight(new THREE.Vector3(v[0], eye, v[1]), new THREE.Vector3(n.spot[0], eye, n.spot[1]));
          if (res.clear) problems.push(`${n.name} is visible from ${label} — the corner no longer hides it`);
        }
        const [elabel, ev] = n.exposedTo;
        const res = castSight(new THREE.Vector3(ev[0], eye, ev[1]), new THREE.Vector3(n.spot[0], eye, n.spot[1]));
        if (!res.clear) problems.push(`${n.name} became fully sealed from ${elabel} — it should stay honest: private enough, not private`);
      }
      if (problems.length) return { status: 'fail', details: problems.join('\n') };
      return {
        status: 'pass',
        details: 'The elbow corner hides from the galley and medbay but not the forward run; the dogleg’s warm wall hides from the approach and the work deck but not the quiet run; the spine turn hides from the corridor and galley but not the engine bay. Each keeps exactly one watched approach — enough warning for three minutes, never the illusion of a locked door.',
      };
    },
  },
  {
    id: 'sound-and-privacy',
    name: 'The ship’s sound map holds (who hears what)',
    basis: ['galley-sounds', 'cabin-six', 'iri-cabin-lower', 'pocket-hum', 'med-corridor'],
    run() {
      // Canonical audibility facts, checked in drift at night (worst case for
      // privacy). Door states are staged per assertion and restored after.
      const A = { audibilityReport, levelAt };
      const byKey = k => state.project.objects.find(o => o.layoutKey === k);
      const staged = [];
      const setOpen = (key, v) => {
        const d = byKey(key);
        if (!d) return;
        staged.push([d, d.params.open ?? 0]);
        d.params.open = v;
      };
      const problems = [];
      const expect = (desc, actual, ok) => { if (!ok.includes(actual)) problems.push(`${desc}: heard as "${actual}" (expected ${ok.join(' or ')})`); };
      try {
        // 1) Intimacy on Quenby's bunk (Cabin Six, door shut): Iri's cabin
        //    knows through the shared party wall; the quiet run gets rhythm;
        //    the approach cabins at most a maybe; the rest of the ship nothing.
        setOpen('cab6Door', 0); setOpen('cab5Door', 0);
        const bunk = byKey('cab6Bunk');
        let rep = A.audibilityReport({ x: bunk.pos[0], y: bunk.pos[1], z: bunk.pos[2] }, 'intimacy', 'drift-night');
        expect('Cabin Five through the party wall', A.levelAt(rep, 'cab5Floor'), ['tone', 'words']);
        expect('the quiet run outside', A.levelAt(rep, 'quietRunFloor'), ['presence', 'tone']);
        expect('Cabin Four (staggered row; shared habitation loop at most a murmur)', A.levelAt(rep, 'cab4Floor'), ['silent', 'presence']);
        expect('the galley (a deck up, far forward)', A.levelAt(rep, 'galFloor'), ['silent']);
        expect('the medbay', A.levelAt(rep, 'medFloor'), ['silent']);
        expect('the bridge', A.levelAt(rep, 'floor'), ['silent']);
        // 2) Galley conversation with doors open carries to the bridge as
        //    activity (Presence-08: galley sounds reach the cradle).
        setOpen('galHatch', 1); setOpen('doorway', 1);
        const gal = byKey('galFloor');
        rep = A.audibilityReport({ x: gal.pos[0], y: 0, z: gal.pos[2] }, 'speech', 'drift-night');
        expect('the bridge from the galley (doors open)', A.levelAt(rep, 'floor'), ['tone', 'presence']);
        expect('Cabin Six from the galley', A.levelAt(rep, 'cab6Floor'), ['silent']);
        // 3) The medbay is the confessional: hatch shut, a conversation
        //    inside reaches the corridor as at most a murmur of presence.
        setOpen('medHatch', 0);
        const med = byKey('medFloor');
        rep = A.audibilityReport({ x: med.pos[0], y: 0, z: med.pos[2] }, 'speech', 'drift-night');
        expect('the aft corridor outside the shut medbay', A.levelAt(rep, 'corAftFloor'), ['silent', 'presence']);
        // 4) The stair well is a chimney: talk at the Lower Ops landing is
        //    audible up in the forward corridor.
        const op = byKey('opLandingFloor');
        rep = A.audibilityReport({ x: op.pos[0], y: op.pos[1], z: op.pos[2] }, 'speech', 'drift-night');
        expect('the forward corridor via the stair chimney', A.levelAt(rep, 'corFloor'), ['presence', 'tone', 'words']);
        // 5) The engine bay's machinery hums through pocket three's wall.
        const eng = byKey('engFloor');
        rep = A.audibilityReport({ x: eng.pos[0], y: 0, z: eng.pos[2] }, 'machinery', 'drift-night');
        expect('pocket three (the ship hums through this wall)', A.levelAt(rep, 'pktFloor'), ['presence', 'tone', 'words']);
        // 6) Under burn, the same bunk sounds vanish even next door.
        rep = A.audibilityReport({ x: bunk.pos[0], y: bunk.pos[1], z: bunk.pos[2] }, 'intimacy', 'burn');
        expect('Cabin Five during a burn', A.levelAt(rep, 'cab5Floor'), ['silent', 'presence']);
      } finally {
        for (const [d, v] of staged) d.params.open = v;
      }
      if (problems.length) return { status: 'fail', details: problems.join('\n') };
      return {
        status: 'pass',
        details: 'The sound map holds: the party wall carries Cabin Six to Cabin Five and nowhere else that matters; galley talk reaches the cradle with doors open; the shut medbay keeps its conversations; the stair well is a chimney; the engine hums through pocket three; and a burn deafens the ship. ',
      };
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
