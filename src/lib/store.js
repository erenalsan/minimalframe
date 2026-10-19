/**
 * store.js — tiny IndexedDB key/value store for things too big for localStorage (uploaded fonts, LUTs,
 * the open photos of the last session).
 * Every call fails soft: private windows and blocked storage just mean nothing is remembered.
 */
const DB = 'minimalframe';
const STORE = 'kv';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
  });
}

export const idbGet = (key) => run('readonly', (s) => s.get(key)).catch(() => undefined);
export const idbSet = (key, value) => run('readwrite', (s) => s.put(value, key)).catch(() => undefined);
export const idbDel = (key) => run('readwrite', (s) => s.delete(key)).catch(() => undefined);
export const idbKeys = () => run('readonly', (s) => s.getAllKeys()).catch(() => []);
