// Central project state, undo/redo, dirty tracking.
import { uid, deepClone, bus } from './util.js';

export const EVIDENCE_LEVELS = ['explicit', 'inference', 'decision', 'assumption'];

export function emptyProject() {
  return {
    meta: {
      app: 'roomwright',
      formatVersion: 1,
      name: 'Wild Huntress — Bridge',
      createdAt: new Date().toISOString(),
      savedAt: null,
    },
    documents: [],     // {id, title, source, text}
    constraints: [],   // {id, docId, quote, category, subject, interpretation,
                       //  strength, evidence, claims:[], status:'active'|'rejected', note}
    rulings: [],       // {id, conflictKey, choice, label, note, decidedAt}
    objects: [],       // {id, type, name, params, pos:[x,y,z], rotY, locked,
                       //  evidence, evidenceRefs:[constraintId], note}
    scenes: [],        // {id, name, note, mannequins:[{character,pos,rotY,pose,props}],
                       //  paths:[{id,name,character,points:[[x,y,z]]}]}
    settings: {
      lightingMode: 'normal',
      sound: false,
      snap: 0.1,
      activeSceneId: null,
    },
  };
}

class State {
  constructor() {
    this.project = emptyProject();
    this.undoStack = [];
    this.redoStack = [];
    this.selection = null;      // object id
    this.dirty = false;
  }

  // ---- undo/redo: snapshot the mutable project ----
  checkpoint(label = '') {
    this.undoStack.push({ label, snap: deepClone(this.project) });
    if (this.undoStack.length > 80) this.undoStack.shift();
    this.redoStack.length = 0;
    this.markDirty();
  }
  undo() {
    if (!this.undoStack.length) return false;
    this.redoStack.push({ label: 'redo', snap: deepClone(this.project) });
    this.project = this.undoStack.pop().snap;
    this.markDirty();
    bus.emit('project:replaced');
    return true;
  }
  redo() {
    if (!this.redoStack.length) return false;
    this.undoStack.push({ label: 'undo', snap: deepClone(this.project) });
    this.project = this.redoStack.pop().snap;
    this.markDirty();
    bus.emit('project:replaced');
    return true;
  }

  markDirty() {
    this.dirty = true;
    bus.emit('project:dirty');
  }

  // ---- documents ----
  addDocument(title, source, text) {
    const doc = { id: uid('doc'), title, source, text };
    this.project.documents.push(doc);
    bus.emit('documents:changed');
    this.markDirty();
    return doc;
  }
  getDocument(id) { return this.project.documents.find(d => d.id === id); }

  // ---- constraints ----
  addConstraint(c) {
    const full = {
      id: uid('con'), status: 'active', claims: [], note: '',
      strength: 'explicit', evidence: 'explicit', ...c
    };
    this.project.constraints.push(full);
    bus.emit('constraints:changed');
    this.markDirty();
    return full;
  }
  getConstraint(id) { return this.project.constraints.find(c => c.id === id); }
  activeConstraints() { return this.project.constraints.filter(c => c.status === 'active'); }

  // ---- rulings ----
  addRuling(conflictKey, choice, label, note = '') {
    const existing = this.project.rulings.find(r => r.conflictKey === conflictKey);
    if (existing) {
      Object.assign(existing, { choice, label, note, decidedAt: new Date().toISOString() });
      bus.emit('rulings:changed');
      this.markDirty();
      return existing;
    }
    const r = { id: uid('rul'), conflictKey, choice, label, note, decidedAt: new Date().toISOString() };
    this.project.rulings.push(r);
    bus.emit('rulings:changed');
    this.markDirty();
    return r;
  }
  getRuling(conflictKey) { return this.project.rulings.find(r => r.conflictKey === conflictKey); }

  // ---- objects ----
  addObject(o) {
    const full = {
      id: uid('obj'), name: o.type, params: {}, pos: [0, 0, 0], rotY: 0,
      locked: false, evidence: 'assumption', evidenceRefs: [], note: '', ...o
    };
    this.project.objects.push(full);
    bus.emit('objects:changed');
    this.markDirty();
    return full;
  }
  getObject(id) { return this.project.objects.find(o => o.id === id); }
  removeObject(id) {
    const i = this.project.objects.findIndex(o => o.id === id);
    if (i >= 0) {
      this.project.objects.splice(i, 1);
      if (this.selection === id) this.select(null);
      bus.emit('objects:changed');
      this.markDirty();
    }
  }

  // ---- scenes ----
  addScene(scene) {
    const full = { id: uid('scn'), name: 'Scene', note: '', mannequins: [], paths: [], ...scene };
    this.project.scenes.push(full);
    bus.emit('scenes:changed');
    this.markDirty();
    return full;
  }
  getScene(id) { return this.project.scenes.find(s => s.id === id); }
  get activeScene() { return this.getScene(this.project.settings.activeSceneId); }

  // ---- selection ----
  select(id) {
    this.selection = id;
    bus.emit('selection:changed', id);
  }

  replaceProject(p) {
    this.project = p;
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.selection = null;
    bus.emit('project:replaced');
  }
}

export const state = new State();
