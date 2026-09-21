// Scene-review workbench: load a scene's prose, place its people, and check
// the scene against the ship — geography, acoustics, sightlines, movement,
// object grounding, and the evidence base. Findings can be queued as pending
// manuscript corrections.
import * as THREE from 'three';
import { state } from './state.js';
import { uid } from './util.js';
import { audibilityReport, levelAt } from './acoustics.js';
import { computeNavGrid, findPath } from './tests.js';
import { castSight } from './editor.js';
import { checkProseAgainstLayout } from './constraints.js';
import { CHARACTERS, eyeHeight } from './mannequin.js';
import { DECK2Y } from './layout.js';

// ---------- geometry helpers ----------
function floorRect(f) {
  const fw = f.params.width ?? 6, fd = f.params.depth ?? 5;
  const rot = Math.abs(Math.sin(f.rotY || 0)) > 0.5;
  const hw = (rot ? fd : fw) / 2, hd = (rot ? fw : fd) / 2;
  return { minX: f.pos[0] - hw, maxX: f.pos[0] + hw, minZ: f.pos[2] - hd, maxZ: f.pos[2] + hd, area: fw * fd };
}
const deckOf = o => Math.abs((o.pos[1] || 0) - DECK2Y) < 0.4 ? DECK2Y : 0;
// snap to a known deck only when actually near one; a figure at Deck Three
// depth (y ≈ -5.5) keeps its own level, so roomAt honestly finds no floor
export const nearestDeck = y => {
  const v = y || 0;
  if (Math.abs(v) < 1.5) return 0;
  if (Math.abs(v - DECK2Y) < 1.5) return DECK2Y;
  return v;
};

// The most specific floor under a point (smallest containing rect on the point's deck).
export function roomAt(pos) {
  const deck = nearestDeck(pos[1]);
  let best = null;
  for (const f of state.project.objects) {
    if (f.type !== 'floor' || deckOf(f) !== deck) continue;
    const r = floorRect(f);
    if (pos[0] >= r.minX && pos[0] <= r.maxX && pos[2] >= r.minZ && pos[2] <= r.maxZ) {
      if (!best || r.area < best.area) best = { area: r.area, floor: f };
    }
  }
  return best?.floor || null;
}

const SIT_POSES = new Set(['sit', 'recline', 'feetUp', 'sitFloor']);
const postureFor = pose => pose === 'crouch' ? 'crouch' : SIT_POSES.has(pose) ? 'sit' : 'stand';
export function figureEye(m) {
  const deck = nearestDeck(m.pos[1]);
  return new THREE.Vector3(m.pos[0], deck + eyeHeight(m.character, postureFor(m.pose)), m.pos[2]);
}

// ---------- prose scanning ----------
const CHAR_ALIASES = { quenby: ['quenby'], iri: ['iri', 'iri-six', 'iri‑six'], nova: ['nova'] };
const ROOM_LEXICON = [
  [/\bgalley\b/i, 'galley'], [/\bbridge\b/i, 'bridge'], [/\bmedbay\b/i, 'medbay'],
  [/\b(?:forward hold|hold one|training bay)\b/i, 'cargo-bay'], [/\bhold two\b/i, 'flex-bay'],
  [/\bengine (?:bay|room)\b/i, 'engine'], [/\bairlock\b/i, 'airlock'], [/\bskiff\b/i, 'skiffbay'],
  [/\bobservation dome\b|\bdome\b/i, 'dome'], [/\bcabin\b/i, 'cabin'],
  [/\bstairs?\b|\bstairwell\b/i, 'stairwell'], [/\bfreight lock\b/i, 'freight-lock'],
  [/\bwork spine\b|\bbelowdeck\b/i, 'work-spine'], [/\bnav(?:igation)? (?:room|station|alcove)\b/i, 'nav'],
];
// generic words that ground nothing on their own
const GENERIC = new Set(['deck', 'wall', 'door', 'hatch', 'unit', 'panel', 'floor', 'overhead',
  'bulkhead', 'room', 'access', 'cover', 'plate', 'service', 'corridor', 'run', 'side', 'lower',
  'upper', 'main', 'forward', 'cabin', 'four', 'five', 'three', 'nova', 'quenby', 'opening',
  'fold', 'down', 'wash', 'point', 'rack', 'row', 'grid', 'bank', 'station']);
