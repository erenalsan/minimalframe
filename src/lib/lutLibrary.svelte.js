// Imported .cube LUTs, kept on this device (IndexedDB, with their colour data). Edits refer to them by id.
// Loaded at startup, so photos that use a LUT develop correctly before the Looks tool is ever opened.
import { idbGet, idbSet } from "./store.js";
import { t } from "./i18n.svelte.js";
import { parseCube } from "./lut.js";
import { registerLut, unregisterLut } from "./developEngine.js";

const KEY = "luts";
export const lutLib = $state({ list: [] }); // [{ id, name }]

idbGet(KEY).then((saved) => {
  for (const l of saved ?? []) registerLut(l.id, l);
  lutLib.list = (saved ?? []).map(({ id, name }) => ({ id, name }));
});

/** @returns {Promise<{ ids: string[], errors: string[] }>} */
export async function importLutFiles(files) {
  const saved = (await idbGet(KEY)) ?? [];
  const ids = [];
  const errors = [];
  for (const [i, file] of files.entries()) {
    try {
      const parsed = parseCube(await file.text());
      const entry = { id: `lut_${Date.now()}_${i}`, name: parsed.title || file.name.replace(/\.cube$/i, ""), ...parsed };
      registerLut(entry.id, entry);
      saved.push(entry);
      lutLib.list.push({ id: entry.id, name: entry.name });
      ids.push(entry.id);
    } catch (err) {
      errors.push(t("Could not read {name}: {error}", { name: file.name, error: err.message }));
    }
  }
  await idbSet(KEY, saved);
  return { ids, errors };
}

export async function deleteLut(id) {
  unregisterLut(id);
  lutLib.list = lutLib.list.filter((l) => l.id !== id);
  await idbSet(KEY, ((await idbGet(KEY)) ?? []).filter((l) => l.id !== id));
}
