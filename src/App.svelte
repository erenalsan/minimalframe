<script>
  // ═══════════════════════════════════════════════════════════════════════════
  //  MinimalFrame — Dual-Mode Photo Tool with Batch Processing & Manual EXIF
  //  Zero-bloat, 100% local photo processing PWA
  //  Stack: Svelte 5 · Vite · Capacitor · exifr · JSZip · rawEngine
  // ═══════════════════════════════════════════════════════════════════════════
  import { onMount, tick } from "svelte";
  import * as exifr from "exifr";
  import JSZip from "jszip";
  import {
    isRawFile,
    processRawFile,
    getRawFormatInfo,
    getRawOrientation,
    decodeRawLinear,
  } from "./lib/rawEngine.js";
  import { applyAnalogEffects } from "./lib/effectsEngine.js";
  import Dial from "./lib/Dial.svelte";
  import { computeFrameLayout } from "./lib/frameLayout.js";
  import Histogram from "./lib/Histogram.svelte";
  import {
    DEV_DEFAULTS,
    isDevelopSupported,
    develop,
    downscaleLinear,
    cssFilterFor,
    histogram,
  } from "./lib/developEngine.js";

  // ─── Mode Navigation ───────────────────────────────────────────────────────
  // 'editor' = Color & Light Adjustments | 'framing' = Frame & EXIF Typography
  let activeTab = $state("framing");

  // One tool panel open at a time per mode, like a camera's quick menu.
  const TOOLS = {
    editor: [["looks", "Looks"], ["light", "Light"], ["color", "Color"], ["film", "Film"]],
    framing: [
      ["templates", "Templates"], ["ratio", "Ratio"], ["border", "Border"], ["colors", "Colors"],
      ["caption", "Caption"], ["position", "Position"], ["logo", "Logo"],
    ],
  };
  let activeTool = $state({ editor: "looks", framing: "ratio" });
  // 24×24 stroke icons for the tool tabs.
  const ICONS = {
    looks: "M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z",
    light: "M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
    color: "M12 3s6 6.4 6 11a6 6 0 01-12 0c0-4.6 6-11 6-11z",
    film: "M4 4h16v16H4zM8 4v16M16 4v16M4 8h4M4 12h4M4 16h4M16 8h4M16 12h4M16 16h4",
    templates: "M4 4h16v16H4zM4 10h16M10 10v10",
    ratio: "M6 2v14a2 2 0 002 2h14M2 6h14a2 2 0 012 2v14",
    border: "M3 3h18v18H3zM7 7h10v10H7z",
    colors: "M12 3a9 9 0 100 18c1.1 0 1.6-.8 1.6-1.6 0-.9-.7-1.3-.7-2.2 0-1 .8-1.8 1.8-1.8H17a4 4 0 004-4C21 6.8 17 3 12 3zM7.5 12h.01M9.5 7.5h.01M14.5 7.5h.01",
    caption: "M5 7V5h14v2M12 5v14M9 19h6",
    position: "M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3",
    logo: "M12 7a5 5 0 100 10 5 5 0 000-10zM12 2a10 10 0 100 20 10 10 0 000-20z",
    export: "M12 3v12M7 10l5 5 5-5M5 21h14",
  };
  let exportDialog = $state.raw(null);
  let fileInput = $state.raw(null);
  let canvasAspect = $state(4 / 5); // preview box ratio; updated whenever the canvas is resized

  const EXIF_FIELDS = [
    ["model", "Camera", "Sony A7 IV"],
    ["lens", "Lens", "FE 35mm F1.8"],
    ["focalLength", "Focal length", "35mm"],
    ["aperture", "Aperture", "ƒ/1.8"],
    ["shutterSpeed", "Shutter", "1/250s"],
    ["iso", "ISO", "ISO 100"],
  ];
  const QUICK_BACKGROUNDS = ["#ffffff", "#f1eee8", "#7d7d7a", "#000000"];

  // ─── Batch / Multi-File State Management ───────────────────────────────────
  // Each item in filesList contains:
  // { id, file, name, sourceBlob, fullW, fullH, previewImage, linearRaw, thumbUrl, isRaw, rawBadge, orientationTag, exifOverride }
  let filesList = $state([]);
  let activeImageIndex = $state(0);
  let isLoading = $state(false);
  let loadingStatus = $state("");
  let loadError = $state("");
  let isDragging = $state(false);

  const selectedCount = $derived(filesList.filter((f) => f.selected).length);

  // Active Item Helper
  const activeItem = $derived(
    filesList.length > 0 && activeImageIndex < filesList.length
      ? filesList[activeImageIndex]
      : null,
  );

  // Processed image for the active item (after color/light adjustments)
  let processedImage = $state.raw(null);

  // ─── Mode 1: Photo Editor State (Color, Light & Analog Effects) ─────────────
  // All develop settings live in one object (see DEV_DEFAULTS) so looks, presets and reset stay one-liners.
  let dev = $state({ ...DEV_DEFAULTS });
  const canDevelop = isDevelopSupported();

  function resetColorAdjustments() {
    Object.assign(dev, DEV_DEFAULTS);
  }

  const look = (id, name, params) => ({ id, name, params: { ...DEV_DEFAULTS, ...params } });
  const LOOKS = [
    look("none", "Original", {}),
    look("raw-fix", "RAW lift", { exposure: 0.25, contrast: 15, highlights: -20, shadows: 25, vibrance: 20 }),
    look("vivid", "Vivid", { contrast: 20, whites: 10, vibrance: 35, saturation: 10 }),
    look("warm", "Golden", { exposure: 0.15, temperature: 35, tint: 8, shadows: 15, vibrance: 20, filmGrain: 10, softBloom: 15 }),
    look("blue", "Blue hour", { temperature: -35, tint: -5, contrast: 15, highlights: -20, shadows: 10, vibrance: 10 }),
    look("soft", "Soft film", { exposure: 0.1, contrast: -10, highlights: -25, shadows: 20, temperature: 12, tint: 6, vibrance: -10, filmGrain: 18, softBloom: 10 }),
    look("fade", "Fade", { contrast: -20, blacks: 30, temperature: 8, saturation: -15, filmGrain: 15 }),
    look("moody", "Moody", { exposure: -0.3, contrast: 25, highlights: -30, blacks: -15, temperature: -15, saturation: -20, filmGrain: 25, softBloom: 30 }),
    look("bw-contrast", "Silver", { contrast: 35, whites: 10, blacks: -10, saturation: -100, filmGrain: 20 }),
  ];

  const applyLook = (l) => Object.assign(dev, l.params);
  const isLookActive = (l) => Object.keys(DEV_DEFAULTS).every((k) => l.params[k] === dev[k]);

  // Look thumbnails rendered by the real develop engine from the active photo, so they match the result.
  let lookThumbs = $state({});
  $effect(() => {
    const src = activeItem?.previewImage;
    if (!src || !canDevelop) {
      lookThumbs = {};
      return;
    }
    let small;
    if (src.linear) {
      small = downscaleLinear(src, 160);
    } else {
      small = document.createElement("canvas");
      const k = 160 / Math.max(src.width, src.height);
      small.width = Math.max(1, Math.round(src.width * k));
      small.height = Math.max(1, Math.round(src.height * k));
      small.getContext("2d").drawImage(src, 0, 0, small.width, small.height);
    }
    const out = document.createElement("canvas");
    lookThumbs = Object.fromEntries(
      LOOKS.map((l) => [l.id, develop(small, l.params, out).toDataURL("image/jpeg", 0.8)]),
    );
  });

  // ─── Mode 2: Frame & EXIF State ────────────────────────────────────────────
  let customMarginH = $state(8); // Horizontal margin % (5 - 50%)
  let customMarginV = $state(8); // Vertical margin % (5 - 50%)

  const RATIOS = [
    { id: "4:5", label: "Feed portrait", w: 4, h: 5 },
    { id: "1:1", label: "Feed square", w: 1, h: 1 },
    { id: "9:16", label: "Story & Reel", w: 9, h: 16 },
    { id: "orig", label: "Photo + caption", w: null, h: null },
    { id: "custom", label: "Even border", w: null, h: null },
    { id: "3:2", label: "Print 3:2", w: 3, h: 2 },
    { id: "16:9", label: "Wide 16:9", w: 16, h: 9 },
  ];
  let selectedRatioId = $state("4:5");

  // Colors & Auto-Contrast
  let backgroundColor = $state("#ffffff");
  let textColor = $state("#000000");
  let autoContrast = $state(true);

  // EXIF Typography & Custom Fonts
  let showExif = $state(true);

  // Bundled fonts (see fonts.js) work offline; "system", "serif" and "mono" use what every device has.
  // Unknown ids from older saved presets fall back to the first entry.
  const SYSTEM_FONTS = [
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

  // Fonts the user adds: installed ones (Chrome/Edge desktop) or uploaded files (every platform).
  // shortcut: uploaded fonts last for this session only; persist them in IndexedDB if people ask.
  let customFonts = $state([]);
  const allFonts = $derived([...customFonts, ...SYSTEM_FONTS]);
  const canBrowseLocalFonts = typeof window !== "undefined" && "queryLocalFonts" in window;
  let localFamilies = $state([]);
  let fontError = $state("");

  function addFont(id, label, css) {
    if (!customFonts.some((f) => f.id === id)) customFonts = [{ id, label, css }, ...customFonts];
    selectedFontId = id;
  }

  async function browseLocalFonts() {
    fontError = "";
    try {
      const fonts = await window.queryLocalFonts();
      localFamilies = [...new Set(fonts.map((f) => f.family))].sort((a, b) => a.localeCompare(b));
    } catch (err) {
      fontError = "Font access was blocked. Allow it in the browser's site settings, or upload a font file instead.";
      console.warn("[MinimalFrame] queryLocalFonts:", err);
    }
  }

  function useLocalFont(family) {
    if (family && localFamilies.includes(family)) addFont(`local:${family}`, family, `"${family}"`);
  }

  async function onFontFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    fontError = "";
    const family = file.name.replace(/\.[^.]+$/, "");
    try {
      const face = new FontFace(`mf-${family}`, await file.arrayBuffer());
      document.fonts.add(await face.load());
      addFont(`file:${family}`, family, `"mf-${family}"`);
    } catch {
      fontError = `${file.name} is not a font this browser can read. Use a .ttf, .otf, .woff or .woff2 file.`;
    }
  }

  // Canvas text can't swap fonts once they arrive, so load the chosen one and redraw.
  $effect(() => {
    const css = (allFonts.find((f) => f.id === selectedFontId) || SYSTEM_FONTS[0]).css;
    Promise.all([document.fonts.load(`400 40px ${css}`), document.fonts.load(`600 40px ${css}`)]).then(() =>
      scheduleRender(),
    );
  });
  let selectedFontId = $state("archivo");

  // Font Size: Dynamic vs Manual Override
  let autoFontSize = $state(true);
  let manualFontSize = $state(24); // px at a 1080px long edge, scaled with the photo

  // Checkboxes for which properties to display
  let exifDisplay = $state({
    model: true,
    lens: true,
    focalLength: true,
    aperture: true,
    shutterSpeed: true,
    iso: true,
  });

  // Text placement: alignment, margin zone & free positioning
  let textAlign = $state("left"); // 'left' | 'center' | 'right'
  let textZone = $state("bottom"); // 'bottom' | 'top' margin zone
  let textPosX = $state(0); // across the photo's width: 0 = its left edge, 100 = its right edge
  let textPosY = $state(50); // inside the caption border: 0 = next to the photo, 100 = at the outer edge
  let captionSpace = $state(12); // "Photo + caption" ratio: extra border for the caption, % of photo height

  // Palettes
  const LS_KEY = "mf_palettes_v1";
  let palettes = $state([]);

  function loadPalettes() {
    try {
      palettes = JSON.parse(localStorage.getItem(LS_KEY) || "[]");
    } catch {
      palettes = [];
    }
  }
  function persistPalettes() {
    localStorage.setItem(LS_KEY, JSON.stringify(palettes));
  }

  // ─── Personal Logo & Watermark State (Framing Mode) ─────────────────────────
  let logoImage = $state.raw(null);
  let logoName = $state("");
  let logoScale = $state(12); // 3% - 45% of canvas width
  let logoOpacity = $state(85); // 5% - 100%
  let logoPosX = $state(92); // 0% - 100%
  let logoPosY = $state(93); // 0% - 100%

  function drawLogoOnCanvas(ctx, canvasW, canvasH) {
    if (!logoImage) return;
    const logoW = Math.max(12, Math.round((logoScale / 100) * canvasW));
    const natW = logoImage.naturalWidth || logoImage.width || 1;
    const natH = logoImage.naturalHeight || logoImage.height || 1;
    const aspect = natH / natW;
    const logoH = Math.round(logoW * aspect);

    const anchorX = Math.round((logoPosX / 100) * canvasW);
    const anchorY = Math.round((logoPosY / 100) * canvasH);
    const x = Math.round(anchorX - logoW / 2);
    const y = Math.round(anchorY - logoH / 2);

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, logoOpacity / 100));
    ctx.drawImage(logoImage, x, y, logoW, logoH);
    ctx.restore();
  }

  let logoObjectUrl = null;

  function onLogoInput(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (logoObjectUrl) {
      URL.revokeObjectURL(logoObjectUrl);
      logoObjectUrl = null;
    }
    logoObjectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      logoImage = img;
      logoName = file.name;
      scheduleRender(false);
    };
    img.src = logoObjectUrl;
    e.target.value = "";
  }

  function removeLogo() {
    if (logoObjectUrl) {
      URL.revokeObjectURL(logoObjectUrl);
      logoObjectUrl = null;
    }
    logoImage = null;
    logoName = "";
    scheduleRender(false);
  }

  function setLogoPreset(pos) {
    if (pos === "bottom-right") {
      logoPosX = 92;
      logoPosY = 93;
    } else if (pos === "bottom-left") {
      logoPosX = 8;
      logoPosY = 93;
    } else if (pos === "top-right") {
      logoPosX = 92;
      logoPosY = 7;
    } else if (pos === "top-left") {
      logoPosX = 8;
      logoPosY = 7;
    } else if (pos === "center") {
      logoPosX = 50;
      logoPosY = 50;
    }
  }

  // ─── Template / Preset System (LocalStorage) ────────────────────────────────
  const PRESETS_STORAGE_KEY = "mf_layout_presets_v1";
  let userPresets = $state([]);
  let showSavePresetModal = $state(false);
  let newPresetName = $state("");

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
    ...fields,
    textPosX: { left: 0, center: 50, right: 100 }[fields.textAlign ?? "left"],
  });
  const BUILTIN_PRESETS = [
    tpl("gallery", "Gallery", { selectedRatioId: "orig", customMarginH: 6, customMarginV: 6, backgroundColor: "#ffffff", selectedFontId: "archivo", textAlign: "left" }),
    tpl("polaroid", "Instant", { selectedRatioId: "orig", customMarginH: 5, customMarginV: 5, captionSpace: 24, backgroundColor: "#fbfaf6", selectedFontId: "caveat", textAlign: "center", autoFontSize: false, manualFontSize: 40 }),
    tpl("museum", "Museum mat", { selectedRatioId: "4:5", customMarginH: 16, customMarginV: 16, backgroundColor: "#f2efe8", selectedFontId: "cormorant", textAlign: "center" }),
    tpl("square", "Feed square", { selectedRatioId: "1:1", customMarginH: 7, customMarginV: 7, backgroundColor: "#ffffff", selectedFontId: "montserrat", textAlign: "center" }),
    tpl("midnight", "Midnight", { selectedRatioId: "4:5", backgroundColor: "#0d0f12", selectedFontId: "montserrat", textAlign: "left" }),
    tpl("editorial", "Editorial", { selectedRatioId: "4:5", customMarginH: 10, customMarginV: 10, backgroundColor: "#141414", selectedFontId: "dmserif", textAlign: "center", softBloom: 15 }),
    tpl("kraft", "Kraft", { selectedRatioId: "4:5", customMarginH: 10, customMarginV: 10, backgroundColor: "#e7dcc8", selectedFontId: "playfair", textAlign: "center" }),
    tpl("filmborder", "Film border", { selectedRatioId: "custom", customMarginH: 4, customMarginV: 4, backgroundColor: "#000000", selectedFontId: "spacemono", textAlign: "left", filmGrain: 20 }),
    tpl("cinema", "Cinema", { selectedRatioId: "16:9", customMarginH: 5, customMarginV: 5, backgroundColor: "#000000", selectedFontId: "bebas", textAlign: "center", filmGrain: 25, softBloom: 20 }),
    tpl("story", "Story poster", { selectedRatioId: "9:16", customMarginH: 8, customMarginV: 8, backgroundColor: "#111111", selectedFontId: "bebas", textAlign: "center" }),
  ];

  function loadPresets() {
    try {
      userPresets = JSON.parse(
        localStorage.getItem(PRESETS_STORAGE_KEY) || "[]",
      );
    } catch {
      userPresets = [];
    }
  }

  function persistPresets() {
    localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(userPresets));
  }

  function saveCurrentPreset(name) {
    const trimmed = name?.trim();
    if (!trimmed) return;
    const newPreset = {
      id: `preset_user_${Date.now()}`,
      name: trimmed,
      customMarginH,
      customMarginV,
      captionSpace,
      selectedRatioId,
      backgroundColor,
      textColor,
      autoContrast,
      textPosX,
      textPosY,
      textAlign,
      textZone,
      selectedFontId,
      autoFontSize,
      manualFontSize,
      showExif,
      logoScale,
      logoOpacity,
      logoPosX,
      logoPosY,
      dev: { ...dev },
      exifDisplay: { ...exifDisplay },
    };
    userPresets = [...userPresets, newPreset];
    persistPresets();
    showSavePresetModal = false;
    newPresetName = "";
  }

  function deletePreset(id, e) {
    e?.stopPropagation();
    userPresets = userPresets.filter((p) => p.id !== id);
    persistPresets();
  }

  function applyPreset(p) {
    if (!p) return;
    if (p.customMarginH !== undefined) customMarginH = p.customMarginH;
    if (p.customMarginV !== undefined) customMarginV = p.customMarginV;
    captionSpace = p.captionSpace ?? 12;
    if (p.selectedRatioId !== undefined) selectedRatioId = p.selectedRatioId;
    if (p.backgroundColor !== undefined) backgroundColor = p.backgroundColor;
    if (p.textColor !== undefined) textColor = p.textColor;
    if (p.autoContrast !== undefined) autoContrast = p.autoContrast;
    if (p.textPosX !== undefined) textPosX = p.textPosX;
    if (p.textPosY !== undefined) textPosY = p.textPosY;
    if (p.textAlign !== undefined) textAlign = p.textAlign;
    if (p.textZone !== undefined) textZone = p.textZone;
    if (p.selectedFontId !== undefined) selectedFontId = p.selectedFontId;
    if (p.autoFontSize !== undefined) autoFontSize = p.autoFontSize;
    if (p.manualFontSize !== undefined) manualFontSize = p.manualFontSize;
    if (p.showExif !== undefined) showExif = p.showExif;
    if (p.logoScale !== undefined) logoScale = p.logoScale;
    if (p.logoOpacity !== undefined) logoOpacity = p.logoOpacity;
    if (p.logoPosX !== undefined) logoPosX = p.logoPosX;
    if (p.logoPosY !== undefined) logoPosY = p.logoPosY;
    // Built-in and older saved presets store develop values at the top level (old "brightness" has no equivalent and is ignored).
    for (const k of Object.keys(DEV_DEFAULTS)) if (p[k] !== undefined) dev[k] = p[k];
    if (p.dev) Object.assign(dev, p.dev);
    if (p.exifDisplay) exifDisplay = { ...exifDisplay, ...p.exifDisplay };

    updateProcessedImage();
    scheduleRender();
  }

  onMount(() => {
    loadPalettes();
    loadPresets();
    // Canvas text can't swap fonts by itself; redraw once the bundled caption font is ready.
    document.fonts?.ready.then(() => scheduleRender());
  });

  // ─── Canvas Refs & Dimensions ──────────────────────────────────────────────
  let canvasEl = $state.raw(null);
  let framedSize = $state({ w: 0, h: 0 }); // full-resolution size of the framed export
  let photoSize = $state({ w: 0, h: 0 }); // full-resolution size of the photo alone
  // Export settings, remembered on this device.
  const EXPORT_SIZES = [
    { id: "instagram", label: "Instagram", width: 1080 },
    { id: "2k", label: "2K", long: 2048 },
    { id: "4k", label: "4K", long: 3840 },
    { id: "full", label: "Full size" },
  ];
  const FORMATS = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
  const QUALITIES = { good: 0.85, high: 0.92, max: 1 };
  const EXPORT_KEY = "mf_export_v1";
  let exportPrefs = $state({ size: "full", format: "jpeg", quality: "high" });
  try {
    Object.assign(exportPrefs, JSON.parse(localStorage.getItem(EXPORT_KEY) || "{}"));
  } catch {}
  $effect(() => {
    try {
      localStorage.setItem(EXPORT_KEY, JSON.stringify(exportPrefs));
    } catch {}
  });

  /** Output scale for the current size preset (layout is proportional, so it can be computed up front). */
  function exportScale(photoW, photoH, mode, exifOverride) {
    const s = EXPORT_SIZES.find((x) => x.id === exportPrefs.size);
    if (!s?.width && !s?.long) return 1;
    const { canvasW: w, canvasH: h } =
      mode === "framed" ? layoutFrame(photoW, photoH, exifOverride) : { canvasW: photoW, canvasH: photoH };
    // shortcut: rounding can land the Instagram width at 1079–1081px; Instagram resamples it anyway.
    return Math.min(1, s.width ? s.width / w : s.long / Math.max(w, h));
  }

  /** Size label for a preset, from the current photo. */
  function sizeLabel(s, mode) {
    const { w, h } = mode === "framed" ? framedSize : photoSize;
    if (!w) return "";
    const k = Math.min(1, s.width ? s.width / w : s.long ? s.long / Math.max(w, h) : 1);
    return `${Math.round(w * k)} × ${Math.round(h * k)}`;
  }

  /** Encodes a canvas with the chosen format; the extension follows what the browser actually produced. */
  async function encodeCanvas(canvas) {
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, FORMATS[exportPrefs.format], QUALITIES[exportPrefs.quality]),
    );
    if (!blob) throw new Error("this browser could not encode the image");
    // Browsers without WebP encoding silently fall back to PNG.
    const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[blob.type] || "png";
    return { blob, ext };
  }

  // Export & Download States
  let isDownloading = $state(false);
  let downloadStatus = $state("");
  let fallbackDownloadUrl = $state("");
  let fallbackFilename = $state("");

  // Batch Export Modal State
  let isBatchExporting = $state(false);
  let batchProgress = $state({
    current: 0,
    total: 0,
    percent: 0,
    filename: "",
  });

  // ─── Auto-Contrast Math ────────────────────────────────────────────────────
  function calculateLuminance(hex) {
    const clean = hex.replace("#", "");
    let r, g, b;
    if (clean.length === 3) {
      r = parseInt(clean[0] + clean[0], 16) / 255;
      g = parseInt(clean[1] + clean[1], 16) / 255;
      b = parseInt(clean[2] + clean[2], 16) / 255;
    } else {
      r = parseInt(clean.substring(0, 2), 16) / 255;
      g = parseInt(clean.substring(2, 4), 16) / 255;
      b = parseInt(clean.substring(4, 6), 16) / 255;
    }
    const toLinear = (c) =>
      c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  }

  function getContrastingColor(bgColor) {
    // 0.179 is where black and white give equal WCAG contrast ratios.
    return calculateLuminance(bgColor) > 0.179 ? "#000000" : "#ffffff";
  }

  // ─── Dynamic Font Sizing Math ──────────────────────────────────────────────
  const selectedExifCount = $derived(
    Object.values(exifDisplay).filter(Boolean).length,
  );

  const dynamicScaleFactor = $derived(
    selectedExifCount > 0 ? 1.0 + (6 - selectedExifCount) * 0.26 : 1.0,
  );

  // ─── EXIF Orientation Transformer (Auto-Rotation) ──────────────────────────
  function applyExifOrientation(source, orientation = 1) {
    const srcW = source.width;
    const srcH = source.height;

    const isRotated90 = orientation >= 5 && orientation <= 8;
    const targetW = isRotated90 ? srcH : srcW;
    const targetH = isRotated90 ? srcW : srcH;

    const offscreen = document.createElement("canvas");
    offscreen.width = targetW;
    offscreen.height = targetH;
    const ctx = offscreen.getContext("2d", { alpha: false });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    ctx.save();
    switch (orientation) {
      case 2:
        ctx.translate(targetW, 0);
        ctx.scale(-1, 1);
        break;
      case 3:
        ctx.translate(targetW, targetH);
        ctx.rotate(Math.PI);
        break;
      case 4:
        ctx.translate(0, targetH);
        ctx.scale(1, -1);
        break;
      case 5:
        ctx.rotate(0.5 * Math.PI);
        ctx.scale(1, -1);
        break;
      case 6:
        ctx.translate(targetW, 0);
        ctx.rotate(0.5 * Math.PI);
        break;
      case 7:
        ctx.rotate(0.5 * Math.PI);
        ctx.translate(srcW, -srcH);
        ctx.scale(-1, 1);
        break;
      case 8:
        ctx.translate(0, targetH);
        ctx.rotate(-0.5 * Math.PI);
        break;
      default:
        break;
    }

    ctx.drawImage(source, 0, 0);
    ctx.restore();
    return offscreen;
  }

  // ─── Proxy (Preview) Generator for Extreme Real-Time Performance ─────────
  // Strictly capped at 1080p max dimension to guarantee high frame rates on mobile CPUs
  function createProxyPreview(sourceCanvas, maxDim = 1080) {
    const srcW = sourceCanvas.width;
    const srcH = sourceCanvas.height;
    if (Math.max(srcW, srcH) <= maxDim) {
      const copy = document.createElement("canvas");
      copy.width = srcW;
      copy.height = srcH;
      const ctx = copy.getContext("2d");
      ctx.drawImage(sourceCanvas, 0, 0);
      return copy;
    }

    const scale = maxDim / Math.max(srcW, srcH);
    const targetW = Math.max(1, Math.round(srcW * scale));
    const targetH = Math.max(1, Math.round(srcH * scale));

    const proxy = document.createElement("canvas");
    proxy.width = targetW;
    proxy.height = targetH;
    const ctx = proxy.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "medium";
    ctx.drawImage(sourceCanvas, 0, 0, targetW, targetH);
    return proxy;
  }

  // Older WebViews reject "from-image" (their default already honors EXIF), so retry without options.
  async function decodeUpright(blob) {
    try {
      return await createImageBitmap(blob, { imageOrientation: "from-image" });
    } catch {
      return await createImageBitmap(blob);
    }
  }

  // Dominant hue (saturation-weighted circular mean) tints the UI to match the photo; null when near-grey.
  function dominantHue(source) {
    const c = document.createElement("canvas");
    c.width = c.height = 48;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.drawImage(source, 0, 0, 48, 48);
    const d = x.getImageData(0, 0, 48, 48).data;
    let sx = 0, sy = 0, total = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b), chroma = max - min;
      if (chroma < 0.08) continue;
      const h = max === r ? ((g - b) / chroma + 6) % 6 : max === g ? (b - r) / chroma + 2 : (r - g) / chroma + 4;
      const w = chroma * max;
      sx += Math.cos((h * Math.PI) / 3) * w;
      sy += Math.sin((h * Math.PI) / 3) * w;
      total += w;
    }
    if (total < 48 * 48 * 0.02) return null;
    return Math.round(((Math.atan2(sy, sx) * 180) / Math.PI + 360) % 360);
  }

  // ─── Filmstrip Thumbnail Generator ─────────────────────────────────────────
  function createThumbnail(baseCanvas) {
    const thumb = document.createElement("canvas");
    const maxDim = 120;
    const scale = maxDim / Math.max(baseCanvas.width, baseCanvas.height);
    thumb.width = Math.max(1, Math.round(baseCanvas.width * scale));
    thumb.height = Math.max(1, Math.round(baseCanvas.height * scale));
    const ctx = thumb.getContext("2d");
    ctx.drawImage(baseCanvas, 0, 0, thumb.width, thumb.height);
    return thumb.toDataURL("image/jpeg", 0.8);
  }

  // ─── EXIF Exposure Time Formatter ──────────────────────────────────────────
  function fmtExposure(et) {
    if (et == null) return "";
    return et >= 1 ? `${et}s` : `1/${Math.round(1 / et)}s`;
  }

  // ─── Multi-File Loading Pipeline ───────────────────────────────────────────
  async function loadFiles(fileList) {
    if (!fileList || fileList.length === 0) return;
    isLoading = true;
    loadError = "";

    const newItems = [];
    let hasRaw = false;

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      loadingStatus = `Decoding ${i + 1} of ${fileList.length}: ${file.name}`;
      try {
        const arrayBuffer = await file.arrayBuffer();

        // 1. EXIF extraction
        let rawExif = null;
        let detectedOrientation = 1;
        try {
          rawExif = await exifr.parse(arrayBuffer, {
            pick: [
              "Orientation",
              "Make",
              "Model",
              "LensModel",
              "FocalLength",
              "FNumber",
              "ExposureTime",
              "ISO",
            ],
          });
          if (rawExif?.Orientation) {
            detectedOrientation = Number(rawExif.Orientation);
          }
        } catch (exifErr) {
          console.warn("[MinimalFrame] EXIF parse warning:", exifErr);
        }

        // 2. Pixel decoding: RAW vs Standard
        let rawBadge = "";
        const isRaw = isRawFile(file.name);
        let sourceBlob = file;
        // Browsers auto-rotate standard JPEG/HEIC; RAW embedded previews carry no orientation, so rotate those manually.
        let orientationTag = 1;

        let previewImage, fullW, fullH, thumbSource;
        // True RAW editing needs the GPU engine; without WebGL2, fall back to an 8-bit JPEG rendering.
        const linearRaw = isRaw && canDevelop;

        if (isRaw) {
          hasRaw = true;
          const info = getRawFormatInfo(file.name);
          rawBadge = `${info.brand} (${info.extension.toUpperCase()})`;
          loadingStatus = `Developing RAW ${i + 1} of ${fileList.length}: ${file.name}`;
        }

        if (linearRaw) {
          // Fast half-size decode (no demosaic) for the on-screen proxy; export re-decodes at full size.
          // LibRaw applies the camera's rotation itself.
          const half = await decodeRawLinear(file, { half: true });
          previewImage = downscaleLinear(half, 1080);
          fullW = half.width * 2;
          fullH = half.height * 2;
          thumbSource = develop(downscaleLinear(previewImage, 160), DEV_DEFAULTS);
          sourceBlob = null;
        } else {
          if (isRaw) {
            const decoded = await processRawFile(file);
            sourceBlob = decoded.blob;
            if (!decoded.oriented) {
              orientationTag =
                detectedOrientation > 1
                  ? detectedOrientation
                  : await getRawOrientation(arrayBuffer);
            }
          }

          // Decode once, keep only a ≤1080px proxy. The full-res source is re-decoded from sourceBlob at export.
          const bitmap = await decodeUpright(sourceBlob);
          previewImage = applyExifOrientation(createProxyPreview(bitmap, 1080), orientationTag);
          const isRotated90 = orientationTag >= 5;
          fullW = isRotated90 ? bitmap.height : bitmap.width;
          fullH = isRotated90 ? bitmap.width : bitmap.height;
          bitmap.close();
          thumbSource = previewImage;
        }

        // 5. Filmstrip Thumbnail (120px)
        const thumbUrl = createThumbnail(thumbSource);
        const hue = dominantHue(thumbSource);

        // 6. Initial Editable EXIF Override values
        const cameraName =
          [rawExif?.Make, rawExif?.Model].filter(Boolean).join(" ").trim() ||
          (isRaw ? getRawFormatInfo(file.name).brand : "");
        const lensName = rawExif?.LensModel || "";
        const focalLength =
          rawExif?.FocalLength != null ? `${rawExif.FocalLength}mm` : "";
        const aperture = rawExif?.FNumber != null ? `ƒ/${rawExif.FNumber}` : "";
        const shutterSpeed =
          rawExif?.ExposureTime != null
            ? fmtExposure(rawExif.ExposureTime)
            : "";
        const iso = rawExif?.ISO != null ? `ISO\u2009${rawExif.ISO}` : "";

        newItems.push({
          id: `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          file,
          name: file.name,
          sourceBlob,                         // Encoded original (or decoded RAW JPEG); decoded only at export
          fullW,
          fullH,
          previewImage,                       // ≤1080px proxy: a canvas, or 16-bit linear data for RAW
          linearRaw,                          // export re-decodes the RAW file at full size
          thumbUrl,
          isRaw,
          rawBadge,
          orientationTag,
          hue,
          rotated: detectedOrientation > 1, // shown in the UI; the browser or LibRaw may have done the rotating
          selected: true,                   // included in batch export
          exifOverride: {
            model: cameraName,
            lens: lensName,
            focalLength: focalLength,
            aperture: aperture,
            shutterSpeed: shutterSpeed,
            iso: iso,
          },
        });
      } catch (err) {
        console.error(`[MinimalFrame] Failed to load ${file.name}:`, err);
        loadError = `Could not load ${file.name}: ${err.message}`;
      }
    }

    if (newItems.length > 0) {
      const startIndex = filesList.length;
      filesList = [...filesList, ...newItems];
      activeImageIndex = startIndex; // Switch to first newly added photo

      if (hasRaw) {
        activeTab = "editor";
      }

      await tick();
      resetTextPosition();
      scheduleRender(true);
    }

    isLoading = false;
    loadingStatus = "";
  }

  function onFileInput(e) {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) loadFiles(files);
    e.target.value = "";
  }

  function onDrop(e) {
    e.preventDefault();
    isDragging = false;
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length > 0) loadFiles(files);
  }

  function onDragOver(e) {
    e.preventDefault();
    isDragging = true;
  }
  function onDragLeave() {
    isDragging = false;
  }

  function removeImage(index, e) {
    e?.stopPropagation();
    const removed = filesList[index];
    if (removed) {
      if (removed.thumbUrl && removed.thumbUrl.startsWith("blob:")) {
        URL.revokeObjectURL(removed.thumbUrl);
      }
      if (removed.previewImage) {
        removed.previewImage.width = 0;
        removed.previewImage.height = 0;
      }
    }
    filesList = filesList.filter((_, idx) => idx !== index);
    if (activeImageIndex >= filesList.length) {
      activeImageIndex = Math.max(0, filesList.length - 1);
    }
    scheduleRender(true);
  }

  function clearAllImages() {
    filesList.forEach((item) => {
      if (item.thumbUrl && item.thumbUrl.startsWith("blob:")) {
        URL.revokeObjectURL(item.thumbUrl);
      }
      if (item.previewImage) {
        item.previewImage.width = 0;
        item.previewImage.height = 0;
      }
    });
    filesList = [];
    activeImageIndex = 0;
    if (fallbackDownloadUrl && fallbackDownloadUrl.startsWith("blob:")) {
      URL.revokeObjectURL(fallbackDownloadUrl);
      fallbackDownloadUrl = null;
    }
    scheduleRender(true);
  }

  function setActiveImage(index) {
    activeImageIndex = index;
    scheduleRender(true);
  }

  // ─── Develop (GPU) ─────────────────────────────────────────────────────────
  // GPU develop when available; otherwise a CSS-filter approximation (exposure, contrast, saturation only).
  function developCanvas(source, target) {
    if (canDevelop) return develop(source, dev, target);
    target.width = source.width;
    target.height = source.height;
    const ctx = target.getContext("2d", { alpha: false });
    ctx.filter = cssFilterFor(dev);
    ctx.drawImage(source, 0, 0);
    return target;
  }

  // Live preview develops only the ≤1080px proxy; grain and bloom are CSS overlays until export.
  let previewWorkCanvas = null;
  let histo = $state.raw(null);
  function updateProcessedImage() {
    const base = activeItem?.previewImage;
    if (!base) {
      processedImage = null;
      return;
    }
    // Reuse one canvas across slider ticks instead of allocating a new one per frame.
    processedImage = developCanvas(base, (previewWorkCanvas ??= document.createElement("canvas")));
    histo = histogram(processedImage);
  }

  // ─── EXIF Text Formatting with Editable Overrides ──────────────────────────
  function buildExifLines(override, display) {
    if (!override) return [];
    const lines = [];

    if (display.model && override.model?.trim()) {
      lines.push({ type: "model", text: override.model.trim() });
    }

    if (display.lens && override.lens?.trim()) {
      lines.push({ type: "lens", text: override.lens.trim() });
    }

    const settings = [];
    if (display.focalLength && override.focalLength?.trim())
      settings.push(override.focalLength.trim());
    if (display.aperture && override.aperture?.trim())
      settings.push(override.aperture.trim());
    if (display.shutterSpeed && override.shutterSpeed?.trim())
      settings.push(override.shutterSpeed.trim());
    if (display.iso && override.iso?.trim()) settings.push(override.iso.trim());

    if (settings.length > 0) {
      lines.push({ type: "settings", text: settings.join("  ·  ") });
    }

    return lines;
  }

  // ─── Frame layout (one function for preview and export, so both always match) ─
  // Every size is proportional to the photo, so the same settings give the same result at any resolution.
  const measureCtx = document.createElement("canvas").getContext("2d");
  const captionFamily = () => (allFonts.find((f) => f.id === selectedFontId) || SYSTEM_FONTS[0]).css;

  function layoutFrame(srcW, srcH, exifOverride) {
    return computeFrameLayout(srcW, srcH, showExif && exifOverride ? buildExifLines(exifOverride, exifDisplay) : [], {
      marginH: customMarginH,
      marginV: customMarginV,
      ratioId: selectedRatioId,
      ratio: RATIOS.find((r) => r.id === selectedRatioId),
      captionSpace,
      fontSize: autoFontSize ? 26 * dynamicScaleFactor : manualFontSize,
      zone: textZone,
      align: textAlign,
      posX: textPosX,
      posY: textPosY,
      measure: (text, px) => {
        measureCtx.font = `600 ${px}px ${captionFamily()}`;
        return measureCtx.measureText(text).width;
      },
    });
  }

  /** Draws `photo` with border, caption and logo into `canvas` (resized to fit). */
  function drawFramed(canvas, photo, exifOverride) {
    const L = layoutFrame(photo.width, photo.height, exifOverride);
    if (canvas.width !== L.canvasW || canvas.height !== L.canvasH) {
      canvas.width = L.canvasW;
      canvas.height = L.canvasH;
    }
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, L.canvasW, L.canvasH);
    ctx.drawImage(photo, L.imgX, L.imgY);
    if (L.caption) {
      const { lines, size, x, y0, lineH } = L.caption;
      ctx.textAlign = textAlign;
      ctx.textBaseline = "middle";
      ctx.fillStyle = textColor;
      lines.forEach((line, i) => {
        const isModel = line.type === "model";
        ctx.font = `${isModel ? 600 : 400} ${isModel ? size : size * 0.88}px ${captionFamily()}`;
        ctx.fillText(line.text, x, y0 + i * lineH);
      });
    }
    drawLogoOnCanvas(ctx, L.canvasW, L.canvasH);
    return canvas;
  }

  // ─── Text Placement & Bounds Clamping ──────────────────────────────────────
  function setAlignment(align) {
    textAlign = align;
    textPosX = { left: 0, center: 50, right: 100 }[align];
  }

  function setZone(zone) {
    textZone = zone;
  }

  function resetTextPosition() {
    setAlignment(textAlign);
    textPosY = 50;
  }

  function resetMargins() {
    customMarginH = 8;
    customMarginV = 8;
  }

  // ─── High-Performance Canvas Rendering (rAF Debounced Loop) ───────────────
  let rafPending = false;
  let needsProcessedUpdate = false;

  function scheduleRender(updateImage = false) {
    if (updateImage) needsProcessedUpdate = true;
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      if (needsProcessedUpdate) {
        needsProcessedUpdate = false;
        updateProcessedImage();
      }
      renderCanvas();
    });
  }

  /**
   * Final Canvas Rendering:
   * - In "Photo Editor" mode: renders processedImage directly for clear color inspection.
   * - In "Frame & EXIF" mode: renders framing margins + manual editable EXIF typography.
   */
  function renderCanvas() {
    if (!canvasEl || !processedImage || !activeItem) return;
    const srcW = processedImage.width;
    const srcH = processedImage.height;
    const fullScale = (activeItem.fullW || srcW) / srcW;

    // Full-resolution sizes for the info line and the export sheet.
    const L = layoutFrame(srcW, srcH, activeItem.exifOverride);
    framedSize = { w: Math.round(L.canvasW * fullScale), h: Math.round(L.canvasH * fullScale) };
    photoSize = { w: activeItem.fullW || srcW, h: activeItem.fullH || srcH };

    if (activeTab === "editor") {
      // Edit mode shows the photo alone for clear colour judgement.
      canvasEl.width = srcW;
      canvasEl.height = srcH;
      canvasEl.getContext("2d").drawImage(processedImage, 0, 0);
    } else {
      drawFramed(canvasEl, processedImage, activeItem.exifOverride);
    }
    canvasAspect = canvasEl.width / canvasEl.height;
  }

  // ─── Reactive State Subscriptions (rAF Throttled) ──────────────────────────
  $effect(() => {
    // When activeItem changes or color sliders move, schedule image update + canvas render
    const _ai = activeItem;
    const _dev = JSON.stringify(dev); // every develop slider

    scheduleRender(true);
  });

  $effect(() => {
    const _bg = backgroundColor;
    if (autoContrast) {
      textColor = getContrastingColor(_bg);
    }
  });

  $effect(() => {
    // Track framing, typography, logo, and active item's custom EXIF overrides
    const _tab = activeTab;
    const _pi = processedImage;
    const _rid = selectedRatioId;
    const _mh = customMarginH;
    const _mv = customMarginV;
    const _bg = backgroundColor;
    const _tc = textColor;
    const _se = showExif;
    const _ta = textAlign;
    const _tz = textZone;
    const _tx = textPosX;
    const _ty = textPosY;
    const _fid = selectedFontId;
    const _af = autoFontSize;
    const _mf = manualFontSize;
    const _ai = activeItem;
    const _ov = activeItem?.exifOverride
      ? JSON.stringify(activeItem.exifOverride)
      : "";
    const _f_m = exifDisplay.model;
    const _f_l = exifDisplay.lens;
    const _f_fl = exifDisplay.focalLength;
    const _f_a = exifDisplay.aperture;
    const _f_ss = exifDisplay.shutterSpeed;
    const _f_i = exifDisplay.iso;
    const _limg = logoImage;
    const _lsc = logoScale;
    const _lop = logoOpacity;
    const _lpx = logoPosX;
    const _lpy = logoPosY;

    scheduleRender(false);
  });

  // ─── Heavy Full-Resolution Export Engine (Off-Screen 24MP Processing) ──────
  async function generateFullResExportCanvas(item, mode = "framed") {
    if (!item) return null;

    // 1–2. Decode the full-res original on demand (only one lives in memory at a time) and develop it
    //      with the same shader as the preview, in tiles.
    let colorCanvas;
    if (item.linearRaw) {
      const raw = await decodeRawLinear(item.file);
      colorCanvas = develop(raw, dev);
    } else {
      const bitmap = await decodeUpright(item.sourceBlob);
      const sourceCanvas =
        item.orientationTag > 1
          ? applyExifOrientation(bitmap, item.orientationTag)
          : bitmap;
      colorCanvas = developCanvas(sourceCanvas, document.createElement("canvas"));
      bitmap.close();
      if (sourceCanvas !== bitmap) sourceCanvas.width = sourceCanvas.height = 0;
    }

    // Size preset: shrink before grain and bloom so they keep their look at small sizes.
    const k = exportScale(colorCanvas.width, colorCanvas.height, mode, item.exifOverride);
    if (k < 1) {
      const small = document.createElement("canvas");
      small.width = Math.max(1, Math.round(colorCanvas.width * k));
      small.height = Math.max(1, Math.round(colorCanvas.height * k));
      const sctx = small.getContext("2d", { alpha: false });
      sctx.imageSmoothingQuality = "high";
      sctx.drawImage(colorCanvas, 0, 0, small.width, small.height);
      colorCanvas.width = colorCanvas.height = 0;
      colorCanvas = small;
    }

    // 3. Heavy Pixel Math (Film Grain & Soft Bloom) executed strictly on export!
    if (dev.softBloom > 0 || dev.filmGrain > 0) {
      applyAnalogEffects(colorCanvas, { grain: dev.filmGrain, bloom: dev.softBloom });
    }

    if (mode === "edited") {
      return colorCanvas;
    }

    // 4. Exact Percentage Framing & Scaled Fonts for Full Resolution
    const framed = drawFramed(document.createElement("canvas"), colorCanvas, item.exifOverride);
    // Explicitly free temporary colorCanvas memory
    colorCanvas.width = 0;
    colorCanvas.height = 0;
    return framed;
  }

  // ─── Single Image Downloader ───────────────────────────────────────────────
  async function downloadImage(mode = "auto") {
    if (!processedImage || !activeItem) return;

    isDownloading = true;
    downloadStatus = "Exporting…";

    try {
      const exportType =
        mode === "auto" ? (activeTab === "editor" ? "edited" : "framed") : mode;

      // Yield briefly to let UI show the status message
      await new Promise((r) => setTimeout(r, 20));

      // Build final image using original full-resolution source and full effectsEngine
      const exportCanvas = await generateFullResExportCanvas(
        activeItem,
        exportType,
      );

      if (!exportCanvas) throw new Error("Could not generate export canvas");

      const rawName = activeItem.name
        ? activeItem.name.replace(/\.[^.]+$/, "")
        : "photo";
      const cleanName =
        rawName.replace(/[^a-zA-Z0-9_\-\s]/g, "").trim() || "photo";
      const suffix = exportType === "edited" ? "_edited" : "_framed";
      const { blob, ext } = await encodeCanvas(exportCanvas);
      exportCanvas.width = exportCanvas.height = 0;
      const filename = `${cleanName}${suffix}.${ext}`;
      fallbackFilename = filename;

      if (fallbackDownloadUrl && fallbackDownloadUrl.startsWith("blob:")) {
        URL.revokeObjectURL(fallbackDownloadUrl);
      }
      const downloadUrl = URL.createObjectURL(blob);
      fallbackDownloadUrl = downloadUrl;

      // Explicit extension in `download` avoids Chrome's extensionless-blob bug.
      const link = document.createElement("a");
      link.style.display = "none";
      link.href = downloadUrl;
      link.setAttribute("download", filename);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      // Keep the blob alive for the manual fallback link; it is revoked on the next export or on Clear All.
      setTimeout(() => link.remove(), 2000);

      downloadStatus = `Saved ${filename}`;
      setTimeout(() => {
        downloadStatus = "";
      }, 4000);
    } catch (err) {
      console.error("[MinimalFrame] Download failed:", err);
      loadError = `Download failed: ${err.message}`;
      downloadStatus = "Export failed. See the message above the photo.";
    } finally {
      isDownloading = false;
    }
  }

  // ─── Batch Export All (.zip) with JSZip ────────────────────────────────────
  async function exportBatch(mode = "framed") {
    const batch = filesList.filter((item) => item.selected);
    if (batch.length === 0) return;

    isBatchExporting = true;
    const total = batch.length;
    batchProgress = { current: 0, total, percent: 0, filename: "" };

    try {
      let zip = new JSZip();

      for (let i = 0; i < total; i++) {
        const item = batch[i];
        batchProgress = {
          current: i + 1,
          total,
          percent: Math.round(((i + 1) / total) * 100),
          filename: `Processing ${item.name} (full-res)…`,
        };

        // Yield to main thread so UI updates progress bar smoothly
        await new Promise((resolve) => setTimeout(resolve, 20));

        // Generate full-res framed canvas with pixel-level grain/bloom
        const exportCanvas = await generateFullResExportCanvas(
          item,
          mode,
        );
        if (!exportCanvas) continue;

        const { blob, ext } = await encodeCanvas(exportCanvas);
        exportCanvas.width = exportCanvas.height = 0;
        const rawName = item.name.replace(/\.[^.]+$/, "");
        const cleanName = rawName.replace(/[^a-zA-Z0-9_\-\s]/g, "").trim() || `photo_${i + 1}`;
        zip.file(`${mode}_${cleanName}.${ext}`, blob);
      }

      batchProgress.filename = "Compressing ZIP package…";
      await new Promise((resolve) => setTimeout(resolve, 30));

      const zipBlob = await zip.generateAsync({ type: "blob" }, (metadata) => {
        batchProgress.percent = Math.round(metadata.percent);
      });

      // Clear JSZip instance immediately to free RAM on mobile devices
      zip = null;

      const zipUrl = URL.createObjectURL(zipBlob);
      const zipFilename = `MinimalFrame_Batch_${Date.now()}.zip`;

      const link = document.createElement("a");
      link.style.display = "none";
      link.href = zipUrl;
      link.setAttribute("download", zipFilename);
      link.download = zipFilename;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        link.remove();
        URL.revokeObjectURL(zipUrl);
      }, 4000);

      downloadStatus = `Saved ${total} photos to ${zipFilename}`;
      setTimeout(() => {
        downloadStatus = "";
      }, 5000);
    } catch (err) {
      console.error("[MinimalFrame] Batch export error:", err);
      loadError = `Batch export failed: ${err.message}`;
    } finally {
      isBatchExporting = false;
    }
  }

  // ─── Palette Management ────────────────────────────────────────────────────
  function savePalette() {
    const exists = palettes.some(
      (p) => p.bg === backgroundColor && p.text === textColor,
    );
    if (!exists) {
      palettes = [...palettes, { bg: backgroundColor, text: textColor }];
      persistPalettes();
    }
  }

  function applyPalette(p) {
    backgroundColor = p.bg;
    textColor = p.text;
  }

  function deletePalette(i) {
    palettes = palettes.filter((_, idx) => idx !== i);
    persistPalettes();
  }
</script>

<input
  bind:this={fileInput}
  id="mf-file-input"
  class="sr-only"
  type="file"
  multiple
  accept=".jpg,.jpeg,.png,.webp,.avif,.heic,.arw,.cr2,.cr3,.dng,.nef,.orf,.raf,.rw2,.pef,.srw"
  onchange={onFileInput}
  tabindex="-1"
  aria-hidden="true"
/>

{#snippet icon(name)}
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d={ICONS[name]} /></svg>
{/snippet}

<main
  class="app"
  class:empty={filesList.length === 0}
  class:dragging={isDragging}
  style:--hue={activeItem?.hue ?? 38}
  ondrop={onDrop}
  ondragover={onDragOver}
  ondragleave={onDragLeave}
>
  <!-- Ambient backdrop: a deep blur of the current photo, so the whole app takes on its colors. -->
  <div class="ambient" aria-hidden="true">
    {#if activeItem}
      {#key activeItem.id}<img src={activeItem.thumbUrl} alt="" />{/key}
    {:else}
      <span class="blob b1"></span><span class="blob b2"></span><span class="blob b3"></span>
    {/if}
  </div>

  <header class="bar glass">
    <span class="wordmark">MinimalFrame</span>
    {#if activeItem}
      <p class="meta">
        <span class="meta-name">{activeItem.name}</span>
        {#if framedSize.w}<span class="meta-dim">{activeTab === "framing" ? framedSize.w : photoSize.w} × {activeTab === "framing" ? framedSize.h : photoSize.h}</span>{/if}
        {#if activeItem.rawBadge}<span class="pill">RAW</span>{/if}
      </p>
    {/if}
    {#if processedImage}
      <button class="btn accent bar-export" onclick={() => exportDialog?.showModal()}>
        {@render icon("export")}Export
      </button>
    {/if}
  </header>

  <section class="stage" aria-label="Preview">
    <div class="fit" style:display={processedImage ? "flex" : "none"}>
      <div class="print" style:--ar={canvasAspect}>
        <canvas bind:this={canvasEl} aria-label="Preview of {activeItem?.name ?? 'your photo'}"></canvas>
        {#if dev.softBloom > 0}
          <div
            class="fx-bloom"
            style:opacity={(dev.softBloom / 100) * 0.85}
            style:backdrop-filter={`blur(${Math.max(2, Math.round((dev.softBloom / 100) * 10))}px) brightness(1.22)`}
            aria-hidden="true"
          ></div>
        {/if}
        {#if dev.filmGrain > 0}
          <div class="fx-grain" style:opacity={(dev.filmGrain / 100) * 0.75} aria-hidden="true"></div>
        {/if}
        {#key activeItem?.id}<div class="develop" aria-hidden="true"></div>{/key}
      </div>
    </div>

    {#if !processedImage}
      <div class="hero">
        <div class="fan" aria-hidden="true">
          <div class="sample s-instant">
            <span class="sample-photo p-sunset"></span>
            <span class="sample-cap" style:font-family="Caveat">Kyoto, spring</span>
          </div>
          <div class="sample s-film">
            <span class="sample-photo p-sea"></span>
            <span class="sample-cap" style:font-family='"Space Mono"'>X-T5  23mm  ƒ/2</span>
          </div>
          <div class="sample s-mat">
            <span class="sample-photo p-forest"></span>
            <span class="sample-cap" style:font-family='"Cormorant Garamond"'>Fujifilm X-T5</span>
          </div>
        </div>
        <h1>Your photos, beautifully framed.</h1>
        <p class="lead">
          Pick a frame, set the light and add your camera details. Ready for Instagram in seconds, and nothing leaves your device.
        </p>
        <button class="btn accent big" onclick={() => fileInput?.click()} disabled={isLoading}>
          {#if isLoading}<span class="spinner" aria-hidden="true"></span>{loadingStatus || "Opening…"}{:else}Choose photos{/if}
        </button>
        <p class="fine">or drop them anywhere. JPEG, PNG, WebP and RAW from Sony, Canon, Nikon, Fujifilm and more.</p>
      </div>
    {/if}

    {#if isLoading && filesList.length > 0}
      <p class="toast glass" role="status"><span class="spinner" aria-hidden="true"></span>{loadingStatus}</p>
    {/if}
    {#if loadError}
      <p class="alert glass" role="alert">
        {loadError}
        <button onclick={() => (loadError = "")} aria-label="Dismiss">×</button>
      </p>
    {/if}
  </section>

  {#if filesList.length > 0}
    <nav class="strip glass" aria-label="Your photos">
      <ol>
        {#each filesList as item, i (item.id)}
          <li class="frame" class:active={activeImageIndex === i}>
            <button
              class="frame-pick"
              onclick={() => setActiveImage(i)}
              aria-current={activeImageIndex === i ? "true" : undefined}
              aria-label="Show {item.name}"
            >
              <img src={item.thumbUrl} alt="" />
              {#if item.isRaw}<span class="frame-raw">RAW</span>{/if}
            </button>
            <label class="frame-sel" title="Include in batch export">
              <input type="checkbox" bind:checked={item.selected} />
              <span class="sr-only">Include {item.name} in batch export</span>
            </label>
            <button class="frame-del" onclick={(e) => removeImage(i, e)} aria-label="Remove {item.name}">×</button>
          </li>
        {/each}
        <li>
          <button class="frame-add" onclick={() => fileInput?.click()} aria-label="Add photos">+</button>
        </li>
      </ol>
      {#if filesList.length > 1}<p class="strip-note">{selectedCount} of {filesList.length} in batch</p>{/if}
    </nav>

    <aside class="panel glass" aria-label="Controls">
      <div class="seg modes" role="group" aria-label="Mode">
        <button aria-pressed={activeTab === "editor"} onclick={() => (activeTab = "editor")}>Edit</button>
        <button aria-pressed={activeTab === "framing"} onclick={() => (activeTab = "framing")}>Frame</button>
      </div>

      <div class="tabs" class:many={TOOLS[activeTab].length > 4} role="group" aria-label="Tools">
        {#each TOOLS[activeTab] as [id, name] (id)}
          <button class="tab" aria-pressed={activeTool[activeTab] === id} onclick={() => (activeTool[activeTab] = id)}>
            {@render icon(id)}<span>{name}</span>
          </button>
        {/each}
      </div>

      <div class="body">
        {#if activeTab === "editor"}
          {@const tool = activeTool.editor}
          {#if histo}<Histogram bins={histo} />{/if}
          {#if !canDevelop}
            <p class="hint">This device can't run the full editor, so only exposure, contrast and saturation are applied.</p>
          {/if}
          {#if tool === "looks"}
            <div class="looks">
              {#each LOOKS as look (look.id)}
                <button class="look" aria-pressed={isLookActive(look)} onclick={() => applyLook(look)}>
                  {#if lookThumbs[look.id]}
                    <img src={lookThumbs[look.id]} alt="" />
                  {:else}
                    <img src={activeItem?.thumbUrl} alt="" style:filter={cssFilterFor(look.params)} />
                  {/if}
                  <span>{look.name}</span>
                </button>
              {/each}
            </div>
            <button class="btn ghost" onclick={resetColorAdjustments}>Reset all edits</button>
          {:else if tool === "light"}
            <div class="stack">
              <Dial id="d-exposure" label="Exposure" bind:value={dev.exposure} min={-3} max={3} step={0.05} unit="EV" reset={0} signed />
              <Dial id="d-contrast" label="Contrast" bind:value={dev.contrast} min={-100} max={100} reset={0} signed />
              <Dial id="d-highlights" label="Highlights" bind:value={dev.highlights} min={-100} max={100} reset={0} signed />
              <Dial id="d-shadows" label="Shadows" bind:value={dev.shadows} min={-100} max={100} reset={0} signed />
              <Dial id="d-whites" label="Whites" bind:value={dev.whites} min={-100} max={100} reset={0} signed />
              <Dial id="d-blacks" label="Blacks" bind:value={dev.blacks} min={-100} max={100} reset={0} signed />
            </div>
          {:else if tool === "color"}
            <div class="stack">
              <Dial id="d-temp" label="Temperature" bind:value={dev.temperature} min={-100} max={100} reset={0} signed track="linear-gradient(to right, #5d9bff, #ffbe55)" />
              <Dial id="d-tint" label="Tint" bind:value={dev.tint} min={-100} max={100} reset={0} signed track="linear-gradient(to right, #53d36b, #e45ce0)" />
              <Dial id="d-vibrance" label="Vibrance" bind:value={dev.vibrance} min={-100} max={100} reset={0} signed />
              <Dial id="d-saturation" label="Saturation" bind:value={dev.saturation} min={-100} max={100} reset={0} signed />
              <p class="hint">Vibrance boosts muted colors and protects skin tones. Saturation moves every color equally.</p>
            </div>
          {:else if tool === "film"}
            <div class="stack">
              <Dial id="d-grain" label="Film grain" bind:value={dev.filmGrain} unit="%" reset={0} />
              <Dial id="d-bloom" label="Soft bloom" bind:value={dev.softBloom} unit="%" reset={0} />
              <p class="hint">Bloom makes highlights glow like a mist filter. The preview is an approximation; full grain and bloom are rendered when you export.</p>
            </div>
          {/if}
        {:else}
          {@const tool = activeTool.framing}
          {#if tool === "templates"}
            <div class="templates">
              {#each [...BUILTIN_PRESETS, ...userPresets] as p (p.id)}
                {@const r = RATIOS.find((x) => x.id === p.selectedRatioId)}
                {@const f = allFonts.find((x) => x.id === p.selectedFontId) || SYSTEM_FONTS[0]}
                <div class="template">
                  <button onclick={() => applyPreset(p)} aria-label="Apply template {p.name}">
                    <span
                      class="template-mini"
                      style:background={p.backgroundColor}
                      style:color={getContrastingColor(p.backgroundColor)}
                      style:aspect-ratio={r?.w ? `${r.w} / ${r.h}` : p.captionSpace > 16 ? "4 / 5" : "5 / 5.4"}
                      style:padding="{Math.max(6, p.customMarginH)}%"
                    >
                      <span class="template-photo"></span>
                      <span class="template-cap" style:font-family={f.css} style:text-align={p.textAlign}>Aa Camera</span>
                    </span>
                    <span class="template-name">{p.name}</span>
                  </button>
                  {#if userPresets.includes(p)}
                    <button class="mini-del" onclick={(e) => deletePreset(p.id, e)} aria-label="Delete template {p.name}">×</button>
                  {/if}
                </div>
              {/each}
            </div>
            <button
              class="btn ghost"
              onclick={() => {
                newPresetName = "";
                showSavePresetModal = true;
              }}>Save current settings as a template</button
            >
          {:else if tool === "ratio"}
            <div class="ratios">
              {#each RATIOS as r (r.id)}
                <button class="ratio" aria-pressed={selectedRatioId === r.id} onclick={() => (selectedRatioId = r.id)}>
                  <span class="ratio-glyph" class:loose={!r.w} style:aspect-ratio={r.w ? `${r.w} / ${r.h}` : r.id === "orig" ? "3 / 3.6" : "3 / 2.4"}></span>
                  <span>{r.label}</span>
                </button>
              {/each}
            </div>
          {:else if tool === "border"}
            <div class="stack">
              <Dial id="d-margin-h" label="Sides" bind:value={customMarginH} min={0} max={40} unit="%" reset={8} />
              <Dial id="d-margin-v" label="Top and bottom" bind:value={customMarginV} min={0} max={40} unit="%" reset={8} />
              {#if selectedRatioId === "orig"}
                <Dial id="d-caption-space" label="Caption space" bind:value={captionSpace} min={0} max={40} unit="%" reset={12} />
              {/if}
              <p class="hint">The border under the caption always grows enough to fit it.</p>
            </div>
          {:else if tool === "colors"}
            <div class="stack">
              <div>
                <p class="label">Border color</p>
                <div class="swatches">
                  {#each QUICK_BACKGROUNDS as c (c)}
                    <button class="swatch" style:background={c} aria-pressed={backgroundColor.toLowerCase() === c} aria-label="Border color {c}" onclick={() => (backgroundColor = c)}></button>
                  {/each}
                  <label class="swatch swatch-custom" title="Pick any color">
                    <input type="color" bind:value={backgroundColor} />
                    <span class="sr-only">Custom border color</span>
                  </label>
                </div>
              </div>
              <label class="switch">
                <input type="checkbox" role="switch" bind:checked={autoContrast} />
                <span class="switch-track" aria-hidden="true"></span>
                Pick text color automatically
              </label>
              {#if !autoContrast}
                <label class="color-row">
                  <input type="color" bind:value={textColor} />
                  Text color <span class="hint">{textColor}</span>
                </label>
              {/if}
              {#if palettes.length > 0}
                <div>
                  <p class="label">Saved pairs</p>
                  <div class="swatches">
                    {#each palettes as pal, i (i)}
                      <span class="pair">
                        <button class="swatch" style:background={pal.bg} onclick={() => applyPalette(pal)} aria-label="Use saved pair {i + 1}">
                          <span class="pair-dot" style:background={pal.text}></span>
                        </button>
                        <button class="mini-del" onclick={() => deletePalette(i)} aria-label="Delete saved pair {i + 1}">×</button>
                      </span>
                    {/each}
                  </div>
                </div>
              {/if}
              <button class="btn ghost" onclick={savePalette}>Save this color pair</button>
            </div>
          {:else if tool === "caption"}
            <div class="stack">
              <label class="switch">
                <input type="checkbox" role="switch" bind:checked={showExif} />
                <span class="switch-track" aria-hidden="true"></span>
                Show camera details
              </label>
              {#if showExif}
                {#if activeItem}
                  <div class="fields">
                    {#each EXIF_FIELDS as [key, name, example] (key)}
                      <div class="field">
                        <label class="field-check">
                          <input type="checkbox" bind:checked={exifDisplay[key]} />
                          {name}
                        </label>
                        <input class="text" type="text" bind:value={activeItem.exifOverride[key]} placeholder={example} aria-label={name} disabled={!exifDisplay[key]} />
                      </div>
                    {/each}
                  </div>
                  <p class="hint">Missing details? Type them in. Changes apply to this photo only.</p>
                {/if}

                <div>
                  <p class="label">Font</p>
                  <div class="fonts">
                    {#each allFonts as f (f.id)}
                      <button class="font" aria-pressed={selectedFontId === f.id} onclick={() => (selectedFontId = f.id)}>
                        <span class="font-aa" style:font-family={f.css}>Aa</span>
                        <span class="font-name">{f.label}</span>
                      </button>
                    {/each}
                  </div>
                </div>
                <div class="font-more">
                  {#if canBrowseLocalFonts}
                    {#if localFamilies.length}
                      <label class="label" for="local-font">Fonts on this computer</label>
                      <input
                        id="local-font"
                        class="text"
                        list="local-font-list"
                        placeholder="Type to search {localFamilies.length} fonts"
                        onchange={(e) => useLocalFont(e.currentTarget.value)}
                      />
                      <datalist id="local-font-list">
                        {#each localFamilies as fam (fam)}<option value={fam}></option>{/each}
                      </datalist>
                    {:else}
                      <button class="btn ghost" onclick={browseLocalFonts}>Use a font from this computer</button>
                    {/if}
                  {/if}
                  <label class="btn ghost upload-font">
                    Upload a font file
                    <input type="file" accept=".ttf,.otf,.woff,.woff2" onchange={onFontFile} class="sr-only" />
                  </label>
                  {#if fontError}<p class="hint warn" role="alert">{fontError}</p>{/if}
                </div>

                <div>
                  <p class="label">Size</p>
                  <div class="seg">
                    <button aria-pressed={autoFontSize} onclick={() => (autoFontSize = true)}>Fit automatically</button>
                    <button aria-pressed={!autoFontSize} onclick={() => (autoFontSize = false)}>Set by hand</button>
                  </div>
                </div>
                {#if !autoFontSize}
                  <Dial id="d-font" label="Text size" bind:value={manualFontSize} min={10} max={80} reset={24} />
                {/if}
                <div>
                  <p class="label">Alignment</p>
                  <div class="seg">
                    <button aria-pressed={textAlign === "left"} onclick={() => setAlignment("left")}>Left</button>
                    <button aria-pressed={textAlign === "center"} onclick={() => setAlignment("center")}>Center</button>
                    <button aria-pressed={textAlign === "right"} onclick={() => setAlignment("right")}>Right</button>
                  </div>
                </div>
                <div>
                  <p class="label">Place</p>
                  <div class="seg">
                    <button aria-pressed={textZone === "bottom"} onclick={() => setZone("bottom")}>Below photo</button>
                    <button aria-pressed={textZone === "top"} onclick={() => setZone("top")}>Above photo</button>
                  </div>
                </div>
              {/if}
            </div>
          {:else if tool === "position"}
            {#if showExif}
              <div class="stack">
                <Dial id="d-text-x" label="Across the photo" bind:value={textPosX} unit="%" />
                <Dial id="d-text-y" label="Distance from photo" bind:value={textPosY} unit="%" reset={50} />
                <p class="hint">The caption always stays inside the frame and never covers your photo.</p>
                <button class="btn ghost" onclick={resetTextPosition}>Reset caption position</button>
              </div>
            {:else}
              <p class="hint">Turn on camera details under Caption to place them.</p>
            {/if}
          {:else if tool === "logo"}
            {#if logoImage}
              <div class="stack">
                <div class="logo-row">
                  <img src={logoImage.src} alt="" />
                  <span class="logo-name">{logoName || "Your logo"}</span>
                  <button class="btn ghost" onclick={removeLogo}>Remove</button>
                </div>
                <div>
                  <p class="label">Snap to</p>
                  <div class="seg wrap">
                    <button onclick={() => setLogoPreset("top-left")}>Top left</button>
                    <button onclick={() => setLogoPreset("top-right")}>Top right</button>
                    <button onclick={() => setLogoPreset("center")}>Center</button>
                    <button onclick={() => setLogoPreset("bottom-left")}>Bottom left</button>
                    <button onclick={() => setLogoPreset("bottom-right")}>Bottom right</button>
                  </div>
                </div>
                <Dial id="d-logo-scale" label="Size" bind:value={logoScale} min={3} max={45} unit="%" reset={12} />
                <Dial id="d-logo-opacity" label="Opacity" bind:value={logoOpacity} min={5} max={100} unit="%" reset={85} />
                <Dial id="d-logo-x" label="Across" bind:value={logoPosX} unit="%" />
                <Dial id="d-logo-y" label="Up and down" bind:value={logoPosY} unit="%" />
              </div>
            {:else}
              <label class="upload">
                <span class="upload-title">Add your logo or signature</span>
                <span class="hint">A PNG or SVG with a transparent background works best.</span>
                <input type="file" accept=".png,.svg,.webp,.jpg,.jpeg" onchange={onLogoInput} class="sr-only" />
              </label>
            {/if}
          {/if}
        {/if}
      </div>
    </aside>
  {/if}

  <!-- ─── Export sheet ──────────────────────────────────────────────────── -->
  <dialog
    bind:this={exportDialog}
    class="sheet glass"
    aria-labelledby="export-title"
    onclick={(e) => {
      if (e.target === exportDialog && !isBatchExporting) exportDialog.close();
    }}
    oncancel={(e) => isBatchExporting && e.preventDefault()}
  >
    <div class="sheet-in">
      <div class="sheet-head">
        <h2 id="export-title">Export</h2>
        <button class="close" onclick={() => exportDialog.close()} disabled={isBatchExporting} aria-label="Close">×</button>
      </div>

      {#if isBatchExporting}
        <div class="progress" role="status">
          <p>Exporting {batchProgress.current} of {batchProgress.total}</p>
          <div class="progress-track"><div style:width="{batchProgress.percent}%"></div></div>
          <p class="hint">{batchProgress.filename}</p>
        </div>
      {:else}
        <fieldset>
          <legend class="label">Size</legend>
          <div class="sizes">
            {#each EXPORT_SIZES as s (s.id)}
              <label class="size" class:on={exportPrefs.size === s.id}>
                <input type="radio" name="size" value={s.id} bind:group={exportPrefs.size} class="sr-only" />
                <strong>{s.label}</strong>
                <span>{sizeLabel(s, "framed")}</span>
              </label>
            {/each}
          </div>
        </fieldset>
        <div class="two">
          <div>
            <p class="label">Format</p>
            <div class="seg">
              <button aria-pressed={exportPrefs.format === "jpeg"} onclick={() => (exportPrefs.format = "jpeg")}>JPEG</button>
              <button aria-pressed={exportPrefs.format === "png"} onclick={() => (exportPrefs.format = "png")}>PNG</button>
              <button aria-pressed={exportPrefs.format === "webp"} onclick={() => (exportPrefs.format = "webp")}>WebP</button>
            </div>
          </div>
          <div>
            <p class="label">Quality</p>
            <div class="seg">
              {#each [["good", "Good"], ["high", "High"], ["max", "Max"]] as [q, name] (q)}
                <button aria-pressed={exportPrefs.quality === q} onclick={() => (exportPrefs.quality = q)} disabled={exportPrefs.format === "png"}>{name}</button>
              {/each}
            </div>
          </div>
        </div>
        <p class="hint">
          {exportPrefs.format === "png"
            ? "PNG is lossless: the best quality, but large files."
            : exportPrefs.format === "webp"
              ? "WebP is about a third smaller than JPEG at the same quality."
              : "JPEG works everywhere. High is a good balance; Max keeps every detail."}
        </p>

        <div class="actions">
          <!-- svelte-ignore a11y_autofocus -->
          <button class="btn accent big" onclick={() => downloadImage("framed")} disabled={!processedImage || isDownloading} autofocus>
            {isDownloading ? "Exporting…" : "Save framed photo"}
          </button>
          <button class="btn ghost" onclick={() => downloadImage("edited")} disabled={!processedImage || isDownloading}>Save photo only, without frame</button>
          {#if filesList.length > 1}
            <button class="btn ghost" onclick={() => exportBatch("framed")} disabled={selectedCount === 0 || isDownloading}>
              Save {selectedCount} framed {selectedCount === 1 ? "photo" : "photos"} as ZIP
            </button>
          {/if}
        </div>
        {#if downloadStatus}<p class="status" role="status">{downloadStatus}</p>{/if}
        {#if fallbackDownloadUrl}
          <a class="fallback" href={fallbackDownloadUrl} download={fallbackFilename}>Download didn't start? Save {fallbackFilename}</a>
        {/if}
      {/if}
    </div>
  </dialog>

  {#if showSavePresetModal}
    <div class="overlay" role="presentation" onclick={(e) => e.target === e.currentTarget && (showSavePresetModal = false)}>
      <div class="sheet-in glass card" role="dialog" aria-modal="true" aria-labelledby="save-title">
        <h2 id="save-title">Save as template</h2>
        <p class="hint">Keeps your ratio, border, colors, caption style, logo placement and edits for one-tap reuse.</p>
        <!-- svelte-ignore a11y_autofocus -->
        <input
          class="text"
          type="text"
          placeholder="e.g. White gallery"
          aria-label="Template name"
          bind:value={newPresetName}
          autofocus
          onkeydown={(e) => {
            if (e.key === "Enter") saveCurrentPreset(newPresetName);
            if (e.key === "Escape") showSavePresetModal = false;
          }}
        />
        <div class="actions row">
          <button class="btn ghost" onclick={() => (showSavePresetModal = false)}>Cancel</button>
          <button class="btn accent" onclick={() => saveCurrentPreset(newPresetName)} disabled={!newPresetName.trim()}>Save template</button>
        </div>
      </div>
    </div>
  {/if}
</main>

<style>
  /* ── Shell ─────────────────────────────────────────────────────────────── */
  .app {
    /* The accent follows the photo's dominant hue (set inline as --hue). */
    --accent: hsl(var(--hue) 88% 72%);
    --accent-strong: hsl(var(--hue) 90% 80%);
    position: relative;
    height: 100dvh;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 384px;
    grid-template-rows: auto minmax(0, 1fr) auto;
    grid-template-areas:
      "bar bar"
      "stage panel"
      "strip panel";
    gap: 14px;
    padding: 14px;
    padding-top: max(14px, env(safe-area-inset-top));
    padding-bottom: max(14px, env(safe-area-inset-bottom));
  }
  .app.empty {
    grid-template-columns: 1fr;
    grid-template-rows: auto minmax(0, 1fr);
    grid-template-areas: "bar" "stage";
  }
  .app > :is(.bar, .stage, .strip, .panel) {
    position: relative;
    z-index: 1;
  }
  .app.dragging .stage {
    outline: 2px dashed var(--accent);
    outline-offset: -6px;
    border-radius: var(--radius);
  }

  /* ── Ambient backdrop ──────────────────────────────────────────────────── */
  .ambient {
    position: fixed;
    inset: 0;
    z-index: 0;
    overflow: hidden;
    background: #0c0c10;
  }
  .ambient img {
    position: absolute;
    inset: -12%;
    width: 124%;
    height: 124%;
    object-fit: cover;
    filter: blur(64px) saturate(1.5) brightness(0.62);
    animation: fade-in 900ms ease-out;
  }
  .ambient::after {
    /* gentle vignette so glass panels keep their contrast at the edges */
    content: "";
    position: absolute;
    inset: 0;
    background: radial-gradient(120% 90% at 50% 40%, transparent 40%, rgb(0 0 0 / 0.45));
  }
  .blob {
    position: absolute;
    width: 60vmax;
    height: 60vmax;
    border-radius: 50%;
    filter: blur(80px);
    opacity: 0.55;
    animation: drift 28s ease-in-out infinite alternate;
  }
  .b1 { background: #ff8a5c; top: -20vmax; left: -15vmax; }
  .b2 { background: #6a7dff; bottom: -25vmax; right: -15vmax; animation-delay: -9s; }
  .b3 { background: #2fc6a0; top: 30%; left: 35%; width: 40vmax; height: 40vmax; opacity: 0.35; animation-delay: -17s; }
  @keyframes drift {
    to { transform: translate(8vmax, -6vmax) scale(1.15); }
  }
  @keyframes fade-in {
    from { opacity: 0; }
  }

  /* ── Glass ─────────────────────────────────────────────────────────────── */
  .glass {
    background: var(--glass);
    -webkit-backdrop-filter: blur(28px) saturate(1.5);
    backdrop-filter: blur(28px) saturate(1.5);
    border: 1px solid var(--glass-line);
    border-radius: var(--radius);
    box-shadow:
      inset 0 1px 0 rgb(255 255 255 / 0.07),
      0 18px 50px -20px rgb(0 0 0 / 0.55);
  }

  /* ── Top bar ───────────────────────────────────────────────────────────── */
  .bar {
    grid-area: bar;
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 8px 8px 8px 20px;
    min-height: 56px;
    border-radius: 999px;
  }
  .wordmark {
    font-stretch: 112%;
    font-weight: 750;
    font-size: 1.05rem;
    letter-spacing: -0.02em;
    white-space: nowrap;
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    margin: 0 auto;
    font-size: 0.87rem;
    color: var(--muted);
  }
  .meta-name {
    color: var(--text);
    font-weight: 550;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 28ch;
  }
  .meta-dim {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .pill {
    padding: 2px 8px;
    border-radius: 999px;
    border: 1px solid var(--glass-line);
    font-size: 0.72rem;
    font-weight: 650;
    letter-spacing: 0.04em;
    color: var(--accent);
  }
  .bar-export {
    margin-left: auto;
  }
  .meta + .bar-export {
    margin-left: 0;
  }

  /* ── Buttons ───────────────────────────────────────────────────────────── */
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 11px 18px;
    border-radius: 999px;
    font-size: 0.95rem;
    font-weight: 600;
    transition: background 150ms, border-color 150ms, transform 120ms;
  }
  .btn :global(svg) {
    width: 18px;
    height: 18px;
  }
  .btn:active:not(:disabled) {
    transform: scale(0.97);
  }
  .btn.accent {
    background: var(--accent);
    color: #111;
  }
  .btn.accent:hover:not(:disabled) {
    background: var(--accent-strong);
  }
  .btn.ghost {
    border: 1px solid var(--glass-line);
    background: rgb(255 255 255 / 0.06);
    color: var(--text);
  }
  .btn.ghost:hover:not(:disabled) {
    background: rgb(255 255 255 / 0.12);
  }
  .btn.big {
    padding: 15px 26px;
    font-size: 1.05rem;
  }
  button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.7;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  /* ── Stage ─────────────────────────────────────────────────────────────── */
  .stage {
    grid-area: stage;
    min-height: 0;
  }
  .fit {
    position: absolute;
    inset: 8px;
    align-items: center;
    justify-content: center;
    container-type: size;
  }
  .print {
    position: relative;
    width: min(100cqw, 100cqh * var(--ar));
    aspect-ratio: var(--ar);
    border-radius: 3px;
    overflow: hidden;
    box-shadow:
      0 2px 4px rgb(0 0 0 / 0.25),
      0 40px 80px -30px rgb(0 0 0 / 0.75);
  }
  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
  .fx-bloom,
  .fx-grain,
  .develop {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .fx-bloom {
    mix-blend-mode: screen;
  }
  .fx-grain {
    mix-blend-mode: overlay;
    background: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E") 0 0 / 160px 160px;
  }
  .develop {
    background: #fff;
    animation: develop 650ms cubic-bezier(0.2, 0.7, 0.2, 1) forwards;
  }
  @keyframes develop {
    from { opacity: 0.85; }
    to { opacity: 0; }
  }

  /* ── Empty state ───────────────────────────────────────────────────────── */
  .hero {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 18px;
    padding: 24px;
    text-align: center;
    overflow: auto;
  }
  .fan {
    position: relative;
    width: 420px;
    max-width: 90vw;
    height: 230px;
    margin-bottom: 18px;
  }
  .sample {
    position: absolute;
    top: 0;
    left: 50%;
    width: 150px;
    display: flex;
    flex-direction: column;
    box-shadow: 0 24px 50px -18px rgb(0 0 0 / 0.7);
    transition: transform 300ms cubic-bezier(0.2, 0.7, 0.2, 1);
  }
  .sample-photo {
    display: block;
    aspect-ratio: 1;
  }
  .sample-cap {
    font-size: 0.8rem;
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
  }
  .s-instant {
    background: #fbfaf6;
    color: #222;
    padding: 9px 9px 0;
    transform: translateX(-140%) rotate(-9deg) translateY(16px);
  }
  .s-instant .sample-cap {
    font-size: 1.05rem;
    padding: 9px 0 12px;
    text-align: center;
  }
  .s-film {
    background: #000;
    color: #ddd;
    padding: 6px;
    z-index: 1;
    transform: translateX(-50%) translateY(-4px);
  }
  .s-film .sample-cap {
    font-size: 0.62rem;
    padding: 6px 0 2px;
  }
  .s-mat {
    background: #f2efe8;
    color: #333;
    padding: 18px 18px 0;
    transform: translateX(40%) rotate(8deg) translateY(20px);
  }
  .s-mat .sample-cap {
    font-size: 0.85rem;
    padding: 10px 0 14px;
    text-align: center;
  }
  .fan:hover .s-instant { transform: translateX(-155%) rotate(-12deg) translateY(10px); }
  .fan:hover .s-mat { transform: translateX(55%) rotate(11deg) translateY(14px); }
  .p-sunset { background: linear-gradient(170deg, #ffb26b 0%, #ff7a7a 45%, #4a3a6b 100%); }
  .p-sea { background: linear-gradient(180deg, #9fd3ff 0%, #4f8fc0 50%, #1d3d5c 100%); }
  .p-forest { background: linear-gradient(160deg, #cfe8a0 0%, #5f9a5a 50%, #23402c 100%); }
  .hero h1 {
    font-stretch: 112%;
    font-weight: 750;
    font-size: clamp(2rem, 4.6vw, 3.4rem);
    line-height: 1.04;
    letter-spacing: -0.03em;
    max-width: 16ch;
    text-wrap: balance;
  }
  .lead {
    max-width: 44ch;
    font-size: 1.08rem;
    line-height: 1.5;
    color: var(--muted);
    text-wrap: pretty;
  }
  .fine {
    max-width: 52ch;
    font-size: 0.85rem;
    color: var(--muted);
  }

  .toast,
  .alert {
    position: absolute;
    left: 50%;
    translate: -50% 0;
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: calc(100% - 32px);
    padding: 10px 16px;
    border-radius: 999px;
    font-size: 0.9rem;
  }
  .toast {
    bottom: 12px;
  }
  .alert {
    top: 12px;
    border-color: var(--accent);
  }
  .alert button {
    font-size: 1.2rem;
    line-height: 1;
    padding: 0 4px;
  }
  .spinner {
    width: 18px;
    height: 18px;
    border: 2px solid rgb(255 255 255 / 0.25);
    border-top-color: currentColor;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    flex: none;
  }
  @keyframes spin {
    to { rotate: 360deg; }
  }

  /* ── Strip ─────────────────────────────────────────────────────────────── */
  .strip {
    grid-area: strip;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 10px 14px;
    min-width: 0;
    justify-self: start;
    max-width: 100%;
  }
  .strip ol {
    display: flex;
    gap: 10px;
    list-style: none;
    overflow-x: auto;
    scrollbar-width: none;
    padding: 6px 4px 4px;
    min-width: 0;
  }
  .strip-note {
    flex: none;
    font-size: 0.82rem;
    color: var(--muted);
    padding-right: 6px;
  }
  .frame {
    position: relative;
    flex: none;
  }
  .frame-pick {
    position: relative;
    display: block;
    height: 56px;
    border-radius: 10px;
    overflow: hidden;
    outline: 2px solid transparent;
    outline-offset: 2px;
    transition: outline-color 150ms;
  }
  .frame.active .frame-pick {
    outline-color: var(--accent);
  }
  .frame-pick img {
    display: block;
    height: 100%;
    width: auto;
  }
  .frame-raw {
    position: absolute;
    bottom: 3px;
    right: 3px;
    padding: 0 4px;
    border-radius: 4px;
    background: rgb(0 0 0 / 0.6);
    font-size: 0.6rem;
    font-weight: 700;
  }
  .frame-sel {
    position: absolute;
    top: 4px;
    left: 4px;
    display: grid;
  }
  .frame-sel input {
    width: 15px;
    height: 15px;
    accent-color: var(--accent);
  }
  .frame-del,
  .mini-del {
    position: absolute;
    top: -6px;
    right: -6px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: #fff;
    color: #111;
    font-size: 0.9rem;
    line-height: 1;
    box-shadow: 0 2px 6px rgb(0 0 0 / 0.35);
  }
  .frame-del {
    opacity: 0;
    transition: opacity 120ms;
  }
  .frame:hover .frame-del,
  .frame.active .frame-del,
  .frame-del:focus-visible {
    opacity: 1;
  }
  .frame-add {
    width: 56px;
    height: 56px;
    border-radius: 10px;
    border: 1px dashed rgb(255 255 255 / 0.35);
    font-size: 1.5rem;
    color: var(--muted);
  }
  .frame-add:hover {
    color: var(--text);
    border-color: var(--text);
  }

  /* ── Control panel ─────────────────────────────────────────────────────── */
  .panel {
    grid-area: panel;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }
  .seg {
    display: inline-flex;
    padding: 3px;
    gap: 2px;
    border-radius: 999px;
    background: rgb(0 0 0 / 0.25);
    border: 1px solid var(--glass-line);
  }
  .seg button {
    padding: 8px 14px;
    border-radius: 999px;
    font-size: 0.88rem;
    font-weight: 550;
    color: var(--muted);
    transition: background 150ms, color 150ms;
  }
  .seg button:hover:not(:disabled) {
    color: var(--text);
  }
  .seg button[aria-pressed="true"] {
    background: rgb(255 255 255 / 0.92);
    color: #111;
  }
  .seg.wrap {
    display: flex;
    flex-wrap: wrap;
    background: none;
    border: 0;
    padding: 0;
    gap: 6px;
  }
  .seg.wrap button {
    border: 1px solid var(--glass-line);
    background: rgb(255 255 255 / 0.05);
  }
  .modes {
    display: grid;
    grid-template-columns: 1fr 1fr;
    margin: 14px 14px 4px;
  }
  .modes button {
    padding: 10px;
    font-size: 0.98rem;
    font-weight: 650;
  }

  .tabs {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
    padding: 10px 10px 6px;
    border-bottom: 1px solid var(--glass-line);
    flex: none;
  }
  .tab {
    display: grid;
    justify-items: center;
    gap: 5px;
    padding: 9px 4px 8px;
    border-radius: 14px;
    font-size: 0.75rem;
    color: var(--muted);
    transition: background 150ms, color 150ms;
  }
  .tab svg {
    width: 22px;
    height: 22px;
  }
  .tab:hover {
    color: var(--text);
    background: rgb(255 255 255 / 0.06);
  }
  .tab[aria-pressed="true"] {
    color: var(--accent);
    background: rgb(255 255 255 / 0.1);
  }

  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 16px 18px 20px;
    display: flex;
    flex-direction: column;
    gap: 18px;
    scrollbar-width: thin;
  }
  .stack {
    display: grid;
    gap: 20px;
  }
  .label {
    display: block;
    font-size: 0.82rem;
    color: var(--muted);
    margin-bottom: 8px;
  }
  .hint {
    font-size: 0.83rem;
    line-height: 1.45;
    color: var(--muted);
  }
  .hint.warn {
    color: var(--accent);
  }

  /* Looks */
  .looks {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14px 10px;
  }
  .look {
    display: grid;
    gap: 6px;
    font-size: 0.8rem;
    color: var(--muted);
  }
  .look img {
    width: 100%;
    aspect-ratio: 1;
    object-fit: cover;
    border-radius: 12px;
    outline: 2px solid transparent;
    outline-offset: 2px;
    transition: outline-color 150ms;
  }
  .look[aria-pressed="true"] {
    color: var(--text);
  }
  .look[aria-pressed="true"] img {
    outline-color: var(--accent);
  }

  /* Templates */
  .templates {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px 10px;
    align-items: end;
  }
  .template {
    position: relative;
  }
  .template > button:first-child {
    width: 100%;
    display: grid;
    gap: 6px;
    justify-items: center;
  }
  .template-mini {
    width: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 7%;
    border-radius: 4px;
    box-shadow: 0 8px 18px -8px rgb(0 0 0 / 0.6);
    transition: transform 150ms;
  }
  .template > button:hover .template-mini {
    transform: translateY(-2px);
  }
  .template-photo {
    flex: 1;
    min-height: 30%;
    background: linear-gradient(160deg, hsl(var(--hue) 60% 70%), hsl(calc(var(--hue) + 40) 40% 30%));
  }
  .template-cap {
    font-size: 0.6rem;
    line-height: 1;
    white-space: nowrap;
    overflow: hidden;
  }
  .template-name {
    font-size: 0.8rem;
    color: var(--muted);
  }

  /* Ratios */
  .ratios {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }
  .ratio {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    border-radius: 14px;
    background: rgb(255 255 255 / 0.05);
    border: 1px solid transparent;
    font-size: 0.88rem;
    text-align: left;
    color: var(--muted);
  }
  .ratio-glyph {
    flex: none;
    height: 24px;
    border: 2px solid currentColor;
    border-radius: 3px;
  }
  .ratio-glyph.loose {
    border-style: dashed;
  }
  .ratio[aria-pressed="true"] {
    border-color: var(--accent);
    color: var(--text);
  }
  .ratio[aria-pressed="true"] .ratio-glyph {
    color: var(--accent);
  }

  /* Colors */
  .swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .swatch {
    position: relative;
    width: 38px;
    height: 38px;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.25);
    display: grid;
    place-items: center;
  }
  .swatch[aria-pressed="true"] {
    outline: 2px solid var(--accent);
    outline-offset: 3px;
  }
  .swatch-custom {
    cursor: pointer;
    background: conic-gradient(#ff5c8a, #ffb13e, #e6ff3e, #3effa8, #3eb8ff, #8a3eff, #ff5c8a);
    overflow: hidden;
  }
  .swatch-custom input {
    opacity: 0;
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    cursor: pointer;
  }
  .pair {
    position: relative;
  }
  .pair-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
  }
  .color-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .color-row input {
    width: 40px;
    height: 32px;
    border: 1px solid var(--glass-line);
    border-radius: 8px;
    background: none;
  }

  /* Switch */
  .switch {
    display: flex;
    align-items: center;
    gap: 12px;
    cursor: pointer;
    font-size: 0.93rem;
  }
  .switch input {
    position: absolute;
    opacity: 0;
    width: 1px;
    height: 1px;
  }
  .switch-track {
    flex: none;
    width: 44px;
    height: 26px;
    border-radius: 999px;
    background: rgb(255 255 255 / 0.18);
    position: relative;
    transition: background 150ms;
  }
  .switch-track::after {
    content: "";
    position: absolute;
    top: 3px;
    left: 3px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 2px 4px rgb(0 0 0 / 0.3);
    transition: translate 150ms;
  }
  .switch input:checked + .switch-track {
    background: var(--accent);
  }
  .switch input:checked + .switch-track::after {
    translate: 18px 0;
  }
  .switch input:focus-visible + .switch-track {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  /* Caption fields & fonts */
  .fields {
    display: grid;
    gap: 8px;
  }
  .field {
    display: grid;
    grid-template-columns: 8rem 1fr;
    align-items: center;
    gap: 10px;
  }
  .field-check {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.86rem;
    color: var(--muted);
    cursor: pointer;
  }
  .field-check input {
    width: 16px;
    height: 16px;
    accent-color: var(--accent);
  }
  .text {
    width: 100%;
    min-width: 0;
    padding: 10px 12px;
    background: rgb(0 0 0 / 0.25);
    border: 1px solid var(--glass-line);
    border-radius: 12px;
    font-size: 0.92rem;
  }
  .text:focus {
    border-color: var(--accent);
    outline: none;
  }
  .text:disabled {
    opacity: 0.4;
  }
  .fonts {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .font {
    display: grid;
    justify-items: center;
    gap: 2px;
    padding: 10px 4px 8px;
    border-radius: 14px;
    background: rgb(255 255 255 / 0.05);
    border: 1px solid transparent;
    min-width: 0;
  }
  .font-aa {
    font-size: 1.5rem;
    line-height: 1.1;
  }
  .font-name {
    font-size: 0.72rem;
    color: var(--muted);
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .font[aria-pressed="true"] {
    border-color: var(--accent);
  }
  .font-more {
    display: grid;
    gap: 8px;
  }
  .upload-font {
    cursor: pointer;
  }

  /* Logo */
  .logo-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .logo-row img {
    width: 48px;
    height: 48px;
    object-fit: contain;
    padding: 6px;
    border-radius: 12px;
    background: rgb(255 255 255 / 0.12);
  }
  .logo-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.92rem;
  }
  .upload {
    display: grid;
    gap: 6px;
    padding: 22px 18px;
    border: 1px dashed rgb(255 255 255 / 0.35);
    border-radius: 16px;
    cursor: pointer;
  }
  .upload:hover,
  .upload:focus-within {
    border-color: var(--accent);
  }
  .upload-title {
    font-weight: 650;
  }

  /* ── Export sheet & dialogs ────────────────────────────────────────────── */
  .sheet {
    margin: auto;
    width: min(500px, calc(100% - 32px));
    max-height: calc(100dvh - 32px);
    padding: 0;
    color: var(--text);
    background: var(--glass-strong);
  }
  .sheet[open] {
    animation: rise 240ms cubic-bezier(0.2, 0.7, 0.2, 1);
  }
  .sheet::backdrop {
    background: rgb(0 0 0 / 0.45);
    backdrop-filter: blur(4px);
  }
  @keyframes rise {
    from { translate: 0 24px; opacity: 0; }
  }
  .sheet-in {
    display: grid;
    gap: 18px;
    padding: 22px;
    padding-bottom: max(22px, env(safe-area-inset-bottom));
  }
  .sheet-head {
    display: flex;
    align-items: center;
  }
  .sheet-in h2 {
    font-stretch: 112%;
    font-weight: 750;
    font-size: 1.5rem;
    letter-spacing: -0.02em;
  }
  .close {
    margin-left: auto;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    font-size: 1.3rem;
    background: rgb(255 255 255 / 0.08);
  }
  fieldset {
    border: 0;
  }
  .sizes {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }
  .size {
    display: grid;
    gap: 2px;
    padding: 12px 8px;
    border-radius: 14px;
    background: rgb(255 255 255 / 0.05);
    border: 1px solid transparent;
    text-align: center;
    cursor: pointer;
  }
  .size strong {
    font-size: 0.92rem;
    font-weight: 650;
  }
  .size span {
    font-size: 0.7rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .size.on {
    border-color: var(--accent);
  }
  .size:focus-within {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .two {
    display: flex;
    flex-wrap: wrap;
    gap: 16px 22px;
  }
  .actions {
    display: grid;
    gap: 8px;
  }
  .actions.row {
    grid-template-columns: 1fr 1.4fr;
  }
  .status {
    font-size: 0.92rem;
  }
  .fallback {
    color: var(--accent);
    font-size: 0.92rem;
    text-underline-offset: 3px;
  }
  .progress {
    display: grid;
    gap: 10px;
  }
  .progress-track {
    height: 6px;
    border-radius: 3px;
    background: rgb(255 255 255 / 0.15);
    overflow: hidden;
  }
  .progress-track div {
    height: 100%;
    background: var(--accent);
    transition: width 200ms;
  }
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 10;
    display: grid;
    place-items: center;
    padding: 16px;
    background: rgb(0 0 0 / 0.45);
  }
  .card {
    width: min(420px, 100%);
    background: var(--glass-strong);
  }

  /* ── Phone ─────────────────────────────────────────────────────────────── */
  @media (max-width: 899px) {
    .app {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto minmax(0, 1fr) auto auto;
      grid-template-areas: "bar" "stage" "strip" "panel";
      gap: 10px;
      padding: 10px;
      padding-top: max(10px, env(safe-area-inset-top));
      padding-bottom: max(10px, env(safe-area-inset-bottom));
    }
    .bar {
      min-height: 48px;
      padding: 6px 6px 6px 16px;
    }
    .meta-dim {
      display: none;
    }
    .strip {
      padding: 6px 10px;
      justify-self: stretch;
    }
    .strip-note {
      display: none;
    }
    .frame-pick,
    .frame-add {
      height: 44px;
    }
    .frame-add {
      width: 44px;
    }
    .panel {
      max-height: 46dvh;
    }
    .modes {
      margin: 10px 10px 2px;
    }
    .tabs.many {
      display: flex;
      overflow-x: auto;
      scrollbar-width: none;
    }
    .tabs.many .tab {
      flex: none;
      min-width: 68px;
    }
    .body {
      padding: 14px 14px 16px;
    }
    .field {
      grid-template-columns: 7rem 1fr;
    }
    .sizes {
      grid-template-columns: repeat(2, 1fr);
    }
    .sheet {
      margin: auto 0 0;
      width: 100%;
      max-width: none;
      border-radius: var(--radius) var(--radius) 0 0;
    }
    .fan {
      height: 190px;
      transform: scale(0.85);
    }
  }
</style>
