// Neutral articulated mannequins. No faces, no detail — proportion and reach only.
// A mannequin is a hierarchy of joint Groups; poses are joint-angle presets.
// Root origin sits on the floor (y=0) under the figure's center of support.
import * as THREE from 'three';

export const CHARACTERS = {
  // Heights are assumptions (no explicit figures in the prose):
  // Quenby — adult, average-tall; Iri — "Small frame, shoulders narrow" (Next-04);
  // Nova — a girl "smaller up close than Quenby had admitted" (Presence-04),
  // carried piggyback, small hands (VH1_B3_02).
  quenby: { label: 'Quenby', height: 1.73, color: 0xc7803a, build: 1.0 },
  iri:    { label: 'Iri',    height: 1.58, color: 0x4da3c7, build: 0.92 },
  nova:   { label: 'Nova',   height: 1.32, color: 0xa8c04a, build: 0.85 },
};

export function eyeHeight(character, posture = 'stand') {
  const h = CHARACTERS[character]?.height ?? 1.7;
  const f = { stand: 0.936, crouch: 0.62, sit: 0.52, sitFloor: 0.42, recline: 0.35 }[posture] ?? 0.936;
  return h * f;
}

function limb(r1, r2, len, mat) {
  const geo = new THREE.CylinderGeometry(r1, r2, len, 10);
  geo.translate(0, -len / 2, 0); // hang from pivot
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  return m;
}

export function buildMannequin(character) {
  const spec = CHARACTERS[character];
  const h = spec.height;
  const w = spec.build;
  const mat = new THREE.MeshStandardMaterial({ color: spec.color, roughness: 0.65, metalness: 0.1 });
  const matDark = new THREE.MeshStandardMaterial({ color: spec.color, roughness: 0.8, metalness: 0.1 });
  matDark.color.multiplyScalar(0.7);

  // proportional dimensions
  const legLen = h * 0.49;         // hip pivot height when standing
  const thighLen = h * 0.245;
  const shinLen = h * 0.245;
  const torsoLen = h * 0.30;
  const neckLen = h * 0.035;
  const headR = h * 0.065;
  const shoulderW = h * 0.24 * w;
  const hipW = h * 0.17 * w;
  const armUpper = h * 0.17;
  const armFore = h * 0.16;

  const root = new THREE.Group();
  root.userData.isMannequin = true;
  root.userData.character = character;

  const joints = {};
  const J = (name, parent, x, y, z) => {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(x, y, z);
    parent.add(g);
    joints[name] = g;
    return g;
  };

  // pelvis at hip height
  const pelvis = J('pelvis', root, 0, legLen, 0);
  const pelvisMesh = new THREE.Mesh(new THREE.BoxGeometry(hipW, h * 0.09, h * 0.09), mat);
  pelvisMesh.position.y = h * 0.02;
  pelvisMesh.castShadow = true;
  pelvis.add(pelvisMesh);

  // torso
  const spine = J('spine', pelvis, 0, h * 0.06, 0);
  const torsoMesh = new THREE.Mesh(new THREE.BoxGeometry(shoulderW * 0.92, torsoLen, h * 0.1), mat);
  torsoMesh.position.y = torsoLen / 2;
  torsoMesh.castShadow = true;
  spine.add(torsoMesh);

  const neck = J('neck', spine, 0, torsoLen, 0);
  const neckMesh = limb(h * 0.025, h * 0.03, neckLen, matDark);
  neckMesh.position.y = neckLen;
  neck.add(neckMesh);
  const head = J('head', neck, 0, neckLen, 0);
  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(headR, 16, 12), mat);
  headMesh.position.y = headR * 1.1;
  headMesh.castShadow = true;
  head.add(headMesh);
  const eye = new THREE.Object3D();
  eye.name = 'eyePoint';
  eye.position.set(0, headR * 1.1, headR * 0.8);
  head.add(eye);

  // legs
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? -1 : 1;
    const hip = J('hip' + side, pelvis, s * hipW / 2 * 0.75, 0, 0);
    hip.add(limb(h * 0.035, h * 0.028, thighLen, mat));
    const knee = J('knee' + side, hip, 0, -thighLen, 0);
    knee.add(limb(h * 0.026, h * 0.02, shinLen, matDark));
    const ankle = J('ankle' + side, knee, 0, -shinLen, 0);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(h * 0.05, h * 0.028, h * 0.13), matDark);
    foot.position.set(0, -h * 0.014, h * 0.035);
    foot.castShadow = true;
    ankle.add(foot);
  }

  // arms
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? -1 : 1;
    const shoulder = J('shoulder' + side, spine, s * shoulderW / 2, torsoLen * 0.92, 0);
    shoulder.add(limb(h * 0.028, h * 0.023, armUpper, mat));
    const elbow = J('elbow' + side, shoulder, 0, -armUpper, 0);
    elbow.add(limb(h * 0.021, h * 0.017, armFore, matDark));
    const wrist = J('wrist' + side, elbow, 0, -armFore, 0);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(h * 0.035, h * 0.075, h * 0.02), mat);
    hand.position.y = -h * 0.037;
    hand.castShadow = true;
    wrist.add(hand);
    const reach = new THREE.Object3D();
    reach.name = 'reach' + side;
    reach.position.y = -h * 0.075;
    wrist.add(reach);
  }

  root.userData.joints = joints;
  root.userData.dims = { h, legLen, thighLen, shinLen, torsoLen };
  return root;
}

// deg helper
const d = x => x * Math.PI / 180;

