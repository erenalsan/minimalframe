// Built-in data: tools, icons, looks, frame templates, ratios, fonts and export presets.
// Plain values only; App.svelte owns all state.
import { freshDev } from "./developEngine.js";
import { parseRecipe } from "./recipes.js";

/**
 * The frame's ratio, with the carousel worked out: n slides of 4:5 (or 1:1) side by side.
 * @returns {{ id: string, label: string, w?: number, h?: number, slices?: number } | undefined}
 */
export function frameRatio(frame) {
  const r = RATIOS.find((x) => x.id === frame.selectedRatioId);
  if (r?.id !== "carousel") return r;
  const n = Math.min(10, Math.max(2, Math.round(frame.slides) || 3));
  const [w, h] = frame.slideShape === "1:1" ? [1, 1] : [4, 5];
  return { ...r, w: w * n, h, slices: n };
}

// Caption x position (textPosX) that matches each alignment.
export const ALIGN_X = { left: 0, center: 50, right: 100 };

// One tool panel open at a time per mode, like a camera's quick menu.
export const TOOLS = {
  editor: [
    ["looks", "Looks"], ["crop", "Crop"], ["light", "Light"], ["color", "Color"],
    ["curve", "Curve"], ["mixer", "Mixer"], ["detail", "Detail"], ["film", "Film"],
  ],
  framing: [
    ["templates", "Templates"], ["ratio", "Ratio"], ["border", "Border"], ["colors", "Colors"],
    ["caption", "Caption"], ["position", "Position"], ["logo", "Logo"],
  ],
};

// One line under the tabs, so every tool explains itself.
export const TOOL_HINTS = {
  looks: "One-tap film looks. Tap again to fine-tune with the other tools.",
  crop: "Crop, straighten and rotate. Drag the box or its corners.",
  light: "Brightness and tone: exposure, contrast and recovery of skies and shadows.",
  color: "White balance and how colorful the photo is.",
  curve: "Advanced tone control. Tap to add points, drag to shape.",
  mixer: "Change the hue, saturation or brightness of a single color.",
  detail: "Texture and sharpness.",
  film: "Analog grain and a soft glow.",
  templates: "Ready-made frame styles. Tap one, then adjust anything.",
  ratio: "Frame shape for each platform: feed, story, carousel or print.",
  border: "How much frame goes around the photo.",
  colors: "Frame and text colors, including ones picked from your photo.",
  caption: "Camera details, date and a note under the photo.",
  position: "Where the caption sits and how it is aligned.",
  logo: "Add your signature or logo as a watermark.",
};

