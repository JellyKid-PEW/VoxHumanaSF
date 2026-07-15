// Roomwright bootstrap: renderer → project (autosave or seed) → UI.
import { state, emptyProject } from './state.js';
import { bus, status } from './util.js';
import { initEditor, editor, setView, setTool, enterFP, setCutaway, screenshot, rebuildRoom, rebuildMannequins, clearMeasurements } from './editor.js';
import { initAtmosphere, setLightingMode, toggleSound } from './atmosphere.js';
import { initPersistence, loadAutosave, autosave, exportProject, importProjectFile } from './persist.js';
import { generateLayout } from './layout.js';
import { SEED_CONSTRAINTS, buildSeedDocuments, SEED_SCENE } from '../data/seed.js';
import { initUI, renderTab, toggleNavOverlay, renderInspector } from './ui.js';
import { conflictBadgeRefresh } from './constraints.js';

function seedProject() {
  const p = emptyProject();
  state.replaceProject(p);
  // documents
  const docs = buildSeedDocuments();
  const docByKey = {};
  for (const d of docs) {
    const rec = state.addDocument(d.title, d.source, d.text);
    docByKey[d.key] = rec;
  }
  // constraints (with seedKey so layout evidenceRefs resolve)
  for (const c of SEED_CONSTRAINTS) {
    const arc = c.source.startsWith('Next') ? 'Next' : c.source.startsWith('Presence') ? 'Presence' : 'VH1_B3';
    state.addConstraint({
      seedKey: c.key,
      docId: docByKey[arc]?.id,
      source: c.source,
      quote: c.quote,
      category: c.category,
      subject: c.subject,
      interpretation: c.interpretation,
      evidence: c.evidence,
      claims: c.claims || [],
    });
  }
  // layout from constraints
  generateLayout({ fresh: true });
  // default scene
  const scene = state.addScene(JSON.parse(JSON.stringify(SEED_SCENE)));
  p.settings.activeSceneId = scene.id;
  state.dirty = true;
  return p;
}

async function boot() {
  await initEditor();
  initAtmosphere();
  initPersistence();

  const saved = loadAutosave();
  if (saved) {
    state.replaceProject(saved);
    status('Restored autosaved project');
  } else {
    seedProject();
    status('Bridge generated from the imported excerpts — check the Conflicts tab.');
    autosave();
  }
  rebuildRoom();
  rebuildMannequins();
  initUI();
  renderInspector();
  conflictBadgeRefresh();
  setView('orbit');
  setTool('select');
  document.getElementById('project-name').textContent = state.project.meta.name;

  wireToolbar();
  window.__roomwright = { state, editor, bus };  // for testing/debugging
}

function wireToolbar() {
  document.querySelectorAll('#view-buttons .tb').forEach(b =>
    b.addEventListener('click', () => setView(b.dataset.view)));
  document.querySelectorAll('#tool-buttons .tb').forEach(b =>
    b.addEventListener('click', () => {
      if (b.dataset.tool !== 'measure') clearMeasurements();
      setTool(b.dataset.tool);
    }));
  document.querySelectorAll('.char-chip').forEach(b =>
    b.addEventListener('click', () => enterFP(b.dataset.char)));
  bus.on('ui:walkAs', ch => enterFP(ch));

  document.getElementById('snap-select').addEventListener('change', e => {
    const v = +e.target.value;
    state.project.settings.snap = v;
    editor.gizmo.setTranslationSnap(v || null);
  });
  document.getElementById('btn-undo').addEventListener('click', () => { if (state.undo()) status('Undo'); });
  document.getElementById('btn-redo').addEventListener('click', () => { if (state.redo()) status('Redo'); });
  document.getElementById('lighting-select').addEventListener('change', e => setLightingMode(e.target.value));
  document.getElementById('btn-cutaway').addEventListener('click', () => setCutaway(!editor.cutaway));
  document.getElementById('btn-nav').addEventListener('click', () => toggleNavOverlay());
  document.getElementById('btn-sound').addEventListener('click', () => toggleSound());
  document.getElementById('btn-screenshot').addEventListener('click', () => screenshot(3));
  document.getElementById('btn-save').addEventListener('click', () => {
    import('./persist.js').then(m => {
      const name = prompt('Version name:', 'Bridge ' + new Date().toLocaleDateString());
      if (name !== null) { m.saveVersion(name); renderTab(); }
    });
  });
  document.getElementById('btn-export').addEventListener('click', () => exportProject());
  document.getElementById('btn-import').addEventListener('click', () => {
    const input = document.getElementById('import-file');
    input.onchange = () => { if (input.files[0]) importProjectFile(input.files[0]); };
    input.click();
  });
}

boot().catch(e => {
  console.error(e);
  document.getElementById('status-msg').textContent = 'Boot failed: ' + e.message;
});
