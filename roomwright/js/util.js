// Small shared helpers.

let idCounter = Math.floor(Math.random() * 1e6);
export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${(idCounter++).toString(36)}`;
}

export function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

export function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

export function fmt(n, digits = 2) {
  return Number(n).toFixed(digits).replace(/\.?0+$/, '') || '0';
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

// Tiny event bus.
const listeners = new Map();
export const bus = {
  on(evt, fn) {
    if (!listeners.has(evt)) listeners.set(evt, new Set());
    listeners.get(evt).add(fn);
    return () => listeners.get(evt).delete(fn);
  },
  emit(evt, data) {
    (listeners.get(evt) || []).forEach(fn => { try { fn(data); } catch (e) { console.error(`bus:${evt}`, e); } });
  }
};

export function status(msg, ms = 4000) {
  const elx = document.getElementById('status-msg');
  if (!elx) return;
  elx.textContent = msg;
  clearTimeout(status._t);
  if (ms) status._t = setTimeout(() => { elx.textContent = ''; }, ms);
}

export function download(filename, text, mime = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
