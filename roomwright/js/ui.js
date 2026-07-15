// All panel UI: documents, constraints, conflicts, tests, scenes, objects,
// inspector, and modal dialogs.
import * as THREE from 'three';
import { state } from './state.js';
import { bus, esc, el, fmt, status, uid } from './util.js';
import { editor, rebuildMannequins, makeLabel, clearSightLines } from './editor.js';
import { OBJECT_TYPES } from './objects.js';
import { CHARACTERS, POSES } from './mannequin.js';
import { detectConflicts, openConflicts, evidenceForObject, objectsForConstraint, checkProseAgainstLayout, conflictBadgeRefresh } from './constraints.js';
import { generateLayout, CONFLICT_LAYOUT_KEYS } from './layout.js';
import { HABIT_TESTS, runAllTests, computeNavGrid } from './tests.js';
import { extractCandidates } from './extract.js';
import { listVersions, saveVersion, restoreVersion, deleteVersion } from './persist.js';

const EV_LABEL = {
  explicit: 'direct textual evidence',
  inference: 'inference from passages',
  decision: 'user decision',
  assumption: 'temporary assumption',
};

// ================= modal =================
export function showModal(title, body, actions = [{ label: 'Close' }]) {
  document.getElementById('modal-title').textContent = title;
  const bodyEl = document.getElementById('modal-body');
  bodyEl.innerHTML = '';
  if (typeof body === 'string') bodyEl.innerHTML = body;
  else bodyEl.appendChild(body);
  const act = document.getElementById('modal-actions');
  act.innerHTML = '';
  for (const a of actions) {
    const b = el(`<button class="small ${a.primary ? 'primary' : ''}">${esc(a.label)}</button>`);
    b.addEventListener('click', () => {
      const keep = a.onClick && a.onClick() === true;
      if (!keep) hideModal();
    });
    act.appendChild(b);
  }
  document.getElementById('modal-backdrop').classList.remove('hidden');
}
export function hideModal() { document.getElementById('modal-backdrop').classList.add('hidden'); }

// ================= tabs =================
export function initTabs() {
  document.querySelectorAll('#left-tabs button').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#left-tabs button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      document.querySelectorAll('.tab-page').forEach(p => p.classList.remove('active'));
      document.getElementById('tab-' + b.dataset.tab).classList.add('active');
      renderTab(b.dataset.tab);
    });
  });
}
function activeTab() {
  return document.querySelector('#left-tabs button.active')?.dataset.tab || 'documents';
}
export function renderTab(name = activeTab()) {
  if (name === 'documents') renderDocuments();
  else if (name === 'constraints') renderConstraints();
  else if (name === 'conflicts') renderConflicts();
  else if (name === 'tests') renderTests();
  else if (name === 'scenes') renderScenes();
  else if (name === 'objects') renderObjects();
}

// ================= documents =================
function renderDocuments() {
  const root = document.getElementById('tab-documents');
  root.innerHTML = `
    <div class="section-head"><span>Source documents</span></div>
    <div class="row" style="display:flex;gap:6px;margin-bottom:10px;">
      <button class="small" id="doc-import">Import .txt</button>
      <button class="small" id="doc-paste">Paste text</button>
      <button class="small" id="doc-check">Check new writing</button>
    </div>
    <div id="doc-list"></div>`;
  const list = root.querySelector('#doc-list');
  for (const d of state.project.documents) {
    const nCons = state.project.constraints.filter(c => c.docId === d.id).length;
    const card = el(`<div class="card">
      <h4>${esc(d.title)}</h4>
      <div class="src">${esc(d.source)}</div>
      <div class="muted" style="font-size:11px;margin-top:3px;">${(d.text.length / 1000).toFixed(1)}k chars · ${nCons} constraints extracted</div>
      <div class="row">
        <button class="small" data-act="view">Read</button>
        <button class="small" data-act="extract">Extract statements</button>
      </div>
    </div>`);
    card.querySelector('[data-act=view]').addEventListener('click', () => viewDocument(d));
    card.querySelector('[data-act=extract]').addEventListener('click', () => extractFromDocument(d));
    list.appendChild(card);
  }
  root.querySelector('#doc-import').addEventListener('click', () => {
    const input = document.getElementById('doc-file');
    input.onchange = async () => {
      const f = input.files[0];
      if (!f) return;
      const text = await f.text();
      state.checkpoint('import doc');
      state.addDocument(f.name.replace(/\.\w+$/, ''), f.name, text);
      renderDocuments();
      status(`Imported “${f.name}”`);
    };
    input.click();
  });
  root.querySelector('#doc-paste').addEventListener('click', () => {
    const body = el(`<div>
      <input type="text" id="paste-title" placeholder="Document title" style="margin-bottom:8px;">
      <textarea id="paste-text" rows="12" placeholder="Paste prose here…"></textarea>
    </div>`);
    showModal('Paste a document', body, [
      { label: 'Cancel' },
      {
        label: 'Add document', primary: true, onClick: () => {
          const t = body.querySelector('#paste-text').value.trim();
          if (!t) return true;
          state.checkpoint('paste doc');
          state.addDocument(body.querySelector('#paste-title').value.trim() || 'Pasted text', 'pasted', t);
          renderDocuments();
        }
      },
    ]);
  });
  root.querySelector('#doc-check').addEventListener('click', () => checkNewWriting());
}

