// Constraint database logic: machine-readable claims, conflict detection,
// rulings, and evidence tracing.
//
// A constraint = a prose statement + interpretation + optional CLAIMS.
// A claim is machine-readable: { kind, target, ... }.
//   kinds:
//     count      {target, value}                e.g. bridge.seats = 3
//     dimension  {target, min?, max?, value?}   meters
//     presence   {target}                       feature must exist
//     relation   {a, b, rel}                    rel: 'adjacent'|'behind'|'beside'|
//                                               'facing'|'near'|'aft-of'|'forward-of'|
//                                               'reachable-from'|'visible-from'
//     property   {target, key, value}           e.g. door.mechanism = 'manual'
// Conflicts are detected between claims that address the same target and
// cannot both hold; curated conflicts can also be declared in seed data.
import { state } from './state.js';
import { bus } from './util.js';

// ---------- conflict detection ----------
export function detectConflicts() {
  const cons = state.activeConstraints();
  const conflicts = [];

  // 1) property clashes: same target+key, different value
  const props = new Map();
  for (const c of cons) {
    for (const cl of (c.claims || [])) {
      if (cl.kind === 'property') {
        const k = `${cl.target}::${cl.key}`;
        if (!props.has(k)) props.set(k, []);
        props.get(k).push({ c, cl });
      }
    }
  }
  for (const [k, list] of props) {
    const values = new Set(list.map(x => JSON.stringify(x.cl.value)));
    if (values.size > 1) {
      conflicts.push(makeConflict('property:' + k, list.map(x => x.c),
        `Sources disagree about ${list[0].cl.target} — ${list[0].cl.key}.`,
        list.map(x => `${x.cl.value}`)));
    }
  }

  // 2) dimension clashes: min > max across constraints for same target
  const dims = new Map();
  for (const c of cons) {
    for (const cl of (c.claims || [])) {
      if (cl.kind === 'dimension') {
        if (!dims.has(cl.target)) dims.set(cl.target, []);
        dims.get(cl.target).push({ c, cl });
      }
    }
  }
  for (const [target, list] of dims) {
    let lo = -Infinity, hi = Infinity, loC = null, hiC = null;
    for (const { c, cl } of list) {
      const mn = cl.min ?? (cl.value != null ? cl.value - (cl.tolerance ?? 0.05) : null);
      const mx = cl.max ?? (cl.value != null ? cl.value + (cl.tolerance ?? 0.05) : null);
      if (mn != null && mn > lo) { lo = mn; loC = c; }
      if (mx != null && mx < hi) { hi = mx; hiC = c; }
    }
    if (lo > hi + 1e-6 && loC && hiC && loC !== hiC) {
      conflicts.push(makeConflict('dimension:' + target, [loC, hiC],
        `One source requires ${target} ≥ ${lo} m; another allows at most ${hi} m. Both cannot hold.`,
        [`≥ ${lo} m`, `≤ ${hi} m`]));
    }
  }

  // 3) count clashes
  const counts = new Map();
  for (const c of cons) {
    for (const cl of (c.claims || [])) {
      if (cl.kind === 'count') {
        if (!counts.has(cl.target)) counts.set(cl.target, []);
        counts.get(cl.target).push({ c, cl });
      }
    }
  }
  for (const [target, list] of counts) {
    const values = new Set(list.map(x => x.cl.value));
    if (values.size > 1) {
      conflicts.push(makeConflict('count:' + target, list.map(x => x.c),
        `Sources give different counts for ${target}.`,
        list.map(x => String(x.cl.value))));
    }
  }

  // 4) curated conflicts declared in seed data (pairs that logically clash)
  for (const c of cons) {
    for (const cl of (c.claims || [])) {
      if (cl.kind === 'clashes-with') {
        const other = cons.find(o => o.seedKey === cl.target || o.id === cl.target);
        if (other) {
          const key = 'declared:' + [c.seedKey || c.id, other.seedKey || other.id].sort().join('~');
          if (!conflicts.some(x => x.key === key)) {
            conflicts.push(makeConflict(key, [c, other], cl.explanation ||
              'These two statements cannot both be literally true in one geometry.',
              null, cl.options));
          }
        }
      }
    }
  }

  // apply rulings: a ruled conflict is resolved (kept for history, not open)
  for (const cf of conflicts) {
    const ruling = state.getRuling(cf.key);
    if (ruling) { cf.resolved = true; cf.ruling = ruling; }
  }
  return conflicts;
}

