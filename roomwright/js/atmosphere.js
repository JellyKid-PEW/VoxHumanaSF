// Atmosphere: starfield, lighting modes, optional ambient ship sound.
// Practical geometry stays primary — this layer is deliberately restrained.
import * as THREE from 'three';
import { editor } from './editor.js';
import { state } from './state.js';
import { bus, status } from './util.js';

const rig = {
  hemi: null, key: null, fills: [], emergency: [], starfield: null,
  audio: null, gain: null, mode: 'normal',
};

export function initAtmosphere() {
  const scene = editor.scene;

  // ---- starfield (visible through the forward glass) ----
  const starGeo = new THREE.BufferGeometry();
  const N = 2600;
  const pos = new Float32Array(N * 3);
  let seed = 987654;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < N; i++) {
    // shell of stars far away
    const r = 140 + rand() * 60;
    const theta = rand() * Math.PI * 2;
    const phi = Math.acos(2 * rand() - 1);
    pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = r * Math.cos(phi) * 0.6;
    pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0xcdd8e8, size: 0.35, sizeAttenuation: true, transparent: true, opacity: 0.9,
  }));
  stars.name = 'starfield';
  editor.envGroup.add(stars);
  rig.starfield = stars;

  // a faint distant nebula tint plane far forward
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(240, 120),
    new THREE.MeshBasicMaterial({ color: 0x0e1a26, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
  );
  glow.position.set(0, 0, -170);
  editor.envGroup.add(glow);

  // ---- lights ----
  rig.hemi = new THREE.HemisphereLight(0x93a7bc, 0x3a4048, 0.65);
  scene.add(rig.hemi);
  rig.key = new THREE.DirectionalLight(0xfff2dd, 0.7);
  rig.key.position.set(2.5, 4, 2);
  rig.key.castShadow = true;
  rig.key.shadow.mapSize.set(1024, 1024);
  rig.key.shadow.camera.left = -6; rig.key.shadow.camera.right = 6;
  rig.key.shadow.camera.top = 6; rig.key.shadow.camera.bottom = -6;
  scene.add(rig.key);

  // ceiling channel fills follow the rooms (rebuilt whenever floors change)
  rebuildRoomLights();
  bus.on('objects:changed', rebuildRoomLights);
  bus.on('room:rebuilt', rebuildRoomLights);

  // emergency strips (off unless emergency mode)
  for (const x of [-1.8, 1.8]) {
    const e = new THREE.PointLight(0xd9482e, 0, 6, 1.5);
    e.position.set(x, 0.25, 0.8);
    scene.add(e);
    rig.emergency.push(e);
  }

  setLightingMode(state.project.settings.lightingMode || 'normal');
  bus.on('project:replaced', () => {
    setLightingMode(state.project.settings.lightingMode || 'normal');
    const sel = document.getElementById('lighting-select');
    if (sel) sel.value = state.project.settings.lightingMode || 'normal';
  });
}

// One point light per ~2.2 m of each room's floor, plus the console glow.
// Intensity is (base × mode factor) so lighting modes keep working.
let rebuildQueued = false;
export function rebuildRoomLights() {
  if (rebuildQueued) return;
  rebuildQueued = true;
  setTimeout(() => {
    rebuildQueued = false;
    const scene = editor.scene;
    rig.fills.forEach(f => scene.remove(f));
    rig.fills = [];
    const M = MODE_TABLE[rig.mode] || MODE_TABLE.normal;
    for (const f of state.project.objects.filter(o => o.type === 'floor')) {
      const fw = f.params.width ?? 4, fd = f.params.depth ?? 4;
      const long = Math.max(fw, fd), along = fd >= fw ? 'z' : 'x';
      const n = Math.max(1, Math.round(long / 2.2));
      let base = Math.min(8.5, 3.0 + fw * fd * 0.32);   // small rooms, softer light
      // the dome's light sensor dips low "to preserve field contrast beyond
      // the glass" (Next-08) — keep its interior near-dark
      if (f.room === 'dome') base *= 0.18;
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n - 0.5;
        const p = new THREE.PointLight(0xdfe8f0, base * (M.fill / 8.5), Math.max(4, long * 0.9), 1.9);
        p.position.set(
          f.pos[0] + (along === 'x' ? t * long * 0.8 : 0),
          2.0,
          f.pos[2] + (along === 'z' ? t * long * 0.8 : 0));
        p.userData.baseIntensity = base;
        scene.add(p);
        rig.fills.push(p);
      }
    }
    // console glow on the bridge
    const cg = new THREE.PointLight(0x2d7c96, 6 * (M.fill / 8.5), 4, 1.6);
    cg.position.set(0, 1.1, -1.4);
    cg.userData.baseIntensity = 6;
    scene.add(cg);
    rig.fills.push(cg);
  }, 60);
}

