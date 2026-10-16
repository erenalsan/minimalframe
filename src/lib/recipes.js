// Fujifilm "film recipes" → MinimalFrame edits.
// Photographers share in-camera recipes as plain text ("Film Simulation: Classic Chrome / Highlight: -1 / ...").
// parseRecipe() reads that text and maps each setting onto the develop sliders. Fujifilm's film simulations
// are proprietary, so the bases below are approximations of their character, not exact matches.
import { freshDev, MIXER_BANDS } from "./developEngine.js";

// Base look of each film simulation. Mixer luminance before the final desaturation acts like a B&W filter.
const SIMS = {
  provia: {},
  velvia: { saturation: 25, contrast: 12, vibrance: 10 },
  astia: { saturation: 10, contrast: -5, shadows: 10 },
  "classic chrome": {
    saturation: -22, contrast: 10, shadows: -10,
    curve: { b: [[0, 0.04], [1, 0.96]] },
    mixer: { blue: [-10, -15, -10], red: [0, -10, 0] },
  },
  "classic neg": {
    saturation: -10, contrast: 18, shadows: -15, temperature: -5,
    curve: { r: [[0, 0.03], [1, 0.97]], b: [[0, 0.05], [1, 0.95]] },
    mixer: { green: [10, -15, 0], yellow: [-8, 0, 0] },
  },
  "nostalgic neg": { temperature: 12, saturation: -5, highlights: -10, shadows: 10, mixer: { orange: [5, 10, 5] } },
  "pro neg hi": { saturation: -5, contrast: 10 },
  "pro neg std": { saturation: -12, contrast: -8 },
  "reala ace": { contrast: 8, vibrance: 8 },
  eterna: { saturation: -35, contrast: -22, shadows: 15, highlights: -10 },
  "eterna bleach bypass": { saturation: -60, contrast: 30, blacks: -10 },
  acros: { saturation: -100, contrast: 15, blacks: -8 },
  monochrome: { saturation: -100 },
  sepia: { saturation: -80, curve: { r: [[0, 0.1], [1, 1]], b: [[0, 0], [1, 0.75]] } },
};
// Black-and-white filter suffixes ("Acros+R", "Monochrome + Ye").
const BW_FILTERS = {
  r: { red: [0, 0, 20], orange: [0, 0, 10], blue: [0, 0, -25] },
  ye: { yellow: [0, 0, 15], orange: [0, 0, 8], blue: [0, 0, -15] },
  g: { green: [0, 0, 20], red: [0, 0, -10] },
};
const SIM_ALIASES = [
  [/bleach/, "eterna bleach bypass"],
  [/eterna/, "eterna"],
  [/nostalgic/, "nostalgic neg"],
  [/classic\s*neg/, "classic neg"],
  [/classic\s*chrome|^cc$/, "classic chrome"],
  [/pro\s*neg\.?\s*hi/, "pro neg hi"],
  [/pro\s*neg/, "pro neg std"],
  [/reala/, "reala ace"],
  [/velvia|vivid/, "velvia"],
  [/astia|soft/, "astia"],
  [/provia|standard/, "provia"],
  [/acros/, "acros"],
  [/sepia/, "sepia"],
  [/mono/, "monochrome"],
];

const WB_PRESETS = {
  auto: 0, "auto white priority": -5, "auto ambience priority": 8, "ambience priority": 8, "white priority": -5,
  daylight: 0, fine: 0, shade: 12, cloudy: 8, fluorescent: -10, incandescent: -25, tungsten: -25, underwater: 10,
};

// Slider ranges (see DEV_DEFAULTS).
const RANGE = { exposure: [-3, 3], sharpen: [0, 100], filmGrain: [0, 100], softBloom: [0, 100] };
const clamp = (k, v) => {
  const [lo, hi] = RANGE[k] ?? [-100, 100];
  return Math.min(hi, Math.max(lo, Math.round(v * 100) / 100));
};

// "+2/3", "-1", "0.5", "+1/3 to +2/3" → first number.
function num(s) {
  const m = /([-+]?\d+(?:\.\d+)?)(?:\s*\/\s*(\d+))?/.exec(s ?? "");
  if (!m) return null;
  return m[2] ? Number(m[1]) / Number(m[2]) : Number(m[1]);
}
const strength = (s) => (/strong/i.test(s) ? 2 : /weak/i.test(s) ? 1 : /auto/i.test(s) ? 1 : 0);

/**
 * @param {string} text  a recipe as people share it, one "Setting: value" per line
 * @returns {{ name: string, sim: string|null, params: object, ignored: string[] }}  params: a full develop object
 */
