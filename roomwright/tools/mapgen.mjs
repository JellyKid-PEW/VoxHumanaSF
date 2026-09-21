#!/usr/bin/env node
// Generates the Wild Huntress reference maps from exported model geometry:
//   maps/deck-main.svg    — main deck plan (walls, openings, furniture, systems)
//   maps/deck-lower.svg   — lower deck plan
//   maps/level-belly.svg  — Deck Three / belly massing plan (working geometry)
//   maps/side-elevation.svg — longitudinal section, all three levels
// Usage: node tools/mapgen.mjs   (reads maps/geometry.json, written by the
// export script from the live app at default rulings)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const G = JSON.parse(fs.readFileSync(path.join(ROOT, 'maps/geometry.json'), 'utf8'));
const { objects, FRAME, HULL, DECK2Y } = G;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const deg = r => -r * 180 / Math.PI;
const deckOf = o => Math.round((o.pos[1] || 0) * 10) / 10;

const ROOM_LABEL = {
  bridge: 'BRIDGE', corridor: 'MAIN CORRIDOR', airlock: 'AIRLOCK', spine: 'STORAGE SPINE',
  'storage-four': 'STORAGE FOUR', pocket: 'POCKET THREE', dome: 'OBSERVATION DOME',
  medbay: 'MEDBAY', galley: 'GALLEY', hygiene: 'HYGIENE', 'domestic-service': 'DOMESTIC SERVICE',
  'wet-service': 'WET CORE', engine: 'ENGINE BAY', stairwell: 'STAIR',
  operations: 'LOWER OPERATIONS', skiffbay: 'SKIFF / MISSION BAY', 'work-spine': 'WORK SPINE',
  'work-head': 'WORK HEAD', residential: 'RESIDENTIAL', nav: 'NAV', cabin: '',
  'domestic-stores': 'STORES / GARDEN', 'aft-service': 'AFT SERVICE', 'flex-bay': 'HOLD TWO (FLEX)',
  'engineering-access': 'ENG ACCESS', 'aft-freight': 'FREIGHT NODE', 'freight-lock': 'FREIGHT LOCK',
  'cargo-bay': 'HOLD ONE (CARGO / TRAINING)', 'lower-aft-spine': 'LOWER AFT SPINE',
  'equipment-crawl': "NOVA'S CRAWL", unlisted: 'UNLISTED', hull: '',
};
const ROOM_TINT = {
  bridge: '#dfe8f2', corridor: '#e9e9e9', airlock: '#f2e7d8', spine: '#efe6da', 'storage-four': '#efe6da',
  pocket: '#efe6da', dome: '#e2eef2', medbay: '#e0f0e6', galley: '#f6ecd9', hygiene: '#e6eef4',
  'domestic-service': '#ececec', 'wet-service': '#dfeaf2', engine: '#f2dede', stairwell: '#e4e4e4',
  operations: '#e6e6ee', skiffbay: '#e4eaf0', 'work-spine': '#e9e9ef', 'work-head': '#e6eef4',
  residential: '#f3ece4', nav: '#e8e4f0', cabin: '#f6efe6', 'domestic-stores': '#e8f0e2',
  'aft-service': '#eae6e0', 'flex-bay': '#e2e8dc', 'engineering-access': '#efe0da',
  'aft-freight': '#e6e2da', 'freight-lock': '#e0ddd4', 'cargo-bay': '#eee9db',
  'lower-aft-spine': '#e6e0d6', 'equipment-crawl': '#e8ddd2', unlisted: '#e3dcea',
};
const BRANCH_COLOR = { domestic: '#2a8fa8', habitation: '#4f9d55', ops: '#c07a2a', 'med-iso': '#8f5fb0' };