// mundane portable props — production-flexible things prose reaches for
const PROP_NOUNS = ['mug', 'cup', 'kettle', 'teapot', 'blanket', 'wrench', 'spanner', 'datapad',
  'slate', 'tin', 'jacket', 'boots', 'towel', 'tray', 'knife', 'pan', 'pot', 'mirror', 'lamp',
  'toolbox', 'crate', 'stool', 'cable', 'mattress', 'pillow', 'basin', 'bottle', 'jar', 'ration',
  'journal', 'medallion', 'marker', 'medkit', 'lantern', 'satchel', 'tarp'];

export function scanProse(scene) {
  const text = (scene.prose || '').toLowerCase();
  if (!text) return null;
  const characters = Object.keys(CHAR_ALIASES).filter(c => CHAR_ALIASES[c].some(a => text.includes(a)));
  const rooms = ROOM_LEXICON.filter(([re]) => re.test(text)).map(([, slug]) => slug);
  const objects = [];
  const seen = new Set();
  for (const o of state.project.objects) {
    if (['floor', 'ceiling', 'wall', 'doorway', 'bolts', 'massing', 'conduit'].includes(o.type)) continue;
    const words = (o.name.toLowerCase().match(/[a-z]{4,}/g) || []).filter(w => !GENERIC.has(w));
    const hit = words.find(w => new RegExp(`\\b${w}s?\\b`).test(text));
    if (hit && !seen.has(o.name)) { seen.add(o.name); objects.push({ name: o.name, room: o.room, word: hit }); }
  }
  // a prop counts as grounded if ANY object aboard carries its word (this
  // catches short names like the tin shelf that the 4-letter scan skips)
  const allNames = state.project.objects.map(o => o.name.toLowerCase()).join(' | ');
  const looseProps = PROP_NOUNS.filter(p => new RegExp(`\\b${p}s?\\b`).test(text) && !allNames.includes(p));
  return { characters, rooms, objects, looseProps };
}

// era heuristics: anticipatory automation reads as early-Next; a Manual-mode
// scene using them is dated wrong (author ruling: door behavior dates a scene)
const AUTO_DOOR = /(door|hatch)[^.!?]{0,60}\b(slid|hissed|ground|eased|opened?)\b[^.!?]{0,45}\b(at (?:her|his|their) approach|itself|on its own|before (?:she|he|they) (?:touched|reached|asked))/i;
const AUTO_LIGHTS = /\blights?\b[^.!?]{0,45}\b(adjusted|dimmed|rose|warmed|brightened)\b[^.!?]{0,35}\b(to (?:her|his|their)|for (?:her|him|them)|preference)/i;

// ---------- the review ----------
const LEVEL_RANK = { silent: 0, presence: 1, tone: 2, words: 3 };