// 24×24 stroke icons for the tool tabs.
export const ICONS = {
  looks: "M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z",
  light: "M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  color: "M12 3s6 6.4 6 11a6 6 0 01-12 0c0-4.6 6-11 6-11z",
  film: "M4 4h16v16H4zM8 4v16M16 4v16M4 8h4M4 12h4M4 16h4M16 8h4M16 12h4M16 16h4",
  templates: "M4 4h16v16H4zM4 10h16M10 10v10",
  ratio: "M4 5h16v14H4zM4 5l16 14",
  crop: "M6 2v14a2 2 0 002 2h14M2 6h14a2 2 0 012 2v14",
  curve: "M3 3v18h18M3 20C9 20 10 5 21 4",
  mixer: "M4 6h9M17 6h3M4 12h3M11 12h9M4 18h12M20 18h0M15 4v4M9 10v4M18 16v4",
  detail: "M12 2v4M12 18v4M2 12h4M18 12h4M12 8a4 4 0 100 8 4 4 0 000-8z",
  undo: "M9 14L4 9l5-5M4 9h11a5 5 0 010 10h-3",
  redo: "M15 14l5-5-5-5M20 9H9a5 5 0 000 10h3",
  compare: "M12 3v18M4 4h16v16H4z",
  share: "M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M16 6l-4-4-4 4M12 2v13",
  border: "M3 3h18v18H3zM7 7h10v10H7z",
  colors: "M12 3a9 9 0 100 18c1.1 0 1.6-.8 1.6-1.6 0-.9-.7-1.3-.7-2.2 0-1 .8-1.8 1.8-1.8H17a4 4 0 004-4C21 6.8 17 3 12 3zM7.5 12h.01M9.5 7.5h.01M14.5 7.5h.01",
  caption: "M5 7V5h14v2M12 5v14M9 19h6",
  position: "M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3",
  logo: "M12 7a5 5 0 100 10 5 5 0 000-10zM12 2a10 10 0 100 20 10 10 0 000-20z",
  export: "M12 3v12M7 10l5 5 5-5M5 21h14",
  add: "M12 5v14M5 12h14",
  globe: "M12 3a9 9 0 100 18 9 9 0 000-18zM3.5 9h17M3.5 15h17M12 3c-2.4 2.5-3.6 5.5-3.6 9s1.2 6.5 3.6 9M12 3c2.4 2.5 3.6 5.5 3.6 9s-1.2 6.5-3.6 9",
  upload: "M12 15V4M7 9l5-5 5 5M4 15v4a1 1 0 001 1h14a1 1 0 001-1v-4",
  revert: "M4 12a8 8 0 102.3-5.6M4 4v4.5h4.5",
  "theme-auto": "M12 3a9 9 0 100 18 9 9 0 000-18zM12 3v18",
  "theme-light": "M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  "theme-dark": "M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z",
  check: "M5 12.5l4.5 4.5L19 7.5",
};

export const EXIF_FIELDS = [
  ["model", "Camera", "Sony A7 IV"],
  ["lens", "Lens", "FE 35mm F1.8"],
  ["focalLength", "Focal length", "35mm"],
  ["aperture", "Aperture", "ƒ/1.8"],
  ["shutterSpeed", "Shutter", "1/250s"],
  ["iso", "ISO", "ISO 100"],
  ["date", "Date", "16 Oct 2026"],
  ["note", "Note", "Kyoto, spring"],
];

export const QUICK_BACKGROUNDS = ["#ffffff", "#f1eee8", "#7d7d7a", "#000000"];

export const CURVE_COLORS = { rgb: "#ffffff", r: "#ff6b6b", g: "#6bdc7a", b: "#6b9bff" };

export const MIXER_SWATCH = {
  red: "#ff4d4d", orange: "#ff9a3c", yellow: "#ffe14d", green: "#4fd16b",
  aqua: "#3fd6d0", blue: "#4d7dff", purple: "#9b5cff", magenta: "#ff4dc4",
};

const look = (id, name, params) => ({ id, name, params: { ...freshDev(), ...params } });

export const LOOKS = [
  look("none", "Original", {}),
  look("raw-fix", "RAW lift", { exposure: 0.25, contrast: 15, highlights: -20, shadows: 25, vibrance: 20 }),
  look("vivid", "Vivid", { contrast: 20, whites: 10, vibrance: 35, saturation: 10 }),
  look("warm", "Golden", { exposure: 0.15, temperature: 35, tint: 8, shadows: 15, vibrance: 20, filmGrain: 10, softBloom: 15 }),
  look("blue", "Blue hour", { temperature: -35, tint: -5, contrast: 15, highlights: -20, shadows: 10, vibrance: 10 }),
  look("soft", "Soft film", { exposure: 0.1, contrast: -10, highlights: -25, shadows: 20, temperature: 12, tint: 6, vibrance: -10, filmGrain: 18, softBloom: 10 }),
  look("fade", "Fade", { contrast: -20, blacks: 30, temperature: 8, saturation: -15, filmGrain: 15 }),
  look("moody", "Moody", { exposure: -0.3, contrast: 25, highlights: -30, blacks: -15, temperature: -15, saturation: -20, filmGrain: 25, softBloom: 30 }),
  look("bw-contrast", "Silver", { contrast: 35, whites: 10, blacks: -10, saturation: -100, filmGrain: 20 }),
  look("r-chrome", "Chrome film", parseRecipe("Film Simulation: Classic Chrome\nDynamic Range: DR200\nHighlight: -1\nShadow: +1\nColor: +1\nGrain Effect: Weak, Small\nWhite Balance: Daylight, +2 Red & -3 Blue").params),
  look("r-neg", "Street neg", parseRecipe("Film Simulation: Classic Negative\nHighlight: -1\nShadow: +0.5\nColor: +2\nClarity: -2\nGrain Effect: Weak, Large\nWhite Balance: Auto, +1 Red & -2 Blue").params),
  look("r-eterna", "Cinema", parseRecipe("Film Simulation: Eterna\nDynamic Range: DR400\nShadow: +1\nColor: +1\nWhite Balance: Auto, -1 Red & +1 Blue").params),
  look("r-acros", "Acros red", parseRecipe("Film Simulation: Acros+R\nHighlight: +1\nShadow: +2\nGrain Effect: Strong, Small").params),
];

