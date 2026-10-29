// IndexedDB mínimo: un registro de estado + últimos 5 respaldos automáticos.
const DB = 'bitacora';
const KEY = 'main';
const MAX_BACKUPS = 5;
let dbp = null;
let memory = null; // respaldo en memoria si IndexedDB no está disponible

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) return reject(new Error('sin IndexedDB'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('state')) db.createObjectStore('state');
      if (!db.objectStoreNames.contains('backups')) db.createObjectStore('backups', { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx(store, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const out = fn(t.objectStore(store));
    t.oncomplete = () => resolve(out instanceof IDBRequest ? out.result : out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export async function load() {
  try {
    return (await tx('state', 'readonly', (s) => s.get(KEY))) || null;
  } catch {
    return memory;
  }
}

export async function saveNow(state) {
  clearTimeout(timer);
  timer = null;
  pending = null;
  const copy = structuredClone(state);
  try { await tx('state', 'readwrite', (s) => s.put(copy, KEY)); } catch { memory = copy; }
}

let timer = null;
let pending = null;
const listeners = new Set();
export const onSaved = (fn) => listeners.add(fn);

export function saveSoon(state) {
  pending = state;
  clearTimeout(timer);
  timer = setTimeout(() => saveNow(pending).then(() => listeners.forEach((fn) => fn())), 300);
}

export function flush() {
  if (pending) return saveNow(pending);
  return Promise.resolve();
}

export async function addBackup(state, reason) {
  const entry = { at: new Date().toISOString(), reason, state: structuredClone(state) };
  try {
    await tx('backups', 'readwrite', (s) => s.add(entry));
    const all = await listBackups();
    const extra = all.slice(MAX_BACKUPS);
    if (extra.length) await tx('backups', 'readwrite', (s) => extra.forEach((b) => s.delete(b.id)));
  } catch { /* sin IndexedDB no hay respaldos internos */ }
}

// Más recientes primero
export async function listBackups() {
  try {
    const all = await tx('backups', 'readonly', (s) => s.getAll());
    return all.sort((a, b) => b.id - a.id);
  } catch { return []; }
}

export async function clearAll() {
  clearTimeout(timer);
  pending = null;
  memory = null;
  try {
    await tx('state', 'readwrite', (s) => s.clear());
    await tx('backups', 'readwrite', (s) => s.clear());
  } catch { /* nada que borrar */ }
}
