// Your logos, kept on this device (IndexedDB) so they're there next time, like fonts and LUTs.
// One of them may be in use as the watermark; that choice is remembered too.
import { idbGet, idbSet } from "./store.js";

const KEY = "logos"; // stored: { current: id | null, items: [{ id, name, file }] }
export const logoLib = $state({ list: [], current: null }); // list: [{ id, name, url }]
let items = [];

const toEntry = (it) => ({ id: it.id, name: it.name, url: URL.createObjectURL(it.file) });
const persist = () => idbSet(KEY, { current: logoLib.current, items });

idbGet(KEY).then((saved) => {
  items = saved?.items ?? [];
  logoLib.list = items.map(toEntry);
  logoLib.current = saved?.current ?? null;
});

/** Adds a logo file (the same file twice is kept once) and starts using it. */
export function addLogo(file) {
  const same = items.find((i) => i.name === file.name && i.file.size === file.size);
  const id = same?.id ?? `logo_${Date.now()}`;
  if (!same) {
    const it = { id, name: file.name, file };
    items.push(it);
    logoLib.list.push(toEntry(it));
  }
  logoLib.current = id;
  persist();
  return id;
}

/** id: a saved logo, or null for no logo on the photo. */
export function useLogo(id) {
  logoLib.current = id;
  persist();
}

export function deleteLogo(id) {
  const entry = logoLib.list.find((l) => l.id === id);
  if (entry) URL.revokeObjectURL(entry.url);
  items = items.filter((i) => i.id !== id);
  logoLib.list = logoLib.list.filter((l) => l.id !== id);
  if (logoLib.current === id) logoLib.current = null;
  persist();
}