function rect2d(o) {
  // plan-view extents before rotation: width along x, depth along z
  const p = o.params;
  let w = p.width ?? p.length ?? 0.5;
  let d = p.depth ?? p.thickness ?? 0.5;
  if (o.type === 'wall' || o.type === 'doorway' || o.type === 'viewport') { w = p.length ?? 1; d = p.thickness ?? 0.14; }
  if (o.type === 'rail') { w = p.length ?? 1; d = 0.08; }
  if (o.type === 'conduit') { w = (p.gauge ?? 0.07) * (p.lines ?? 1) * 1.7; d = p.length ?? 2; }
  if (o.type === 'step') { w = p.width ?? 1; d = (p.run ?? 0.2) * (p.steps ?? 1); }
  if (o.type === 'domeShell') { const r = p.radius ?? 1.25; w = r * 2 + 0.3; d = r * 2 + 0.3; }
  return { w, d };
}

class SVG {
  constructor() { this.layers = { floor: [], zone: [], furn: [], wall: [], sys: [], label: [], deco: [] }; }
  add(layer, s) { this.layers[layer].push(s); }
}

function planMap({ file, title, subtitle, deckY, extraObjects = [], ghost = [], legendTitle }) {
  const objs = objects.filter(o => Math.abs(deckOf(o) - deckY) < 0.4 && o.type !== 'massing').concat(extraObjects);
  const floors = objs.filter(o => o.type === 'floor');
  const S = 34, M = 60, LEGW = 360;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const o of floors.concat(ghost).concat(extraObjects)) {
    const { w, d } = rect2d(o);
    const rot = Math.abs(Math.sin(o.rotY)) > 0.5;
    const hw = (rot ? d : w) / 2, hd = (rot ? w : d) / 2;
    minX = Math.min(minX, o.pos[0] - hw); maxX = Math.max(maxX, o.pos[0] + hw);
    minZ = Math.min(minZ, o.pos[2] - hd); maxZ = Math.max(maxZ, o.pos[2] + hd);
  }
  minX -= 0.6; maxX += 0.6; minZ -= 0.8; maxZ += 0.8;
  const W = Math.round((maxX - minX) * S) + M * 2 + LEGW;
  const H = Math.round((maxZ - minZ) * S) + M * 2 + 40;
  const sx = x => M + (x - minX) * S;
  const sy = z => M + (z - minZ) * S;
  const svg = new SVG();

  // 1 m grid
  for (let gx = Math.ceil(minX); gx <= maxX; gx++)
    svg.add('deco', `<line x1="${sx(gx)}" y1="${sy(minZ)}" x2="${sx(gx)}" y2="${sy(maxZ)}" stroke="#00000010"/>`);
  for (let gz = Math.ceil(minZ); gz <= maxZ; gz++)
    svg.add('deco', `<line x1="${sx(minX)}" y1="${sy(gz)}" x2="${sx(maxX)}" y2="${sy(gz)}" stroke="#00000010"/>`);
  // frame ruler (left edge)
  for (let n = 1; n <= FRAME.count; n++) {
    const z = FRAME.z0 + (n - 1) * FRAME.spacing;
    if (z < minZ || z > maxZ) continue;
    svg.add('deco', `<line x1="${M - 14}" y1="${sy(z)}" x2="${M - 4}" y2="${sy(z)}" stroke="#5a789a" stroke-width="${n % 5 ? 0.7 : 1.6}"/>`);
    if (n % 5 === 0) svg.add('deco', `<text x="${M - 18}" y="${sy(z) + 3}" font-size="8" fill="#5a789a" text-anchor="end">F${String(n).padStart(2, '0')}</text>`);
  }

  // ghost floors (context from another level)
  for (const o of ghost) {
    const { w, d } = rect2d(o);
    svg.add('floor', `<rect x="${sx(o.pos[0]) - w * S / 2}" y="${sy(o.pos[2]) - d * S / 2}" width="${w * S}" height="${d * S}" fill="none" stroke="#9aa4b0" stroke-dasharray="2 3" stroke-width="0.8" transform="rotate(${deg(o.rotY)} ${sx(o.pos[0])} ${sy(o.pos[2])})"/>`);
  }

  const callouts = [];
  let calloutN = 0;
  const callout = (o, cx, cy) => {
    calloutN++;
    callouts.push([calloutN, o.name]);
    svg.add('label', `<circle cx="${cx}" cy="${cy}" r="5.4" fill="#ffffffd8" stroke="#444" stroke-width="0.6"/><text x="${cx}" y="${cy + 2.4}" font-size="6.4" fill="#222" text-anchor="middle" font-family="sans-serif">${calloutN}</text>`);
  };

  for (const o of objs) {
    const { w, d } = rect2d(o);
    const cx = sx(o.pos[0]), cy = sy(o.pos[2]);
    const x0 = cx - w * S / 2, y0 = cy - d * S / 2, pw = w * S, pd = d * S;
    const tr = ` transform="rotate(${deg(o.rotY)} ${cx} ${cy})"`;
    switch (o.type) {
      case 'floor':
        svg.add('floor', `<rect x="${x0}" y="${y0}" width="${pw}" height="${pd}" fill="${ROOM_TINT[o.room] || '#eee'}" stroke="none"${tr}/>`);
        break;
      case 'ceiling': case 'bolts': break;
      case 'wall':
        svg.add('wall', `<rect x="${x0}" y="${y0}" width="${pw}" height="${Math.max(pd, 2.4)}" fill="#2b2f36"${tr}/>`);
        break;
      case 'viewport':
        svg.add('wall', `<rect x="${x0}" y="${y0}" width="${pw}" height="${Math.max(pd, 2.6)}" fill="#2b2f36"${tr}/>`);
        svg.add('wall', `<rect x="${x0 + 2}" y="${y0}" width="${pw - 4}" height="${Math.max(pd, 2.6)}" fill="#8fc3d8"${tr}/>`);
        break;
      case 'doorway': {
        const dw = (o.params.doorWidth ?? 0.85) * S;
        const jamb = Math.max((pw - dw) / 2, 0);
        const th = Math.max(pd, 2.4);
        svg.add('wall', `<g${tr}><rect x="${x0}" y="${cy - th / 2}" width="${jamb}" height="${th}" fill="#2b2f36"/><rect x="${x0 + pw - jamb}" y="${cy - th / 2}" width="${jamb}" height="${th}" fill="#2b2f36"/>` +
          ((o.params.kind ?? 'sliding') === 'hinged'
            ? `<path d="M ${cx - dw / 2} ${cy} A ${dw} ${dw} 0 0 1 ${cx - dw / 2 + dw * 0.7} ${cy - dw * 0.7}" fill="none" stroke="#b3543f" stroke-width="0.8"/><line x1="${cx - dw / 2}" y1="${cy}" x2="${cx - dw / 2 + dw * 0.72}" y2="${cy - dw * 0.72}" stroke="#b3543f" stroke-width="1.4"/>`
            : `<rect x="${cx - dw / 2}" y="${cy - 1.2}" width="${dw}" height="2.4" fill="#b3543f"/><line x1="${cx - dw / 2}" y1="${cy - 4}" x2="${cx + dw / 2}" y2="${cy - 4}" stroke="#b3543f" stroke-width="0.7" stroke-dasharray="2 2"/>`) +
          `</g>`);
        callout(o, cx, cy);
        break;
      }
      case 'domeShell': {
        const r = (o.params.radius ?? 1.25) * S;
        svg.add('wall', `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#2b2f36" stroke-width="3.4"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#8fc3d8" stroke-width="1.4" stroke-dasharray="5 3"/>`);
        // arch: local +z, rotated
        const a = -(o.rotY) + Math.PI / 2;
        const ax = cx + Math.cos(a) * r, ay = cy + Math.sin(a) * r;
        svg.add('wall', `<circle cx="${ax}" cy="${ay}" r="4.5" fill="${ROOM_TINT.dome}" stroke="none"/>`);
        break;
      }
      case 'conduit': {
        const col = o.params.era === 'ancient' ? '#7a6a4f' : (BRANCH_COLOR[o.params.branch] || '#7d8794');
        const dash = o.params.era === 'ancient' ? '2 3' : (o.params.branch ? '6 3' : '1.5 2.5');
        const len = (o.params.length ?? 2) * S;
        svg.add('sys', `<line x1="${cx}" y1="${cy - len / 2}" x2="${cx}" y2="${cy + len / 2}" stroke="${col}" stroke-width="${o.params.branch ? 2 : 1.3}" stroke-dasharray="${dash}" opacity="0.85"${tr}/>`);
        break;
      }
      case 'step': {
        const n = o.params.steps ?? 10;
        let lines = '';
        for (let i = 0; i <= n; i++) lines += `<line x1="${x0}" y1="${y0 + (pd * i / n)}" x2="${x0 + pw}" y2="${y0 + (pd * i / n)}" stroke="#555" stroke-width="0.7"/>`;
        svg.add('furn', `<g${tr}><rect x="${x0}" y="${y0}" width="${pw}" height="${pd}" fill="#d8d8d8" stroke="#555" stroke-width="0.8"/>${lines}</g>`);
        callout(o, cx, cy);
        break;
      }
      case 'rail':
        svg.add('furn', `<line x1="${x0}" y1="${cy}" x2="${x0 + pw}" y2="${cy}" stroke="#6a4f8f" stroke-width="2"${tr}/><line x1="${x0}" y1="${cy - 2.5}" x2="${x0}" y2="${cy + 2.5}" stroke="#6a4f8f" stroke-width="1.4"${tr}/><line x1="${x0 + pw}" y1="${cy - 2.5}" x2="${x0 + pw}" y2="${cy + 2.5}" stroke="#6a4f8f" stroke-width="1.4"${tr}/>`);
        callout(o, cx, cy - 6);
        break;
      case 'crate':
        svg.add('furn', `<g${tr}><rect x="${x0}" y="${y0}" width="${pw}" height="${pd}" fill="#e0d6c2" stroke="#6d6152" stroke-width="0.9"/><line x1="${x0}" y1="${y0}" x2="${x0 + pw}" y2="${y0 + pd}" stroke="#6d6152" stroke-width="0.6"/><line x1="${x0 + pw}" y1="${y0}" x2="${x0}" y2="${y0 + pd}" stroke="#6d6152" stroke-width="0.6"/></g>`);
        callout(o, cx, cy);
        break;
      case 'shelf':
        svg.add('furn', `<rect x="${x0}" y="${y0}" width="${pw}" height="${pd}" fill="none" stroke="#5a789a" stroke-width="1" stroke-dasharray="3 2"${tr}/>`);
        callout(o, cx, cy);
        break;
      case 'strut':
        if ((o.params.height ?? 1) < 0.2) {  // tie-down anchor puck
          svg.add('furn', `<circle cx="${cx}" cy="${cy}" r="3" fill="none" stroke="#8a6f3c" stroke-width="1.2"/><circle cx="${cx}" cy="${cy}" r="0.9" fill="#8a6f3c"/>`);
        } else {
          svg.add('furn', `<rect x="${x0}" y="${y0}" width="${pw}" height="${pd}" fill="#3a3f47"${tr}/>`);
        }
        break;
      case 'console': {
        svg.add('furn', `<g${tr}><rect x="${x0}" y="${y0}" width="${pw}" height="${pd}" fill="#cdd6de" stroke="#41505c" stroke-width="1"/><rect x="${x0 + 1.5}" y="${y0 + 1}" width="${pw - 3}" height="2.4" fill="#41889c"/></g>`);
        callout(o, cx, cy);
        break;
      }
      case 'counter':
        svg.add('furn', `<g${tr}><rect x="${x0}" y="${y0}" width="${pw}" height="${pd}" fill="#d6d0c4" stroke="#5c554a" stroke-width="1"/>${o.params.sink ? `<circle cx="${x0 + pw * 0.25}" cy="${cy}" r="${Math.min(4, pd * 0.3)}" fill="none" stroke="#5c554a" stroke-width="0.8"/>` : ''}</g>`);
        callout(o, cx, cy);
        break;
      case 'seat':
        svg.add('furn', `<g${tr}><rect x="${x0}" y="${y0}" width="${pw}" height="${pd}" rx="2.5" fill="#cbb9a4" stroke="#6d5b46" stroke-width="0.9"/><line x1="${x0}" y1="${y0 + 1.6}" x2="${x0 + pw}" y2="${y0 + 1.6}" stroke="#6d5b46" stroke-width="1.4"/></g>`);
        callout(o, cx, cy);
        break;
      case 'bench':
        svg.add('furn', `<rect x="${x0}" y="${y0}" width="${pw}" height="${pd}" rx="2" fill="#d9c8b2" stroke="#6d5b46" stroke-width="0.9"${tr}/>`);
        callout(o, cx, cy);
        break;
      case 'table':
        svg.add('furn', `<rect x="${x0}" y="${y0}" width="${pw}" height="${pd}" fill="#efe9df" stroke="#6d6152" stroke-width="1.1"${tr}/>`);
        callout(o, cx, cy);
        break;
      case 'storage':
        svg.add('furn', `<g${tr}><rect x="${x0}" y="${y0}" width="${pw}" height="${pd}" fill="#c9cdd3" stroke="#4c525b" stroke-width="0.9"/><line x1="${x0}" y1="${cy}" x2="${x0 + pw}" y2="${cy}" stroke="#4c525b" stroke-width="0.5"/></g>`);
        callout(o, cx, cy);
        break;
      case 'massingPlan':
        svg.add('floor', `<g${tr}><rect x="${x0}" y="${y0}" width="${pw}" height="${pd}" fill="#c9d4de" fill-opacity="0.35" stroke="#5a789a" stroke-width="1.3" stroke-dasharray="7 4"/><line x1="${x0}" y1="${y0}" x2="${x0 + pw}" y2="${y0 + pd}" stroke="#5a789a" stroke-width="0.5" opacity="0.5"/></g>`);
        callout(o, cx, cy);
        break;
      default:
        svg.add('furn', `<rect x="${x0}" y="${y0}" width="${pw}" height="${pd}" fill="#ddd" stroke="#666" stroke-width="0.8"${tr}/>`);
        callout(o, cx, cy);
    }
  }

  // room labels at floor centroids (largest floor per room label wins)
  const seen = new Map();
  for (const f of floors) {
    const lbl = f.room === 'cabin' ? f.name.replace(/ deck$/, '').toUpperCase() : ROOM_LABEL[f.room];
    if (!lbl) continue;
    const { w, d } = rect2d(f);
    const area = w * d;
    const key = f.room === 'cabin' ? f.name : f.room;
    if (!seen.has(key) || seen.get(key).area < area) seen.set(key, { area, f, lbl });
  }
  for (const { f, lbl } of seen.values()) {
    const { w, d } = rect2d(f);
    const vertical = d > w * 1.6 && w * S < 90;
    const t = `<text x="${sx(f.pos[0])}" y="${sy(f.pos[2]) + 3}" font-size="${Math.min(11, Math.max(7, w * S / (lbl.length * 0.62)))}" fill="#333" text-anchor="middle" font-family="sans-serif" font-weight="600" letter-spacing="0.6"${vertical ? ` transform="rotate(-90 ${sx(f.pos[0])} ${sy(f.pos[2])})"` : ''}>${esc(lbl)}</text>`;
    svg.add('label', t);
  }

  // legend
  let leg = `<text x="${W - LEGW + 10}" y="${M}" font-size="11" font-weight="700" fill="#222" font-family="sans-serif">${esc(legendTitle || 'KEY')}</text>`;
  const colH = Math.floor((H - M - 60) / 10.5);
  callouts.forEach(([n, name], i) => {
    const col = Math.floor(i / colH), row = i % colH;
    leg += `<text x="${W - LEGW + 10 + col * 178}" y="${M + 16 + row * 10.5}" font-size="7" fill="#333" font-family="sans-serif">${n}. ${esc(name.length > 44 ? name.slice(0, 43) + '…' : name)}</text>`;
  });

  // title block, compass, scale
  const head = `
  <text x="${M}" y="26" font-size="17" font-weight="700" fill="#1c2733" font-family="sans-serif">WILD HUNTRESS — ${esc(title)}</text>
  <text x="${M}" y="42" font-size="9" fill="#55606c" font-family="sans-serif">${esc(subtitle)} · layout v${G.version} · working geometry, exterior not canon-locked · frame spacing ${FRAME.spacing} m from the bow</text>
  <g transform="translate(${M + 8},${H - 34})">
    <line x1="0" y1="0" x2="0" y2="-22" stroke="#333" stroke-width="1.6"/><path d="M -4 -16 L 0 -24 L 4 -16 Z" fill="#333"/>
    <text x="8" y="-14" font-size="9" fill="#333" font-family="sans-serif">FWD</text>
    <line x1="60" y1="0" x2="${60 + 5 * S}" y2="0" stroke="#333" stroke-width="2.4"/>
    ${[0, 1, 2, 3, 4, 5].map(m => `<line x1="${60 + m * S}" y1="-4" x2="${60 + m * S}" y2="4" stroke="#333" stroke-width="1"/>`).join('')}
    <text x="${60 + 5 * S + 8}" y="3" font-size="9" fill="#333" font-family="sans-serif">5 m</text>
    <text x="${60}" y="16" font-size="8" fill="#55606c" font-family="sans-serif">PORT ← · → STBD</text>
  </g>`;

  const out = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#fafaf7"/>${head}
  ${svg.layers.deco.join('')}${svg.layers.floor.join('')}${svg.layers.zone.join('')}${svg.layers.furn.join('')}${svg.layers.wall.join('')}${svg.layers.sys.join('')}${svg.layers.label.join('')}${leg}</svg>`;
  fs.writeFileSync(path.join(ROOT, 'maps', file), out);
  console.log(file, `${W}x${H}`, `${callouts.length} callouts`);
}

// ---------- side elevation ----------
function sideElevation(file) {
  const S = 26, M = 70;
  const minZ = -6, maxZ = 42, minY = -8.2, maxY = 6.4;
  const W = Math.round((maxZ - minZ) * S) + M * 2;
  const H = Math.round((maxY - minY) * S) + M * 2;
  const sx = z => M + (z - minZ) * S;
  const sy = y => H - M - (y - minY) * S;
  let g = '';
  // ground line (landing crouch)
  g += `<line x1="${sx(minZ + 0.5)}" y1="${sy(-7.4)}" x2="${sx(maxZ - 0.5)}" y2="${sy(-7.4)}" stroke="#8a7f6a" stroke-width="1.4" stroke-dasharray="8 5"/>`;
  g += `<text x="${sx(maxZ - 0.6)}" y="${sy(-7.4) + 12}" font-size="8" fill="#8a7f6a" text-anchor="end" font-family="sans-serif">GROUND LINE — LANDING CROUCH (gear extended)</text>`;
  // hull level lines + stepped silhouette
  const lv = HULL.map(l => ({ y: l.y, zmin: Math.min(...l.pts.map(p => p[1])), zmax: Math.max(...l.pts.map(p => p[1])) })).sort((a, b) => a.y - b.y);
  for (const l of lv) g += `<line x1="${sx(l.zmin)}" y1="${sy(l.y)}" x2="${sx(l.zmax)}" y2="${sy(l.y)}" stroke="#6f93b4" stroke-width="1.6" opacity="0.85"/>`;
  for (let i = 0; i < lv.length - 1; i++) {
    g += `<line x1="${sx(lv[i].zmin)}" y1="${sy(lv[i].y)}" x2="${sx(lv[i + 1].zmin)}" y2="${sy(lv[i + 1].y)}" stroke="#6f93b4" stroke-width="1.3" opacity="0.7"/>`;
    g += `<line x1="${sx(lv[i].zmax)}" y1="${sy(lv[i].y)}" x2="${sx(lv[i + 1].zmax)}" y2="${sy(lv[i + 1].y)}" stroke="#6f93b4" stroke-width="1.3" opacity="0.7"/>`;
  }
  // room bands per deck
  const bands = [];
  for (const f of objects.filter(o => o.type === 'floor')) {
    const { w, d } = rect2d(f);
    const rot = Math.abs(Math.sin(f.rotY)) > 0.5;
    const hd = (rot ? w : d) / 2;
    const ceil = objects.find(c => c.type === 'ceiling' && c.room === f.room && Math.abs(c.pos[2] - f.pos[2]) < 1.5 && Math.abs(deckOf(c) - deckOf(f)) < 0.4);
    bands.push({ room: f.room, name: f.name, z0: f.pos[2] - hd, z1: f.pos[2] + hd, y: deckOf(f), h: ceil?.params?.height ?? 2.1 });
  }
  for (const b of bands) {
    g += `<rect x="${sx(b.z0)}" y="${sy(b.y + b.h)}" width="${(b.z1 - b.z0) * S}" height="${b.h * S}" fill="${ROOM_TINT[b.room] || '#eee'}" opacity="0.5" stroke="#88919c" stroke-width="0.5"/>`;
  }
  // deck slabs
  for (const y of [0, DECK2Y]) {
    const bs = bands.filter(b => Math.abs(b.y - y) < 0.4);
    if (!bs.length) continue;
    g += `<line x1="${sx(Math.min(...bs.map(b => b.z0)))}" y1="${sy(y)}" x2="${sx(Math.max(...bs.map(b => b.z1)))}" y2="${sy(y)}" stroke="#2b2f36" stroke-width="3"/>`;
  }
  // label collision avoidance: nudge a label up (dir=-1) or down (dir=+1) until clear
  const placedLabels = [];
  const labelY = (x, y, w, dir = -1) => {
    let yy = y;
    for (let guard = 0; guard < 12; guard++) {
      const hit = placedLabels.find(p => Math.abs(p.y - yy) < 8.5 && x - w / 2 < p.x + p.w / 2 && x + w / 2 > p.x - p.w / 2);
      if (!hit) break;
      yy += 8.5 * dir;
    }
    placedLabels.push({ x, y: yy, w });
    return yy;
  };
  // massing volumes (side); port/starboard twins overlap in this view — label once
  const labeledMassing = new Set();
  for (const m of objects.filter(o => o.type === 'massing')) {
    const d = m.params.depth ?? 1, h = m.params.height ?? 1;
    const y0 = (m.pos[1] || 0) + (m.params.lift ?? 0);
    const bad = m.params.tint === 'anomaly';
    g += `<rect x="${sx(m.pos[2] - d / 2)}" y="${sy(y0 + h)}" width="${d * S}" height="${h * S}" fill="${bad ? '#c4626222' : '#5b7a9922'}" stroke="${bad ? '#c46262' : '#5b7a99'}" stroke-width="0.9" stroke-dasharray="4 3"/>`;
    const short = m.name.replace(/ —.*$/, '').replace(/\(.*\)/, '').replace(/\b(port|starboard)\b/i, '').trim();
    const dedupe = `${short}@${Math.round(m.pos[2] * 2)}`;
    if (labeledMassing.has(dedupe)) continue;
    labeledMassing.add(dedupe);
    const my = labelY(sx(m.pos[2]), sy(y0 + h) - 3, short.length * 4.2, -1);
    g += `<text x="${sx(m.pos[2])}" y="${my}" font-size="6.6" fill="${bad ? '#a04848' : '#46617c'}" text-anchor="middle" font-family="sans-serif">${esc(short)}</text>`;
  }
  // stairs / ladder glyphs
  const stw = objects.find(o => o.layoutKey === 'stwSteps');
  if (stw) g += `<path d="M ${sx(stw.pos[2]) - 7} ${sy(DECK2Y)} L ${sx(stw.pos[2]) + 7} ${sy(0)}" stroke="#333" stroke-width="2"/><text x="${sx(stw.pos[2]) + 10}" y="${sy(-1.4)}" font-size="7.5" fill="#333" font-family="sans-serif">STAIR</text>`;
  const lad = objects.find(o => o.layoutKey === 'secondaryLadder');
  if (lad) g += `<line x1="${sx(lad.pos[2])}" y1="${sy(DECK2Y)}" x2="${sx(lad.pos[2])}" y2="${sy(0)}" stroke="#333" stroke-width="1.6" stroke-dasharray="2 2"/><text x="${sx(lad.pos[2]) + 4}" y="${sy(-1.4)}" font-size="7.5" fill="#333" font-family="sans-serif">LADDER</text>`;
  // labels for the major spaces
  const major = { bridge: 0, galley: 0, engine: 0, medbay: 0, operations: 0, 'cargo-bay': 0, 'flex-bay': 0, skiffbay: 0, cabin: 0, nav: 0 };
  for (const b of bands) {
    if (!(b.room in major) || major[b.room]) continue;
    major[b.room] = 1;
    const lbl = ROOM_LABEL[b.room] || 'CABINS';
    const lx = sx((b.z0 + b.z1) / 2);
    const ly = labelY(lx, sy(b.y + b.h / 2), lbl.length * 5.4, +1);
    g += `<text x="${lx}" y="${ly}" font-size="8.5" font-weight="600" fill="#333" text-anchor="middle" font-family="sans-serif">${esc(lbl)}</text>`;
  }
  // deck name tags + frame ruler
  g += `<text x="${sx(minZ + 0.4)}" y="${sy(1.1)}" font-size="9" fill="#55606c" font-family="sans-serif">MAIN DECK  0.0 m</text>`;
  g += `<text x="${sx(minZ + 0.4)}" y="${sy(DECK2Y + 1.1)}" font-size="9" fill="#55606c" font-family="sans-serif">LOWER DECK  ${DECK2Y} m</text>`;
  g += `<text x="${sx(minZ + 0.4)}" y="${sy(-4.6)}" font-size="9" fill="#55606c" font-family="sans-serif">DECK THREE / BELLY (partial)</text>`;
  for (let n = 1; n <= FRAME.count; n++) {
    const z = FRAME.z0 + (n - 1) * FRAME.spacing;
    g += `<line x1="${sx(z)}" y1="${H - M + 4}" x2="${sx(z)}" y2="${H - M + (n % 5 ? 9 : 14)}" stroke="#5a789a" stroke-width="${n % 5 ? 0.7 : 1.4}"/>`;
    if (n % 5 === 0) g += `<text x="${sx(z)}" y="${H - M + 24}" font-size="8" fill="#5a789a" text-anchor="middle" font-family="sans-serif">F${String(n).padStart(2, '0')}</text>`;
  }
  const head = `<text x="${M}" y="28" font-size="17" font-weight="700" fill="#1c2733" font-family="sans-serif">WILD HUNTRESS — SIDE ELEVATION (from starboard)</text>
  <text x="${M}" y="44" font-size="9" fill="#55606c" font-family="sans-serif">Longitudinal section, all levels · FWD at left · layout v${G.version} · hull envelope is a working sketch, not a canon exterior · room bands overlap where spaces share a station at different beam positions</text>`;
  const out = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fafaf7"/>${head}${g}</svg>`;
  fs.writeFileSync(path.join(ROOT, 'maps', file), out);
  console.log(file, `${W}x${H}`);
}