export function reviewScene(scene) {
  const findings = [];
  const add = (kind, severity, title, detail = '') => findings.push({ kind, severity, title, detail });
  const manns = scene.mannequins || [];
  const mode = scene.flightMode || 'drift-night';
  const grids = new Map();
  const gridFor = deck => {
    if (!grids.has(deck)) grids.set(deck, computeNavGrid(0.24, [], deck));
    return grids.get(deck);
  };

  // -- figures: where each person is, and whether a body fits there --
  const placed = manns.map(m => {
    const floor = roomAt(m.pos);
    const label = CHARACTERS[m.character]?.label || m.character;
    if (!floor) {
      add('placement', 'issue', `${label} stands outside any floor`, `At (${m.pos[0].toFixed(1)}, ${m.pos[2].toFixed(1)}) — no deck underfoot. Move the figure onto the ship.`);
      return { m, label, floor: null };
    }
    if (m.pose === 'sitFloor') {
      // sitting on the deck needs deck, not furniture
      const v = new THREE.Vector3(m.pos[0], 0, m.pos[2]);
      const ok = gridFor(nearestDeck(m.pos[1])) && findPath(gridFor(nearestDeck(m.pos[1])), v, v, 4);
      if (!ok) add('placement', 'issue', `${label} has nowhere to sit on the deck`, `In ${floor.name}, but the spot is inside furniture or a wall clearance.`);
      else add('placement', 'ok', `${label} — sitting on the deck in ${floor.name}`);
    } else if (SIT_POSES.has(m.pose)) {
      const near = state.project.objects.some(o => ['seat', 'bench'].includes(o.type) &&
        Math.hypot(o.pos[0] - m.pos[0], o.pos[2] - m.pos[2]) < 0.7);
      if (!near) add('placement', 'issue', `${label} sits on nothing`, `Seated pose in ${floor.name}, but no seat or bench within reach. Move them to a seat or change the pose.`);
      else add('placement', 'ok', `${label} — seated in ${floor.name}`);
    } else {
      const v = new THREE.Vector3(m.pos[0], 0, m.pos[2]);
      const ok = gridFor(nearestDeck(m.pos[1])) && findPath(gridFor(nearestDeck(m.pos[1])), v, v, 3);
      if (!ok) add('placement', 'issue', `${label} has no standing room`, `In ${floor.name}, but the spot is inside furniture or a wall clearance. Nudge the figure.`);
      else add('placement', 'ok', `${label} — standing in ${floor.name}`);
    }
    return { m, label, floor };
  });

  // -- hearing: what carries between the people, and where it leaks --
  const located = placed.filter(p => p.floor);
  for (const speaker of located) {
    const report = audibilityReport({ x: speaker.m.pos[0], y: nearestDeck(speaker.m.pos[1]), z: speaker.m.pos[2] }, 'speech', mode);
    for (const listener of located) {
      if (listener === speaker) continue;
      const lv = listener.floor.layoutKey === speaker.floor.layoutKey ? 'words' : levelAt(report, listener.floor.layoutKey);
      add('hearing', 'note', `${speaker.label} → ${listener.label}: ${lv}`,
        lv === 'words' ? `${listener.label} hears the conversation itself (${mode}).`
          : lv === 'tone' ? `${listener.label} catches tone and cadence, not words (${mode}).`
            : lv === 'presence' ? `${listener.label} knows someone is talking, nothing more (${mode}).`
              : `${listener.label} hears nothing of it (${mode}).`);
    }
    const partRooms = new Set(located.map(p => p.floor.layoutKey));
    const leaks = report.rows.filter(r => !partRooms.has(r.layoutKey) && LEVEL_RANK[r.level] >= 2);
    if (leaks.length) {
      add('hearing', 'note', `${speaker.label}'s voice carries beyond the scene`,
        `Words or tone reach: ${leaks.slice(0, 6).map(r => `${r.name} (${r.level}, ${r.channel})`).join('; ')}${leaks.length > 6 ? ` — and ${leaks.length - 6} more` : ''}. Anyone there is a witness the scene has to own.`);
    } else {
      add('hearing', 'ok', `${speaker.label}'s conversation stays in the room`, `Nothing above a presence-level murmur escapes to unoccupied spaces (${mode}).`);
    }
  }

  // -- sightlines between the people --
  for (let i = 0; i < located.length; i++) {
    for (let j = i + 1; j < located.length; j++) {
      const a = located[i], b = located[j];
      const r = castSight(figureEye(a.m), figureEye(b.m));
      const blockName = r.blocker ? (state.getObject(r.blocker)?.name || 'geometry') : 'geometry';
      add('sight', 'note', `${a.label} ↔ ${b.label}: ${r.clear ? 'line of sight' : 'no line of sight'}`,
        r.clear ? 'They can see each other from where they stand.' : `Blocked by ${blockName}. Eye contact in this beat needs a move first.`);
    }
  }

  // -- recorded movement paths --
  for (const p of scene.paths || []) {
    const pts = p.points || [];
    if (pts.length < 2) continue;
    const deck = nearestDeck(pts[0][1]);
    const grid = gridFor(deck);
    let length = 0, broken = null;
    for (let i = 1; i < pts.length && !broken; i++) {
      length += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2]);
      const seg = grid && findPath(grid, new THREE.Vector3(...pts[i - 1]), new THREE.Vector3(...pts[i]), 3);
      if (!seg) broken = i;
    }
    if (broken !== null) add('path', 'issue', `${p.name}: not walkable`, `The leg into point ${broken + 1} crosses furniture or a wall. Re-record that stretch.`);
    else add('path', 'ok', `${p.name}: walkable`, `${(CHARACTERS[p.character]?.label || '')} walks ${length.toFixed(1)} m through clear space.`);
  }

  // -- the prose itself against the evidence base --
  if (scene.prose) {
    const checks = checkProseAgainstLayout(scene.prose);
    const tensions = checks.filter(c => c.verdict === 'tension');
    const news = checks.filter(c => c.verdict === 'new');
    for (const t of tensions) add('prose', 'issue', 'Contradicts a ruling', `“${t.sentence}”`);
    for (const n of news.slice(0, 8)) add('prose', 'note', 'New spatial claim — nothing on record', `“${n.sentence}” If this should bind the ship, extract it as a constraint.`);
    const consistent = checks.length - tensions.length - news.length;
    if (consistent > 0) add('prose', 'ok', `${consistent} spatial statement(s) match known evidence`);

    // object grounding + loose props
    const scan = scanProse(scene);
    if (scan) {
      if (scan.objects.length) add('props', 'ok', `Grounded aboard: ${scan.objects.slice(0, 10).map(o => o.name).join('; ')}${scan.objects.length > 10 ? ' …' : ''}`);
      for (const lp of scan.looseProps) add('props', 'note', `“${lp}” is not on record aboard`, 'Production-flexible: fine as loose set dressing, or add it as an object if it should recur.');
      // rooms named in prose that no placed figure occupies
      const occupied = new Set(located.map(pl => pl.floor.room));
      const unvisited = scan.rooms.filter(rm => !occupied.has(rm));
      if (located.length && unvisited.length) add('prose', 'note', `Rooms named but nobody placed there: ${unvisited.join(', ')}`, 'Fine if they are only mentioned — place a figure if the scene actually happens there.');
    }

    // era: door behavior dates a scene (author ruling)
    const era = scene.era || 'manual';
    if (era === 'manual') {
      if (AUTO_DOOR.test(scene.prose)) add('era', 'issue', 'A door anticipates someone in a Manual-mode scene',
        'Anticipatory door behavior is the B.O.B.-era tell (author ruling: automation is an era, not a fixture). In this era, everything waits to be told — or the scene is set earlier than its slot.');
      if (AUTO_LIGHTS.test(scene.prose)) add('era', 'issue', 'Lights adjust themselves in a Manual-mode scene',
        'Preference-tracking lights are B.O.B.-era behavior. Date the scene earlier or make someone touch a panel.');
    }
  }

  return findings;
}

