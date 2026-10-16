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
  import { computeFrameLayout, autoBorderAxis } from "./lib/frameLayout.js";
  import { extractPalette, tint } from "./lib/palette.js";
  import { idbGet, idbSet } from "./lib/store.js";
  import { cleanCamera, cleanLens, cameraBrand } from "./lib/exifCleaner.js";
  import { parseCube } from "./lib/lut.js";
  import { parseRecipe } from "./lib/recipes.js";
  import { imageStats, matchLook } from "./lib/matchLook.js";
  import {
    CROP_DEFAULT,
    CROP_RATIOS,
    applyGeometry,
    isIdentity,
    normalizedAspect,
    fitRect,
    dragRect,
    turnedSize,
  } from "./lib/geometry.js";
  import Histogram from "./lib/Histogram.svelte";
  import CurveEditor from "./lib/CurveEditor.svelte";
  import {
    DEV_DEFAULTS,
    MIXER_BANDS,
    freshDev,
    applyDetail,
    isDevelopSupported,
    develop,
    downscaleLinear,
    cssFilterFor,
    histogram,
    registerLut,
    unregisterLut,
  } from "./lib/developEngine.js";

  // ─── Mode Navigation ───────────────────────────────────────────────────────
  // 'editor' = Color & Light Adjustments | 'framing' = Frame & EXIF Typography
  let activeTab = $state("framing");

  // One tool panel open at a time per mode, like a camera's quick menu.
  const TOOLS = {
    editor: [
      ["looks", "Looks"], ["crop", "Crop"], ["light", "Light"], ["color", "Color"],
      ["curve", "Curve"], ["mixer", "Mixer"], ["detail", "Detail"], ["film", "Film"],
    ],
    framing: [
      ["templates", "Templates"], ["ratio", "Ratio"], ["border", "Border"], ["colors", "Colors"],
      ["caption", "Caption"], ["position", "Position"], ["logo", "Logo"],
    ],
  };
  let activeTool = $state({ editor: "looks", framing: "ratio" });
  // Phones: the tool panel folds down to its tab row so the photo can use the screen (CSS hides it only ≤600px).
  let sheetOpen = $state(true);
  function pickTool(id) {
    sheetOpen = activeTool[activeTab] === id ? !sheetOpen : true;
    activeTool[activeTab] = id;
  }
  // One line under the tabs, so every tool explains itself.
  const TOOL_HINTS = {
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
  const ICONS = {
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
    grid: "M4 4h4.5v4.5H4zM9.75 4h4.5v4.5h-4.5zM15.5 4H20v4.5h-4.5zM4 9.75h4.5v4.5H4zM9.75 9.75h4.5v4.5h-4.5zM15.5 9.75H20v4.5h-4.5zM4 15.5h4.5V20H4zM9.75 15.5h4.5V20h-4.5zM15.5 15.5H20V20h-4.5z",
  };
  let exportDialog = $state.raw(null);
  let gridDialog = $state.raw(null);
  let fileInput = $state.raw(null);
  let canvasAspect = $state(4 / 5); // preview box ratio; updated whenever the canvas is resized

  const EXIF_FIELDS = [
    ["model", "Camera", "Sony A7 IV"],
    ["lens", "Lens", "FE 35mm F1.8"],
    ["focalLength", "Focal length", "35mm"],
    ["aperture", "Aperture", "ƒ/1.8"],
    ["shutterSpeed", "Shutter", "1/250s"],
    ["iso", "ISO", "ISO 100"],
    ["date", "Date", "16 Oct 2026"],
    ["note", "Note", "Kyoto, spring"],
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
  // Each photo keeps its own develop settings (item.dev, see DEV_DEFAULTS), like VSCO or Lightroom.
  // `dev` is always the active photo's settings, so sliders, looks and presets edit just that photo.
  const noPhotoDev = $state(freshDev());
  const dev = $derived(activeItem?.dev ?? noPhotoDev);
  const canDevelop = isDevelopSupported();
  let showOriginal = $state(false); // before/after: held while comparing

  // ─── Tone curve & colour mixer (immutable updates keep undo snapshots and looks independent) ─
  let curveChannel = $state("rgb");
  const CURVE_COLORS = { rgb: "#ffffff", r: "#ff6b6b", g: "#6bdc7a", b: "#6b9bff" };
  const setCurve = (pts) => (dev.curve = { ...dev.curve, [curveChannel]: pts });
  const resetCurve = () => (dev.curve = freshDev().curve);

  let mixerBand = $state("red");
  const MIXER_SWATCH = {
    red: "#ff4d4d", orange: "#ff9a3c", yellow: "#ffe14d", green: "#4fd16b",
    aqua: "#3fd6d0", blue: "#4d7dff", purple: "#9b5cff", magenta: "#ff4dc4",
  };
  const mixerValue = (i) => dev.mixer[mixerBand][i];
  function setMixer(i, v) {
    const band = [...dev.mixer[mixerBand]];
    band[i] = v;
    dev.mixer = { ...dev.mixer, [mixerBand]: band };
  }
  const bandChanged = (b) => dev.mixer[b].some((v) => v !== 0);

  // ─── Crop, straighten, rotate ──────────────────────────────────────────────
  const cropping = $derived(activeTab === "editor" && activeTool.editor === "crop" && Boolean(activeItem));
  const crop = $derived(activeItem?.crop ?? CROP_DEFAULT);
  // Turned image size (the crop rect is in fractions of it); the preview has the full image's proportions.
  const turned = $derived(
    activeItem ? turnedSize(activeItem.previewImage.width, activeItem.previewImage.height, crop.rot) : [1, 1],
  );
  const cropAspect = $derived(normalizedAspect(crop.ratio, turned[0], turned[1]));

  function setCrop(patch) {
    if (activeItem) activeItem.crop = { ...CROP_DEFAULT, ...activeItem.crop, ...patch };
  }
  function setCropRatio(id) {
    const [W, H] = turned;
    setCrop({ ratio: id, ...(id === "free" ? {} : fitRect(normalizedAspect(id, W, H))) });
  }
  function turnCrop(quarter) {
    const rot = (crop.rot + quarter + 4) % 4;
    const [W, H] = turnedSize(activeItem.previewImage.width, activeItem.previewImage.height, rot);
    setCrop({ rot, ...fitRect(normalizedAspect(crop.ratio, W, H)) });
  }
  const resetCrop = () => activeItem && (activeItem.crop = null);

  let cropDrag = null;
  function startCropDrag(e, handle) {
    e.preventDefault();
    e.stopPropagation();
    const box = e.currentTarget.closest(".print").getBoundingClientRect();
    cropDrag = { handle, box, x: e.clientX, y: e.clientY, rect: { ...crop } };
  }
  function moveCropDrag(e) {
    if (!cropDrag) return;
    const { handle, box, x, y, rect } = cropDrag;
    setCrop(dragRect(rect, handle, (e.clientX - x) / box.width, (e.clientY - y) / box.height, cropAspect));
  }
  // Arrow keys nudge the crop; with Shift they resize it from the bottom-right corner.
  function cropKey(e) {
    const step = 0.01;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d) return;
    e.preventDefault();
    e.stopPropagation();
    setCrop(dragRect(crop, e.shiftKey ? "se" : "move", d[0], d[1], cropAspect));
  }

  function resetColorAdjustments() {
    Object.assign(dev, freshDev());
  }

  const look = (id, name, params) => ({ id, name, params: { ...freshDev(), ...params } });
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
    look("r-chrome", "Chrome film", parseRecipe("Film Simulation: Classic Chrome\nDynamic Range: DR200\nHighlight: -1\nShadow: +1\nColor: +1\nGrain Effect: Weak, Small\nWhite Balance: Daylight, +2 Red & -3 Blue").params),
    look("r-neg", "Street neg", parseRecipe("Film Simulation: Classic Negative\nHighlight: -1\nShadow: +0.5\nColor: +2\nClarity: -2\nGrain Effect: Weak, Large\nWhite Balance: Auto, +1 Red & -2 Blue").params),
    look("r-eterna", "Cinema", parseRecipe("Film Simulation: Eterna\nDynamic Range: DR400\nShadow: +1\nColor: +1\nWhite Balance: Auto, -1 Red & +1 Blue").params),
    look("r-acros", "Acros red", parseRecipe("Film Simulation: Acros+R\nHighlight: +1\nShadow: +2\nGrain Effect: Strong, Small").params),
  ];

  // Copies (never shares) the look's nested curve and mixer, so later edits don't change the look itself.
  const applyLook = (l) => Object.assign(dev, freshDev(), JSON.parse(JSON.stringify(l.params)));

  // Copy the active photo's edits to every other selected photo.
  function applyEditsToSelected() {
    const src = $state.snapshot(dev);
    for (const f of filesList) if (f.selected && f !== activeItem) Object.assign(f.dev, JSON.parse(JSON.stringify(src)));
  }

  // ─── Imported .cube LUTs ───────────────────────────────────────────────────
  // Kept on this device (IndexedDB, with their colour data); edits refer to them by id.
  const LUTS_KEY = "luts";
  let luts = $state([]); // [{ id, name }]
  idbGet(LUTS_KEY).then((saved) => {
    for (const l of saved ?? []) registerLut(l.id, l);
    luts = (saved ?? []).map(({ id, name }) => ({ id, name }));
    if (luts.length) scheduleRender(true);
  });
  async function importLuts(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    const saved = (await idbGet(LUTS_KEY)) ?? [];
    for (const [i, file] of files.entries()) {
      try {
        const parsed = parseCube(await file.text());
        const entry = { id: `lut_${Date.now()}_${i}`, name: parsed.title || file.name.replace(/\.cube$/i, ""), ...parsed };
        registerLut(entry.id, entry);
        saved.push(entry);
        luts = [...luts, { id: entry.id, name: entry.name }];
        dev.lut = entry.id;
      } catch (err) {
        loadError = `Could not read ${file.name}: ${err.message}`;
      }
    }
    await idbSet(LUTS_KEY, saved);
  }
  async function deleteLut(id) {
    unregisterLut(id);
    luts = luts.filter((l) => l.id !== id);
    for (const f of filesList) if (f.dev.lut === id) f.dev.lut = "";
    await idbSet(LUTS_KEY, ((await idbGet(LUTS_KEY)) ?? []).filter((l) => l.id !== id));
  }
  // Per-LUT previews of the active photo, rendered by the real engine.
  let lutThumbs = $state({});
  $effect(() => {
    const small = activeItem?.small;
    const list = luts;
    if (!small || !canDevelop) return;
    const out = document.createElement("canvas");
    lutThumbs = Object.fromEntries(list.map((l) => [l.id, develop(small, { ...freshDev(), lut: l.id }, out).toDataURL("image/jpeg", 0.8)]));
  });

  // ─── Fujifilm recipes ──────────────────────────────────────────────────────
  let recipeText = $state("");
  let recipeNote = $state("");
  let recipeName = "";
  function applyRecipe() {
    const r = parseRecipe(recipeText);
    if (!r.sim && JSON.stringify(r.params) === JSON.stringify(freshDev())) {
      recipeNote = "No recipe settings found. Paste lines like “Film Simulation: Classic Chrome”, “Highlight: -1”.";
      return;
    }
    Object.assign(dev, r.params);
    recipeName = r.name;
    recipeNote = r.ignored.length ? `Applied. Not available here: ${r.ignored.map((l) => l.split(":")[0]).join(", ")}.` : "Applied.";
  }

  // ─── Match look ────────────────────────────────────────────────────────────
  // Makes photos look like one shoot: brightness, white balance, contrast and colour follow a reference photo.
  const pixels = (c) => c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  function matchItemTo(item, ref) {
    const work = document.createElement("canvas");
    const target = imageStats(pixels(develop(ref.small, ref.dev, work)));
    const next = matchLook($state.snapshot(item.dev), target, (p) => imageStats(pixels(develop(item.small, p, work))));
    Object.assign(item.dev, next);
  }
  function matchSelectedToActive() {
    for (const f of filesList) if (f.selected && f !== activeItem) matchItemTo(f, activeItem);
  }

  // Your own looks ("recipes"), saved on this device.
  const LOOKS_KEY = "mf_looks_v1";
  let userLooks = $state([]);
  try {
    userLooks = JSON.parse(localStorage.getItem(LOOKS_KEY) || "[]");
  } catch {}
  const persistLooks = () => localStorage.setItem(LOOKS_KEY, JSON.stringify(userLooks));
  const allLooks = $derived([...LOOKS, ...userLooks]);
  function saveLook(name) {
    userLooks = [...userLooks, { id: `look_user_${Date.now()}`, name, params: { ...freshDev(), ...$state.snapshot(dev) } }];
    persistLooks();
  }
  function deleteLook(id) {
    userLooks = userLooks.filter((l) => l.id !== id);
    persistLooks();
  }
  // Deep compare: curve and mixer are nested.
  const isLookActive = (l) =>
    Object.keys(DEV_DEFAULTS).every(
      (k) => JSON.stringify(l.params[k] ?? DEV_DEFAULTS[k]) === JSON.stringify(dev[k] ?? DEV_DEFAULTS[k]),
    );

  // Look thumbnails rendered by the real develop engine from the active photo, so they match the result.
  let lookThumbs = $state({});
  $effect(() => {
    const small = activeItem?.small;
    const looks = allLooks;
    if (!small || !canDevelop) {
      lookThumbs = {};
      return;
    }
    const out = document.createElement("canvas");
    lookThumbs = Object.fromEntries(looks.map((l) => [l.id, develop(small, l.params, out).toDataURL("image/jpeg", 0.8)]));
  });

  // Strip thumbnails show each photo's own edits, refreshed shortly after they change.
  $effect(() => {
    if (!canDevelop) return;
    const pending = filesList.map((f) => [f, JSON.stringify([f.dev, f.crop])]);
    const t = setTimeout(() => {
      const out = document.createElement("canvas");
      for (const [f, key] of pending) {
        if (f.thumbKey === key) continue;
        const thumb = develop(f.small, f.dev, out);
        f.thumbUrl = (isIdentity(f.crop) ? thumb : applyGeometry(thumb, f.crop)).toDataURL("image/jpeg", 0.8);
        f.thumbKey = key;
      }
    }, 500);
    return () => clearTimeout(t);
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
    // One wide frame cut into seamless 4:5 slides for an Instagram carousel.
    { id: "carousel2", label: "Carousel × 2", w: 8, h: 5, slices: 2 },
    { id: "carousel3", label: "Carousel × 3", w: 12, h: 5, slices: 3 },
  ];
  const slices = $derived(RATIOS.find((r) => r.id === selectedRatioId)?.slices ?? 1);
  // In a fixed ratio one border is filled by the ratio itself, so only the other slider is shown.
  const autoAxis = $derived(
    processedImage ? autoBorderAxis(processedImage.width, processedImage.height, RATIOS.find((r) => r.id === selectedRatioId)) : null,
  );
  let selectedRatioId = $state("4:5");

  // Colors & Auto-Contrast
  let backgroundColor = $state("#ffffff");
  let textColor = $state("#000000");
  let autoContrast = $state(true);

  // EXIF Typography & Custom Fonts
  let showExif = $state(true);
  let captionStyle = $state("stack"); // "stack" | "bar" (camera-brand bar: model left, brand and settings right)
  let cleanNames = $state(true); // "ILCE-7RM4" → "Sony A7R IV" on the frame; the typed text is kept as is

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
  // Both are remembered on this device (IndexedDB), so templates that use them keep working.
  let customFonts = $state([]);
  const FONTS_KEY = "fonts"; // [{ kind: "file", family, buffer } | { kind: "local", family }]

  async function rememberFont(entry) {
    const saved = (await idbGet(FONTS_KEY)) ?? [];
    await idbSet(FONTS_KEY, [...saved.filter((f) => f.family !== entry.family), entry]);
  }

  async function registerFile(family, buffer) {
    const face = new FontFace(`mf-${family}`, buffer);
    document.fonts.add(await face.load());
    return { id: `file:${family}`, label: family, css: `"mf-${family}"` };
  }

  // Bring back fonts from earlier sessions without selecting them.
  idbGet(FONTS_KEY).then(async (saved = []) => {
    const restored = [];
    for (const f of saved) {
      try {
        restored.push(
          f.kind === "file" ? await registerFile(f.family, f.buffer) : { id: `local:${f.family}`, label: f.family, css: `"${f.family}"` },
        );
      } catch {} // a font that no longer loads is skipped
    }
    customFonts = [...restored.filter((r) => !customFonts.some((c) => c.id === r.id)), ...customFonts];
    scheduleRender();
  });
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
    if (!family || !localFamilies.includes(family)) return;
    addFont(`local:${family}`, family, `"${family}"`);
    rememberFont({ kind: "local", family });
  }

  async function onFontFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    fontError = "";
    const family = file.name.replace(/\.[^.]+$/, "");
    try {
      const buffer = await file.arrayBuffer();
      const f = await registerFile(family, buffer.slice(0));
      addFont(f.id, f.label, f.css);
      rememberFont({ kind: "file", family, buffer });
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
    date: false,
    note: true, // empty unless typed, so it only shows when you add one
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
  let saveKind = $state("template"); // what the name dialog saves: "template" or "look"
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
    captionStyle: "stack",
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
    tpl("brandbar", "Brand bar", { selectedRatioId: "orig", customMarginH: 0, customMarginV: 0, captionSpace: 0, backgroundColor: "#ffffff", selectedFontId: "archivo", textAlign: "left", captionStyle: "bar", autoFontSize: false, manualFontSize: 22 }),
    tpl("brandbar-dark", "Brand bar dark", { selectedRatioId: "4:5", customMarginH: 0, customMarginV: 0, backgroundColor: "#111111", selectedFontId: "montserrat", textAlign: "left", captionStyle: "bar", autoFontSize: false, manualFontSize: 22 }),
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

  // Every frame setting in one plain object: used by templates and by undo/redo.
  const frameSnapshot = () => ({
    customMarginH, customMarginV, captionSpace, selectedRatioId, backgroundColor, textColor, autoContrast,
    textPosX, textPosY, textAlign, textZone, selectedFontId, autoFontSize, manualFontSize, showExif, cleanNames, captionStyle,
    logoScale, logoOpacity, logoPosX, logoPosY, exifDisplay: { ...exifDisplay },
  });

  function saveCurrentPreset(name) {
    userPresets = [...userPresets, { id: `preset_user_${Date.now()}`, name, ...frameSnapshot(), dev: $state.snapshot(dev) }];
    persistPresets();
  }

  function saveNamed() {
    const name = newPresetName.trim();
    if (!name) return;
    if (saveKind === "look") saveLook(name);
    else saveCurrentPreset(name);
    showSavePresetModal = false;
    newPresetName = "";
  }

  // Back up or move your own templates and looks as one small file.
  function exportLibrary() {
    const data = { app: "MinimalFrame", version: 1, templates: $state.snapshot(userPresets), looks: $state.snapshot(userLooks) };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    triggerDownload(blob, `MinimalFrame_library_${new Date().toISOString().slice(0, 10)}.json`);
  }

  let libraryMessage = $state("");

  // Imported files are untrusted: keep only known keys whose type matches the app's own values.
  const cleanLabel = (v) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 60) : "Imported");
  const isNum = (v) => typeof v === "number" && Number.isFinite(v);
  const isPoints = (v) =>
    Array.isArray(v) && v.length >= 2 && v.length <= 16 && v.every((p) => Array.isArray(p) && p.length === 2 && p.every((n) => isNum(n) && n >= 0 && n <= 1));
  function sanitizeDev(d) {
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
  function sanitizeTemplate(t) {
    const out = { name: cleanLabel(t?.name) };
    if (!t || typeof t !== "object") return out;
    for (const [k, v] of Object.entries(frameSnapshot())) {
      if (k === "exifDisplay") continue;
      if (typeof v === "number" ? isNum(t[k]) : typeof t[k] === typeof v) out[k] = t[k];
    }
    if (t.exifDisplay && typeof t.exifDisplay === "object") {
      out.exifDisplay = Object.fromEntries(Object.keys(exifDisplay).filter((k) => typeof t.exifDisplay[k] === "boolean").map((k) => [k, t.exifDisplay[k]]));
    }
    if (t.dev) out.dev = sanitizeDev(t.dev);
    return out;
  }
  async function importLibrary(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== "MinimalFrame") throw new Error("not a MinimalFrame library file");
      // Fresh ids so importing twice, or on top of your own, never overwrites anything.
      const stamp = Date.now();
      const list = (v) => (Array.isArray(v) ? v.slice(0, 500) : []);
      const templates = list(data.templates).map((t, i) => ({ ...sanitizeTemplate(t), id: `preset_user_${stamp}_${i}` }));
      const looks = list(data.looks).map((l, i) => ({
        id: `look_user_${stamp}_${i}`,
        name: cleanLabel(l?.name),
        params: sanitizeDev(l?.params),
      }));
      userPresets = [...userPresets, ...templates];
      userLooks = [...userLooks, ...looks];
      persistPresets();
      persistLooks();
      libraryMessage = `Added ${templates.length} templates and ${looks.length} looks.`;
    } catch (err) {
      libraryMessage = `That file couldn't be imported: ${err.message}.`;
    }
  }

  function deletePreset(id, e) {
    e?.stopPropagation();
    userPresets = userPresets.filter((p) => p.id !== id);
    persistPresets();
  }

  function applyPreset(p) {
    if (!p) return;
    applyFrame(p);
    // Built-in and older saved presets store develop values at the top level (old "brightness" has no equivalent and is ignored).
    for (const k of Object.keys(DEV_DEFAULTS)) if (p[k] !== undefined) dev[k] = p[k];
    if (p.dev) Object.assign(dev, p.dev);
    scheduleRender(true);
  }

  function applyFrame(p) {
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
    if (p.cleanNames !== undefined) cleanNames = p.cleanNames;
    captionStyle = p.captionStyle === "bar" ? "bar" : "stack";
    if (p.logoScale !== undefined) logoScale = p.logoScale;
    if (p.logoOpacity !== undefined) logoOpacity = p.logoOpacity;
    if (p.logoPosX !== undefined) logoPosX = p.logoPosX;
    if (p.logoPosY !== undefined) logoPosY = p.logoPosY;
    if (p.exifDisplay) exifDisplay = { ...exifDisplay, ...p.exifDisplay };
  }

  // ─── Undo / redo ───────────────────────────────────────────────────────────
  // Snapshots of everything undoable (frame settings + the active photo's edits, crop and caption text),
  // taken once changes settle so a slider drag is one step. Switching photos starts a fresh baseline.
  const undoStack = [];
  const redoStack = [];
  let canUndo = $state(false);
  let canRedo = $state(false);
  let lastSnap = null;
  let snapTimer;
  const takeSnapshot = () =>
    JSON.stringify({
      id: activeItem?.id ?? null,
      frame: frameSnapshot(),
      dev: activeItem?.dev ?? null,
      crop: activeItem?.crop ?? null,
      exif: activeItem?.exifOverride ?? null,
    });
  function commitSnapshot(snap) {
    clearTimeout(snapTimer);
    if (snap === lastSnap) return;
    if (lastSnap && JSON.parse(lastSnap).id === JSON.parse(snap).id) {
      undoStack.push(lastSnap);
      if (undoStack.length > 100) undoStack.shift();
      redoStack.length = 0;
    }
    lastSnap = snap;
    canUndo = undoStack.length > 0;
    canRedo = false;
  }
  $effect(() => {
    const snap = takeSnapshot();
    clearTimeout(snapTimer);
    snapTimer = setTimeout(() => commitSnapshot(snap), 350);
  });
  function restoreSnapshot(snap) {
    const o = JSON.parse(snap);
    applyFrame(o.frame);
    const item = filesList.find((f) => f.id === o.id);
    if (item) {
      Object.assign(item.dev, o.dev);
      item.crop = o.crop;
      Object.assign(item.exifOverride, o.exif);
    }
    lastSnap = snap; // the change this causes is not a new step
    canUndo = undoStack.length > 0;
    canRedo = redoStack.length > 0;
  }
  function undo() {
    commitSnapshot(takeSnapshot()); // flush an edit that hasn't settled yet
    if (!undoStack.length) return;
    redoStack.push(lastSnap);
    restoreSnapshot(undoStack.pop());
  }
  function redo() {
    if (!redoStack.length) return;
    undoStack.push(lastSnap);
    restoreSnapshot(redoStack.pop());
  }

  function onKeydown(e) {
    const typing = e.target.closest?.("input[type=text], input:not([type]), textarea");
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "z" && !typing) {
      e.preventDefault();
      e.shiftKey ? redo() : undo();
    } else if (mod && e.key.toLowerCase() === "y" && !typing) {
      e.preventDefault();
      redo();
    } else if (e.key === "\\" && !e.repeat && !typing) {
      showOriginal = true;
    } else if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && !e.target.closest?.("input, textarea")) {
      const n = filesList.length;
      if (n > 1) setActiveImage((activeImageIndex + (e.key === "ArrowRight" ? 1 : n - 1)) % n);
    }
  }
  function onKeyup(e) {
    if (e.key === "\\") showOriginal = false;
  }

  onMount(() => {
    if (new URLSearchParams(location.search).has("shared")) loadSharedFiles();
    loadPalettes();
    loadPresets();
    // Canvas text can't swap fonts by itself; redraw once the bundled caption font is ready.
    document.fonts?.ready.then(() => scheduleRender());
  });

  // ─── Instagram grid preview ────────────────────────────────────────────────
  // Profile grids show the newest post first, cropped to 3:4; carousels show their first slide.
  let gridCells = $state([]); // [{ id, url }] newest first
  const loadImage = (url) => new Promise((ok, fail) => Object.assign(new Image(), { onload: (e) => ok(e.target), onerror: fail, src: url }));
  async function renderGrid() {
    const posts = filesList.filter((f) => f.selected);
    gridCells = await Promise.all(
      posts.map(async (f) => {
        const framed = drawFramed(document.createElement("canvas"), await loadImage(f.thumbUrl), f.exifOverride);
        if (slices <= 1) return { id: f.id, url: framed.toDataURL("image/jpeg", 0.85) };
        const first = document.createElement("canvas");
        first.width = Math.round(framed.width / slices);
        first.height = framed.height;
        first.getContext("2d").drawImage(framed, 0, 0);
        return { id: f.id, url: first.toDataURL("image/jpeg", 0.85) };
      }),
    );
    gridCells.reverse();
  }
  function openGrid() {
    renderGrid();
    gridDialog?.showModal();
  }
  // Posting order follows the strip: earlier in the strip = posted first = lower on the grid.
  function movePost(id, towardTop) {
    const i = filesList.findIndex((f) => f.id === id);
    const step = towardTop ? 1 : -1;
    let j = i + step;
    while (j >= 0 && j < filesList.length && !filesList[j].selected) j += step;
    if (j < 0 || j >= filesList.length) return;
    const active = filesList[activeImageIndex];
    const next = [...filesList];
    [next[i], next[j]] = [next[j], next[i]];
    filesList = next;
    activeImageIndex = filesList.indexOf(active);
    renderGrid();
  }

  // Photos sent with "Share to MinimalFrame" wait in a cache the service worker filled; open them once.
  async function loadSharedFiles() {
    history.replaceState(null, "", location.pathname);
    try {
      const cache = await caches.open("mf-shared");
      const files = [];
      for (const req of await cache.keys()) {
        const res = await cache.match(req);
        const name = new URL(req.url).searchParams.get("name") || "shared.jpg";
        files.push(new File([await res.blob()], name, { type: res.headers.get("content-type") || "" }));
        await cache.delete(req);
      }
      if (files.length) loadFiles(files);
    } catch (err) {
      loadError = `Could not open the shared photos: ${err.message}`;
    }
  }

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
    // Carousel: the Instagram width applies to each slide.
    const width = s.width && mode === "framed" ? s.width * slices : s.width;
    return Math.min(1, width ? width / w : s.long / Math.max(w, h));
  }

  /** Output pixel size for a preset, from the current photo. */
  function targetDims(s, mode) {
    const { w, h } = mode === "framed" ? framedSize : photoSize;
    const width = s.width && mode === "framed" ? s.width * slices : s.width;
    const k = Math.min(1, width ? width / w : s.long ? s.long / Math.max(w, h) : 1);
    return { w: Math.round(w * k), h: Math.round(h * k) };
  }
  function sizeLabel(s, mode) {
    const { w, h } = targetDims(s, mode);
    return w ? `${w} × ${h}` : "";
  }

  // Estimated file size: encode the framed preview with the chosen settings and scale by pixel count.
  // shortcut: small previews compress a little worse than full-size photos, so this tends to overestimate.
  let exportOpen = $state(false);
  let sizeEstimate = $state("");
  $effect(() => {
    if (!exportOpen || !processedImage || !activeItem) return;
    const s = EXPORT_SIZES.find((x) => x.id === exportPrefs.size);
    const { w, h } = targetDims(s, "framed");
    const sample = drawFramed(document.createElement("canvas"), processedImage, activeItem.exifOverride);
    let cancelled = false;
    encodeCanvas(sample).then(({ blob }) => {
      if (cancelled) return;
      const bytes = (blob.size / (sample.width * sample.height)) * w * h;
      sizeEstimate = bytes > 1e6 ? `about ${(bytes / 1e6).toFixed(1)} MB` : `about ${Math.max(1, Math.round(bytes / 1e3))} KB`;
    });
    return () => (cancelled = true);
  });

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
  // Fewer camera fields → larger text (date and note are extra lines and don't count).
  const selectedExifCount = $derived(
    ["model", "lens", "focalLength", "aperture", "shutterSpeed", "iso"].filter((k) => exifDisplay[k]).length,
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

  // Border colour suggestions from the photo itself.
  function photoPalette(source) {
    const c = document.createElement("canvas");
    c.width = c.height = 40;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.drawImage(source, 0, 0, 40, 40);
    return extractPalette(x.getImageData(0, 0, 40, 40).data, 5);
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
              "DateTimeOriginal",
              "GPSLatitude",
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

        let previewImage, fullW, fullH, thumbSource, small;
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
          small = downscaleLinear(previewImage, 160);
          thumbSource = develop(small, DEV_DEFAULTS);
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
          small = document.createElement("canvas");
          const k = 160 / Math.max(previewImage.width, previewImage.height);
          small.width = Math.max(1, Math.round(previewImage.width * k));
          small.height = Math.max(1, Math.round(previewImage.height * k));
          small.getContext("2d").drawImage(previewImage, 0, 0, small.width, small.height);
        }

        // 5. Filmstrip Thumbnail (120px)
        const thumbUrl = createThumbnail(thumbSource);
        const hue = dominantHue(thumbSource);
        const palette = photoPalette(thumbSource);

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
        const taken = rawExif?.DateTimeOriginal instanceof Date ? rawExif.DateTimeOriginal : null;
        const date = taken
          ? taken.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
          : "";

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
          palette,
          rotated: detectedOrientation > 1, // shown in the UI; the browser or LibRaw may have done the rotating
          selected: true,                   // included in batch export
          hadGps: rawExif?.GPSLatitude != null || rawExif?.latitude != null, // exports never contain it
          small,                            // 160px source for looks and strip thumbnails
          dev: freshDev(),                  // this photo's own edits
          crop: null,                       // this photo's crop / rotation (see geometry.js)
          exifOverride: {
            model: cameraName,
            lens: lensName,
            focalLength: focalLength,
            aperture: aperture,
            shutterSpeed: shutterSpeed,
            iso: iso,
            date,
            note: "",
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

  // A built-in photo for first-time visitors: painted on a canvas so it works offline and adds no download.
  // Its camera details are raw EXIF codes on purpose, so "Clean metadata names" has something to show.
  async function loadSamplePhoto() {
    const W = 2400, H = 3000;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d");
    const sky = g.createLinearGradient(0, 0, 0, H * 0.62);
    sky.addColorStop(0, "#2b3a78");
    sky.addColorStop(0.45, "#c9677a");
    sky.addColorStop(0.8, "#ffb36b");
    sky.addColorStop(1, "#ffe2a8");
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    const sun = g.createRadialGradient(W * 0.62, H * 0.5, 0, W * 0.62, H * 0.5, W * 0.5);
    sun.addColorStop(0, "rgb(255 246 214 / 1)");
    sun.addColorStop(0.08, "rgb(255 230 170 / 0.95)");
    sun.addColorStop(0.3, "rgb(255 170 110 / 0.25)");
    sun.addColorStop(1, "rgb(255 170 110 / 0)");
    g.fillStyle = sun;
    g.fillRect(0, 0, W, H);
    // Three mountain ridges, lighter with distance.
    [["#6a4a78", 0.5, 0.06], ["#3e2f5c", 0.56, 0.09], ["#1d1a33", 0.63, 0.12]].forEach(([color, base, amp], k) => {
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(0, H);
      for (let x = 0; x <= W; x += 20) {
        const t = x / W;
        g.lineTo(x, H * (base - amp * (0.6 * Math.sin(t * 7 + k * 2) + 0.4 * Math.sin(t * 19 + k)) * Math.sin(t * Math.PI + k)));
      }
      g.lineTo(W, H);
      g.fill();
    });
    // Lake with a broken reflection of the sun.
    const lake = g.createLinearGradient(0, H * 0.7, 0, H);
    lake.addColorStop(0, "#3a3060");
    lake.addColorStop(1, "#0f0e1c");
    g.fillStyle = lake;
    g.fillRect(0, H * 0.7, W, H * 0.3);
    for (let y = H * 0.71; y < H; y += 22) {
      const w = W * 0.22 * (1 - (y - H * 0.7) / (H * 0.3)) * (0.6 + 0.4 * Math.sin(y * 0.37));
      g.fillStyle = `rgb(255 214 160 / ${0.5 * (1 - (y - H * 0.7) / (H * 0.3))})`;
      g.fillRect(W * 0.62 - w / 2, y, w, 7);
    }
    const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.92));
    const file = new File([blob], "minimalframe-sample.jpg", { type: "image/jpeg" });
    await loadFiles([file]);
    const item = filesList.findLast((f) => f.name === file.name);
    if (item) {
      Object.assign(item.exifOverride, {
        model: "SONY ILCE-7M3",
        lens: "FE 24-70mm F2.8 GM",
        focalLength: "35mm",
        aperture: "ƒ/5.6",
        shutterSpeed: "1/250s",
        iso: "ISO 100",
        note: "Lake at golden hour",
      });
    }
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
  function developCanvas(source, target, params = dev) {
    if (canDevelop) return develop(source, params, target);
    target.width = source.width;
    target.height = source.height;
    const ctx = target.getContext("2d", { alpha: false });
    ctx.filter = cssFilterFor(params);
    ctx.drawImage(source, 0, 0);
    return target;
  }

  // Live preview develops only the ≤1080px proxy; grain and bloom are CSS overlays until export.
  let previewWorkCanvas = null;
  let previewGeoCanvas = null;
  let histo = $state.raw(null);
  function updateProcessedImage() {
    const base = activeItem?.previewImage;
    if (!base) {
      processedImage = null;
      return;
    }
    // Reuse one canvas across slider ticks instead of allocating a new one per frame.
    const params = showOriginal ? DEV_DEFAULTS : dev;
    const developed = applyDetail(
      developCanvas(base, (previewWorkCanvas ??= document.createElement("canvas")), params),
      params,
    );
    // While cropping, show the whole turned/straightened photo so the crop box can be moved over it.
    const geo = showOriginal ? null : cropping ? { ...crop, x: 0, y: 0, w: 1, h: 1 } : activeItem.crop;
    processedImage = isIdentity(geo)
      ? developed
      : applyGeometry(developed, geo, (previewGeoCanvas ??= document.createElement("canvas")));
    histo = histogram(processedImage);
  }

  // ─── EXIF Text Formatting with Editable Overrides ──────────────────────────
  function buildExifLines(override, display) {
    if (!override) return [];
    const lines = [];

    if (display.model && override.model?.trim()) {
      lines.push({ type: "model", text: cleanNames ? cleanCamera(override.model) : override.model.trim() });
    }

    if (display.lens && override.lens?.trim()) {
      lines.push({ type: "lens", text: cleanNames ? cleanLens(override.lens) : override.lens.trim() });
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

    const extra = [];
    if (display.note && override.note?.trim()) extra.push(override.note.trim());
    if (display.date && override.date?.trim()) extra.push(override.date.trim());
    if (extra.length) lines.push({ type: "extra", text: extra.join("  ·  ") });

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
      style: captionStyle,
      brand: cameraBrand(exifOverride?.model).toUpperCase(),
      measure: (text, px, weight = 600) => {
        measureCtx.font = `${weight} ${px}px ${captionFamily()}`;
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
    if (L.caption?.style === "bar") {
      const c = L.caption;
      const fam = captionFamily();
      ctx.textBaseline = "middle";
      ctx.fillStyle = textColor;
      for (const [block, align] of [[c.left, "left"], [c.right, "right"]]) {
        ctx.textAlign = align;
        block.lines.forEach((line, i) => {
          ctx.globalAlpha = i ? 0.62 : 1; // second row (lens, date) is quieter
          ctx.font = `${i ? 400 : 600} ${i ? c.sub : c.size}px ${fam}`;
          ctx.fillText(line.text, block.x, block.ys[i]);
        });
      }
      ctx.globalAlpha = 1;
      if (c.brand) {
        ctx.textAlign = "right";
        ctx.font = `800 ${c.brand.size}px ${fam}`;
        ctx.fillText(c.brand.text, c.brand.x, c.brand.y);
      }
      if (c.divider) {
        ctx.globalAlpha = 0.3;
        const w = Math.max(1, c.size * 0.07);
        ctx.fillRect(c.divider.x - w / 2, c.divider.y1, w, c.divider.y2 - c.divider.y1);
        ctx.globalAlpha = 1;
      }
    } else if (L.caption) {
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
    const fullScale = (activeItem.fullW || activeItem.previewImage.width) / activeItem.previewImage.width;

    // Full-resolution sizes for the info line and the export sheet.
    const L = layoutFrame(srcW, srcH, activeItem.exifOverride);
    framedSize = { w: Math.round(L.canvasW * fullScale), h: Math.round(L.canvasH * fullScale) };
    photoSize = { w: Math.round(srcW * fullScale), h: Math.round(srcH * fullScale) };

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
    const _orig = showOriginal;
    const _crop = JSON.stringify(activeItem?.crop);
    const _cropping = cropping;

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
    const _cn = cleanNames;
    const _cs = captionStyle;
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
    const _fields = JSON.stringify(exifDisplay); // every caption checkbox, including ones added later (date, note)
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
      colorCanvas = develop(raw, item.dev);
    } else {
      const bitmap = await decodeUpright(item.sourceBlob);
      const sourceCanvas =
        item.orientationTag > 1
          ? applyExifOrientation(bitmap, item.orientationTag)
          : bitmap;
      colorCanvas = developCanvas(sourceCanvas, document.createElement("canvas"), item.dev);
      bitmap.close();
      if (sourceCanvas !== bitmap) sourceCanvas.width = sourceCanvas.height = 0;
    }

    const detailed = applyDetail(colorCanvas, item.dev);
    if (detailed !== colorCanvas) {
      colorCanvas.width = colorCanvas.height = 0;
      colorCanvas = detailed;
    }
    if (!isIdentity(item.crop)) {
      const turned = applyGeometry(colorCanvas, item.crop);
      colorCanvas.width = colorCanvas.height = 0;
      colorCanvas = turned;
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
    if (item.dev.softBloom > 0 || item.dev.filmGrain > 0) {
      applyAnalogEffects(colorCanvas, { grain: item.dev.filmGrain, bloom: item.dev.softBloom });
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

  // ─── Saving and sharing ────────────────────────────────────────────────────
  const cleanName = (name, fallback) =>
    name.replace(/\.[^.]+$/, "").replace(/[^\p{L}\p{N}_\-\s]/gu, "").trim() || fallback;

  /** Cuts a carousel frame into equal slides (the last one takes any rounding remainder). */
  function sliceCanvas(canvas, n) {
    const w = Math.round(canvas.width / n);
    return Array.from({ length: n }, (_, i) => {
      const part = document.createElement("canvas");
      part.width = i === n - 1 ? canvas.width - w * i : w;
      part.height = canvas.height;
      part.getContext("2d").drawImage(canvas, w * i, 0, part.width, part.height, 0, 0, part.width, part.height);
      return part;
    });
  }

  /** Renders one photo for export: one file, or one per slide for carousel ratios. */
  async function renderFiles(item, mode, index = 0) {
    const canvas = await generateFullResExportCanvas(item, mode);
    if (!canvas) throw new Error("could not render the photo");
    const base = `${cleanName(item.name, `photo_${index + 1}`)}_${mode === "edited" ? "edited" : "framed"}`;
    const n = mode === "framed" ? slices : 1;
    const parts = n > 1 ? sliceCanvas(canvas, n) : [canvas];
    const files = [];
    for (let i = 0; i < parts.length; i++) {
      const { blob, ext } = await encodeCanvas(parts[i]);
      files.push({ name: n > 1 ? `${base}_${i + 1}of${n}.${ext}` : `${base}.${ext}`, blob });
      parts[i].width = parts[i].height = 0;
    }
    canvas.width = canvas.height = 0;
    return files;
  }

  async function zipFiles(files) {
    const zip = new JSZip();
    for (const f of files) zip.file(f.name, f.blob);
    return zip.generateAsync({ type: "blob" }, (m) => (batchProgress.percent = Math.round(m.percent)));
  }

  function triggerDownload(blob, filename) {
    if (fallbackDownloadUrl?.startsWith("blob:")) URL.revokeObjectURL(fallbackDownloadUrl);
    fallbackDownloadUrl = URL.createObjectURL(blob);
    fallbackFilename = filename;
    // Explicit extension in `download` avoids Chrome's extensionless-blob bug.
    const link = document.createElement("a");
    link.style.display = "none";
    link.href = fallbackDownloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    // Keep the blob alive for the manual fallback link; it is revoked on the next export or on Clear All.
    setTimeout(() => link.remove(), 2000);
  }

  function flashStatus(text) {
    downloadStatus = text;
    setTimeout(() => downloadStatus === text && (downloadStatus = ""), 5000);
  }

  async function downloadImage(mode = "framed") {
    if (!processedImage || !activeItem) return;
    isDownloading = true;
    downloadStatus = "Exporting…";
    try {
      await new Promise((r) => setTimeout(r, 20)); // let the status paint
      const files = await renderFiles(activeItem, mode);
      if (files.length === 1) {
        triggerDownload(files[0].blob, files[0].name);
        flashStatus(`Saved ${files[0].name}`);
      } else {
        const name = `${cleanName(activeItem.name, "photo")}_carousel.zip`;
        triggerDownload(await zipFiles(files), name);
        flashStatus(`Saved ${files.length} slides to ${name}`);
      }
    } catch (err) {
      console.error("[MinimalFrame] Download failed:", err);
      loadError = `Export failed: ${err.message}`;
      downloadStatus = "Export failed. See the message above the photo.";
    } finally {
      isDownloading = false;
    }
  }

  // Native share sheet (Android/iOS browsers, installed PWA): sends the photo straight to Instagram & co.
  const canShareFiles =
    typeof navigator !== "undefined" &&
    Boolean(navigator.canShare?.({ files: [new File([""], "x.jpg", { type: "image/jpeg" })] }));
  let pendingShare = $state.raw(null); // files ready but the browser wants a fresh tap to share them

  async function shareFiles(files) {
    try {
      await navigator.share({ files: files.map((f) => new File([f.blob], f.name, { type: f.blob.type })) });
      pendingShare = null;
      flashStatus("Shared");
    } catch (err) {
      if (err.name === "AbortError") return; // closed the share sheet
      // Rendering can outlast the tap that started it; keep the files and ask for one more tap.
      if (err.name === "NotAllowedError") pendingShare = files;
      else throw err;
    }
  }

  async function shareImage() {
    if (!activeItem) return;
    isDownloading = true;
    downloadStatus = "Preparing…";
    try {
      await shareFiles(await renderFiles(activeItem, "framed"));
      if (pendingShare) downloadStatus = "Ready to share";
    } catch (err) {
      console.error("[MinimalFrame] Share failed:", err);
      loadError = `Share failed: ${err.message}`;
      downloadStatus = "";
    } finally {
      isDownloading = false;
    }
  }

  // ─── Batch export (.zip) ───────────────────────────────────────────────────
  async function exportBatch(mode = "framed") {
    const batch = filesList.filter((item) => item.selected);
    if (batch.length === 0) return;
    isBatchExporting = true;
    const total = batch.length;
    batchProgress = { current: 0, total, percent: 0, filename: "" };
    try {
      const files = [];
      for (let i = 0; i < total; i++) {
        batchProgress = { current: i + 1, total, percent: Math.round(((i + 1) / total) * 100), filename: batch[i].name };
        await new Promise((r) => setTimeout(r, 20)); // let the progress bar paint
        files.push(...(await renderFiles(batch[i], mode, i)));
      }
      batchProgress.filename = "Packing the ZIP…";
      const name = `MinimalFrame_${new Date().toISOString().slice(0, 10)}_${total}photos.zip`;
      triggerDownload(await zipFiles(files), name);
      flashStatus(`Saved ${total} photos to ${name}`);
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

<svelte:window
  onkeydown={onKeydown}
  onkeyup={onKeyup}
  onpointermove={moveCropDrag}
  onpointerup={() => (cropDrag = null)}
  onblur={() => (showOriginal = false)}
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
  <header class="bar glass">
    <span class="wordmark"><img class="mark" src="/favicon.svg" alt="" /><span class="wm-text">MinimalFrame</span></span>
    {#if activeItem}
      <p class="meta">
        <span class="meta-name">{activeItem.name}</span>
        {#if framedSize.w}<span class="meta-dim">{activeTab === "framing" ? framedSize.w : photoSize.w} × {activeTab === "framing" ? framedSize.h : photoSize.h}</span>{/if}
        {#if activeItem.rawBadge}<span class="pill">RAW</span>{/if}
      </p>
    {/if}
    {#if processedImage}
      <div class="bar-tools">
        <button class="icon-btn" onclick={undo} disabled={!canUndo} aria-label="Undo" title="Undo (Ctrl+Z)">{@render icon("undo")}</button>
        <button class="icon-btn" onclick={redo} disabled={!canRedo} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">{@render icon("redo")}</button>
        <button
          class="icon-btn"
          class:on={showOriginal}
          aria-label="Hold to see the original"
          title="Hold to see the original (\)"
          onpointerdown={() => (showOriginal = true)}
          onpointerup={() => (showOriginal = false)}
          onpointerleave={() => (showOriginal = false)}
          onkeydown={(e) => (e.key === " " || e.key === "Enter") && (showOriginal = true)}
          onkeyup={() => (showOriginal = false)}
        >{@render icon("compare")}</button>
        <button class="icon-btn" onclick={openGrid} aria-label="Preview on your Instagram grid" title="Preview on your Instagram grid">{@render icon("grid")}</button>
      </div>
      <button
        class="btn accent bar-export"
        onclick={() => {
          exportDialog?.showModal();
          exportOpen = true;
        }}
      >
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
        {#if showOriginal}<span class="badge">Original</span>{/if}
        {#if activeTab === "framing" && slices > 1}
          {#each Array.from({ length: slices - 1 }, (_, i) => i + 1) as i (i)}
            <span class="slice-line" style:left="{(i / slices) * 100}%" aria-hidden="true"></span>
          {/each}
        {/if}
        {#if cropping && !showOriginal}
          <div class="crop-layer">
            <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
            <div
              class="crop-box"
              role="group"
              tabindex="0"
              aria-label="Crop area. Arrow keys move it, Shift plus arrow keys resize it."
              style:left="{crop.x * 100}%"
              style:top="{crop.y * 100}%"
              style:width="{crop.w * 100}%"
              style:height="{crop.h * 100}%"
              onpointerdown={(e) => startCropDrag(e, "move")}
              onkeydown={cropKey}
            >
              <span class="third v1"></span><span class="third v2"></span><span class="third h1"></span><span class="third h2"></span>
              {#each ["nw", "ne", "sw", "se"] as h (h)}
                <span class="handle {h}" onpointerdown={(e) => startCropDrag(e, h)} aria-hidden="true"></span>
              {/each}
            </div>
          </div>
        {/if}
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
        <p class="eyebrow">For Instagram, VSCO and every feed</p>
        <h1>Social-media-ready frames, with your EXIF <em>beautifully set.</em></h1>
        <p class="lead">100% private: zero server uploads. Everything runs entirely in your browser.</p>
        <ul class="badges" aria-label="Features">
          <li>🔒 100% Private (Local Processing)</li>
          <li>⚡ Instant Batch Export</li>
          <li>📸 RAW &amp; EXIF Support</li>
          <li>✨ Film Grain &amp; Bloom</li>
        </ul>
        <div class="dropzone" class:over={isDragging}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4M7 9l5-5 5 5M4 15v4a1 1 0 001 1h14a1 1 0 001-1v-4" /></svg>
          <p class="dz-title">{isDragging ? "Drop to open" : "Drag & drop one photo or a whole shoot"}</p>
          <div class="dz-actions">
            <button class="btn accent big" onclick={() => fileInput?.click()} disabled={isLoading}>
              {#if isLoading}<span class="spinner" aria-hidden="true"></span>{loadingStatus || "Opening…"}{:else}Choose photos{/if}
            </button>
            <button class="btn ghost big" onclick={loadSamplePhoto} disabled={isLoading}>Try sample photo</button>
          </div>
          <p class="fine">JPEG, PNG, WebP and RAW from Sony, Canon, Nikon, Fujifilm and more.</p>
        </div>
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

    <aside class="panel glass" class:collapsed={!sheetOpen} aria-label="Controls">
      <button class="grabber" onclick={() => (sheetOpen = !sheetOpen)} aria-expanded={sheetOpen} aria-controls="tool-body" aria-label={sheetOpen ? "Hide tools to see the whole photo" : "Show tools"}>
        <span aria-hidden="true"></span>
      </button>
      <div class="seg modes" role="group" aria-label="Mode">
        <button aria-pressed={activeTab === "editor"} onclick={() => ((activeTab = "editor"), (sheetOpen = true))}>Edit</button>
        <button aria-pressed={activeTab === "framing"} onclick={() => ((activeTab = "framing"), (sheetOpen = true))}>Frame</button>
      </div>

      <div class="tabs" class:many={TOOLS[activeTab].length > 4} role="group" aria-label="Tools">
        {#each TOOLS[activeTab] as [id, name] (id)}
          <button class="tab" title={TOOL_HINTS[id]} aria-pressed={activeTool[activeTab] === id} onclick={() => pickTool(id)}>
            {@render icon(id)}<span>{name}</span>
          </button>
        {/each}
      </div>

      <div class="body" id="tool-body">
        <p class="tool-hint">{TOOL_HINTS[activeTool[activeTab]]}</p>
        {#if activeTab === "editor"}
          {@const tool = activeTool.editor}
          {#if histo}<Histogram bins={histo} />{/if}
          {#if !canDevelop}
            <p class="hint">This device can't run the full editor, so only exposure, contrast and saturation are applied.</p>
          {/if}
          {#if tool === "looks"}
            <div class="looks">
              {#each allLooks as look (look.id)}
                <div class="look-cell">
                  <button class="look" aria-pressed={isLookActive(look)} onclick={() => applyLook(look)}>
                    {#if lookThumbs[look.id]}
                      <img src={lookThumbs[look.id]} alt="" />
                    {:else}
                      <img src={activeItem?.thumbUrl} alt="" style:filter={cssFilterFor(look.params)} />
                    {/if}
                    <span>{look.name}</span>
                  </button>
                  {#if userLooks.includes(look)}
                    <button class="mini-del" onclick={() => deleteLook(look.id)} aria-label="Delete look {look.name}">×</button>
                  {/if}
                </div>
              {/each}
            </div>
            <div class="row-btns">
              <button
                class="btn ghost"
                onclick={() => {
                  saveKind = "look";
                  newPresetName = "";
                  showSavePresetModal = true;
                }}>Save as my look</button
              >
              <button class="btn ghost" onclick={resetColorAdjustments}>Reset all edits</button>
            </div>
            {#if selectedCount > 1}
              <button class="btn ghost" onclick={applyEditsToSelected}>Apply these edits to the other {selectedCount - 1} selected</button>
            {/if}

            {#if canDevelop}
              <section class="sub">
                <p class="label">LUTs</p>
                <p class="hint">Import .cube files from Lightroom, Resolve or your favourite creators.</p>
                <div class="looks">
                  {#each luts as l (l.id)}
                    <div class="look-cell">
                      <button class="look" aria-pressed={dev.lut === l.id} onclick={() => (dev.lut = dev.lut === l.id ? "" : l.id)}>
                        <img src={lutThumbs[l.id] ?? activeItem?.thumbUrl} alt="" />
                        <span>{l.name}</span>
                      </button>
                      <button class="mini-del" onclick={() => deleteLut(l.id)} aria-label="Delete LUT {l.name}">×</button>
                    </div>
                  {/each}
                  <label class="look look-add">
                    <input type="file" accept=".cube" multiple class="sr-only" onchange={importLuts} />
                    <span aria-hidden="true">+</span><span>Import .cube</span>
                  </label>
                </div>
                {#if dev.lut}
                  <Dial id="d-lut" label="LUT strength" bind:value={dev.lutAmount} unit="%" reset={100} hint="Blend between your edit and the LUT. Applied on top of all other edits." />
                {/if}
              </section>

              {#if filesList.length > 1}
                <section class="sub">
                  <p class="label">Match look</p>
                  <p class="hint">Make this photo's brightness, white balance, contrast and colour follow another photo.</p>
                  <div class="match-row">
                    {#each filesList as f, i (f.id)}
                      {#if f !== activeItem}
                        <button class="match-pick" onclick={() => matchItemTo(activeItem, f)} aria-label="Match to {f.name}" title="Match to {f.name}">
                          <img src={f.thumbUrl} alt="" />
                        </button>
                      {/if}
                    {/each}
                  </div>
                  {#if selectedCount > 1}
                    <button class="btn ghost" onclick={matchSelectedToActive}>Match the other {selectedCount - 1} selected to this photo</button>
                  {/if}
                </section>
              {/if}
            {/if}

            <details class="sub recipe">
              <summary class="label">Paste a Fujifilm recipe</summary>
              <textarea
                class="text"
                rows="7"
                bind:value={recipeText}
                placeholder={"Film Simulation: Classic Chrome\nDynamic Range: DR400\nHighlight: -1\nShadow: +1\nColor: +2\nWhite Balance: Daylight, +2 Red & -4 Blue\nGrain Effect: Weak, Small"}
                aria-label="Fujifilm recipe text"
              ></textarea>
              <div class="row-btns">
                <button class="btn accent" onclick={applyRecipe} disabled={!recipeText.trim()}>Apply recipe</button>
                {#if recipeNote.startsWith("Applied")}
                  <button class="btn ghost" onclick={() => { saveKind = "look"; newPresetName = recipeName; showSavePresetModal = true; }}>Save as my look</button>
                {/if}
              </div>
              {#if recipeNote}<p class="hint" role="status">{recipeNote}</p>{/if}
              <p class="hint">Film simulations are approximations of Fujifilm's in-camera looks.</p>
            </details>
          {:else if tool === "crop"}
            <div class="stack">
              <div>
                <p class="label">Crop ratio</p>
                <div class="seg wrap">
                  {#each CROP_RATIOS as r (r.id)}
                    <button aria-pressed={crop.ratio === r.id} onclick={() => setCropRatio(r.id)}>{r.label}</button>
                  {/each}
                </div>
              </div>
              <Dial
                id="d-straighten"
                label="Straighten"
                bind:value={() => crop.angle, (v) => setCrop({ angle: v })}
                min={-45}
                max={45}
                step={0.1}
                unit="°"
                reset={0}
                signed
              />
              <div class="row-btns">
                <button class="btn ghost" onclick={() => turnCrop(-1)}>Rotate left</button>
                <button class="btn ghost" onclick={() => turnCrop(1)}>Rotate right</button>
                <button class="btn ghost" onclick={() => setCrop({ flip: !crop.flip })}>Flip</button>
              </div>
              <button class="btn ghost" onclick={resetCrop} disabled={isIdentity(activeItem?.crop)}>Reset crop</button>
              <p class="hint">Drag the box or its corners. The crop shows on the photo when you switch to another tool.</p>
            </div>
          {:else if tool === "light"}
            <div class="stack">
              <Dial id="d-exposure" hint="Overall brightness in camera stops. +1 EV doubles the light." label="Exposure" bind:value={dev.exposure} min={-3} max={3} step={0.05} unit="EV" reset={0} signed />
              <Dial id="d-contrast" hint="Spreads tones apart: darker darks and brighter brights." label="Contrast" bind:value={dev.contrast} min={-100} max={100} reset={0} signed />
              <Dial id="d-highlights" hint="Recovers or brightens only the brightest areas, like skies." label="Highlights" bind:value={dev.highlights} min={-100} max={100} reset={0} signed />
              <Dial id="d-shadows" hint="Lifts or deepens only the darkest areas without touching the rest." label="Shadows" bind:value={dev.shadows} min={-100} max={100} reset={0} signed />
              <Dial id="d-whites" hint="Sets the white point: how bright the very brightest pixels get." label="Whites" bind:value={dev.whites} min={-100} max={100} reset={0} signed />
              <Dial id="d-blacks" hint="Sets the black point: how deep the very darkest pixels get." label="Blacks" bind:value={dev.blacks} min={-100} max={100} reset={0} signed />
            </div>
          {:else if tool === "color"}
            <div class="stack">
              <Dial id="d-temp" hint="White balance: cooler (blue) to warmer (yellow)." label="Temperature" bind:value={dev.temperature} min={-100} max={100} reset={0} signed track="linear-gradient(to right, #5d9bff, #ffbe55)" />
              <Dial id="d-tint" hint="Corrects green or magenta casts, e.g. from fluorescent light." label="Tint" bind:value={dev.tint} min={-100} max={100} reset={0} signed track="linear-gradient(to right, #53d36b, #e45ce0)" />
              <Dial id="d-vibrance" hint="Boosts muted colors more than strong ones, and protects skin tones." label="Vibrance" bind:value={dev.vibrance} min={-100} max={100} reset={0} signed />
              <Dial id="d-saturation" hint="Intensity of every color equally." label="Saturation" bind:value={dev.saturation} min={-100} max={100} reset={0} signed />
              <p class="hint">Vibrance boosts muted colors and protects skin tones. Saturation moves every color equally.</p>
            </div>
          {:else if tool === "curve"}
            <div class="stack">
              <div class="seg">
                {#each [["rgb", "RGB"], ["r", "Red"], ["g", "Green"], ["b", "Blue"]] as [ch, name] (ch)}
                  <button aria-pressed={curveChannel === ch} onclick={() => (curveChannel = ch)}>{name}</button>
                {/each}
              </div>
              <CurveEditor points={dev.curve[curveChannel]} onchange={setCurve} color={CURVE_COLORS[curveChannel]} label="{curveChannel.toUpperCase()} curve" />
              <p class="hint">Click to add a point, drag to shape the curve, double-click a point to remove it.</p>
              <button class="btn ghost" onclick={resetCurve}>Reset curves</button>
            </div>
          {:else if tool === "mixer"}
            <div class="stack">
              <div class="bands" role="group" aria-label="Color band">
                {#each MIXER_BANDS as b (b)}
                  <button
                    class="band"
                    class:changed={bandChanged(b)}
                    style:--c={MIXER_SWATCH[b]}
                    aria-pressed={mixerBand === b}
                    aria-label={b}
                    onclick={() => (mixerBand = b)}
                  ></button>
                {/each}
              </div>
              <Dial id="d-mix-h" hint="Shifts this color toward its neighbours on the color wheel." label="{mixerBand[0].toUpperCase() + mixerBand.slice(1)} hue" bind:value={() => mixerValue(0), (v) => setMixer(0, v)} min={-100} max={100} reset={0} signed />
              <Dial id="d-mix-s" hint="How intense this one color is." label="Saturation" bind:value={() => mixerValue(1), (v) => setMixer(1, v)} min={-100} max={100} reset={0} signed />
              <Dial id="d-mix-l" hint="How bright this one color is." label="Luminance" bind:value={() => mixerValue(2), (v) => setMixer(2, v)} min={-100} max={100} reset={0} signed />
              <p class="hint">Shift one color without touching the rest: warmer greens, deeper blue skies, softer skin.</p>
            </div>
          {:else if tool === "detail"}
            <div class="stack">
              <Dial id="d-clarity" hint="Midtone contrast: adds punch and texture, or softens." label="Clarity" bind:value={dev.clarity} min={-100} max={100} reset={0} signed />
              <Dial id="d-sharpen" hint="Crisper fine edges. Best judged at 100% zoom." label="Sharpen" bind:value={dev.sharpen} unit="%" reset={0} />
              <p class="hint">Clarity adds mid-tone punch; negative clarity softens. Sharpen crisps fine detail.</p>
            </div>
          {:else if tool === "film"}
            <div class="stack">
              <Dial id="d-grain" hint="Analog film texture over the photo." label="Film grain" bind:value={dev.filmGrain} unit="%" reset={0} />
              <Dial id="d-bloom" hint="Soft glow around bright areas, like a diffusion filter." label="Soft bloom" bind:value={dev.softBloom} unit="%" reset={0} />
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
                saveKind = "template";
                newPresetName = "";
                showSavePresetModal = true;
              }}>Save current settings as a template</button
            >
            <div class="row-btns">
              <button class="btn ghost" onclick={exportLibrary} disabled={!userPresets.length && !userLooks.length}>Back up my templates and looks</button>
              <label class="btn ghost">
                Import
                <input type="file" accept=".json,application/json" onchange={importLibrary} class="sr-only" />
              </label>
            </div>
            {#if libraryMessage}<p class="hint" role="status">{libraryMessage}</p>{/if}
          {:else if tool === "ratio"}
            <div class="ratios">
              {#each RATIOS as r (r.id)}
                <button class="ratio" aria-pressed={selectedRatioId === r.id} onclick={() => (selectedRatioId = r.id)}>
                  <span class="ratio-glyph" class:loose={!r.w} style:aspect-ratio={r.w ? `${r.w} / ${r.h}` : r.id === "orig" ? "3 / 3.6" : "3 / 2.4"}></span>
                  <span>{r.label}</span>
                </button>
              {/each}
            </div>
            {#if slices > 1}
              <p class="hint">Exports {slices} separate 4:5 slides that line up seamlessly when people swipe your carousel.</p>
            {/if}
          {:else if tool === "border"}
            <div class="stack">
              {#if autoAxis !== "h"}
                <Dial id="d-margin-h" label={autoAxis ? "Border" : "Sides"} bind:value={customMarginH} min={0} max={40} unit="%" reset={8} />
              {/if}
              {#if autoAxis !== "v"}
                <Dial id="d-margin-v" label={autoAxis ? "Border" : "Top and bottom"} bind:value={customMarginV} min={0} max={40} unit="%" reset={8} />
              {/if}
              {#if autoAxis}
                <p class="hint">
                  {autoAxis === "v" ? "Top and bottom fill" : "The sides fill"} in by themselves to keep the
                  {RATIOS.find((r) => r.id === selectedRatioId)?.label} shape. Choose Even border in Ratio to set every side yourself.
                </p>
              {/if}
              {#if selectedRatioId === "orig"}
                <Dial id="d-caption-space" hint="Extra frame space reserved for the caption text." label="Caption space" bind:value={captionSpace} min={0} max={40} unit="%" reset={12} />
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
              {#if activeItem?.palette?.length}
                <div>
                  <p class="label">From this photo</p>
                  <div class="swatches">
                    {#each activeItem.palette.flatMap((c) => [tint(c), c]) as c (c)}
                      <button class="swatch" style:background={c} aria-pressed={backgroundColor.toLowerCase() === c} aria-label="Border color {c}" onclick={() => (backgroundColor = c)}></button>
                    {/each}
                  </div>
                </div>
              {/if}
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
                <label class="switch" title="Turns codes like ILCE-7RM4 or XF35mmF2 into Sony A7R IV and Fujifilm XF 35mm f/2">
                  <input type="checkbox" role="switch" bind:checked={cleanNames} />
                  <span class="switch-track" aria-hidden="true"></span>
                  Clean metadata names
                </label>
                <div>
                  <p class="label">Layout</p>
                  <div class="seg">
                    <button aria-pressed={captionStyle === "stack"} onclick={() => (captionStyle = "stack")}>Stacked</button>
                    <button aria-pressed={captionStyle === "bar"} onclick={() => (captionStyle = "bar")} title="Model and lens on the left; brand and settings on the right, like a camera watermark">Brand bar</button>
                  </div>
                </div>
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
    onclose={() => (exportOpen = false)}
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
        <p class="privacy">
          🔒 Saved without metadata: no GPS location, serial numbers or camera data in the file{#if filesList.some((f) => f.hadGps)}.
            {filesList.filter((f) => f.hadGps).length === 1 ? "1 photo had" : `${filesList.filter((f) => f.hadGps).length} photos had`} a GPS location, now removed{/if}.
        </p>
        {#if sizeEstimate}<p class="estimate">{sizeEstimate} per {slices > 1 ? "carousel" : "photo"}</p>{/if}
        <p class="hint">
          {exportPrefs.format === "png"
            ? "PNG is lossless: the best quality, but large files."
            : exportPrefs.format === "webp"
              ? "WebP is about a third smaller than JPEG at the same quality."
              : "JPEG works everywhere. High is a good balance; Max keeps every detail."}
        </p>

        <div class="actions">
          <!-- svelte-ignore a11y_autofocus -->
          {#if canShareFiles}
            {#if pendingShare}
              <button class="btn accent big" onclick={() => shareFiles(pendingShare)}>{@render icon("share")}Share now</button>
            {:else}
              <button class="btn accent big" onclick={shareImage} disabled={!processedImage || isDownloading} autofocus>
                {@render icon("share")}{isDownloading ? "Preparing…" : "Share to Instagram & more"}
              </button>
            {/if}
          {/if}
          <button class={canShareFiles ? "btn ghost" : "btn accent big"} onclick={() => downloadImage("framed")} disabled={!processedImage || isDownloading} autofocus={!canShareFiles}>
            {isDownloading && !canShareFiles ? "Exporting…" : slices > 1 ? `Save ${slices} carousel slides` : "Save framed photo"}
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

  <dialog bind:this={gridDialog} class="sheet glass" aria-labelledby="grid-title" onclick={(e) => e.target === gridDialog && gridDialog.close()}>
    <div class="sheet-in">
      <div class="sheet-head">
        <h2 id="grid-title">Your grid</h2>
        <button class="close" onclick={() => gridDialog.close()} aria-label="Close">×</button>
      </div>
      <p class="hint">How the selected photos will sit on your Instagram profile if you post them in strip order: the last one ends up top left.</p>
      <ol class="ig-grid">
        {#each gridCells as cell, i (cell.id)}
          <li>
            <img src={cell.url} alt="Post {gridCells.length - i}" />
            <span class="ig-order">
              <button onclick={() => movePost(cell.id, true)} disabled={i === 0} aria-label="Post later (move up the grid)">‹</button>
              <button onclick={() => movePost(cell.id, false)} disabled={i === gridCells.length - 1} aria-label="Post earlier (move down the grid)">›</button>
            </span>
          </li>
        {/each}
        {#each Array.from({ length: (3 - (gridCells.length % 3)) % 3 + 3 }) as _, k (k)}
          <li class="ig-old" aria-hidden="true"></li>
        {/each}
      </ol>
      <p class="hint">Grey tiles stand for your earlier posts. Only photos ticked in the strip are included.</p>
    </div>
  </dialog>

  {#if showSavePresetModal}
    <div class="overlay" role="presentation" onclick={(e) => e.target === e.currentTarget && (showSavePresetModal = false)}>
      <div class="sheet-in glass card" role="dialog" aria-modal="true" aria-labelledby="save-title">
        <h2 id="save-title">{saveKind === "look" ? "Save as my look" : "Save as template"}</h2>
        <p class="hint">
          {saveKind === "look"
            ? "Keeps every edit (light, color, curve, mixer, detail, film) so you can apply it to any photo in one tap."
            : "Keeps your ratio, border, colors, caption style, logo placement and edits for one-tap reuse."}
        </p>
        <!-- svelte-ignore a11y_autofocus -->
        <input
          class="text"
          type="text"
          placeholder="e.g. White gallery"
          aria-label="Template name"
          bind:value={newPresetName}
          autofocus
          onkeydown={(e) => {
            if (e.key === "Enter") saveNamed();
            if (e.key === "Escape") showSavePresetModal = false;
          }}
        />
        <div class="actions row">
          <button class="btn ghost" onclick={() => (showSavePresetModal = false)}>Cancel</button>
          <button class="btn accent" onclick={saveNamed} disabled={!newPresetName.trim()}>{saveKind === "look" ? "Save look" : "Save template"}</button>
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
    --accent-ink: var(--accent);
    --bg: hsl(var(--hue) 14% 8%);
    --stage: hsl(var(--hue) 16% 6%);
    --surface: hsl(var(--hue) 10% 11%);
    --glass: var(--surface);
    --glass-line: hsl(var(--hue) 30% 80% / 0.1);
    --shadow: 0 1px 2px rgb(0 0 0 / 0.3), 0 12px 32px -16px rgb(0 0 0 / 0.6);
    position: relative;
    height: 100dvh;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 384px;
    grid-template-rows: auto minmax(0, 1fr) auto;
    grid-template-areas:
      "bar bar"
      "stage panel"
      "strip panel";
    gap: 10px;
    padding: 10px;
    padding-top: max(10px, env(safe-area-inset-top));
    padding-bottom: max(10px, env(safe-area-inset-bottom));
    background:
      radial-gradient(70% 60% at 40% 45%, color-mix(in srgb, var(--accent) 13%, transparent), transparent 70%),
      var(--stage);
  }
  @media (prefers-color-scheme: light) {
    .app {
      --accent: hsl(var(--hue) 80% 66%);
      --accent-strong: hsl(var(--hue) 80% 72%);
      --accent-ink: hsl(var(--hue) 70% 34%);
      --bg: hsl(var(--hue) 30% 96%);
      --stage: hsl(var(--hue) 24% 92%);
      --surface: hsl(var(--hue) 45% 99.5%);
      --glass-line: hsl(var(--hue) 25% 25% / 0.1);
      --shadow: 0 1px 2px hsl(var(--hue) 30% 20% / 0.06), 0 12px 32px -18px hsl(var(--hue) 30% 20% / 0.25);
    }
  }
  .app.empty {
    grid-template-columns: 1fr;
    grid-template-rows: auto minmax(0, 1fr);
    grid-template-areas: "bar" "stage";
    background:
      radial-gradient(50% 45% at 50% 30%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 70%),
      var(--bg);
  }
  .app > :is(.bar, .stage, .strip, .panel) {
    position: relative;
    z-index: 1;
  }
  .app.dragging .stage {
    outline: 2px dashed var(--accent-ink);
    outline-offset: -10px;
    border-radius: var(--radius);
  }
  .app > :is(.bar, .panel, .strip) {
    box-shadow: var(--shadow);
  }

  @keyframes fade-in {
    from { opacity: 0; }
  }

  /* ── Glass ─────────────────────────────────────────────────────────────── */
  .glass {
    background: var(--surface);
    border: 1px solid var(--glass-line);
    border-radius: var(--radius);
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
    display: flex;
    align-items: center;
    gap: 8px;
    flex: none;
    font-stretch: 112%;
    font-weight: 750;
    font-size: 1.05rem;
    letter-spacing: -0.02em;
    white-space: nowrap;
  }
  .mark {
    width: 24px;
    height: 24px;
    display: block;
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
    color: var(--accent-ink);
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
    background: color-mix(in srgb, var(--text) 6%, transparent);
    color: var(--text);
  }
  .btn.ghost:hover:not(:disabled) {
    background: color-mix(in srgb, var(--text) 12%, transparent);
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
    justify-content: safe center;
    gap: 16px;
    padding: 24px 16px;
    text-align: center;
    overflow: auto;
  }
  .fan {
    position: relative;
    flex: none;
    width: 360px;
    max-width: 90vw;
    height: 180px;
    margin-bottom: 4px;
  }
  .sample {
    position: absolute;
    top: 0;
    left: 50%;
    width: 124px;
    display: flex;
    flex-direction: column;
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.08), 0 18px 36px -16px rgb(0 0 0 / 0.4);
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
  .hero h1 em {
    font-style: normal;
    background: linear-gradient(90deg, var(--accent-ink), hsl(calc(var(--hue) - 30) 80% 60%));
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .hero h1 {
    font-weight: 700;
    font-size: clamp(1.9rem, 4vw, 2.8rem);
    line-height: 1.1;
    letter-spacing: -0.025em;
    max-width: 20ch;
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
  .eyebrow {
    font-size: 0.78rem;
    font-weight: 650;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--accent-ink);
  }
  .badges {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
    max-width: 640px;
    padding: 0;
    list-style: none;
  }
  .badges li {
    padding: 7px 13px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    font-size: 0.85rem;
    font-weight: 550;
    white-space: nowrap;
  }
  .dropzone {
    flex: none;
    display: grid;
    justify-items: center;
    gap: 12px;
    width: min(560px, 100%);
    margin-top: 8px;
    padding: 26px 20px 20px;
    border: 1.5px dashed color-mix(in srgb, var(--text) 22%, transparent);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow);
    transition: border-color 150ms, background 150ms, transform 150ms;
  }
  .dropzone.over {
    border-color: var(--accent-ink);
    background: color-mix(in srgb, var(--text) 8%, transparent);
    transform: scale(1.01);
  }
  .dropzone > svg {
    width: 30px;
    height: 30px;
    color: var(--accent-ink);
  }
  .dz-title {
    font-weight: 600;
  }
  .dz-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 10px;
  }
  /* Keep the dropzone above the fold: shrink the fan on short screens, drop it on phones. */
  @media (max-width: 600px) {
    .fan {
      display: none;
    }
    .hero {
      gap: 12px;
    }
    .badges li {
      padding: 5px 10px;
      font-size: 0.76rem;
    }
    .dropzone {
      padding: 18px 14px 14px;
    }
    .dropzone .btn.big {
      padding: 12px 20px;
      font-size: 0.98rem;
    }
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
    border-color: var(--accent-ink);
  }
  .alert button {
    font-size: 1.2rem;
    line-height: 1;
    padding: 0 4px;
  }
  .spinner {
    width: 18px;
    height: 18px;
    border: 2px solid color-mix(in srgb, var(--text) 25%, transparent);
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
    outline-color: var(--accent-ink);
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
    accent-color: var(--accent-ink);
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
    border: 1px dashed color-mix(in srgb, var(--text) 35%, transparent);
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
    /* clip, not hidden: a hidden container can still be scrolled by focus (e.g. the visually hidden
       .cube file input), which pushed the tabs out of view with no way to scroll back. */
    overflow: clip;
  }
  .grabber {
    display: none;
  }
  .seg {
    display: inline-flex;
    padding: 3px;
    gap: 2px;
    border-radius: 999px;
    background: var(--field);
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
    background: var(--text);
    color: var(--surface);
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
    background: color-mix(in srgb, var(--text) 5%, transparent);
  }
  .seg.wrap button[aria-pressed="true"] {
    background: var(--text);
    color: var(--surface);
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
    background: color-mix(in srgb, var(--text) 6%, transparent);
  }
  .tab[aria-pressed="true"] {
    color: var(--accent-ink);
    background: color-mix(in srgb, var(--text) 10%, transparent);
  }
  .tool-hint {
    margin: 0;
    font-size: 0.82rem;
    line-height: 1.4;
    color: var(--muted);
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
    color: var(--accent-ink);
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
    outline-color: var(--accent-ink);
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
    background: color-mix(in srgb, var(--text) 5%, transparent);
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
    border-color: var(--accent-ink);
    color: var(--text);
  }
  .ratio[aria-pressed="true"] .ratio-glyph {
    color: var(--accent-ink);
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
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--text) 25%, transparent);
    display: grid;
    place-items: center;
  }
  .swatch[aria-pressed="true"] {
    outline: 2px solid var(--accent-ink);
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
    background: color-mix(in srgb, var(--text) 18%, transparent);
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
    outline: 2px solid var(--accent-ink);
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
    accent-color: var(--accent-ink);
  }
  .text {
    width: 100%;
    min-width: 0;
    padding: 10px 12px;
    background: var(--field);
    border: 1px solid var(--glass-line);
    border-radius: 12px;
    font-size: 0.92rem;
  }
  .text:focus {
    border-color: var(--accent-ink);
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
    background: color-mix(in srgb, var(--text) 5%, transparent);
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
    border-color: var(--accent-ink);
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
    background: color-mix(in srgb, var(--text) 12%, transparent);
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
    border: 1px dashed color-mix(in srgb, var(--text) 35%, transparent);
    border-radius: 16px;
    cursor: pointer;
  }
  .upload:hover,
  .upload:focus-within {
    border-color: var(--accent-ink);
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
    background: color-mix(in srgb, var(--text) 8%, transparent);
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
    background: color-mix(in srgb, var(--text) 5%, transparent);
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
    border-color: var(--accent-ink);
  }
  .size:focus-within {
    outline: 2px solid var(--accent-ink);
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
    color: var(--accent-ink);
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
    background: color-mix(in srgb, var(--text) 15%, transparent);
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

  /* ── Bar tools: undo / redo / compare ──────────────────────────────────── */
  .bar-tools {
    display: flex;
    gap: 2px;
    margin-left: auto;
  }
  .meta + .bar-tools {
    margin-left: 0;
  }
  .bar-tools + .bar-export {
    margin-left: 4px;
  }
  .icon-btn {
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: var(--text);
    transition: background 150ms;
  }
  .icon-btn svg {
    width: 20px;
    height: 20px;
  }
  .icon-btn:hover:not(:disabled),
  .icon-btn.on {
    background: color-mix(in srgb, var(--text) 12%, transparent);
  }
  .icon-btn.on {
    color: var(--accent-ink);
  }

  /* ── Overlays on the photo ─────────────────────────────────────────────── */
  .badge {
    position: absolute;
    top: 10px;
    left: 10px;
    padding: 3px 10px;
    border-radius: 999px;
    background: rgb(0 0 0 / 0.6);
    font-size: 0.78rem;
    font-weight: 600;
  }
  .slice-line {
    position: absolute;
    top: 0;
    bottom: 0;
    border-left: 1px dashed rgb(255 255 255 / 0.85);
    box-shadow: 0 0 0 1px rgb(0 0 0 / 0.25);
    pointer-events: none;
  }
  .crop-layer {
    position: absolute;
    inset: 0;
    overflow: hidden;
  }
  .crop-box {
    position: absolute;
    box-shadow: 0 0 0 9999px rgb(0 0 0 / 0.55);
    outline: 1px solid rgb(255 255 255 / 0.9);
    cursor: move;
    touch-action: none;
  }
  .crop-box:focus-visible {
    outline: 2px solid var(--accent-ink);
  }
  .third {
    position: absolute;
    background: rgb(255 255 255 / 0.35);
    pointer-events: none;
  }
  .third.v1, .third.v2 { top: 0; bottom: 0; width: 1px; }
  .third.h1, .third.h2 { left: 0; right: 0; height: 1px; }
  .third.v1 { left: 33.333%; }
  .third.v2 { left: 66.666%; }
  .third.h1 { top: 33.333%; }
  .third.h2 { top: 66.666%; }
  .handle {
    position: absolute;
    width: 26px;
    height: 26px;
    margin: -13px;
    touch-action: none;
  }
  .handle::after {
    content: "";
    position: absolute;
    inset: 8px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 4px rgb(0 0 0 / 0.5);
  }
  .handle.nw { left: 0; top: 0; cursor: nwse-resize; }
  .handle.ne { right: 0; top: 0; cursor: nesw-resize; }
  .handle.sw { left: 0; bottom: 0; cursor: nesw-resize; }
  .handle.se { right: 0; bottom: 0; cursor: nwse-resize; }

  /* ── Panel extras ──────────────────────────────────────────────────────── */
  .look-cell {
    position: relative;
  }
  .sub {
    display: grid;
    gap: 10px;
    padding-top: 14px;
    border-top: 1px solid var(--glass-line);
  }
  .look-add {
    display: grid;
    place-content: center;
    gap: 2px;
    aspect-ratio: 1;
    border: 1px dashed color-mix(in srgb, var(--text) 30%, transparent);
    border-radius: 12px;
    color: var(--muted);
    font-size: 0.78rem;
    text-align: center;
    cursor: pointer;
  }
  .look-add span:first-of-type {
    font-size: 1.5rem;
    line-height: 1;
  }
  .match-row {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding-bottom: 2px;
  }
  .match-pick {
    flex: none;
    width: 56px;
    height: 56px;
    border-radius: 10px;
    overflow: hidden;
    border: 1px solid var(--glass-line);
  }
  .match-pick:hover {
    outline: 2px solid var(--accent-ink);
  }
  .match-pick img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .recipe summary {
    cursor: pointer;
  }
  .recipe textarea {
    width: 100%;
    resize: vertical;
    font: 0.85rem/1.45 ui-monospace, "Space Mono", monospace;
  }
  .privacy {
    font-size: 0.85rem;
    line-height: 1.45;
    padding: 10px 12px;
    border-radius: 12px;
    background: var(--field);
  }
  .ig-grid {
    list-style: none;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 3px;
    margin: 4px 0;
  }
  .ig-grid li {
    position: relative;
    aspect-ratio: 3 / 4;
    overflow: hidden;
    background: var(--field);
  }
  .ig-grid img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .ig-old {
    background: repeating-linear-gradient(45deg, var(--field) 0 8px, transparent 8px 16px) !important;
  }
  .ig-order {
    position: absolute;
    inset: auto 4px 4px;
    display: flex;
    justify-content: space-between;
    opacity: 0;
    transition: opacity 150ms;
  }
  .ig-grid li:hover .ig-order,
  .ig-grid li:focus-within .ig-order {
    opacity: 1;
  }
  .ig-order button {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: rgb(0 0 0 / 0.6);
    color: #fff;
    font-size: 1.1rem;
  }
  @media (hover: none) {
    .ig-order {
      opacity: 1;
    }
  }
  .row-btns {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .row-btns > :global(*) {
    flex: 1 1 auto;
  }
  .bands {
    display: flex;
    justify-content: space-between;
    gap: 6px;
  }
  .band {
    position: relative;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: var(--c);
    outline: 2px solid transparent;
    outline-offset: 3px;
  }
  .band[aria-pressed="true"] {
    outline-color: #fff;
  }
  .band.changed::after {
    /* dot marks bands you've adjusted */
    content: "";
    position: absolute;
    bottom: -9px;
    left: 50%;
    width: 4px;
    height: 4px;
    margin-left: -2px;
    border-radius: 50%;
    background: #fff;
  }
  .estimate {
    font-size: 0.92rem;
    font-weight: 600;
  }

  /* ── Phone ─────────────────────────────────────────────────────────────── */
  @media (max-width: 899px) {
    .app {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto minmax(0, 1fr) auto auto;
      grid-template-areas: "bar" "stage" "strip" "panel";
      gap: 8px;
      padding: 8px;
      padding-top: max(8px, env(safe-area-inset-top));
      padding-bottom: max(8px, env(safe-area-inset-bottom));
    }
    .bar {
      min-height: 48px;
      padding: 6px 6px 6px 16px;
    }
    /* Room for undo / redo / compare / export on a phone-width bar. */
    .meta {
      display: none;
    }
    /* Same specificity as ".meta + .bar-tools", which would otherwise keep Export off the right edge. */
    .meta + .bar-tools {
      margin-left: auto;
    }
    .wordmark {
      font-size: 0.95rem;
    }
    .bar {
      gap: 6px;
    }
    .icon-btn {
      width: 36px;
      height: 36px;
    }
    .bar-export {
      padding: 9px 14px;
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
  }
  @media (max-width: 600px) {
    /* No floating cards: bar, strip and panel sit flush, so the photo gets the room. */
    .app:not(.empty) {
      gap: 0;
      padding: 0;
      padding-top: env(safe-area-inset-top);
      padding-bottom: env(safe-area-inset-bottom);
    }
    .app:not(.empty) > :is(.bar, .strip, .panel) {
      box-shadow: none;
      border-radius: 0;
      border-width: 0;
    }
    .app:not(.empty) > .bar {
      border-bottom-width: 1px;
      background: var(--surface);
    }
    .bar {
      min-height: 52px;
      gap: 2px;
      padding: 6px 8px 6px 12px;
      min-width: 0;
    }
    /* On the start page the name introduces the app; while editing, the icon is enough. */
    .app:not(.empty) .wm-text {
      display: none;
    }
    .bar-tools {
      gap: 0;
    }
    .ratio {
      gap: 8px;
      padding: 8px 10px;
      font-size: 0.82rem;
    }
    .icon-btn {
      width: 38px;
      height: 38px;
    }
    .icon-btn :global(svg) {
      width: 20px;
      height: 20px;
    }
    .bar-export {
      margin-left: 6px;
      padding: 8px 14px;
      font-size: 0.9rem;
    }
    .strip {
      padding: 6px 10px;
      background: transparent;
    }
    .frame-pick,
    .frame-add {
      height: 40px;
    }
    .frame-add {
      width: 40px;
    }
    .strip ol {
      gap: 8px;
    }
    /* The panel becomes a bottom sheet: fixed height, only its content scrolls. */
    .app > .panel {
      height: 36dvh;
      max-height: none;
      border-top-width: 1px;
      border-radius: 18px 18px 0 0;
    }
    .modes {
      margin: 0 12px;
    }
    /* Sheet handle: tap to fold the panel down to its tab row (tapping the active tool does the same). */
    .grabber {
      display: grid;
      place-items: center;
      height: 18px;
      flex: none;
    }
    .grabber span {
      width: 40px;
      height: 4px;
      border-radius: 2px;
      background: color-mix(in srgb, var(--text) 30%, transparent);
    }
    .app > .panel.collapsed {
      height: auto;
    }
    .panel.collapsed .body {
      display: none;
    }
    .modes button {
      padding: 6px 12px;
      font-size: 0.85rem;
    }
    .tabs,
    .tabs.many {
      display: flex;
      overflow-x: auto;
      scrollbar-width: none;
      gap: 2px;
      padding: 6px 8px;
    }
    .tabs .tab,
    .tabs.many .tab {
      flex: none;
      min-width: 60px;
      gap: 3px;
      padding: 6px 4px;
      font-size: 0.7rem;
    }
    .tab svg {
      width: 20px;
      height: 20px;
    }
    /* Explanations stay one tap away (the ⓘ on each slider); the histogram is a desktop luxury. */
    .tool-hint,
    .body > :global(.histo) {
      display: none;
    }
    .body {
      padding: 12px 14px 16px;
      gap: 14px;
    }
  }
</style>