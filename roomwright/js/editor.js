// 3D editor core: renderer (WebGPU with WebGL2 fallback), cameras/views,
// transform tools, snapping, selection, measurement, screenshots, cutaway.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { state } from './state.js';
import { bus, status, fmt } from './util.js';
import { buildObject } from './objects.js';
import { buildMannequin, applyPose, CHARACTERS, eyeHeight, getEyeWorld } from './mannequin.js';

export const editor = {
  renderer: null,
  scene: null,
  perspCam: null,
  orthoCam: null,
  activeCam: null,
  orbit: null,
  gizmo: null,
  view: 'orbit',
  tool: 'select',
  objectGroups: new Map(),     // objectId -> THREE.Group
  mannequinGroups: new Map(),  // scene mannequin index -> group
  helpers: null,
  envGroup: null,
  roomGroup: null,
  mannGroup: null,
  navOverlay: null,
  measurements: [],
  measurePending: null,
  sightLines: [],
  pathLines: [],
  fp: { active: false, character: 'quenby', crouch: false, yaw: 0, pitch: 0, pos: new THREE.Vector3(0, 1.6, 1.5), keys: {}, vel: new THREE.Vector3() },
  cutaway: false,
  clipPlane: null,
  frameCbs: [],
  raycaster: new THREE.Raycaster(),
  selBox: null,
  isWebGPU: false,
};

const canvas = () => document.getElementById('viewport');

// Create the renderer, preferring WebGPU but verifying it with a trial render
// that exercises the features we use (standard materials, shadows, emissive,
// transparency). Some browsers advertise navigator.gpu but fail at render
// time; those fall back to WebGL2 on a fresh canvas.
async function createRendererWithFallback() {
  const setup = r => {
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
  };
  const freshCanvas = () => {
    const old = canvas();
    const c2 = old.cloneNode(false);
    old.replaceWith(c2);
    return c2;
  };
  const forced = localStorage.getItem('roomwright:forceWebGL') === '1';
  if (navigator.gpu && !forced) {
    try {
      const r = new THREE.WebGPURenderer({ canvas: canvas(), antialias: true });
      await r.init();
      setup(r);
      // trial render with representative content
      const ts = new THREE.Scene();
      const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color: 0x888888, emissive: 0x112233 }));
      box.castShadow = box.receiveShadow = true;
      ts.add(box);
      const glass = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.1),
        new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.2 }));
      ts.add(glass);
      const dl = new THREE.DirectionalLight(0xffffff, 1);
      dl.position.set(2, 3, 1);
      dl.castShadow = true;
      ts.add(dl, new THREE.HemisphereLight(0xffffff, 0x222222, 0.4));
      const tc = new THREE.PerspectiveCamera(60, 1, 0.1, 10);
      tc.position.set(0, 1, 3);
      tc.lookAt(0, 0, 0);
      r.setSize(64, 64, false);
      await r.renderAsync(ts, tc);
      ts.traverse(o => o.geometry?.dispose?.());
      return { renderer: r, webgpu: true };
    } catch (e) {
      console.warn('WebGPU failed trial render — falling back to WebGL2:', e);
    }
  }
  const r = new THREE.WebGPURenderer({ canvas: freshCanvas(), antialias: true, forceWebGL: true });
  await r.init();
  setup(r);
  return { renderer: r, webgpu: false };
}