export const RATIOS = [
  { id: "4:5", label: "Feed portrait", w: 4, h: 5 },
  { id: "1:1", label: "Feed square", w: 1, h: 1 },
  { id: "9:16", label: "Story & Reel", w: 9, h: 16 },
  { id: "orig", label: "Photo + caption", w: null, h: null },
  { id: "custom", label: "Even border", w: null, h: null },
  { id: "3:2", label: "Print 3:2", w: 3, h: 2 },
  { id: "16:9", label: "Wide 16:9", w: 16, h: 9 },
  // One wide frame cut into seamless slides for a swipeable Instagram carousel (see frameRatio).
  { id: "carousel", label: "Carousel" },
];

// Bundled fonts (see fonts.js) work offline; "system", "serif" and "mono" use what every device has.
// Unknown ids from older saved presets fall back to the first entry.
export const SYSTEM_FONTS = [
  { id: "archivo", label: "Archivo", css: '"Archivo Variable", system-ui, sans-serif' },
  { id: "montserrat", label: "Montserrat", css: '"Montserrat", sans-serif' },
  { id: "bebas", label: "Bebas Neue", css: '"Bebas Neue", sans-serif' },
  { id: "dmserif", label: "DM Serif", css: '"DM Serif Display", serif' },
  { id: "playfair", label: "Playfair", css: '"Playfair Display", serif' },
  { id: "cormorant", label: "Cormorant", css: '"Cormorant Garamond", serif' },
  { id: "spacemono", label: "Space Mono", css: '"Space Mono", monospace' },
  { id: "caveat", label: "Caveat", css: '"Caveat", cursive' },
  { id: "system", label: "System", css: "system-ui, -apple-system, sans-serif" },
  { id: "serif", label: "Serif", css: 'Georgia, "Noto Serif", serif' },
  { id: "mono", label: "Typewriter", css: '"Courier New", "Droid Sans Mono", monospace' },
];

// Built-in frame templates. Develop settings (grain, bloom) are only set where they define the style.
const tpl = (id, name, fields) => ({
  id: `preset_${id}`,
  name,
  customMarginH: 8,
  customMarginV: 8,
  captionSpace: 12,
  autoContrast: true,
  textZone: "bottom",
  textPosY: 50,
  autoFontSize: true,
  showExif: true,
  captionStyle: "stack",
  filmStyle: null,
  ...fields,
  textPosX: fields.textPosX ?? ALIGN_X[fields.textAlign ?? "left"],
});

