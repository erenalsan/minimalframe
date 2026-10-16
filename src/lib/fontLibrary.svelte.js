// Fonts the user adds: installed ones (Chrome/Edge desktop) or uploaded files (every platform).
// Both are remembered on this device (IndexedDB), so templates that use them keep working.
import { idbGet, idbSet } from "./store.js";
import { SYSTEM_FONTS } from "./catalog.js";

const KEY = "fonts"; // [{ kind: "file", family, buffer } | { kind: "local", family }]
const custom = $state({ list: [] }); // [{ id, label, css }]

/** Every font to choose from: added ones first, then the bundled and system ones. */
export const allFonts = () => [...custom.list, ...SYSTEM_FONTS];

export async function rememberFont(entry) {
  const saved = (await idbGet(KEY)) ?? [];
  await idbSet(KEY, [...saved.filter((f) => f.family !== entry.family), entry]);
}

export async function registerFile(family, buffer) {
  const face = new FontFace(`mf-${family}`, buffer);
  document.fonts.add(await face.load());
  return { id: `file:${family}`, label: family, css: `"mf-${family}"` };
}

/** Adds a font to the list (once) and returns its id. */
export function addFont(id, label, css) {
  if (!custom.list.some((f) => f.id === id)) custom.list = [{ id, label, css }, ...custom.list];
  return id;
}

// Bring back fonts from earlier sessions without selecting them.
idbGet(KEY).then(async (saved = []) => {
  const restored = [];
  for (const f of saved) {
    try {
      restored.push(f.kind === "file" ? await registerFile(f.family, f.buffer) : { id: `local:${f.family}`, label: f.family, css: `"${f.family}"` });
    } catch {} // a font that no longer loads is skipped
  }
  custom.list = [...restored.filter((r) => !custom.list.some((c) => c.id === r.id)), ...custom.list];
});