export async function initEditor() {
  const { renderer, webgpu } = await createRendererWithFallback();
  editor.renderer = renderer;
  editor.isWebGPU = webgpu;
  const c = canvas();
  document.getElementById('status-renderer').textContent =
    `Renderer: ${editor.isWebGPU ? 'WebGPU' : 'WebGL2 (fallback)'}`;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x04060a);
  editor.scene = scene;

  editor.envGroup = new THREE.Group(); editor.envGroup.name = 'env';
  editor.roomGroup = new THREE.Group(); editor.roomGroup.name = 'room';
  editor.mannGroup = new THREE.Group(); editor.mannGroup.name = 'mannequins';
  editor.helpers = new THREE.Group(); editor.helpers.name = 'helpers';
  scene.add(editor.envGroup, editor.roomGroup, editor.mannGroup, editor.helpers);

  // cameras
  const aspect = c.clientWidth / Math.max(1, c.clientHeight);
  editor.perspCam = new THREE.PerspectiveCamera(60, aspect, 0.05, 400);
  editor.perspCam.position.set(6, 5, 7);
  editor.orthoCam = new THREE.OrthographicCamera(-6, 6, 4.5, -4.5, 0.05, 200);
  editor.orthoCam.position.set(0, 30, 0);
  editor.orthoCam.lookAt(0, 0, 0);
  editor.activeCam = editor.perspCam;

  // orbit controls
  editor.orbit = new OrbitControls(editor.perspCam, c);
  editor.orbit.target.set(0, 1, 0);
  editor.orbit.enableDamping = true;
  editor.orbit.dampingFactor = 0.12;

  // transform gizmo
  const gizmo = new TransformControls(editor.perspCam, c);
  gizmo.setTranslationSnap(state.project.settings.snap || null);
  gizmo.setRotationSnap(THREE.MathUtils.degToRad(15));
  gizmo.setScaleSnap(0.05);
  gizmo.addEventListener('dragging-changed', e => {
    editor.orbit.enabled = !e.value && editor.view === 'orbit';
    if (e.value) beforeGizmoDrag(); else afterGizmoDrag();
  });
  gizmo.addEventListener('objectChange', onGizmoChange);
  editor.gizmo = gizmo;
  scene.add(gizmo.getHelper());

  // grid
  const grid = new THREE.GridHelper(30, 60, 0x2a3038, 0x1d2229);
  grid.position.y = -0.001;
  grid.name = 'grid';
  editor.helpers.add(grid);

  // selection helper
  editor.selBox = new THREE.Box3Helper(new THREE.Box3(), 0xe8a33d);
  editor.selBox.visible = false;
  editor.helpers.add(editor.selBox);

  wireInput();
  wireBus();
  onResize();
  window.addEventListener('resize', onResize);

  renderer.setAnimationLoop(tick);
}

function onResize() {
  const c = canvas();
  const w = c.clientWidth || c.parentElement.clientWidth;
  const h = c.clientHeight || c.parentElement.clientHeight;
  editor.renderer.setSize(w, h, false);
  editor.perspCam.aspect = w / Math.max(1, h);
  editor.perspCam.updateProjectionMatrix();
  const oh = editor.orthoCam.top - editor.orthoCam.bottom;
  const ow = oh * (w / Math.max(1, h));
  editor.orthoCam.left = -ow / 2; editor.orthoCam.right = ow / 2;
  editor.orthoCam.updateProjectionMatrix();
}

// ================= rebuild from state =================
export function rebuildRoom() {
  // dispose old
  editor.roomGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  editor.roomGroup.clear();
  editor.objectGroups.clear();
  for (const rec of state.project.objects) {
    try {
      const g = buildObject(rec);
      if (rec.scale) g.scale.set(...rec.scale);
      editor.roomGroup.add(g);
      editor.objectGroups.set(rec.id, g);
    } catch (e) { console.error('build failed', rec, e); }
  }
  applyCeilingVisibility();
  refreshSelectionVisual();
  bus.emit('room:rebuilt');
}

// Dollhouse behavior: hide ceilings in exterior views so the interior reads.
function applyCeilingVisibility() {
  const show = editor.view === 'fp' || editor.view === 'elev';
  for (const [id, g] of editor.objectGroups) {
    const rec = state.getObject(id);
    if (rec?.type === 'ceiling') g.visible = show;
  }
}

export function rebuildMannequins() {
  editor.mannGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  editor.mannGroup.clear();
  editor.mannequinGroups.clear();
  const scene = state.activeScene;
  if (!scene) return;
  scene.mannequins.forEach((m, i) => {
    const g = buildMannequin(m.character);
    applyPose(g, m.pose, { supportHeight: m.supportHeight });
    g.position.set(...m.pos);
    g.rotation.y = m.rotY || 0;
    g.userData.mannequinIndex = i;
    editor.mannGroup.add(g);
    editor.mannequinGroups.set(i, g);
    if (m.props === 'bolts') {
      // scatter bolts in front of a floor-sitting figure
      const bolts = buildObject({ id: 'prop_bolts_' + i, type: 'bolts', params: { count: 8, spread: 0.7 }, pos: [0, 0, 0.45], rotY: 0 });
      g.add(bolts);
    }
  });
  drawPaths();
  bus.emit('mannequins:rebuilt');
}