export const BUILTIN_PRESETS = [
  tpl("gallery", "Gallery", { selectedRatioId: "orig", customMarginH: 6, customMarginV: 6, backgroundColor: "#ffffff", selectedFontId: "archivo", textAlign: "left" }),
  tpl("museum", "Museum mat", { selectedRatioId: "4:5", customMarginH: 16, customMarginV: 16, backgroundColor: "#f2efe8", selectedFontId: "cormorant", textAlign: "center" }),
  tpl("square", "Feed square", { selectedRatioId: "1:1", customMarginH: 7, customMarginV: 7, backgroundColor: "#ffffff", selectedFontId: "montserrat", textAlign: "center" }),
  tpl("midnight", "Midnight", { selectedRatioId: "4:5", backgroundColor: "#0d0f12", selectedFontId: "montserrat", textAlign: "left" }),
  tpl("editorial", "Editorial", { selectedRatioId: "4:5", customMarginH: 10, customMarginV: 10, backgroundColor: "#141414", selectedFontId: "dmserif", textAlign: "center", softBloom: 15 }),
  tpl("kraft", "Kraft", { selectedRatioId: "4:5", customMarginH: 10, customMarginV: 10, backgroundColor: "#e7dcc8", selectedFontId: "playfair", textAlign: "center" }),
  tpl("cinema", "Cinema", { selectedRatioId: "16:9", customMarginH: 5, customMarginV: 5, backgroundColor: "#000000", selectedFontId: "bebas", textAlign: "center", filmGrain: 25, softBloom: 20 }),
  tpl("brandbar", "Brand bar", { selectedRatioId: "orig", customMarginH: 0, customMarginV: 0, captionSpace: 0, backgroundColor: "#ffffff", selectedFontId: "archivo", textAlign: "left", captionStyle: "bar", autoFontSize: false, manualFontSize: 22 }),
  tpl("brandbar-dark", "Brand bar dark", { selectedRatioId: "4:5", customMarginH: 0, customMarginV: 0, backgroundColor: "#111111", selectedFontId: "montserrat", textAlign: "left", captionStyle: "bar", autoFontSize: false, manualFontSize: 22 }),
  tpl("spread", "Spread", { selectedRatioId: "4:5", customMarginH: 3, customMarginV: 3, backgroundColor: "#ffffff", selectedFontId: "archivo", textAlign: "left", captionStyle: "spread" }),
  tpl("story", "Story poster", { selectedRatioId: "9:16", customMarginH: 8, customMarginV: 8, backgroundColor: "#111111", selectedFontId: "bebas", textAlign: "center" }),
];

// Real film borders (see film.js): the photo in a 35 mm strip, an instant print, a darkroom print or a slide.
// They take the photo's place in the frame, so ratio, background and caption still apply around them.
export const FILM_PRESETS = [
  tpl("film35", "35 mm", { filmStyle: "35mm", selectedRatioId: "4:5", customMarginH: 7, customMarginV: 7, backgroundColor: "#f2f1ed", selectedFontId: "spacemono", textAlign: "left", textPosX: 6, autoFontSize: false, manualFontSize: 17, filmInk: "#f2a23c" }),
  tpl("instant", "Instant", { filmStyle: "instant", selectedRatioId: "4:5", customMarginH: 7, customMarginV: 7, backgroundColor: "#e6e4df", selectedFontId: "caveat", textAlign: "center", filmCard: "#f7f6f1" }),
  tpl("darkroom", "Darkroom", { filmStyle: "darkroom", selectedRatioId: "4:5", customMarginH: 8, customMarginV: 8, backgroundColor: "#f6f5f1", selectedFontId: "caveat", textAlign: "left" }),
  tpl("slide", "Slide", { filmStyle: "slide", selectedRatioId: "4:5", customMarginH: 6, customMarginV: 6, backgroundColor: "#e9e8e4", selectedFontId: "caveat", textAlign: "left", filmCard: "#f7f6f1" }),
];

// Export settings, remembered on this device.
export const EXPORT_SIZES = [
  { id: "instagram", label: "Instagram", width: 1080 },
  { id: "2k", label: "2K", long: 2048 },
  { id: "4k", label: "4K", long: 3840 },
  { id: "full", label: "Full size" },
];

export const FORMATS = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

export const QUALITIES = { good: 0.85, high: 0.92, max: 1 };