function makeConflict(key, constraints, explanation, valueLabels, options) {
  return {
    key,
    constraints,       // constraint records involved
    explanation,       // plain-language physical conflict
    valueLabels,       // short label per side (optional)
    options: options || null,  // curated spatial solutions [{id,label,detail}]
    resolved: false,
    ruling: null,
  };
}

export function openConflicts() {
  return detectConflicts().filter(c => !c.resolved);
}

// ---------- evidence tracing ----------
export function evidenceForObject(objId) {
  const obj = state.getObject(objId);
  if (!obj) return [];
  return (obj.evidenceRefs || [])
    .map(id => state.getConstraint(id) || state.project.constraints.find(c => c.seedKey === id))
    .filter(Boolean);
}

export function constraintsForDocument(docId) {
  return state.project.constraints.filter(c => c.docId === docId);
}

// Objects that a constraint helped determine.
export function objectsForConstraint(conId) {
  const con = state.getConstraint(conId);
  const key = con?.seedKey;
  return state.project.objects.filter(o =>
    (o.evidenceRefs || []).some(r => r === conId || (key && r === key)));
}

// ---------- checking new prose against locked layout ----------
// Returns findings: {sentence, matches:[constraint], verdict:'consistent'|'tension'|'new'}
export function checkProseAgainstLayout(text) {
  const sentences = text.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+/g) || [text];
  const findings = [];
  const cons = state.activeConstraints();
  const spatialWords = /\b(bridge|door|hatch|seat|chair|cradle|console|rail|bench|viewport|window|glass|deck|floor|corridor|galley|wall|bulkhead|behind|beside|across|aft|forward|port|starboard|steps?|meters?|sits?|sat|stood|stands?|leaned?|crossed)\b/i;
  for (const s of sentences) {
    if (!spatialWords.test(s)) continue;
    const words = s.toLowerCase().match(/[a-z]{4,}/g) || [];
    const matches = cons.filter(c => {
      const hay = (c.quote + ' ' + c.subject + ' ' + c.interpretation).toLowerCase();
      let hit = 0;
      for (const w of words) if (hay.includes(w)) hit++;
      return hit >= Math.min(4, Math.max(2, words.length * 0.25));
    }).slice(0, 3);
    // simple contradiction sniff: sentence mentions a target whose ruling says otherwise
    let verdict = matches.length ? 'consistent' : 'new';
    const lower = s.toLowerCase();
    for (const r of state.project.rulings) {
      const label = (r.label || '').toLowerCase();
      if (!label) continue;
      // if the ruling rejected a phrasing that the new sentence re-asserts, flag it
      if (r.rejectedPhrases) {
        for (const ph of r.rejectedPhrases) {
          if (lower.includes(ph.toLowerCase())) { verdict = 'tension'; }
        }
      }
    }
    findings.push({ sentence: s.trim(), matches, verdict });
  }
  return findings;
}

export function conflictBadgeRefresh() {
  const open = openConflicts();
  const badge = document.getElementById('conflict-badge');
  if (badge) {
    badge.textContent = String(open.length);
    badge.classList.toggle('hidden', open.length === 0);
  }
  return open;
}

bus.on('constraints:changed', conflictBadgeRefresh);
bus.on('rulings:changed', conflictBadgeRefresh);
bus.on('project:replaced', conflictBadgeRefresh);