function drawPaths() {
  editor.pathLines.forEach(l => { l.geometry.dispose(); editor.helpers.remove(l); });
  editor.pathLines = [];
  const scene = state.activeScene;
  if (!scene) return;
  for (const p of (scene.paths || [])) {
    if (!p.points || p.points.length < 2) continue;
    const pts = p.points.map(q => new THREE.Vector3(q[0], (q[1] || 0) + 0.03, q[2]));
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const color = CHARACTERS[p.character]?.color ?? 0xffffff;
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color }));
    editor.helpers.add(line);
    editor.pathLines.push(line);
    for (const v of pts) {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color }));
      dot.position.copy(v);
      line.add(dot);
    }
  }
}

// ================= views =================
export function setView(name) {
  editor.view = name;
  exitFP();
  const c = canvas();
  document.querySelectorAll('#view-buttons .tb').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  const hudMode = document.getElementById('hud-mode');
  editor.orbit.enabled = false;

  if (name === 'orbit') {
    editor.activeCam = editor.perspCam;
    editor.orbit.object = editor.perspCam;
    editor.orbit.enabled = true;
    editor.orbit.enableRotate = true;
    editor.orbit.minPolarAngle = 0; editor.orbit.maxPolarAngle = Math.PI * 0.495;
    hudMode.textContent = 'Orbit — drag rotate · wheel zoom · right-drag pan';
  } else if (name === 'fp') {
    enterFP(editor.fp.character);
    hudMode.textContent = '';
  } else if (name === 'over') {
    editor.activeCam = editor.perspCam;
    editor.perspCam.position.set(0, 13, 0.02);
    editor.orbit.object = editor.perspCam;
    editor.orbit.target.set(0, 0, 0);
    editor.orbit.enabled = true;
    editor.orbit.enableRotate = true;
    editor.orbit.minPolarAngle = 0; editor.orbit.maxPolarAngle = 0.6;
    hudMode.textContent = 'Overhead — wheel zoom · right-drag pan';
  } else if (name === 'plan') {
    editor.activeCam = editor.orthoCam;
    editor.orthoCam.position.set(0, 30, 0);
    editor.orthoCam.up.set(0, 0, -1);
    editor.orthoCam.lookAt(0, 0, 0);
    editor.orbit.object = editor.orthoCam;
    editor.orbit.enabled = true;
    editor.orbit.enableRotate = false;
    hudMode.textContent = 'Floor plan (orthographic) — wheel zoom · drag pan';
  } else if (name === 'elev') {
    editor.activeCam = editor.orthoCam;
    editor.orthoCam.up.set(0, 1, 0);
    editor.orthoCam.position.set(0, 1.4, 30);
    editor.orthoCam.lookAt(0, 1.4, 0);
    editor.orbit.object = editor.orthoCam;
    editor.orbit.enabled = true;
    editor.orbit.enableRotate = false;
    hudMode.textContent = 'Elevation (orthographic) — wheel zoom · drag pan';
  }
  editor.gizmo.camera = editor.activeCam;
  document.getElementById('hud-fp').classList.toggle('hidden', name !== 'fp');
  applyCeilingVisibility();
}

// ---------- first person ----------
export function enterFP(character) {
  editor.fp.active = true;
  editor.fp.character = character;
  editor.fp.crouch = false;
  editor.activeCam = editor.perspCam;
  editor.orbit.enabled = false;
  const eh = eyeHeight(character, 'stand');
  editor.fp.pos.set(editor.fp.pos.x, eh, editor.fp.pos.z);
  editor.perspCam.position.copy(editor.fp.pos);
  editor.fp.yaw = Math.PI; // face -z (forward viewport)
  editor.fp.pitch = 0;
  document.querySelectorAll('.char-chip').forEach(b => b.classList.toggle('active', b.dataset.char === character));
  document.getElementById('hud-fp').classList.remove('hidden');
  document.getElementById('hud-mode').textContent = '';
  document.getElementById('hud-fp-char').textContent = CHARACTERS[character].label;
  document.getElementById('hud-fp-eye').textContent = fmt(eh, 2);
  document.querySelectorAll('#view-buttons .tb').forEach(b => b.classList.toggle('active', b.dataset.view === 'fp'));
  editor.view = 'fp';
  applyCeilingVisibility();
}
export function exitFP() {
  if (!editor.fp.active) return;
  editor.fp.active = false;
  document.getElementById('hud-fp').classList.add('hidden');
  document.querySelectorAll('.char-chip').forEach(b => b.classList.remove('active'));
}