export function viewDocument(doc, highlight = null) {
  const body = el(`<div style="white-space:pre-wrap;font-size:12.5px;line-height:1.55;max-height:60vh;"></div>`);
  let html = esc(doc.text);
  if (highlight) {
    const h = esc(highlight);
    html = html.replace(h, `<mark style="background:#5a4a1e;color:#ffe9b0;padding:1px 2px;">${h}</mark>`);
  }
  body.innerHTML = html;
  showModal(doc.title, body);
  if (highlight) {
    const mark = body.querySelector('mark');
    if (mark) setTimeout(() => mark.scrollIntoView({ block: 'center' }), 30);
  }
}

function extractFromDocument(doc) {
  const existing = new Set(state.project.constraints.map(c => c.quote));
  const candidates = extractCandidates(doc.text).filter(c => !existing.has(c.quote)).slice(0, 60);
  if (!candidates.length) {
    showModal('Extract statements', '<p class="muted">No new spatial statements found in this document (statements already extracted are skipped).</p>');
    return;
  }
  const body = el(`<div><p class="muted" style="margin-bottom:8px;">${candidates.length} candidate spatial statements. Tick the ones to add to the constraint database — nothing is added without your confirmation.</p></div>`);
  candidates.forEach((c, i) => {
    body.appendChild(el(`<div class="card">
      <label style="display:flex;gap:8px;align-items:flex-start;cursor:pointer;">
        <input type="checkbox" data-i="${i}" ${c.score >= 5 ? 'checked' : ''} style="margin-top:3px;">
        <div>
          <blockquote style="margin:0;">${esc(c.quote)}</blockquote>
          <div class="row"><span class="pill category">${esc(c.categories.join(' · '))}</span></div>
        </div>
      </label>
    </div>`));
  });
  showModal(`Extract from “${doc.title}”`, body, [
    { label: 'Cancel' },
    {
      label: 'Add selected', primary: true, onClick: () => {
        let n = 0;
        state.checkpoint('extract constraints');
        body.querySelectorAll('input:checked').forEach(cb => {
          const c = candidates[+cb.dataset.i];
          state.addConstraint({
            docId: doc.id, source: doc.title, quote: c.quote,
            category: c.category, subject: c.subject,
            interpretation: '(no interpretation yet — edit in the Constraints tab)',
            evidence: 'explicit', strength: 'candidate',
          });
          n++;
        });
        status(`Added ${n} constraints`);
        renderTab();
      }
    },
  ]);
}

function checkNewWriting() {
  const body = el(`<div>
    <p class="muted" style="margin-bottom:8px;">Paste new writing. It will be checked against the locked layout, existing constraints, and your conflict rulings.</p>
    <textarea id="check-text" rows="10"></textarea>
    <div id="check-results" style="margin-top:10px;"></div>
  </div>`);
  showModal('Check new writing against the layout', body, [
    { label: 'Close' },
    {
      label: 'Check', primary: true, onClick: () => {
        const text = body.querySelector('#check-text').value;
        const res = checkProseAgainstLayout(text);
        const out = body.querySelector('#check-results');
        out.innerHTML = '';
        if (!res.length) { out.innerHTML = '<p class="muted">No spatial statements detected.</p>'; return true; }
        for (const f of res) {
          const cls = f.verdict === 'tension' ? 'status-fail' : f.verdict === 'consistent' ? 'status-pass' : 'status-warn';
          const label = f.verdict === 'tension' ? 'CONTRADICTS A RULING' : f.verdict === 'consistent' ? 'matches known evidence' : 'new statement — nothing on record';
          const card = el(`<div class="card">
            <blockquote style="margin:0 0 5px;">${esc(f.sentence)}</blockquote>
            <span class="pill ${cls}">${label}</span>
            <div class="muted" style="font-size:11px;margin-top:5px;">${f.matches.map(m => `↳ ${esc(m.subject)} (${esc(m.source || '')})`).join('<br>') || ''}</div>
          </div>`);
          out.appendChild(card);
        }
        return true; // keep modal open
      }
    },
  ]);
}

