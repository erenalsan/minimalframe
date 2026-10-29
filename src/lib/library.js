// Reading a shared/backed-up library file (your templates and looks).
// Imported files are untrusted: keep only known keys whose type matches the app's own values.
import { DEV_DEFAULTS, MIXER_BANDS, freshDev } from "./developEngine.js";

const cleanLabel = (v) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 60) : "Imported");
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isPoints = (v) =>
  Array.isArray(v) && v.length >= 2 && v.length <= 16 && v.every((p) => Array.isArray(p) && p.length === 2 && p.every((n) => isNum(n) && n >= 0 && n <= 1));

export function sanitizeDev(d) {
  const out = freshDev();
  if (!d || typeof d !== "object") return out;
  for (const [k, v] of Object.entries(DEV_DEFAULTS)) if (typeof v === "number" && isNum(d[k])) out[k] = d[k];
  if (typeof d.lut === "string" && /^lut_[\w]{1,40}$/.test(d.lut)) out.lut = d.lut; // only works if that LUT is on this device
  for (const ch of ["rgb", "r", "g", "b"]) if (isPoints(d.curve?.[ch])) out.curve[ch] = d.curve[ch];
  for (const band of MIXER_BANDS) {
    const m = d.mixer?.[band];
    if (Array.isArray(m) && m.length === 3 && m.every(isNum)) out.mixer[band] = m;
  }
  return out;
}

/** @param shape  the app's current frame settings (frameSnapshot()), used as the list of allowed keys and types */
export function sanitizeTemplate(t, shape) {
  const out = { name: cleanLabel(t?.name) };
  if (!t || typeof t !== "object") return out;
  for (const [k, v] of Object.entries(shape)) {
    if (k === "exifDisplay") continue;
    // a setting that is empty by default (filmStyle: null) takes a name or stays empty
    if (v === null ? t[k] === null || typeof t[k] === "string" : typeof v === "number" ? isNum(t[k]) : typeof t[k] === typeof v) out[k] = t[k];
  }
  if (t.exifDisplay && typeof t.exifDisplay === "object") {
    out.exifDisplay = Object.fromEntries(
      Object.keys(shape.exifDisplay).filter((k) => typeof t.exifDisplay[k] === "boolean").map((k) => [k, t.exifDisplay[k]]),
    );
  }
  if (t.dev) out.dev = sanitizeDev(t.dev);
  return out;
}

/**
 * @param {unknown} data  parsed JSON of a library file
 * @param {object} shape  frameSnapshot(), see sanitizeTemplate
 * @param {number} stamp  makes fresh ids, so importing twice (or on top of your own) never overwrites anything
 * @returns {{ templates: object[], looks: object[] }}
 */
export function parseLibrary(data, shape, stamp = Date.now()) {
  if (data?.app !== "MinimalFrame") throw new Error("not a MinimalFrame library file");
  const list = (v) => (Array.isArray(v) ? v.slice(0, 500) : []);
  return {
    templates: list(data.templates).map((t, i) => ({ ...sanitizeTemplate(t, shape), id: `preset_user_${stamp}_${i}` })),
    looks: list(data.looks).map((l, i) => ({ id: `look_user_${stamp}_${i}`, name: cleanLabel(l?.name), params: sanitizeDev(l?.params) })),
  };
}