function fpUpdate(dt) {
  const f = editor.fp;
  if (!f.active) return;
  const spec = CHARACTERS[f.character];
  const speed = (f.keys['shift'] ? 2.6 : 1.4) * (spec.height / 1.7);
  const dir = new THREE.Vector3();
  if (f.keys['w']) dir.z -= 1;
  if (f.keys['s']) dir.z += 1;
  if (f.keys['a']) dir.x -= 1;
  if (f.keys['d']) dir.x += 1;
  dir.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), f.yaw);
  const step = dir.multiplyScalar(speed * dt);
  const radius = Math.max(0.16, 0.22 * (spec.height / 1.7));
  const eh = eyeHeight(f.character, f.crouch ? 'crouch' : 'stand');
  // slide along colliders: try x and z independently
  const tryMove = (dx, dz) => {
    const nx = f.pos.x + dx, nz = f.pos.z + dz;
    if (!circleHitsColliders(nx, nz, radius, 0.15, eh + 0.1)) { f.pos.x = nx; f.pos.z = nz; }
  };
  tryMove(step.x, 0);
  tryMove(0, step.z);
  f.pos.y = eh;
  editor.perspCam.position.copy(f.pos);
  const look = new THREE.Vector3(
    Math.sin(f.yaw) * Math.cos(f.pitch), Math.sin(f.pitch), Math.cos(f.yaw) * Math.cos(f.pitch)
  );
  editor.perspCam.lookAt(f.pos.clone().add(look));
  document.getElementById('hud-fp-eye').textContent = fmt(eh, 2);
}

// Collision query: does a circle at (x,z) with radius r hit any collidable AABB
// whose vertical span intersects [yLo, yHi]?
export function circleHitsColliders(x, z, r, yLo = 0.15, yHi = 1.9) {
  for (const [id, g] of editor.objectGroups) {
    const rec = state.getObject(id);
    if (!rec) continue;
    if (rec.type === 'floor' || rec.type === 'ceiling' || rec.type === 'bolts') continue;
    for (const bb of collectAABBs(g, /*skipDoorLeaf*/true)) {
      if (bb.max.y < yLo || bb.min.y > yHi) continue;
      const cx = Math.max(bb.min.x, Math.min(x, bb.max.x));
      const cz = Math.max(bb.min.z, Math.min(z, bb.max.z));
      if ((cx - x) ** 2 + (cz - z) ** 2 < r * r) return { id, name: rec.name };
    }
  }
  return null;
}

const _tmpBox = new THREE.Box3();
export function collectAABBs(group, skipDoorLeaf = false) {
  const out = [];
  group.updateWorldMatrix(true, true);
  group.traverse(o => {
    if (!o.isMesh || !o.userData.collidable) return;
    if (skipDoorLeaf) {
      let p = o;
      while (p && p !== group) { if (p.userData.isDoorLeaf) return; p = p.parent; }
    }
    _tmpBox.setFromObject(o);
    out.push(_tmpBox.clone());
  });
  return out;
}

// World AABB of a whole object (collidable meshes only).
export function objectAABB(id, skipDoorLeaf = true) {
  const g = editor.objectGroups.get(id);
  if (!g) return null;
  const boxes = collectAABBs(g, skipDoorLeaf);
  if (!boxes.length) return null;
  const b = boxes[0].clone();
  for (let i = 1; i < boxes.length; i++) b.union(boxes[i]);
  return b;
}

// ================= tools =================
export function setTool(name) {
  editor.tool = name;
  document.querySelectorAll('#tool-buttons .tb').forEach(b => b.classList.toggle('active', b.dataset.tool === name));
  clearMeasurePending();
  const g = editor.gizmo;
  if (name === 'move') {
    attachGizmo(); g.setMode('translate');
    // everything sits on the deck: no vertical translation
    g.showX = true; g.showY = false; g.showZ = true;
  } else if (name === 'rotate') {
    attachGizmo(); g.setMode('rotate');
    // the model stores yaw only
    g.showX = false; g.showY = true; g.showZ = false;
  } else if (name === 'scale') {
    attachGizmo(); g.setMode('scale');
    g.showX = true; g.showY = true; g.showZ = true;
  } else g.detach();
  document.getElementById('hud-measure').classList.toggle('hidden', name !== 'measure');
  if (name === 'measure') document.getElementById('hud-measure').textContent = 'Measure: click first point';
}