// ================= constraints =================
function renderConstraints() {
  const root = document.getElementById('tab-constraints');
  const cats = [...new Set(state.project.constraints.map(c => c.category))].sort();
  root.innerHTML = `
    <div class="section-head"><span>Constraint database (${state.project.constraints.length})</span></div>
    <select id="con-filter" style="width:100%;margin-bottom:8px;">
      <option value="">All categories</option>
      ${cats.map(c => `<option>${esc(c)}</option>`).join('')}
    </select>
    <div id="con-list"></div>`;
  const list = root.querySelector('#con-list');
  const draw = () => {
    const filter = root.querySelector('#con-filter').value;
    list.innerHTML = '';
    for (const c of state.project.constraints) {
      if (filter && c.category !== filter) continue;
      const objs = objectsForConstraint(c.id);
      const doc = state.getDocument(c.docId);
      const card = el(`<div class="card">
        <div class="src">${esc(c.source || doc?.title || '?')}</div>
        <blockquote>${esc(c.quote)}</blockquote>
        <div style="font-size:12px;">${esc(c.interpretation)}</div>
        <div class="row">
          <span class="pill ${esc(c.evidence)}">${esc(EV_LABEL[c.evidence] || c.evidence)}</span>
          <span class="pill category">${esc(c.category)}</span>
          ${c.status === 'rejected' ? '<span class="pill status-fail">rejected</span>' : ''}
        </div>
        <div class="row">
          <button class="small" data-act="passage">Show passage</button>
          ${objs.map(o => `<button class="small" data-obj="${o.id}">→ ${esc(o.name)}</button>`).join('')}
        </div>
      </div>`);
      card.querySelector('[data-act=passage]').addEventListener('click', () => {
        const d = state.getDocument(c.docId) || state.project.documents.find(x => x.text.includes(c.quote));
        if (d) viewDocument(d, c.quote);
        else showModal('Passage', `<blockquote>${esc(c.quote)}</blockquote><p class="muted">Source: ${esc(c.source || 'unknown')}</p>`);
      });
      card.querySelectorAll('[data-obj]').forEach(b => b.addEventListener('click', () => {
        state.select(b.dataset.obj);
      }));
      list.appendChild(card);
    }
  };
  root.querySelector('#con-filter').addEventListener('change', draw);
  draw();
}

// ================= conflicts =================
function renderConflicts() {
  const root = document.getElementById('tab-conflicts');
  const all = detectConflicts();
  const open = all.filter(c => !c.resolved);
  const resolved = all.filter(c => c.resolved);
  root.innerHTML = `<div class="section-head"><span>Open conflicts (${open.length})</span></div><div id="cf-open"></div>
    <div class="section-head"><span>Ruled (${resolved.length})</span></div><div id="cf-done"></div>`;
  const openEl = root.querySelector('#cf-open');
  if (!open.length) openEl.innerHTML = '<p class="muted">No unresolved contradictions. The model reflects the evidence and your rulings.</p>';
  for (const cf of open) openEl.appendChild(conflictCard(cf, false));
  const doneEl = root.querySelector('#cf-done');
  for (const cf of resolved) doneEl.appendChild(conflictCard(cf, true));
}

function conflictCard(cf, resolved) {
  const [a, b] = cf.constraints;
  const card = el(`<div class="card">
    <div class="conflict-pair">
      <div><div class="src">${esc(a?.source || '')}</div><blockquote style="margin:4px 0;">${esc(a?.quote || '')}</blockquote></div>
      <div><div class="src">${esc(b?.source || '')}</div><blockquote style="margin:4px 0;">${esc(b?.quote || '')}</blockquote></div>
    </div>
    <div class="conflict-explain">${esc(cf.explanation)}</div>
    <div class="cf-body"></div>
  </div>`);
  const bodyEl = card.querySelector('.cf-body');
  if (resolved) {
    bodyEl.appendChild(el(`<div class="row">
      <span class="pill decision">ruled: ${esc(cf.ruling.label || cf.ruling.choice)}</span>
      <button class="small" data-act="reopen">Reopen</button>
    </div>`));
    bodyEl.querySelector('[data-act=reopen]').addEventListener('click', () => {
      state.checkpoint('reopen conflict');
      state.project.rulings = state.project.rulings.filter(r => r.conflictKey !== cf.key);
      bus.emit('rulings:changed');
      regenerateForConflict(cf.key);
      renderConflicts();
    });
    return card;
  }
  if (cf.options) {
    const opts = el(`<div style="margin:4px 0 8px;"></div>`);
    cf.options.forEach((o, i) => {
      opts.appendChild(el(`<label style="display:flex;gap:8px;align-items:flex-start;margin-bottom:7px;cursor:pointer;">
        <input type="radio" name="cf-${esc(cf.key)}" value="${esc(o.id)}" ${i === 0 ? 'checked' : ''} style="margin-top:3px;">
        <div><b style="font-size:12px;">${esc(o.label)}</b><div class="muted" style="font-size:11.5px;">${esc(o.detail)}</div></div>
      </label>`));
    });
    bodyEl.appendChild(opts);
  }
  const row = el(`<div class="row">
    <button class="small primary" data-act="accept">Accept solution</button>
    <button class="small" data-act="manual">I’ll fix it manually</button>
    <button class="small" data-act="defer">Defer</button>
  </div>`);
  bodyEl.appendChild(row);
  row.querySelector('[data-act=accept]').addEventListener('click', () => {
    const sel = card.querySelector(`input[name="cf-${cf.key}"]:checked`);
    const choice = sel ? sel.value : 'accepted';
    const opt = cf.options?.find(o => o.id === choice);
    state.checkpoint('rule conflict');
    state.addRuling(cf.key, choice, opt?.label || choice, opt?.detail || '');
    regenerateForConflict(cf.key);
    status('Ruling recorded — it will be remembered for future imports.');
    renderConflicts();
  });
  row.querySelector('[data-act=manual]').addEventListener('click', () => {
    state.checkpoint('rule conflict');
    state.addRuling(cf.key, 'manual', 'Resolved manually in the editor', 'The user adjusted the model by hand.');
    renderConflicts();
  });
  row.querySelector('[data-act=defer]').addEventListener('click', () => {
    state.checkpoint('defer conflict');
    state.addRuling(cf.key, 'defer', 'Deferred — provisional geometry stands', 'Decision postponed; affected objects stay marked as assumptions.');
    renderConflicts();
  });
  return card;
}

