// Autosave, named versions, and JSON project import/export.
import { state } from './state.js';
import { bus, status, download } from './util.js';

const AUTOSAVE_KEY = 'roomwright:autosave';
const VERSIONS_KEY = 'roomwright:versions';

let saveTimer = null;
export function initPersistence() {
  bus.on('project:dirty', () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(autosave, 1200);
  });
}

export function autosave() {
  try {
    state.project.meta.savedAt = new Date().toISOString();
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(state.project));
    state.dirty = false;
    const el = document.getElementById('status-save');
    if (el) el.textContent = `autosaved ${new Date().toLocaleTimeString()}`;
  } catch (e) {
    console.error('autosave failed', e);
    status('Autosave failed: ' + e.message);
  }
}

export function loadAutosave() {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (p?.meta?.app !== 'roomwright') return null;
    return p;
  } catch { return null; }
}

export function clearAutosave() { localStorage.removeItem(AUTOSAVE_KEY); }

// ---- named versions ----
export function listVersions() {
  try { return JSON.parse(localStorage.getItem(VERSIONS_KEY) || '[]'); }
  catch { return []; }
}
export function saveVersion(name) {
  const versions = listVersions();
  versions.unshift({
    id: 'v' + Date.now(),
    name: name || `Version ${versions.length + 1}`,
    date: new Date().toISOString(),
    project: JSON.parse(JSON.stringify(state.project)),
  });
  while (versions.length > 20) versions.pop();
  try {
    localStorage.setItem(VERSIONS_KEY, JSON.stringify(versions));
    status(`Saved version “${versions[0].name}”`);
    bus.emit('versions:changed');
  } catch (e) { status('Version save failed (storage full?): ' + e.message); }
  return versions[0];
}
export function restoreVersion(id) {
  const v = listVersions().find(x => x.id === id);
  if (!v) return false;
  state.replaceProject(JSON.parse(JSON.stringify(v.project)));
  status(`Restored “${v.name}”`);
  return true;
}
export function deleteVersion(id) {
  const versions = listVersions().filter(x => x.id !== id);
  localStorage.setItem(VERSIONS_KEY, JSON.stringify(versions));
  bus.emit('versions:changed');
}

// ---- JSON file import/export ----
export function exportProject() {
  state.project.meta.savedAt = new Date().toISOString();
  const name = (state.project.meta.name || 'roomwright').replace(/[^\w-]+/g, '_');
  download(`${name}.roomwright.json`, JSON.stringify(state.project, null, 2));
  status('Project exported');
}

export function importProjectFile(file) {
  return file.text().then(text => {
    const p = JSON.parse(text);
    if (p?.meta?.app !== 'roomwright') throw new Error('Not a Roomwright project file');
    state.replaceProject(p);
    status(`Imported “${p.meta.name}”`);
  }).catch(e => { status('Import failed: ' + e.message, 8000); throw e; });
}