const MODE_TABLE = {
  normal:    { hemi: 0.65, key: 0.7, fill: 8.5, emer: 0, exp: 1.0, bg: 0x04060a },
  dim:       { hemi: 0.26, key: 0.18, fill: 3.2, emer: 0, exp: 0.85, bg: 0x030408 },
  emergency: { hemi: 0.06, key: 0.0, fill: 0.6, emer: 14, exp: 0.8, bg: 0x030304 },
  powerless: { hemi: 0.035, key: 0.0, fill: 0.0, emer: 0, exp: 0.7, bg: 0x020204 },
};

export function setLightingMode(mode) {
  rig.mode = mode;
  state.project.settings.lightingMode = mode;
  const M = MODE_TABLE[mode] || MODE_TABLE.normal;
  if (rig.hemi) rig.hemi.intensity = M.hemi;
  if (rig.key) rig.key.intensity = M.key;
  rig.fills.forEach(f => f.intensity = (f.userData.baseIntensity ?? 8.5) * (M.fill / 8.5));
  rig.emergency.forEach(e => e.intensity = M.emer);
  editor.renderer.toneMappingExposure = M.exp;
  editor.scene.background = new THREE.Color(M.bg);
  // screens go dark when powerless
  editor.roomGroup.traverse(o => {
    if (o.userData.isScreen) o.material.emissiveIntensity = (mode === 'powerless') ? 0.02 : (mode === 'emergency' ? 0.35 : 0.9);
  });
  state.markDirty();
}

// ---- ambient sound: filtered noise hum, no assets required ----
export function toggleSound() {
  if (rig.audio && rig.gain) {
    const on = rig.gain.gain.value > 0.001;
    rig.gain.gain.linearRampToValueAtTime(on ? 0 : 0.05, rig.audio.currentTime + 0.4);
    state.project.settings.sound = !on;
    document.getElementById('btn-sound')?.classList.toggle('active', !on);
    status(!on ? 'Ambient ship sound on' : 'Ambient sound off');
    return;
  }
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  rig.audio = ctx;
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);
  rig.gain = master;
  // low drive hum: two detuned oscillators through a lowpass
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 130; lp.Q.value = 0.6;
  lp.connect(master);
  for (const f of [46, 46.7, 92.5]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth'; o.frequency.value = f;
    const g = ctx.createGain(); g.gain.value = f > 60 ? 0.05 : 0.16;
    o.connect(g); g.connect(lp); o.start();
  }
  // air noise
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) { last = last * 0.97 + (Math.random() * 2 - 1) * 0.03; data[i] = last * 3; }
  const noise = ctx.createBufferSource();
  noise.buffer = buf; noise.loop = true;
  const ng = ctx.createGain(); ng.gain.value = 0.25;
  const np = ctx.createBiquadFilter(); np.type = 'bandpass'; np.frequency.value = 420; np.Q.value = 0.4;
  noise.connect(np); np.connect(ng); ng.connect(master); noise.start();
  master.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 1.2);
  state.project.settings.sound = true;
  document.getElementById('btn-sound')?.classList.add('active');
  status('Ambient ship sound on');
}