function regenerateForConflict(key) {
  const keys = CONFLICT_LAYOUT_KEYS[key];
  if (keys) generateLayout({ replaceKeys: keys });
}

// ================= tests =================
let lastTestResults = null;
function renderTests() {
  const root = document.getElementById('tab-tests');
  root.innerHTML = `
    <div class="section-head"><span>Habit tests</span>
      <button class="small primary" id="run-tests">Run all</button>
    </div>
    <div id="test-list"></div>`;
  const list = root.querySelector('#test-list');
  const draw = () => {
    list.innerHTML = '';
    for (const t of HABIT_TESTS) {
      const res = lastTestResults?.find(r => r.id === t.id);
      const cls = res ? res.status : 'idle';
      const dot = cls === 'pass' ? 'pass' : cls === 'warn' ? 'warn' : cls === 'fail' ? 'fail' : 'idle';
      const card = el(`<div class="card">
        <div class="test-row">
          <div class="test-dot ${dot}"></div>
          <div style="flex:1;">
            <div style="font-size:12px;">${esc(t.name)}</div>
            ${res ? `<div class="test-details">${esc(res.details)}</div>` : ''}
          </div>
        </div>
      </div>`);
      list.appendChild(card);
    }
  };
  root.querySelector('#run-tests').addEventListener('click', () => {
    lastTestResults = runAllTests();
    const p = lastTestResults.filter(r => r.status === 'pass').length;
    const w = lastTestResults.filter(r => r.status === 'warn').length;
    const f = lastTestResults.filter(r => r.status === 'fail').length;
    status(`Tests: ${p} pass · ${w} uncertain · ${f} impossible`);
    draw();
  });
  draw();
}

// ================= scenes =================
let compareGhostGroup = null;
let recording = null;