// ---------- pending manuscript corrections ----------
// Seeded corrections carry stable ids so author rulings made outside the app
// reach every project, even ones whose corrections list already exists.
const SEED_CORRECTIONS = [
  {
    id: 'corr-seed-third-cabin', source: 'author ruling — cabin registry',
    text: 'Iri’s "third cabin" phrasing → Cabin Five: she belongs beside Quenby on the quiet run, sharing the party wall.',
  },
  {
    id: 'corr-seed-prep-island', source: 'author ruling — galley',
    text: 'Next-07 "central prep counter" island phrasing → the working stretch of the one long counter run (no free-standing island).',
  },
  {
    id: 'corr-seed-next10-left', source: 'author ruling — directions are character-relative',
    text: 'Next-10 "turned left at the galley" → turned RIGHT (walking aft, the locker row is a right turn into the dry branch; "left" walks into the storage spine). Series convention now locked: prose directions follow the walker’s facing, never ship port/starboard.',
  },
  {
    id: 'corr-seed-next10-mug', source: 'author ruling — Next-10 sightline',
    text: 'Next-10 "From the bridge, Iri watched the mug pass through the door’s peripheral frame" — geometry doesn’t support it: from the bridge, the visible stretch is the forward corridor between the unused airlock and a bulkhead, and Quenby’s locker-row→galley route never crosses it. Move Iri to the corridor for the beat, or change watching to hearing/inference.',
  },
];
export function corrections() {
  const p = state.project;
  if (!p.corrections) p.corrections = [];
  const have = new Set(p.corrections.map(c => c.id));
  const haveText = new Set(p.corrections.map(c => c.text));   // older projects hold the first seeds under random ids
  for (const s of SEED_CORRECTIONS) {
    if (!have.has(s.id) && !haveText.has(s.text)) p.corrections.push({ ...s, status: 'pending', createdAt: new Date().toISOString() });
  }
  return p.corrections;
}

export function addCorrection(text, source = '') {
  const list = corrections();
  list.push({ id: uid('corr'), status: 'pending', createdAt: new Date().toISOString(), source, text });
  state.markDirty();
  return list[list.length - 1];
}

export function correctionsAsText() {
  const list = corrections();
  const pend = list.filter(c => c.status === 'pending');
  const done = list.filter(c => c.status !== 'pending');
  let out = '# Wild Huntress — pending manuscript corrections\n\n';
  for (const c of pend) out += `- [ ] ${c.text}${c.source ? `  _(${c.source})_` : ''}\n`;
  if (done.length) {
    out += '\n## Done\n\n';
    for (const c of done) out += `- [x] ${c.text}${c.source ? `  _(${c.source})_` : ''}\n`;
  }
  return out;
}