// ---------- run ----------
planMap({
  file: 'deck-main.svg', deckY: 0,
  title: 'MAIN DECK PLAN', legendTitle: 'MAIN DECK — CALLOUTS',
  subtitle: 'Bridge · corridor & elbow · airlock · medbay · galley · hygiene wing · storage spine · Pocket Three · Storage Four · dome · engine bay',
});
planMap({
  file: 'deck-lower.svg', deckY: DECK2Y,
  title: 'LOWER DECK PLAN', legendTitle: 'LOWER DECK — CALLOUTS',
  subtitle: 'Lower Operations · skiff/mission bay (mudroom) · work spine · nav · cabins & quiet run · wet core & dogleg · Hold Two · freight node & lock · Hold One · lower aft spine · Nova’s crawl',
});
planMap({
  file: 'level-belly.svg', deckY: -99,   // no floors at this level: massing only
  title: 'DECK THREE / BELLY PLAN (working massing)', legendTitle: 'BELLY — CALLOUTS',
  subtitle: 'Ventral service & reserve layer: Deck Three volume, water cells, gear bays, chute trunk — dashed = reserved massing, footprints OPEN',
  extraObjects: objects.filter(o => o.type === 'massing' && ((o.pos[1] ?? 0) + (o.params.lift ?? 0)) <= -3.8).map(o => ({ ...o, type: 'massingPlan' })),
  ghost: objects.filter(o => o.type === 'floor' && Math.abs(deckOf(o) - DECK2Y) < 0.4),
});
sideElevation('side-elevation.svg');
console.log('done');