function renderScenes() {
  const root = document.getElementById('tab-scenes');
  const proj = state.project;
  root.innerHTML = `
    <div class="section-head"><span>Scenes</span>
      <button class="small" id="scene-add">New scene</button>
    </div>
    <div id="scene-list"></div>
    <div id="scene-detail"></div>
    <div class="section-head" style="margin-top:14px;"><span>Saved versions</span>
      <button class="small" id="ver-save">Save version</button>
    </div>
    <div id="ver-list"></div>`;
  const list = root.querySelector('#scene-list');
  for (const s of proj.scenes) {
    const active = proj.settings.activeSceneId === s.id;
    const card = el(`<div class="card clickable ${active ? 'selected' : ''}">
      <h4>${esc(s.name)} ${active ? '<span class="pill decision">active</span>' : ''}</h4>
      <div class="muted" style="font-size:11px;">${s.mannequins.length} figure(s) · ${s.paths?.length || 0} path(s)</div>
      <div class="row">
        ${active ? '' : '<button class="small" data-act="activate">Activate</button>'}
        <button class="small" data-act="compare">${compareGhostGroup?.userData?.sceneId === s.id ? 'Hide ghost' : 'Compare (ghost)'}</button>
        <button class="small" data-act="dup">Duplicate</button>
        <button class="small danger" data-act="del">Delete</button>
      </div>
    </div>`);
    card.querySelector('[data-act=activate]')?.addEventListener('click', () => {
      state.checkpoint('activate scene');
      proj.settings.activeSceneId = s.id;
      bus.emit('scenes:changed');
      renderScenes();
    });
    card.querySelector('[data-act=compare]').addEventListener('click', () => { toggleCompareGhost(s); renderScenes(); });
    card.querySelector('[data-act=dup]').addEventListener('click', () => {
      state.checkpoint('duplicate scene');
      state.addScene({ ...JSON.parse(JSON.stringify(s)), id: undefined, name: s.name + ' (copy)' });
      renderScenes();
    });
    card.querySelector('[data-act=del]').addEventListener('click', () => {
      state.checkpoint('delete scene');
      proj.scenes = proj.scenes.filter(x => x.id !== s.id);
      if (proj.settings.activeSceneId === s.id) proj.settings.activeSceneId = proj.scenes[0]?.id || null;
      bus.emit('scenes:changed');
      renderScenes();
    });
    list.appendChild(card);
  }
  root.querySelector('#scene-add').addEventListener('click', () => {
    state.checkpoint('new scene');
    const s = state.addScene({ name: 'Scene ' + (proj.scenes.length + 1) });
    proj.settings.activeSceneId = s.id;
    bus.emit('scenes:changed');
    renderScenes();
  });

  // active scene detail
  const detail = root.querySelector('#scene-detail');
  const scene = state.activeScene;
  if (scene) {
    detail.appendChild(el(`<div class="section-head"><span>Figures in “${esc(scene.name)}”</span></div>`));
    scene.mannequins.forEach((m, i) => {
      const card = el(`<div class="card">
        <h4>${esc(CHARACTERS[m.character].label)} <span class="pill category">${esc(POSES[m.pose]?.label || m.pose)}</span></h4>
        <div class="row">
          <select data-role="pose">${Object.entries(POSES).map(([k, p]) =>
            `<option value="${k}" ${m.pose === k ? 'selected' : ''}>${esc(p.label)}</option>`).join('')}</select>
          <label style="font-size:11px;color:var(--muted);"><input type="checkbox" data-role="bolts" ${m.props === 'bolts' ? 'checked' : ''}> bolts</label>
        </div>
        <div class="row">
          <button class="small" data-act="select">Select</button>
          <button class="small" data-act="walk">Walk as</button>
          <button class="small danger" data-act="remove">Remove</button>
        </div>
      </div>`);
      card.querySelector('[data-role=pose]').addEventListener('change', e => {
        state.checkpoint('pose');
        m.pose = e.target.value;
        autoSupportHeight(m);
        bus.emit('scenes:changed');
      });
      card.querySelector('[data-role=bolts]').addEventListener('change', e => {
        state.checkpoint('props');
        m.props = e.target.checked ? 'bolts' : null;
        bus.emit('scenes:changed');
      });
      card.querySelector('[data-act=select]').addEventListener('click', () => state.select('mann_' + i));
      card.querySelector('[data-act=walk]').addEventListener('click', () => bus.emit('ui:walkAs', m.character));
      card.querySelector('[data-act=remove]').addEventListener('click', () => {
        state.checkpoint('remove figure');
        scene.mannequins.splice(i, 1);
        bus.emit('scenes:changed');
        renderScenes();
      });
      detail.appendChild(card);
    });
    const addRow = el(`<div class="row" style="margin-bottom:10px;">
      ${Object.entries(CHARACTERS).map(([k, c]) => `<button class="small" data-char="${k}">+ ${esc(c.label)}</button>`).join('')}
    </div>`);
    addRow.querySelectorAll('[data-char]').forEach(b => b.addEventListener('click', () => {
      state.checkpoint('add figure');
      scene.mannequins.push({ character: b.dataset.char, pos: [0, 0, 0.6], rotY: Math.PI, pose: 'stand', props: null });
      bus.emit('scenes:changed');
      renderScenes();
    }));
    detail.appendChild(addRow);

    // paths
    detail.appendChild(el(`<div class="section-head"><span>Movement paths</span></div>`));
    (scene.paths || []).forEach((p, i) => {
      const card = el(`<div class="card">
        <h4>${esc(p.name)}</h4>
        <div class="muted" style="font-size:11px;">${esc(CHARACTERS[p.character]?.label || '')} · ${p.points.length} points · ${fmt(pathLength(p))} m</div>
        <div class="row"><button class="small danger" data-act="del">Delete</button></div>
      </div>`);
      card.querySelector('[data-act=del]').addEventListener('click', () => {
        state.checkpoint('delete path');
        scene.paths.splice(i, 1);
        bus.emit('scenes:changed');
        renderScenes();
      });
      detail.appendChild(card);
    });
    const recBtn = el(`<button class="small ${recording ? 'primary' : ''}" id="path-rec">${recording ? `Finish path (${recording.points.length} pts)` : 'Record path (click floor)'}</button>`);
    recBtn.addEventListener('click', () => {
      if (recording) finishRecording();
      else startRecording(scene);
      renderScenes();
    });
    detail.appendChild(recBtn);
  }

  // versions
  const verList = root.querySelector('#ver-list');
  for (const v of listVersions()) {
    const card = el(`<div class="card">
      <h4>${esc(v.name)}</h4>
      <div class="muted" style="font-size:11px;">${new Date(v.date).toLocaleString()}</div>
      <div class="row">
        <button class="small" data-act="restore">Restore</button>
        <button class="small danger" data-act="del">Delete</button>
      </div>
    </div>`);
    card.querySelector('[data-act=restore]').addEventListener('click', () => { restoreVersion(v.id); renderTab(); });
    card.querySelector('[data-act=del]').addEventListener('click', () => { deleteVersion(v.id); renderScenes(); });
    verList.appendChild(card);
  }
  root.querySelector('#ver-save').addEventListener('click', () => {
    const body = el(`<div><input type="text" id="ver-name" placeholder="Version name (e.g. 'bench moved to starboard')"></div>`);
    showModal('Save a named version', body, [
      { label: 'Cancel' },
      { label: 'Save', primary: true, onClick: () => { saveVersion(body.querySelector('#ver-name').value.trim()); renderScenes(); } },
    ]);
  });
}