function attachGizmo() {
  const target = selectedGroup();
  if (target && !state.getObject(state.selection)?.locked) editor.gizmo.attach(target);
  else editor.gizmo.detach();
}

function selectedGroup() {
  if (!state.selection) return null;
  return editor.objectGroups.get(state.selection) ||
    [...editor.mannequinGroups.values()].find(g => 'mann_' + g.userData.mannequinIndex === state.selection) || null;
}

let dragCheckpointed = false;
function beforeGizmoDrag() { if (!dragCheckpointed) { state.checkpoint('transform'); dragCheckpointed = true; } }
function afterGizmoDrag() {
  dragCheckpointed = false;
  const g = editor.gizmo.object;
  if (!g) return;
  if (g.userData.objectId) {
    const rec = state.getObject(g.userData.objectId);
    if (rec) {
      g.position.y = 0; // deck-bound
      rec.pos = [g.position.x, 0, g.position.z];
      rec.rotY = g.rotation.y;
      rec.scale = [g.scale.x, g.scale.y, g.scale.z];
      state.markDirty();
      bus.emit('object:transformed', rec.id);
    }
  } else if (g.userData.isMannequin) {
    const scene = state.activeScene;
    const m = scene?.mannequins[g.userData.mannequinIndex];
    if (m) {
      m.pos = [g.position.x, 0, g.position.z];
      g.position.y = 0;
      m.rotY = g.rotation.y;
      state.markDirty();
      bus.emit('mannequin:transformed', g.userData.mannequinIndex);
    }
  }
  refreshSelectionVisual();
}
function onGizmoChange() {
  const g = editor.gizmo.object;
  if (!g) return;
  if (g.userData.isMannequin) g.position.y = 0; // keep on deck
  if (editor.selBox.visible && g) {
    editor.selBox.box.setFromObject(g);
  }
}

// ================= selection & picking =================
function wireInput() {
  const c = canvas();
  let downPos = null;
  c.addEventListener('pointerdown', e => {
    downPos = [e.clientX, e.clientY];
    if (editor.fp.active) { c.setPointerCapture(e.pointerId); }
  });
  c.addEventListener('pointermove', e => {
    if (editor.fp.active && e.buttons & 1) {
      editor.fp.yaw -= e.movementX * 0.0042;
      editor.fp.pitch = Math.max(-1.4, Math.min(1.4, editor.fp.pitch - e.movementY * 0.0042));
    }
  });
  c.addEventListener('pointerup', e => {
    if (!downPos) return;
    const moved = Math.hypot(e.clientX - downPos[0], e.clientY - downPos[1]);
    downPos = null;
    if (moved > 5 || editor.fp.active) return;
    if (editor.gizmo.dragging) return;
    handleClick(e);
  });
  window.addEventListener('keydown', e => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const k = e.key.toLowerCase();
    editor.fp.keys[k] = true;
    if (k === 'shift') editor.fp.keys['shift'] = true;
    if (editor.fp.active && k === 'c') { editor.fp.crouch = !editor.fp.crouch; }
    if (k === 'escape') {
      if (editor.fp.active) setView('orbit');
      clearMeasurePending();
      state.select(null);
    }
    if (e.ctrlKey && k === 'z') { e.preventDefault(); if (state.undo()) status('Undo'); }
    else if (e.ctrlKey && (k === 'y' || (e.shiftKey && k === 'z'))) { e.preventDefault(); if (state.redo()) status('Redo'); }
    else if (!e.ctrlKey && !editor.fp.active) {
      if (k === '1') setView('orbit');
      if (k === '2') setView('fp');
      if (k === '3') setView('over');
      if (k === '4') setView('plan');
      if (k === '5') setView('elev');
      if (k === 'q') setTool('select');
      if (k === 'w') setTool('move');
      if (k === 'e') setTool('rotate');
      if (k === 'r') setTool('scale');
      if (k === 'm') setTool('measure');
      if (k === 'delete' || k === 'backspace') deleteSelected();
    }
  });
  window.addEventListener('keyup', e => { editor.fp.keys[e.key.toLowerCase()] = false; if (e.key === 'Shift') editor.fp.keys['shift'] = false; });
}

