// The recipe a Fujifilm camera saved inside its JPEG (its MakerNote), as recipe text for parseRecipe():
// film simulation, dynamic range, tone, colour, white balance and its shift, grain, Color Chrome, clarity,
// sharpness. Tag numbers and values as documented by ExifTool's FujiFilm tables.
import * as exifrModule from "exifr";

const parseExif = exifrModule.parse ?? exifrModule.default?.parse;

const FILM = {
  0x000: "Provia", 0x120: "Astia", 0x200: "Velvia", 0x400: "Velvia", 0x500: "Pro Neg. Std", 0x501: "Pro Neg. Hi",
  0x600: "Classic Chrome", 0x700: "Eterna", 0x800: "Classic Negative", 0x900: "Eterna Bleach Bypass",
  0xa00: "Nostalgic Neg", 0xb00: "Reala Ace",
};
// Saturation (0x1003) is the colour setting, or the black-and-white mode.
const COLOR = { 0x0: 0, 0x80: 1, 0x100: 2, 0xc0: 3, 0xe0: 4, 0x180: -1, 0x400: -2, 0x200: -2, 0x4c0: -3, 0x4e0: -4 };
const MONO = {
  0x300: "Monochrome", 0x301: "Monochrome + R", 0x302: "Monochrome + Ye", 0x303: "Monochrome + G", 0x310: "Sepia",
  0x500: "Acros", 0x501: "Acros + R", 0x502: "Acros + Ye", 0x503: "Acros + G",
};
const WB = {
  0x0: "Auto", 0x1: "Auto Ambience Priority", 0x2: "Auto White Priority", 0x100: "Daylight", 0x200: "Cloudy",
  0x300: "Fluorescent", 0x301: "Fluorescent", 0x302: "Fluorescent", 0x303: "Fluorescent", 0x304: "Fluorescent",
  0x400: "Incandescent", 0x600: "Underwater",
};
const SHARP = { 0x0: -4, 0x1: -3, 0x2: -2, 0x82: -1, 0x3: 0, 0x84: 1, 0x4: 2, 0x5: 3, 0x6: 4 };
const STRENGTH = { 0: "Off", 32: "Weak", 64: "Strong" };
const signed = (n) => (n > 0 ? `+${n}` : `${n}`);

/** Reads the MakerNote's tags: { tag: number | number[] }. Offsets are from the MakerNote's start. */
function readTags(mn) {
  const dv = new DataView(mn.buffer, mn.byteOffset, mn.byteLength);
  const tags = {};
  const ifd = dv.getUint32(8, true);
  if (ifd + 2 > mn.length) return tags;
  const count = dv.getUint16(ifd, true);
  const size = { 3: 2, 4: 4, 8: 2, 9: 4 };
  for (let i = 0; i < count; i++) {
    const at = ifd + 2 + i * 12;
    if (at + 12 > mn.length) break;
    const tag = dv.getUint16(at, true), type = dv.getUint16(at + 2, true), n = dv.getUint32(at + 4, true);
    if (!size[type] || n < 1 || n > 4) continue; // only the small numbers we need
    let p = size[type] * n > 4 ? dv.getUint32(at + 8, true) : at + 8;
    if (p + size[type] * n > mn.length) continue;
    const vals = [];
    for (let k = 0; k < n; k++, p += size[type]) {
      vals.push(type === 3 ? dv.getUint16(p, true) : type === 4 ? dv.getUint32(p, true) : type === 8 ? dv.getInt16(p, true) : dv.getInt32(p, true));
    }
    tags[tag] = n === 1 ? vals[0] : vals;
  }
  return tags;
}

/**
 * @param {Uint8Array} mn  the MakerNote bytes (exifr: { makerNote: true })
 * @param {string} [name]  a first line naming the recipe
 * @returns {string | null} recipe text, or null when it isn't a Fujifilm MakerNote
 */
export function fujiRecipeText(mn, name = "") {
  if (!(mn instanceof Uint8Array) || mn.length < 14 || new TextDecoder().decode(mn.subarray(0, 8)) !== "FUJIFILM") return null;
  let t;
  try {
    t = readTags(mn);
  } catch {
    return null;
  }
  const lines = name ? [name] : [];
  const sat = t[0x1003];
  if (MONO[sat]) lines.push(`Film Simulation: ${MONO[sat]}`);
  else if (FILM[t[0x1401]]) lines.push(`Film Simulation: ${FILM[t[0x1401]]}`);
  if (t[0x1403] >= 100) lines.push(`Dynamic Range: DR${t[0x1403]}`);
  if (Number.isInteger(t[0x1041])) lines.push(`Highlight: ${signed(-t[0x1041] / 16)}`);
  if (Number.isInteger(t[0x1040])) lines.push(`Shadow: ${signed(-t[0x1040] / 16)}`);
  if (sat in COLOR) lines.push(`Color: ${signed(COLOR[sat])}`);
  if (t[0x1002] !== undefined) {
    const kelvin = t[0x1002] === 0xff0 && t[0x1005] ? `${t[0x1005]}K` : null;
    let wb = kelvin ?? WB[t[0x1002]] ?? "Auto";
    const fine = t[0x100a];
    if (Array.isArray(fine) && fine.length === 2) {
      const [r, b] = fine.map((v) => (Math.abs(v) > 9 ? Math.round(v / 20) : v)); // newer cameras store steps × 20
      if (r || b) wb += `, ${signed(r)} Red & ${signed(b)} Blue`;
    }
    lines.push(`White Balance: ${wb}`);
  }
  if (t[0x1047] in STRENGTH && t[0x1047] > 0) lines.push(`Grain Effect: ${STRENGTH[t[0x1047]]}${t[0x104c] === 32 ? ", Large" : t[0x104c] === 16 ? ", Small" : ""}`);
  if (t[0x1048] in STRENGTH) lines.push(`Color Chrome Effect: ${STRENGTH[t[0x1048]]}`);
  if (t[0x104e] in STRENGTH) lines.push(`Color Chrome FX Blue: ${STRENGTH[t[0x104e]]}`);
  if (Number.isInteger(t[0x100f])) lines.push(`Clarity: ${signed(Math.round(t[0x100f] / 1000))}`);
  if (t[0x1001] in SHARP) lines.push(`Sharpness: ${signed(SHARP[t[0x1001]])}`);
  return lines.length > (name ? 1 : 0) ? lines.join("\n") : null;
}

/**
 * The recipe in a Fujifilm photo (a File, Blob or ArrayBuffer), named after the camera; null for other cameras,
 * or Fujifilm photos without a film simulation (older compacts), where there's no recipe to speak of.
 */
export async function recipeFromPhoto(data) {
  const buf = data instanceof Blob ? await data.arrayBuffer() : data;
  const e = await parseExif(buf, { makerNote: true }).catch(() => null);
  if (!/fujifilm/i.test(e?.Make ?? "")) return null;
  const text = fujiRecipeText(e.makerNote, String(e.Model ?? "Fujifilm").trim());
  return /Film Simulation/.test(text ?? "") ? text : null;
}