function pathLength(p) {
  let d = 0;
  for (let i = 1; i < p.points.length; i++) {
    d += Math.hypot(p.points[i][0] - p.points[i - 1][0], p.points[i][2] - p.points[i - 1][2]);
  }
  return d;
}

function autoSupportHeight(m) {
  // seat-relative poses snap to the nearest sit point
  if (!['sit', 'recline', 'feetUp'].includes(m.pose)) { delete m.supportHeight; return; }
  let best = null;
  for (const rec of state.project.objects) {
    if (!['seat', 'bench'].includes(rec.type)) continue;
    const d = Math.hypot(rec.pos[0] - m.pos[0], rec.pos[2] - m.pos[2]);
    if (d < 0.7 && (!best || d < best.d)) best = { d, rec };
  }
  if (best) {
    m.supportHeight = (best.rec.params.seatHeight ?? best.rec.params.height ?? 0.45);
    m.pos = [best.rec.pos[0], 0, best.rec.pos[2]];
    m.rotY = best.rec.rotY;
  } else {
    m.supportHeight = 0.45;
  }
}

function startRecording(scene) {
  const character = scene.mannequins[0]?.character || 'quenby';
  recording = { sceneId: scene.id, character, points: [] };
  status('Recording path: click floor points in the viewport, then press "Finish path".', 0);
  editor.pickFloorMode = v => {
    recording.points.push([+v.x.toFixed(2), 0, +v.z.toFixed(2)]);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xe8a33d }));
    dot.position.set(v.x, 0.05, v.z);
    dot.userData.isRecDot = true;
    editor.helpers.add(dot);
    status(`Path point ${recording.points.length}`, 0);
    renderScenes();
  };
}
function finishRecording() {
  const scene = state.getScene(recording.sceneId);
  if (scene && recording.points.length >= 2) {
    state.checkpoint('record path');
    scene.paths = scene.paths || [];
    scene.paths.push({
      id: uid('path'),
      name: `Path ${scene.paths.length + 1}`,
      character: recording.character,
      points: recording.points,
    });
    bus.emit('scenes:changed');
    status(`Path saved (${recording.points.length} points)`);
  } else status('Path discarded (needs at least 2 points)');
  editor.pickFloorMode = null;
  [...editor.helpers.children].forEach(c => { if (c.userData.isRecDot) editor.helpers.remove(c); });
  recording = null;
}

function toggleCompareGhost(scene) {
  if (compareGhostGroup) {
    const same = compareGhostGroup.userData.sceneId === scene.id;
    editor.helpers.remove(compareGhostGroup);
    compareGhostGroup = null;
    if (same) return;
  }
  compareGhostGroup = new THREE.Group();
  compareGhostGroup.userData.sceneId = scene.id;
  import('./mannequin.js').then(({ buildMannequin, applyPose }) => {
    for (const m of scene.mannequins) {
      const g = buildMannequin(m.character);
      applyPose(g, m.pose, { supportHeight: m.supportHeight });
      g.position.set(...m.pos);
      g.rotation.y = m.rotY || 0;
      g.traverse(o => {
        if (o.isMesh) {
          o.material = o.material.clone();
          o.material.transparent = true;
          o.material.opacity = 0.28;
          o.castShadow = false;
        }
      });
      compareGhostGroup.add(g);
    }
    editor.helpers.add(compareGhostGroup);
    status(`Ghost overlay: “${scene.name}” shown against the active scene`);
  });
}

// ================= objects tab =================
function renderObjects() {
  const root = document.getElementById('tab-objects');
  root.innerHTML = `
    <div class="section-head"><span>Add object</span></div>
    <div class="row" id="obj-add" style="margin-bottom:10px;"></div>
    <div class="section-head"><span>Objects in model (${state.project.objects.length})</span></div>
    <div id="obj-list"></div>`;
  const addRow = root.querySelector('#obj-add');
  for (const [type, def] of Object.entries(OBJECT_TYPES)) {
    const b = el(`<button class="small">+ ${esc(def.label)}</button>`);
    b.addEventListener('click', () => {
      state.checkpoint('add object');
      const rec = state.addObject({
        type, name: def.label, params: { ...def.defaults },
        pos: [0, 0, 0.5], rotY: 0, evidence: 'assumption',
        note: 'Added by hand — mark up its evidence in the inspector note if it comes from the text.',
      });
      state.select(rec.id);
      renderObjects();
    });
    addRow.appendChild(b);
  }
  const list = root.querySelector('#obj-list');
  for (const o of state.project.objects) {
    const card = el(`<div class="card clickable ${state.selection === o.id ? 'selected' : ''}">
      <h4>${esc(o.name)} ${o.locked ? '🔒' : ''}</h4>
      <div class="row">
        <span class="pill ${esc(o.evidence)}">${esc(o.evidence)}</span>
        <span class="pill category">${esc(o.type)}</span>
      </div>
    </div>`);
    card.addEventListener('click', () => state.select(o.id));
    list.appendChild(card);
  }
}