export function parseRecipe(text) {
  const p = freshDev();
  const add = (k, v) => (p[k] = clamp(k, p[k] + v));
  const addMixer = (bands) => {
    for (const [band, vals] of Object.entries(bands)) {
      p.mixer[band] = p.mixer[band].map((v, i) => Math.min(100, Math.max(-100, v + vals[i])));
    }
  };
  let name = "";
  let sim = null;
  const ignored = [];

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^([^:]+):\s*(.*)$/.exec(line);
    if (!m) {
      if (!name) name = line.replace(/\s*(film\s*)?recipe$/i, "");
      continue;
    }
    const key = m[1].trim().toLowerCase();
    const val = m[2].trim();
    const lv = val.toLowerCase();

    if (/film\s*sim/.test(key)) {
      sim = SIM_ALIASES.find(([re]) => re.test(lv))?.[1] ?? null;
      if (!sim) { ignored.push(line); continue; }
      const base = SIMS[sim];
      for (const [k, v] of Object.entries(base)) if (typeof v === "number") add(k, v);
      for (const [ch, pts] of Object.entries(base.curve ?? {})) p.curve[ch] = pts;
      addMixer(base.mixer ?? {});
      const filter = /\+\s*(r|ye|g)\b/.exec(lv)?.[1];
      if (filter && (sim === "acros" || sim === "monochrome")) addMixer(BW_FILTERS[filter]);
    } else if (key === "dynamic range" || key === "dr") {
      const dr = num(lv.replace(/^dr/, "")) ?? (lv.includes("auto") ? 200 : 100);
      const stops = Math.log2(Math.max(100, dr) / 100);
      add("highlights", -12 * stops);
      add("shadows", 5 * stops);
    } else if (/priority/.test(key)) {
      const s = strength(lv);
      add("highlights", -15 * s);
      add("shadows", 10 * s);
    } else if (key === "tone curve") {
      // "H+1 S-1", "+1H, -0.5S"
      // Scanned left to right so "H+1 S-1" never pairs S with H's number.
      for (const t of lv.matchAll(/([hs])\s*([-+]?\d+(?:\.\d+)?)|([-+]?\d+(?:\.\d+)?)\s*([hs])\b/g)) {
        const which = t[1] ?? t[4];
        const v = Number(t[2] ?? t[3]);
        if (which === "h") add("highlights", 12 * v);
        else add("shadows", -12 * v);
      }
    } else if (/^highlights?( tone)?$/.test(key)) {
      add("highlights", 12 * (num(lv) ?? 0)); // Fujifilm +: brighter, harder highlights
    } else if (/^shadows?( tone)?$/.test(key)) {
      add("shadows", -12 * (num(lv) ?? 0)); // Fujifilm +: deeper shadows
    } else if (key === "color" || key === "colour" || key === "saturation") {
      add("saturation", 8 * (num(lv) ?? 0));
    } else if (/white balance|^wb$/.test(key)) {
      const [preset, ...shift] = val.split(/,/);
      const kelvin = /(\d{4,5})\s*k/i.exec(preset);
      if (kelvin) add("temperature", Math.max(-60, Math.min(60, (Number(kelvin[1]) - 5500) / 60)));
      else add("temperature", WB_PRESETS[preset.trim().toLowerCase()] ?? 0);
      const rest = shift.join(",");
      const r = /([-+]?\d+)\s*(?:r\b|red)/i.exec(rest);
      const b = /([-+]?\d+)\s*(?:b\b|blue)/i.exec(rest);
      const R = r ? Number(r[1]) : 0;
      const B = b ? Number(b[1]) : 0;
      add("temperature", (R - B) * 4); // red up / blue down = warmer
      add("tint", (R + B) * 2.5); // red and blue together = magenta
    } else if (/color chrome (fx|effect) blue/.test(key)) {
      const s = strength(lv);
      addMixer({ blue: [0, 8 * s, -8 * s] });
    } else if (/color chrome/.test(key)) {
      const s = strength(lv);
      add("saturation", 4 * s);
      add("contrast", 3 * s);
    } else if (/grain/.test(key)) {
      const s = strength(lv);
      if (s) add("filmGrain", 15 * s + (/large/i.test(lv) ? 10 : 0));
    } else if (key === "clarity") {
      add("clarity", 10 * (num(lv) ?? 0));
    } else if (/sharp/.test(key)) {
      add("sharpen", 12 * Math.max(0, num(lv) ?? 0));
    } else if (/exposure/.test(key)) {
      add("exposure", num(lv) ?? 0);
    } else {
      ignored.push(line); // noise reduction, ISO, … have no equivalent here
    }
  }
  for (const band of MIXER_BANDS) p.mixer[band] = p.mixer[band].map((v) => Math.round(v));
  return { name, sim, params: p, ignored };
}