function ndc(e) {
  const r = canvas().getBoundingClientRect();
  return new THREE.Vector2(
    ((e.clientX - r.left) / r.width) * 2 - 1,
    -((e.clientY - r.top) / r.height) * 2 + 1
  );
}

function handleClick(e) {
  const m = ndc(e);
  editor.raycaster.setFromCamera(m, editor.activeCam);

  // floor-pick mode (used by path recording): consume the click
  if (editor.pickFloorMode) {
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const v = new THREE.Vector3();
    if (editor.raycaster.ray.intersectPlane(plane, v)) editor.pickFloorMode(v);
    return;
  }

  if (editor.tool === 'measure') { measureClick(); return; }

  // pick objects + mannequins (skip anything in a hidden branch, e.g. the
  // ceiling in dollhouse views — the raycaster itself tests hidden meshes)
  const hits = editor.raycaster.intersectObjects([editor.roomGroup, editor.mannGroup], true)
    .filter(h => {
      let p = h.object;
      while (p) { if (p.visible === false) return false; p = p.parent; }
      return true;
    });
  for (const h of hits) {
    let o = h.object;
    while (o) {
      if (o.userData.objectId && !String(o.userData.objectId).startsWith('prop_')) {
        state.select(o.userData.objectId);
        return;
      }
      if (o.userData.isMannequin) {
        state.select('mann_' + o.userData.mannequinIndex);
        return;
      }
      o = o.parent;
    }
  }
  state.select(null);
}

function deleteSelected() {
  if (!state.selection || String(state.selection).startsWith('mann_')) return;
  const rec = state.getObject(state.selection);
  if (!rec) return;
  if (rec.locked) { status('Object is locked (see inspector)'); return; }
  state.checkpoint('delete');
  state.removeObject(rec.id);
  status(`Deleted ${rec.name}`);
}

export function refreshSelectionVisual() {
  const g = selectedGroup();
  if (g) {
    editor.selBox.box.setFromObject(g);
    editor.selBox.visible = true;
    if (['move', 'rotate', 'scale'].includes(editor.tool)) attachGizmo();
  } else {
    editor.selBox.visible = false;
    editor.gizmo.detach();
  }
}

// ================= measurement =================
function measureClick() {
  // intersect room + a ground plane
  const hits = editor.raycaster.intersectObjects([editor.roomGroup, editor.mannGroup], true);
  let pt = hits.length ? hits[0].point.clone() : null;
  if (!pt) {
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const v = new THREE.Vector3();
    if (editor.raycaster.ray.intersectPlane(plane, v)) pt = v.clone();
  }
  if (!pt) return;
  const hud = document.getElementById('hud-measure');
  if (!editor.measurePending) {
    editor.measurePending = pt;
    hud.textContent = 'Measure: click second point';
    return;
  }
  const a = editor.measurePending, b = pt;
  editor.measurePending = null;
  const dist = a.distanceTo(b);
  const flat = Math.hypot(b.x - a.x, b.z - a.z);
  hud.textContent = `${fmt(dist, 3)} m  (horizontal ${fmt(flat, 3)} m, Δh ${fmt(Math.abs(b.y - a.y), 3)} m)`;
  const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xe8a33d, depthTest: false }));
  line.renderOrder = 99;
  const mkDot = p => {
    const d = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshBasicMaterial({ color: 0xe8a33d, depthTest: false }));
    d.position.copy(p); d.renderOrder = 99; return d;
  };
  line.add(mkDot(a), mkDot(b));
  line.add(makeLabel(`${fmt(dist, 2)} m`, a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, 0.08, 0))));
  editor.helpers.add(line);
  editor.measurements.push(line);
}

export function clearMeasurements() {
  editor.measurements.forEach(l => { l.geometry.dispose(); editor.helpers.remove(l); });
  editor.measurements = [];
}
function clearMeasurePending() {
  editor.measurePending = null;
  const hud = document.getElementById('hud-measure');
  if (editor.tool === 'measure') hud.textContent = 'Measure: click first point';
}