// ================= inspector =================
export function renderInspector() {
  const title = document.getElementById('insp-title');
  const body = document.getElementById('insp-body');
  const sel = state.selection;
  body.innerHTML = '';
  if (!sel) {
    title.textContent = 'Nothing selected';
    body.innerHTML = '<p class="muted">Click an object in the viewport to see what it is, why it exists, and the evidence that determines it.</p>';
    return;
  }

  // ---- mannequin ----
  if (String(sel).startsWith('mann_')) {
    const i = +sel.slice(5);
    const scene = state.activeScene;
    const m = scene?.mannequins[i];
    if (!m) { title.textContent = 'Figure'; return; }
    const c = CHARACTERS[m.character];
    title.textContent = c.label + ' (mannequin)';
    body.appendChild(el(`<div class="kv">
      <dt>Height</dt><dd>${fmt(c.height)} m (assumption)</dd>
      <dt>Pose</dt><dd>${esc(POSES[m.pose]?.label || m.pose)}</dd>
      <dt>Position</dt><dd>${m.pos.map(v => fmt(v)).join(', ')}</dd>
    </div>`));
    const poseSel = el(`<select style="width:100%;">${Object.entries(POSES).map(([k, p]) =>
      `<option value="${k}" ${m.pose === k ? 'selected' : ''}>${esc(p.label)}</option>`).join('')}</select>`);
    poseSel.addEventListener('change', () => {
      state.checkpoint('pose');
      m.pose = poseSel.value;
      autoSupportHeight(m);
      bus.emit('scenes:changed');
    });
    body.appendChild(poseSel);
    const rot = el(`<div style="margin-top:8px;"><label class="muted" style="font-size:11px;">Facing (drag)</label>
      <input type="range" min="0" max="6.283" step="0.05" value="${m.rotY || 0}" style="width:100%;"></div>`);
    rot.querySelector('input').addEventListener('input', e => {
      m.rotY = +e.target.value;
      const g = editor.mannequinGroups.get(i);
      if (g) g.rotation.y = m.rotY;
      state.markDirty();
    });
    body.appendChild(rot);
    body.appendChild(el(`<p class="muted" style="font-size:11px;margin-top:8px;">Use the Move tool to place the figure. Sitting poses snap to the nearest seat.</p>`));
    return;
  }

  // ---- object ----
  const o = state.getObject(sel);
  if (!o) { title.textContent = 'Unknown'; return; }
  title.textContent = o.name;
  const def = OBJECT_TYPES[o.type];

  const nameIn = el(`<input type="text" value="${esc(o.name)}" style="margin-bottom:6px;">`);
  nameIn.addEventListener('change', () => { state.checkpoint('rename'); o.name = nameIn.value; bus.emit('objects:changed'); renderTab(); });
  body.appendChild(nameIn);

  body.appendChild(el(`<div class="row" style="margin-bottom:6px;">
    <span class="pill ${esc(o.evidence)}">${esc(EV_LABEL[o.evidence] || o.evidence)}</span>
    <span class="pill category">${esc(def?.label || o.type)}</span>
  </div>`));

  if (o.note) body.appendChild(el(`<p style="font-size:12px;color:var(--muted);margin:6px 0;">${esc(o.note)}</p>`));

  // evidence trail
  const evs = evidenceForObject(o.id);
  if (evs.length) {
    body.appendChild(el(`<div class="section-head"><span>Why it exists — evidence</span></div>`));
    for (const c of evs) {
      const item = el(`<div class="ev-item">
        <div class="src">${esc(c.source)} · <span class="pill ${esc(c.evidence)}" style="font-size:9px;">${esc(c.evidence)}</span></div>
        <div class="q">“${esc(c.quote)}”</div>
        <div style="font-size:11px;margin-top:2px;">${esc(c.interpretation)}</div>
        <button class="small" style="margin-top:4px;">Show passage</button>
      </div>`);
      item.querySelector('button').addEventListener('click', () => {
        const d = state.getDocument(c.docId) || state.project.documents.find(x => x.text.includes(c.quote));
        if (d) viewDocument(d, c.quote);
      });
      body.appendChild(item);
    }
  } else {
    body.appendChild(el(`<p class="muted" style="font-size:11px;">No textual evidence linked — this object is ${o.evidence === 'decision' ? 'your decision' : 'an assumption'}.</p>`));
  }

  // params
  if (def?.schema?.length) {
    body.appendChild(el(`<div class="section-head"><span>Parameters</span></div>`));
    for (const f of def.schema) {
      const val = o.params[f.key] ?? def.defaults[f.key];
      let row;
      if (f.options) {
        row = el(`<div class="kv"><dt>${esc(f.label)}</dt><dd>
          <select>${f.options.map(v => `<option value="${v}" ${String(val) === String(v) ? 'selected' : ''}>${v}</option>`).join('')}</select></dd></div>`);
        row.querySelector('select').addEventListener('change', e => {
          state.checkpoint('param');
          let v = e.target.value;
          if (v === 'true') v = true; else if (v === 'false') v = false;
          o.params[f.key] = v;
          bus.emit('objects:changed');
        });
      } else {
        row = el(`<div class="kv"><dt>${esc(f.label)}</dt><dd>
          <input class="insp-num" type="number" value="${val}" min="${f.min}" max="${f.max}" step="${f.step}"></dd></div>`);
        row.querySelector('input').addEventListener('change', e => {
          state.checkpoint('param');
          o.params[f.key] = +e.target.value;
          bus.emit('objects:changed');
        });
      }
      body.appendChild(row);
    }
  }

  // transform readout
  body.appendChild(el(`<div class="section-head"><span>Placement</span></div>`));
  const tf = el(`<div class="kv">
    <dt>Position</dt><dd>
      <input class="insp-num" data-k="0" type="number" step="0.05" value="${fmt(o.pos[0], 3)}">
      <input class="insp-num" data-k="2" type="number" step="0.05" value="${fmt(o.pos[2], 3)}">
    </dd>
    <dt>Rotation</dt><dd><input class="insp-num" data-k="rot" type="number" step="5" value="${fmt((o.rotY || 0) * 180 / Math.PI, 1)}">°</dd>
  </div>`);
  tf.querySelectorAll('input').forEach(inp => inp.addEventListener('change', () => {
    state.checkpoint('move');
    if (inp.dataset.k === 'rot') o.rotY = +inp.value * Math.PI / 180;
    else o.pos[+inp.dataset.k] = +inp.value;
    bus.emit('objects:changed');
  }));
  body.appendChild(tf);

  const lockRow = el(`<div class="row">
    <button class="small">${o.locked ? 'Unlock' : 'Lock'}</button>
    <button class="small danger">Delete</button>
  </div>`);
  const [lockBtn, delBtn] = lockRow.querySelectorAll('button');
  lockBtn.addEventListener('click', () => {
    state.checkpoint('lock');
    o.locked = !o.locked;
    if (o.locked && o.evidence === 'assumption') o.evidence = 'decision';
    bus.emit('objects:changed');
    renderInspector();
  });
  delBtn.addEventListener('click', () => {
    if (o.locked) { status('Unlock it first.'); return; }
    state.checkpoint('delete');
    state.removeObject(o.id);
  });
  body.appendChild(lockRow);
}

