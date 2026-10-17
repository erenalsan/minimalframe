// Camera-maker logos for the brand bar (files in public/brands/).
// Source: Wikimedia Commons — Sony_logo.svg, Sony_Alpha_logo.svg, Canon_wordmark.svg, Nikon_Logo.svg,
// Fujifilm_logo.svg, Leica_Camera_logo.svg, Lumix_logo.svg, OM-System-Logo.svg, Ricoh_logo_2005.svg,
// Pentax_Logo.svg, Hasselblad_logo.svg. The artwork is public domain, but every logo is a trademark of its
// owner; they're only used to say which camera took the photo.
import { cameraBrand, cleanCamera } from "./exifCleaner.js";

// aspect: width / height of the artwork. height: drawn height relative to the caption's first-line text size
// (badges like Nikon's are drawn taller than wordmarks so they read at the same weight).
// tint: a black wordmark that takes the caption colour (white on dark frames); badges keep their own colours.
const LOGOS = {
  sony: { aspect: 1280 / 225, height: 0.9, tint: true },
  "sony-alpha": { aspect: 290 / 207, height: 1.3 },
  canon: { aspect: 1000 / 209, height: 1.15 },
  nikon: { aspect: 1, height: 2.1 },
  fujifilm: { aspect: 1029 / 171, height: 0.85, tint: true },
  leica: { aspect: 1, height: 2.1 },
  lumix: { aspect: 500 / 114, height: 0.9, tint: true },
  omsystem: { aspect: 1, height: 2.1 },
  ricoh: { aspect: 200 / 36, height: 0.9 },
  pentax: { aspect: 662 / 133, height: 0.95 },
  hasselblad: { aspect: 512 / 48, height: 0.6, tint: true },
};
// Panasonic's cameras carry the LUMIX name.
const BY_BRAND = {
  Sony: "sony", Canon: "canon", Nikon: "nikon", Fujifilm: "fujifilm", Leica: "leica", Panasonic: "lumix",
  "OM System": "omsystem", Ricoh: "ricoh", Pentax: "pentax", Hasselblad: "hasselblad",
};

/**
 * What the brand bar shows for a camera: its maker's logo (Sony Alpha bodies add the α), or the maker's
 * name as text when there's no logo file.
 * @returns {{ text: string, parts: { name: string, aspect: number, height: number, tint?: boolean }[] }}
 */
export function brandMark(model) {
  const brand = cameraBrand(model);
  const key = BY_BRAND[brand];
  if (!key) return { text: brand.toUpperCase(), parts: [] };
  const parts = [{ name: key, ...LOGOS[key] }];
  // The orange α is the full-frame Alpha mark: A7 (every variant), A1, A9. APS-C bodies (A6000 series) don't
  // get it. cleanCamera turns ILCE-7M3 into "Sony A7 III", ILCE-6400 into "Sony A6400".
  if (key === "sony" && /^Sony A(?:1|7|9)(?!\d)/.test(cleanCamera(model))) parts.push({ name: "sony-alpha", ...LOGOS["sony-alpha"] });
  return { text: brand.toUpperCase(), parts };
}