// Pose presets: joint euler angles (x = forward pitch) + pelvis height rule.
// pelvisY(dims) returns pelvis joint height above root origin.
export const POSES = {
  stand: {
    label: 'Stand',
    pelvisY: dd => dd.legLen,
    angles: {},
  },
  walk: {
    label: 'Walk (mid-stride)',
    pelvisY: dd => dd.legLen * 0.985,
    angles: {
      hipL: { x: d(-22) }, kneeL: { x: d(14) },
      hipR: { x: d(18) }, kneeR: { x: d(28) },
      shoulderL: { x: d(14) }, shoulderR: { x: d(-14) },
      elbowL: { x: d(10) }, elbowR: { x: d(24) },
    },
  },
  sit: {
    label: 'Sit',
    pelvisY: dd => dd.legLen * 0.94, // placed onto seats externally: pelvisY≈seatHeight
    seatRelative: true,
    angles: {
      hipL: { x: d(-84) }, kneeL: { x: d(82) },
      hipR: { x: d(-84) }, kneeR: { x: d(82) },
      shoulderL: { x: d(6) }, shoulderR: { x: d(6) },
      elbowL: { x: d(30) }, elbowR: { x: d(30) },
      spine: { x: d(-4) },
    },
  },
  sitFloor: {
    label: 'Sit on floor (play)',
    pelvisY: dd => dd.h * 0.09,
    angles: {
      hipL: { x: d(-88), y: d(-42) }, kneeL: { x: d(112) },
      hipR: { x: d(-88), y: d(42) }, kneeR: { x: d(112) },
      spine: { x: d(14) },
      shoulderL: { x: d(-38) }, shoulderR: { x: d(-38) },
      elbowL: { x: d(46) }, elbowR: { x: d(46) },
      head: { x: d(22) },
    },
  },
  crouch: {
    label: 'Crouch',
    pelvisY: dd => dd.legLen * 0.52,
    angles: {
      hipL: { x: d(-102) }, kneeL: { x: d(118) },
      hipR: { x: d(-102) }, kneeR: { x: d(118) },
      spine: { x: d(18) },
      shoulderL: { x: d(-16) }, shoulderR: { x: d(-16) },
      elbowL: { x: d(40) }, elbowR: { x: d(40) },
    },
  },
  recline: {
    label: 'Recline / lounge',
    pelvisY: dd => dd.legLen * 0.9,
    seatRelative: true,
    angles: {
      spine: { x: d(-24) },
      neck: { x: d(6) },
      hipL: { x: d(-58) }, kneeL: { x: d(30) },
      hipR: { x: d(-58) }, kneeR: { x: d(30) },
      shoulderL: { x: d(10), z: d(-14) }, shoulderR: { x: d(10), z: d(14) },
      elbowL: { x: d(16) }, elbowR: { x: d(16) },
    },
  },
  feetUp: {
    label: 'Feet up on rail',
    pelvisY: dd => dd.legLen * 0.92,
    seatRelative: true,
    angles: {
      spine: { x: d(-20) },
      hipL: { x: d(-46) }, kneeL: { x: d(8) },
      hipR: { x: d(-46) }, kneeR: { x: d(8) },
      shoulderL: { x: d(4), z: d(-30) }, shoulderR: { x: d(4), z: d(30) },
      elbowL: { x: d(58) }, elbowR: { x: d(58) },
      head: { x: d(-4) },
    },
  },
  lean: {
    label: 'Lean (against surface)',
    pelvisY: dd => dd.legLen * 0.97,
    angles: {
      spine: { x: d(-9), z: d(4) },
      hipL: { x: d(4) }, hipR: { x: d(-10) }, kneeR: { x: d(12) },
      shoulderL: { z: d(-8) }, shoulderR: { x: d(-30), z: d(20) },
      elbowR: { x: d(52) },
    },
  },
  reach: {
    label: 'Reach forward',
    pelvisY: dd => dd.legLen,
    angles: {
      spine: { x: d(8) },
      shoulderR: { x: d(-86) },
      elbowR: { x: d(8) },
      shoulderL: { x: d(6) },
    },
  },
  reachUp: {
    label: 'Reach up',
    pelvisY: dd => dd.legLen,
    angles: {
      spine: { x: d(-3) },
      shoulderR: { x: d(-168) },
      elbowR: { x: d(4) },
    },
  },
};

export function applyPose(mannequin, poseName, opts = {}) {
  const pose = POSES[poseName] || POSES.stand;
  const joints = mannequin.userData.joints;
  const dims = mannequin.userData.dims;
  // reset
  for (const j of Object.values(joints)) j.rotation.set(0, 0, 0);
  for (const [name, e] of Object.entries(pose.angles)) {
    const j = joints[name];
    if (j) j.rotation.set(e.x || 0, e.y || 0, e.z || 0);
  }
  // pelvis height: seat-relative poses can pass opts.supportHeight (seat pan height)
  let py = pose.pelvisY(dims);
  if (pose.seatRelative && opts.supportHeight != null) py = opts.supportHeight + dims.h * 0.015;
  joints.pelvis.position.y = py;
  mannequin.userData.pose = poseName;
  return mannequin;
}

// World-space eye position for a posed mannequin.
export function getEyeWorld(mannequin, out = new THREE.Vector3()) {
  let eye = null;
  mannequin.traverse(o => { if (o.name === 'eyePoint') eye = o; });
  if (!eye) return out.set(0, 1.6, 0);
  return eye.getWorldPosition(out);
}