// ================= nav overlay =================
let navMesh = null;
export function toggleNavOverlay() {
  if (navMesh) {
    editor.helpers.remove(navMesh);
    navMesh.geometry.dispose();
    navMesh = null;
    document.getElementById('btn-nav').classList.remove('active');
    return;
  }
  const grid = computeNavGrid(0.24);
  if (!grid) { status('No floor.'); return; }
  const count = grid.nx * grid.nz;
  const geo = new THREE.PlaneGeometry(grid.cell * 0.9, grid.cell * 0.9);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: 0x2fae62, transparent: true, opacity: 0.35, depthWrite: false });
  const inst = new THREE.InstancedMesh(geo, mat, count);
  const m4 = new THREE.Matrix4();
  let n = 0;
  for (let i = 0; i < grid.nx; i++) {
    for (let j = 0; j < grid.nz; j++) {
      if (!grid.walkable[i * grid.nz + j]) continue;
      m4.setPosition(grid.ox + i * grid.cell, 0.012, grid.oz + j * grid.cell);
      inst.setMatrixAt(n++, m4);
    }
  }
  inst.count = n;
  inst.instanceMatrix.needsUpdate = true;
  navMesh = inst;
  editor.helpers.add(inst);
  document.getElementById('btn-nav').classList.add('active');
  status(`Navigable space: ${n} of ${count} cells walkable (0.48 m body clearance)`);
}

// ================= wiring =================
export function initUI() {
  initTabs();
  bus.on('selection:changed', () => { renderInspector(); if (activeTab() === 'objects') renderObjects(); });
  bus.on('objects:changed', () => { if (['objects', 'conflicts'].includes(activeTab())) renderTab(); renderInspector(); });
  bus.on('constraints:changed', () => renderTab());
  bus.on('rulings:changed', () => conflictBadgeRefresh());
  bus.on('scenes:changed', () => { if (activeTab() === 'scenes') renderScenes(); });
  bus.on('project:replaced', () => { renderTab(); renderInspector(); conflictBadgeRefresh(); });
  conflictBadgeRefresh();
  renderTab('documents');
}