export function makeLabel(text, pos, scale = 1) {
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d');
  ctx.font = '600 42px system-ui, sans-serif';
  const w = Math.ceil(ctx.measureText(text).width) + 28;
  cv.width = w; cv.height = 64;
  const c2 = cv.getContext('2d');
  c2.fillStyle = 'rgba(15,18,22,0.85)';
  c2.fillRect(0, 0, w, 64);
  c2.strokeStyle = '#e8a33d'; c2.strokeRect(0.5, 0.5, w - 1, 63);
  c2.font = '600 42px system-ui, sans-serif';
  c2.fillStyle = '#e8c37d';
  c2.fillText(text, 14, 46);
  const tex = new THREE.CanvasTexture(cv);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sp.scale.set((w / 64) * 0.22 * scale, 0.22 * scale, 1);
  sp.position.copy(pos);
  sp.renderOrder = 100;
  return sp;
}

// ================= sightlines =================
export function clearSightLines() {
  editor.sightLines.forEach(l => { l.geometry?.dispose?.(); editor.helpers.remove(l); });
  editor.sightLines = [];
}

// Cast from eye point to target point; windows/glass do not block.
export function castSight(from, to) {
  const dir = to.clone().sub(from);
  const dist = dir.length();
  dir.normalize();
  const rc = new THREE.Raycaster(from, dir, 0.02, dist - 0.05);
  const hits = rc.intersectObjects([editor.roomGroup], true);
  for (const h of hits) {
    if (h.object.userData.isWindow) continue;
    if (!h.object.userData.collidable && !h.object.userData.isScreen) continue;
    // find owner
    let o = h.object, owner = null;
    while (o) { if (o.userData.objectId) { owner = o.userData.objectId; break; } o = o.parent; }
    return { clear: false, blocker: owner, point: h.point.clone() };
  }
  return { clear: true };
}

export function drawSightLine(from, to, clear) {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: clear ? 0x4caf6e : 0xe05c5c, depthTest: false }));
  line.renderOrder = 98;
  editor.helpers.add(line);
  editor.sightLines.push(line);
  return line;
}

// ================= cutaway =================
export function setCutaway(on) {
  editor.cutaway = on;
  if (on) {
    editor.clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1.25);
    editor.renderer.clippingPlanes = [editor.clipPlane];
  } else {
    editor.renderer.clippingPlanes = [];
  }
  document.getElementById('btn-cutaway').classList.toggle('active', on);
}

// ================= screenshot =================
export async function screenshot(mult = 3) {
  const r = editor.renderer;
  const c = canvas();
  const w = c.clientWidth, h = c.clientHeight;
  r.setSize(w * mult, h * mult, false);
  if (editor.activeCam.isPerspectiveCamera) {
    editor.activeCam.aspect = w / h;
    editor.activeCam.updateProjectionMatrix();
  }
  await r.renderAsync(editor.scene, editor.activeCam);
  const url = c.toDataURL('image/png');
  r.setSize(w, h, false);
  const a = document.createElement('a');
  a.href = url;
  a.download = `roomwright_${Date.now()}.png`;
  a.click();
  status(`Saved ${w * mult}×${h * mult} screenshot`);
}

// ================= frame loop =================
let lastT = performance.now();
let renderFails = 0;
function tick() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  if (editor.orbit.enabled) editor.orbit.update();
  fpUpdate(dt);
  for (const cb of editor.frameCbs) cb(dt);
  try {
    editor.renderer.render(editor.scene, editor.activeCam);
    renderFails = 0;
  } catch (e) {
    // WebGPU implementations that pass the trial can still fail on live
    // content; after repeated failures, pin WebGL2 and reload once.
    if (++renderFails > 3 && editor.isWebGPU && !localStorage.getItem('roomwright:forceWebGL')) {
      console.warn('WebGPU failing at runtime — switching to WebGL2', e);
      localStorage.setItem('roomwright:forceWebGL', '1');
      location.reload();
    }
  }
}

function wireBus() {
  bus.on('objects:changed', rebuildRoom);
  bus.on('project:replaced', () => { rebuildRoom(); rebuildMannequins(); });
  bus.on('scenes:changed', rebuildMannequins);
  bus.on('selection:changed', refreshSelectionVisual);
}
