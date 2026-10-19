// Every interface text has a Turkish and a German version, with the same {placeholders}, and the
// dictionaries hold nothing the app no longer uses. Run with I18N_DUMP=1 to print the keys.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import tr from './locales/tr.js';
import de from './locales/de.js';
import { TOOLS, TOOL_HINTS, LOOKS, RATIOS, EXIF_FIELDS, BUILTIN_PRESETS, EXPORT_SIZES, SYSTEM_FONTS } from './catalog.js';
import { CROP_RATIOS } from './geometry.js';

const files = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? (f === 'locales' ? [] : files(p)) : /\.(svelte|js)$/.test(f) && !f.endsWith('.test.js') ? [p] : [];
});
const keys = new Set();
const unescape = (s) => JSON.parse(`"${s}"`);
for (const f of files(new URL('..', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/\bt\(\s*"((?:[^"\\]|\\.)*)"/g)) keys.add(unescape(m[1]));
  // ternaries inside t(cond ? "a" : "b")
  for (const m of src.matchAll(/\bt\(\s*[\w.!=" ]+\?\s*"((?:[^"\\]|\\.)*)"\s*:\s*"((?:[^"\\]|\\.)*)"/g)) keys.add(unescape(m[1])).add(unescape(m[2]));
  // texts kept in data and translated where shown: t(s.label), t(p.alt)…
  if (/DevelopSliders|Landing/.test(f)) for (const m of src.matchAll(/\b(?:label|hint|note|alt): "((?:[^"\\]|\\.)+)"/g)) keys.add(unescape(m[1]));
}
// names from the catalog, the export sheet and the curve / mixer tools, shown through t(name)
for (const [, name] of [...TOOLS.editor, ...TOOLS.framing]) keys.add(name);
for (const h of Object.values(TOOL_HINTS)) keys.add(h);
for (const l of LOOKS) keys.add(l.name);
for (const r of RATIOS) keys.add(r.label);
for (const [, name] of EXIF_FIELDS) keys.add(name);
for (const p of BUILTIN_PRESETS) keys.add(p.name);
for (const s of EXPORT_SIZES) keys.add(s.label);
for (const f of SYSTEM_FONTS) if (['system', 'serif', 'mono'].includes(f.id)) keys.add(f.label);
for (const r of CROP_RATIOS) if (/[a-z]/i.test(r.label)) keys.add(r.label);
for (const k of ['Good', 'High', 'Max', 'RGB', 'Red', 'Orange', 'Yellow', 'Green', 'Aqua', 'Blue', 'Purple', 'Magenta']) keys.add(k);
keys.delete('');

if (process.env.I18N_DUMP) {
  console.log(JSON.stringify([...keys].filter((k) => !(k in tr) || !(k in de)), null, 1));
  process.exit(0);
}
const holes = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
for (const [name, dict] of [['tr', tr], ['de', de]]) {
  const missing = [...keys].filter((k) => !(k in dict));
  assert.deepEqual(missing, [], `${name} is missing translations`);
  const unused = Object.keys(dict).filter((k) => !keys.has(k));
  assert.deepEqual(unused, [], `${name} has translations nothing uses`);
  for (const [k, v] of Object.entries(dict)) assert.equal(holes(v), holes(k), `${name}: placeholders differ in "${k}"`);
}
console.log(`i18n: ${keys.size} texts in Turkish and German OK`);
