<script>
  // MinimalFrame: frame, edit and caption photos for Instagram, 100% on-device.
  //
  // App owns the state and the pipeline: the photo list, each photo's edits (dev) and crop, the frame settings,
  // undo/redo, the live preview render and full-resolution export. Everything else lives beside it:
  //   components/        landing page, export sheet, save dialog, icon
  //   components/tools/  one component per tool panel (Looks, Crop, Light…, Templates, Ratio, Caption…)
  //   lib/               pure logic and engines (develop, RAW, layout, colour, LUTs, recipes, EXIF names)
  //   ui.css             shared buttons, controls and dialogs; app.css holds the theme tokens

  import * as exifr from "exifr";
  import JSZip from "jszip";
  import { onMount, tick } from "svelte";

  // Pure logic and engines
  import {
    ALIGN_X,
    TOOLS,
    TOOL_HINTS,
    frameRatio,
    SYSTEM_FONTS,
    EXPORT_SIZES,
    FORMATS,
    QUALITIES,
  } from "./lib/catalog.js";
  import {
    DEV_DEFAULTS,
    freshDev,
    applyDetail,
    isDevelopSupported,
    develop,
    downscaleLinear,
    cssFilterFor,
    histogram,
  } from "./lib/developEngine.js";
  import { applyAnalogEffects } from "./lib/effectsEngine.js";
  import { cleanCamera, cleanLens } from "./lib/exifCleaner.js";
  import { brandMark } from "./lib/brandLogos.js";
  import { computeFrameLayout, autoBorderAxis } from "./lib/frameLayout.js";
  import {
    CROP_DEFAULT,
    applyGeometry,
    isIdentity,
    normalizedAspect,
    fitRect,
    dragRect,
    turnedSize,
  } from "./lib/geometry.js";
  import {
    getContrastingColor,
    applyExifOrientation,
    createProxyPreview,
    decodeUpright,
    photoPalette,
    createThumbnail,
    fmtExposure,
    cleanName,
    sliceCanvas,
    paintSamplePhoto,
  } from "./lib/imageUtils.js";
  import { isHeif, heifSource } from "./lib/heifDecoder.js";
  import { parseLibrary } from "./lib/library.js";
  import {
    isRawFile,
    processRawFile,
    getRawFormatInfo,
    getRawOrientation,
    decodeRawLinear,
  } from "./lib/rawEngine.js";

  // Shared state (loaded at start-up)
  import { allFonts } from "./lib/fontLibrary.svelte.js";
  import { lutLib } from "./lib/lutLibrary.svelte.js";

  // Components
  import ExportSheet from "./components/ExportSheet.svelte";
  import Icon from "./components/Icon.svelte";
  import Landing from "./components/Landing.svelte";
  import PhotosTray from "./components/PhotosTray.svelte";
  import SaveDialog from "./components/SaveDialog.svelte";
  import Histogram from "./lib/Histogram.svelte";

  // Tool panels
  import BorderTool from "./components/tools/BorderTool.svelte";
  import CaptionTool from "./components/tools/CaptionTool.svelte";
  import ColorsTool from "./components/tools/ColorsTool.svelte";
  import CropTool from "./components/tools/CropTool.svelte";
  import CurveTool from "./components/tools/CurveTool.svelte";
  import DevelopSliders from "./components/tools/DevelopSliders.svelte";
  import LogoTool from "./components/tools/LogoTool.svelte";
  import LooksTool from "./components/tools/LooksTool.svelte";
  import MixerTool from "./components/tools/MixerTool.svelte";
  import PositionTool from "./components/tools/PositionTool.svelte";
  import RatioTool from "./components/tools/RatioTool.svelte";
  import TemplatesTool from "./components/tools/TemplatesTool.svelte";

  // ─── Panel navigation ──────────────────────────────────────────────────────
  // "editor" = Edit mode (light, colour, looks…), "framing" = Frame mode (ratio, border, caption…)
  let activeTab = $state("framing");

  let activeTool = $state({ editor: "looks", framing: "ratio" });
  // Compact layout (phones, portrait tablets): the photo fills the screen, the tool row sits at the bottom and a
  // tool opens in a small tray above it, closed with Done. Same query as the compact CSS block below.
  const COMPACT = "(max-width: 899px) and (min-height: 501px)";
  const compactQuery = matchMedia(COMPACT);
  let compact = $state(compactQuery.matches);
  compactQuery.addEventListener("change", (e) => (compact = e.matches));
  let trayOpen = $state(false); // compact only; the desktop panel is always open
  // The tray opens straight away (its CSS slides it up); closing first plays the slide-down, so the
  // close lands 200ms later. Any tap in between cancels the close, so taps always win and in order.
  let trayClosing = $state(false);
  let closeTimer;
  function openTray() {
    clearTimeout(closeTimer);
    trayClosing = false;
    trayOpen = true;
  }
  function closeTray() {
    if (!trayOpen || trayClosing) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return void (trayOpen = false);
    trayClosing = true;
    closeTimer = setTimeout(() => {
      trayOpen = false;
      trayClosing = false;
    }, 200);
  }
  let trayView = $state("tool"); // phones: the tray shows the tool's settings, or "photos"
  function pickTool(id) {
    glide(() => {
      if (trayOpen && !trayClosing && trayView === "tool" && activeTool[activeTab] === id) return closeTray(); // tapping the open tool again
      activeTool[activeTab] = id;
      trayView = "tool";
      openTray();
    });
  }
  function togglePhotos() {
    glide(() => {
      if (trayOpen && !trayClosing && trayView === "photos") return closeTray();
      trayView = "photos";
      openTray();
    });
  }
  function setMode(tab) {
    glide(() => {
      activeTab = tab;
      closeTray();
    });
  }

  // The tray resizes the photo area instantly; FLIP turns that into motion: measure the photo (and the
  // compare button under it), apply the change, measure again, then animate from the old box to the new
  // one with the tray's own curve. Transforms only, so it stays smooth on phones.
  let printEl = $state.raw(null);
  let holdEl = $state.raw(null);
  async function glide(change) {
    const els = [printEl, holdEl].filter(Boolean);
    if (!compact || !els.length || matchMedia("(prefers-reduced-motion: reduce)").matches) return change();
    const before = els.map((el) => el.getBoundingClientRect());
    const wasOpen = trayOpen && !trayClosing;
    change();
    await tick();
    const opening = trayOpen && !trayClosing;
    els.forEach((el, i) => {
      const a = before[i];
      const b = el.getBoundingClientRect();
      if (!b.width || (a.width === b.width && a.top === b.top)) return;
      const dx = a.left + a.width / 2 - (b.left + b.width / 2);
      const dy = a.top + a.height / 2 - (b.top + b.height / 2);
      const scale = el === printEl ? a.width / b.width : 1;
      el.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${scale})` }, { transform: "none" }], {
        duration: opening || wasOpen === opening ? 380 : 320,
        easing: opening || wasOpen === opening ? "cubic-bezier(0.34, 1.3, 0.64, 1)" : "cubic-bezier(0.22, 1, 0.36, 1)",
      });
    });
  }
  const toolOpen = (id) => activeTool[activeTab] === id && (!compact || (trayOpen && trayView === "tool"));
  let exportDialog = $state.raw(null);
  let fileInput = $state.raw(null);
  let canvasAspect = $state(4 / 5); // preview box ratio; updated whenever the canvas is resized

  // ─── Photos ────────────────────────────────────────────────────────────────
  // Each item: { id, file, name, sourceBlob, fullW, fullH, previewImage, linearRaw, small, thumbUrl, isRaw, rawBadge,
  //   orientationTag, palette, rotated, selected, hadGps, dev, crop, exifOverride } (see loadFiles)
  let filesList = $state([]);
  let activeImageIndex = $state(0);
  let isLoading = $state(false);
  let loadingStatus = $state("");
  let loadError = $state("");
  let isDragging = $state(false);

  const selectedCount = $derived(filesList.filter((f) => f.selected).length);

  const activeItem = $derived(
    filesList.length > 0 && activeImageIndex < filesList.length
      ? filesList[activeImageIndex]
      : null,
  );

  // Processed image for the active item (after color/light adjustments)
  let processedImage = $state.raw(null);

  // ─── Develop settings ──────────────────────────────────────────────────────
  // Each photo keeps its own develop settings (item.dev, see DEV_DEFAULTS), like VSCO or Lightroom.
  // `dev` is always the active photo's settings, so sliders, looks and presets edit just that photo.
  const noPhotoDev = $state(freshDev());
  const dev = $derived(activeItem?.dev ?? noPhotoDev);
  const canDevelop = isDevelopSupported();
  // Setter for function bindings (bind:dev={() => dev, keep}): tools mutate these objects but never replace them.
  const keep = () => {};
  let showOriginal = $state(false); // before/after: held while comparing
  // Press and hold the photo itself (mouse or finger). A short delay keeps a quick click from flashing the
  // original; while cropping, the photo's pointer belongs to the crop box.
  // A quick sideways swipe switches to the next or previous photo; moving cancels the hold.
  let holdTimer;
  let swipe = null;
  function holdPhoto(e) {
    if (cropping || e.button > 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId); // keep getting the gesture if the finger leaves the photo
    if (positioning) return startFillDrag(e);
    swipe = { x: e.clientX, y: e.clientY, t: performance.now() };
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => (showOriginal = true), 120);
  }
  function movePhoto(e) {
    if (fillDrag) return dragFill(e);
    if (swipe && Math.hypot(e.clientX - swipe.x, e.clientY - swipe.y) > 12) {
      clearTimeout(holdTimer);
      showOriginal = false;
    }
  }
  function releasePhoto(e) {
    fillDrag = null;
    clearTimeout(holdTimer);
    showOriginal = false;
    if (swipe && e?.type === "pointerup") {
      const dx = e.clientX - swipe.x;
      const dy = e.clientY - swipe.y;
      const quick = performance.now() - swipe.t < 700;
      if (quick && Math.abs(dx) > 50 && Math.abs(dx) > 1.5 * Math.abs(dy)) {
        const next = activeImageIndex + (dx < 0 ? 1 : -1);
        if (next >= 0 && next < filesList.length) setActiveImage(next);
      }
    }
    swipe = null;
  }

  // ─── Carousel position ─────────────────────────────────────────────────────
  // With the Ratio tool open on a carousel, dragging the photo slides it inside the strip (instead of
  // compare/swipe), and the Ratio tool shows a Position slider for the direction that has room to move.
  const positioning = $derived(
    activeTab === "framing" && slices > 1 && activeTool.framing === "ratio" && (!compact || (trayOpen && trayView === "tool")),
  );
  // "y" when the photo is cropped top/bottom, "x" when cropped at the sides, null when it fits exactly.
  const fillAxis = $derived.by(() => {
    if (slices <= 1 || !processedImage || !activeItem) return null;
    const c = layoutFrame(processedImage.width, processedImage.height, activeItem).crop;
    return processedImage.height - c.sh > 1 ? "y" : processedImage.width - c.sw > 1 ? "x" : null;
  });
  let fillDrag = null;
  function startFillDrag(e) {
    const c = layoutFrame(processedImage.width, processedImage.height, activeItem).crop;
    fillDrag = {
      x: e.clientX,
      y: e.clientY,
      from: { ...activeItem.fill },
      slackX: processedImage.width - c.sw,
      slackY: processedImage.height - c.sh,
      k: canvasEl.width / e.currentTarget.getBoundingClientRect().width, // canvas pixels per screen pixel
    };
  }
  function dragFill(e) {
    const d = fillDrag;
    const clamp = (v) => Math.min(1, Math.max(0, v));
    // Dragging down shows more of the top, like moving a photo behind a window.
    activeItem.fill = {
      x: d.slackX > 1 ? clamp(d.from.x - ((e.clientX - d.x) * d.k) / d.slackX) : d.from.x,
      y: d.slackY > 1 ? clamp(d.from.y - ((e.clientY - d.y) * d.k) / d.slackY) : d.from.y,
    };
  }

  // ─── Crop, straighten, rotate ──────────────────────────────────────────────
  const cropping = $derived(
    activeTab === "editor" &&
      activeTool.editor === "crop" &&
      (!compact || (trayOpen && trayView === "tool")) &&
      Boolean(activeItem),
  );
  const crop = $derived(activeItem?.crop ?? CROP_DEFAULT);
  // Turned image size (the crop rect is in fractions of it); the preview has the full image's proportions.
  const turned = $derived(
    activeItem
      ? turnedSize(
          activeItem.previewImage.width,
          activeItem.previewImage.height,
          crop.rot,
        )
      : [1, 1],
  );
  const cropAspect = $derived(
    normalizedAspect(crop.ratio, turned[0], turned[1]),
  );

  function setCrop(patch) {
    if (activeItem)
      activeItem.crop = { ...CROP_DEFAULT, ...activeItem.crop, ...patch };
  }
  function setCropRatio(id) {
    const [W, H] = turned;
    setCrop({
      ratio: id,
      ...(id === "free" ? {} : fitRect(normalizedAspect(id, W, H))),
    });
  }
  function turnCrop(quarter) {
    const rot = (crop.rot + quarter + 4) % 4;
    const [W, H] = turnedSize(
      activeItem.previewImage.width,
      activeItem.previewImage.height,
      rot,
    );
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
    setCrop(
      dragRect(
        rect,
        handle,
        (e.clientX - x) / box.width,
        (e.clientY - y) / box.height,
        cropAspect,
      ),
    );
  }
  // Arrow keys nudge the crop; with Shift they resize it from the bottom-right corner.
  function cropKey(e) {
    const step = 0.01;
    const d = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }[e.key];
    if (!d) return;
    e.preventDefault();
    e.stopPropagation();
    setCrop(dragRect(crop, e.shiftKey ? "se" : "move", d[0], d[1], cropAspect));
  }

  // Your own looks ("recipes"), saved on this device.
  const LOOKS_KEY = "mf_looks_v1";
  let userLooks = $state([]);
  try {
    userLooks = JSON.parse(localStorage.getItem(LOOKS_KEY) || "[]");
  } catch {}
  const persistLooks = () =>
    localStorage.setItem(LOOKS_KEY, JSON.stringify(userLooks));
  function saveLook(name) {
    userLooks = [
      ...userLooks,
      {
        id: `look_user_${Date.now()}`,
        name,
        params: { ...freshDev(), ...$state.snapshot(dev) },
      },
    ];
    persistLooks();
  }
  function deleteLook(id) {
    userLooks = userLooks.filter((l) => l.id !== id);
    persistLooks();
  }
  // Strip thumbnails show each photo's own edits, refreshed shortly after they change.
  $effect(() => {
    if (!canDevelop) return;
    const pending = filesList.map((f) => [f, JSON.stringify([f.dev, f.crop])]);
    const t = setTimeout(() => {
      const out = document.createElement("canvas");
      for (const [f, key] of pending) {
        if (f.thumbKey === key) continue;
        const thumb = develop(f.small, f.dev, out);
        f.thumbUrl = (
          isIdentity(f.crop) ? thumb : applyGeometry(thumb, f.crop)
        ).toDataURL("image/jpeg", 0.8);
        f.thumbKey = key;
      }
    }, 500);
    return () => clearTimeout(t);
  });

  // ─── Frame settings ────────────────────────────────────────────────────────
  // Every frame setting in one object: templates, undo/redo and the redraw all use it as a whole.
  // Keys are the saved-template keys, so older templates keep loading.
  const frame = $state({
    selectedRatioId: "4:5",
    slides: 3, // carousel only: how many slides the photo is cut into
    slideShape: "4:5", // carousel only: "4:5" or "1:1" slides
    customMarginH: 8, // Horizontal margin % (5 - 50%)
    customMarginV: 8, // Vertical margin % (5 - 50%)
    captionSpace: 12, // "Photo + caption" ratio: extra border for the caption, % of photo height
    backgroundColor: "#ffffff",
    textColor: "#000000",
    autoContrast: true,
    showExif: true,
    cleanNames: true, // "ILCE-7RM4" → "Sony A7R IV" on the frame; the typed text is kept as is
    captionStyle: "stack", // "stack" | "bar" (camera-brand bar: model left, brand and settings right)
    selectedFontId: "archivo",
    autoFontSize: true,
    manualFontSize: 24, // px at a 1080px long edge, scaled with the photo
    textAlign: "left", // 'left' | 'center' | 'right'
    textZone: "bottom", // 'bottom' | 'top' margin zone
    textPosX: 0, // across the photo's width: 0 = its left edge, 100 = its right edge
    textPosY: 50, // inside the caption border: 0 = next to the photo, 100 = at the outer edge
    logoScale: 12, // 3% - 45% of canvas width
    logoOpacity: 85, // 5% - 100%
    logoPosX: 92, // 0% - 100%
    logoPosY: 93, // 0% - 100%
    exifDisplay: {
      date: false,
      note: true, // empty unless typed, so it only shows when you add one
      model: true,
      lens: true,
      focalLength: true,
      aperture: true,
      shutterSpeed: true,
      iso: true,
    },
  });

  const ratio = $derived(frameRatio(frame));
  const slices = $derived(ratio?.slices ?? 1);
  // In a fixed ratio one border is filled by the ratio itself, so only the other slider is shown.
  const autoAxis = $derived(slices > 1 ? "v" :
    processedImage
      ? autoBorderAxis(
          processedImage.width,
          processedImage.height,
          ratio,
        )
      : null,
  );

  // Canvas text can't swap fonts once they arrive, so load the chosen one and redraw.
  $effect(() => {
    const css = (
      allFonts().find((f) => f.id === frame.selectedFontId) || SYSTEM_FONTS[0]
    ).css;
    Promise.all([
      document.fonts.load(`400 40px ${css}`),
      document.fonts.load(`600 40px ${css}`),
    ]).then(() => scheduleRender());
  });

  // ─── Logo / watermark ──────────────────────────────────────────────────────
  let logoImage = $state.raw(null);
  let logoName = $state("");

  function drawLogoOnCanvas(ctx, canvasW, canvasH) {
    if (!logoImage) return;
    const logoW = Math.max(12, Math.round((frame.logoScale / 100) * canvasW));
    const natW = logoImage.naturalWidth || logoImage.width || 1;
    const natH = logoImage.naturalHeight || logoImage.height || 1;
    const aspect = natH / natW;
    const logoH = Math.round(logoW * aspect);

    const anchorX = Math.round((frame.logoPosX / 100) * canvasW);
    const anchorY = Math.round((frame.logoPosY / 100) * canvasH);
    const x = Math.round(anchorX - logoW / 2);
    const y = Math.round(anchorY - logoH / 2);

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, frame.logoOpacity / 100));
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

  // ─── Templates (saved on this device) ──────────────────────────────────────
  const PRESETS_STORAGE_KEY = "mf_layout_presets_v1";
  let userPresets = $state([]);
  let showSavePresetModal = $state(false);
  let saveKind = $state("template"); // what the name dialog saves: "template" or "look"
  let newPresetName = $state("");

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

  const frameSnapshot = () => $state.snapshot(frame);

  function saveCurrentPreset(name) {
    userPresets = [
      ...userPresets,
      {
        id: `preset_user_${Date.now()}`,
        name,
        ...frameSnapshot(),
        dev: $state.snapshot(dev),
      },
    ];
    persistPresets();
  }

  function openSave(kind, name = "") {
    saveKind = kind;
    newPresetName = name;
    showSavePresetModal = true;
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
    const data = {
      app: "MinimalFrame",
      version: 1,
      templates: $state.snapshot(userPresets),
      looks: $state.snapshot(userLooks),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    triggerDownload(
      blob,
      `MinimalFrame_library_${new Date().toISOString().slice(0, 10)}.json`,
    );
  }

  let libraryMessage = $state("");

  async function importLibrary(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const { templates, looks } = parseLibrary(
        JSON.parse(await file.text()),
        frameSnapshot(),
      );
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
    for (const k of Object.keys(DEV_DEFAULTS))
      if (p[k] !== undefined) dev[k] = p[k];
    if (p.dev) Object.assign(dev, p.dev);
    scheduleRender(true);
  }

  function applyFrame(p) {
    for (const k of Object.keys(frame))
      if (k !== "exifDisplay" && p[k] !== undefined) frame[k] = p[k];
    frame.captionSpace = p.captionSpace ?? 12; // older templates have none
    frame.captionStyle = ["bar", "spread"].includes(p.captionStyle) ? p.captionStyle : "stack";
    // Templates from before the flexible carousel had fixed 2- and 3-slide ratios.
    const oldCarousel = /^carousel(\d)$/.exec(p.selectedRatioId ?? "");
    if (oldCarousel) Object.assign(frame, { selectedRatioId: "carousel", slides: Number(oldCarousel[1]), slideShape: "4:5" });
    if (p.exifDisplay)
      frame.exifDisplay = { ...frame.exifDisplay, ...p.exifDisplay };
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
      fill: activeItem?.fill ?? null,
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
      if (o.fill) item.fill = o.fill;
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
    const typing = e.target.closest?.(
      "input[type=text], input:not([type]), textarea",
    );
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "z" && !typing) {
      e.preventDefault();
      e.shiftKey ? redo() : undo();
    } else if (mod && e.key.toLowerCase() === "y" && !typing) {
      e.preventDefault();
      redo();
    } else if (e.key === "\\" && !e.repeat && !typing) {
      showOriginal = true;
    } else if (
      (e.key === "ArrowRight" || e.key === "ArrowLeft") &&
      !e.target.closest?.("input, textarea")
    ) {
      const n = filesList.length;
      if (n > 1)
        setActiveImage(
          (activeImageIndex + (e.key === "ArrowRight" ? 1 : n - 1)) % n,
        );
    }
  }
  function onKeyup(e) {
    if (e.key === "\\") showOriginal = false;
  }

  onMount(() => {
    if (new URLSearchParams(location.search).has("shared")) loadSharedFiles();
    loadPresets();
    // Canvas text can't swap fonts by itself; redraw once the bundled caption font is ready.
    document.fonts?.ready.then(() => scheduleRender());
  });

  // Photos sent with "Share to MinimalFrame" wait in a cache the service worker filled; open them once.
  async function loadSharedFiles() {
    history.replaceState(null, "", location.pathname);
    try {
      const cache = await caches.open("mf-shared");
      const files = [];
      for (const req of await cache.keys()) {
        const res = await cache.match(req);
        const name = new URL(req.url).searchParams.get("name") || "shared.jpg";
        files.push(
          new File([await res.blob()], name, {
            type: res.headers.get("content-type") || "",
          }),
        );
        await cache.delete(req);
      }
      if (files.length) loadFiles(files);
    } catch (err) {
      loadError = `Could not open the shared photos: ${err.message}`;
    }
  }

  // ─── Preview canvas and export settings ────────────────────────────────────
  let canvasEl = $state.raw(null);
  let framedSize = $state({ w: 0, h: 0 }); // full-resolution size of the framed export
  let photoSize = $state({ w: 0, h: 0 }); // full-resolution size of the photo alone
  const EXPORT_KEY = "mf_export_v1";
  let exportPrefs = $state({ size: "full", format: "jpeg", quality: "high" });
  try {
    Object.assign(
      exportPrefs,
      JSON.parse(localStorage.getItem(EXPORT_KEY) || "{}"),
    );
  } catch {}
  $effect(() => {
    try {
      localStorage.setItem(EXPORT_KEY, JSON.stringify(exportPrefs));
    } catch {}
  });

  /** Output scale for the current size preset (layout is proportional, so it can be computed up front). */
  function exportScale(photoW, photoH, mode, item) {
    const s = EXPORT_SIZES.find((x) => x.id === exportPrefs.size);
    if (!s?.width && !s?.long) return 1;
    const { canvasW: w, canvasH: h } =
      mode === "framed"
        ? layoutFrame(photoW, photoH, item)
        : { canvasW: photoW, canvasH: photoH };
    // shortcut: rounding can land the Instagram width at 1079–1081px; Instagram resamples it anyway.
    // Carousel: the Instagram width applies to each slide.
    const width = s.width && mode === "framed" ? s.width * slices : s.width;
    return Math.min(1, width ? width / w : s.long / Math.max(w, h));
  }

  /** Output pixel size for a preset, from the current photo. */
  function targetDims(s, mode) {
    const { w, h } = mode === "framed" ? framedSize : photoSize;
    const width = s.width && mode === "framed" ? s.width * slices : s.width;
    const k = Math.min(
      1,
      width ? width / w : s.long ? s.long / Math.max(w, h) : 1,
    );
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
    const sample = drawFramed(document.createElement("canvas"), processedImage, activeItem);
    let cancelled = false;
    encodeCanvas(sample).then(({ blob }) => {
      if (cancelled) return;
      const bytes = (blob.size / (sample.width * sample.height)) * w * h;
      sizeEstimate =
        bytes > 1e6
          ? `about ${(bytes / 1e6).toFixed(1)} MB`
          : `about ${Math.max(1, Math.round(bytes / 1e3))} KB`;
    });
    return () => (cancelled = true);
  });

  /** Encodes a canvas with the chosen format; the extension follows what the browser actually produced. */
  async function encodeCanvas(canvas) {
    const blob = await new Promise((resolve) =>
      canvas.toBlob(
        resolve,
        FORMATS[exportPrefs.format],
        QUALITIES[exportPrefs.quality],
      ),
    );
    if (!blob) throw new Error("this browser could not encode the image");
    // Browsers without WebP encoding silently fall back to PNG.
    const ext =
      { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[
        blob.type
      ] || "png";
    return { blob, ext };
  }

  // Export & Download States
  let isDownloading = $state(false);
  let downloadStatus = $state("");
  let fallbackDownloadUrl = $state("");
  let fallbackFilename = $state("");

  // Batch export progress
  let isBatchExporting = $state(false);
  let batchProgress = $state({
    current: 0,
    total: 0,
    percent: 0,
    filename: "",
  });

  // ─── Automatic caption size ────────────────────────────────────────────────
  // Fewer camera fields → larger text (date and note are extra lines and don't count).
  const selectedExifCount = $derived(
    ["model", "lens", "focalLength", "aperture", "shutterSpeed", "iso"].filter(
      (k) => frame.exifDisplay[k],
    ).length,
  );

  const dynamicScaleFactor = $derived(
    selectedExifCount > 0 ? 1.0 + (6 - selectedExifCount) * 0.26 : 1.0,
  );

  // ─── Loading photos ────────────────────────────────────────────────────────
  let startPreset = null; // a frame picked on the landing page, applied to the photos it opens
  let started = $state(false); // once a photo has opened, removing them all leaves an empty workbench, not the landing page
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

          if (isHeif(file)) {
            loadingStatus = `Opening HEIF ${i + 1} of ${fileList.length}: ${file.name}`;
            sourceBlob = await heifSource(file); // a JPEG unless the browser reads HEIF itself
          }

          // Decode once, keep only a ≤1080px proxy. The full-res source is re-decoded from sourceBlob at export.
          const bitmap = await decodeUpright(sourceBlob);
          previewImage = applyExifOrientation(
            createProxyPreview(bitmap, 1080),
            orientationTag,
          );
          const isRotated90 = orientationTag >= 5;
          fullW = isRotated90 ? bitmap.height : bitmap.width;
          fullH = isRotated90 ? bitmap.width : bitmap.height;
          bitmap.close();
          thumbSource = previewImage;
          small = document.createElement("canvas");
          const k = 160 / Math.max(previewImage.width, previewImage.height);
          small.width = Math.max(1, Math.round(previewImage.width * k));
          small.height = Math.max(1, Math.round(previewImage.height * k));
          small
            .getContext("2d")
            .drawImage(previewImage, 0, 0, small.width, small.height);
        }

        // 5. Filmstrip Thumbnail (120px)
        const thumbUrl = createThumbnail(thumbSource);
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
        const taken =
          rawExif?.DateTimeOriginal instanceof Date
            ? rawExif.DateTimeOriginal
            : null;
        const date = taken
          ? taken.toLocaleDateString(undefined, {
              day: "numeric",
              month: "short",
              year: "numeric",
            })
          : "";

        newItems.push({
          id: `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          file,
          name: file.name,
          sourceBlob, // Encoded original (or decoded RAW JPEG); decoded only at export
          fullW,
          fullH,
          previewImage, // ≤1080px proxy: a canvas, or 16-bit linear data for RAW
          linearRaw, // export re-decodes the RAW file at full size
          thumbUrl,
          isRaw,
          rawBadge,
          orientationTag,
          palette,
          rotated: detectedOrientation > 1, // shown in the UI; the browser or LibRaw may have done the rotating
          selected: true, // included in batch export
          hadGps: rawExif?.GPSLatitude != null || rawExif?.latitude != null, // exports never contain it
          small, // 160px source for looks and strip thumbnails
          dev: freshDev(), // this photo's own edits
          crop: null, // this photo's crop / rotation (see geometry.js)
          fill: { x: 0.5, y: 0.5 }, // carousels: which part of the photo fills the strip (0..1, centre)
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
      started = true;
      activeImageIndex = startIndex; // Switch to first newly added photo

      if (hasRaw) {
        activeTab = "editor";
      }

      await tick();
      resetTextPosition();
      if (startPreset) applyPreset(startPreset);
      startPreset = null;
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

  // Nothing on the page can be dragged (template previews, thumbnails, the logo): browsers would offer those
  // as files, and dropping one would open it as a photo. Files dragged in from outside still work.
  // Drop anywhere: window-level listeners. dragenter/dragleave fire for every element crossed,
  // so a counter tells "still over the page" from "left the window".
  let dragDepth = 0;
  const hasFiles = (e) => e.dataTransfer?.types?.includes("Files");
  function onDragEnter(e) {
    if (!hasFiles(e)) return;
    dragDepth++;
    isDragging = true;
  }
  function onDrop(e) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    isDragging = false;
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length > 0) loadFiles(files);
  }

  // A built-in photo for first-time visitors: painted on a canvas so it works offline and adds no download.
  // Its camera details are raw EXIF codes on purpose, so "Clean metadata names" has something to show.
  async function loadSamplePhoto() {
    const c = paintSamplePhoto();
    const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.92));
    const file = new File([blob], "minimalframe-sample.jpg", {
      type: "image/jpeg",
    });
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
    if (hasFiles(e)) e.preventDefault(); // allows the drop
  }
  function onDragLeave(e) {
    if (hasFiles(e) && --dragDepth <= 0) {
      dragDepth = 0;
      isDragging = false;
    }
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
    if (filesList.length === 0) closeTray(); // nothing left to show in the photos tray or a tool
    if (activeImageIndex >= filesList.length) {
      activeImageIndex = Math.max(0, filesList.length - 1);
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
      developCanvas(
        base,
        (previewWorkCanvas ??= document.createElement("canvas")),
        params,
      ),
      params,
    );
    // While cropping, show the whole turned/straightened photo so the crop box can be moved over it.
    const geo = showOriginal
      ? null
      : cropping
        ? { ...crop, x: 0, y: 0, w: 1, h: 1 }
        : activeItem.crop;
    processedImage = isIdentity(geo)
      ? developed
      : applyGeometry(
          developed,
          geo,
          (previewGeoCanvas ??= document.createElement("canvas")),
        );
    histo = histogram(processedImage);
  }

  // ─── Caption text ──────────────────────────────────────────────────────────
  function buildExifLines(override, display) {
    if (!override) return [];
    const lines = [];

    if (display.model && override.model?.trim()) {
      lines.push({
        type: "model",
        text: frame.cleanNames
          ? cleanCamera(override.model)
          : override.model.trim(),
      });
    }

    if (display.lens && override.lens?.trim()) {
      lines.push({
        type: "lens",
        text: frame.cleanNames
          ? cleanLens(override.lens)
          : override.lens.trim(),
      });
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
      lines.push({ type: "settings", text: settings.join("  ·  "), parts: settings });
    }

    const extra = [];
    if (display.note && override.note?.trim()) extra.push(override.note.trim());
    if (display.date && override.date?.trim()) extra.push(override.date.trim());
    if (extra.length) lines.push({ type: "extra", text: extra.join("  ·  "), parts: extra });

    return lines;
  }

  // ─── Frame layout (one function for preview and export, so both always match) ─
  // Every size is proportional to the photo, so the same settings give the same result at any resolution.
  const measureCtx = document.createElement("canvas").getContext("2d");
  const captionFamily = () =>
    (allFonts().find((f) => f.id === frame.selectedFontId) || SYSTEM_FONTS[0])
      .css;

  // item: the photo (its caption text, and for carousels which part of it fills the strip).
  function layoutFrame(srcW, srcH, item) {
    const exifOverride = item?.exifOverride;
    return computeFrameLayout(
      srcW,
      srcH,
      frame.showExif && exifOverride
        ? buildExifLines(exifOverride, frame.exifDisplay)
        : [],
      {
        marginH: frame.customMarginH,
        marginV: frame.customMarginV,
        ratioId: frame.selectedRatioId,
        ratio,
        fill: slices > 1,
        fillX: item?.fill?.x ?? 0.5,
        fillY: item?.fill?.y ?? 0.5,
        captionSpace: frame.captionSpace,
        fontSize: frame.autoFontSize
          ? 26 * dynamicScaleFactor
          : frame.manualFontSize,
        zone: frame.textZone,
        align: frame.textAlign,
        posX: frame.textPosX,
        posY: frame.textPosY,
        style: frame.captionStyle,
        brand: brandMark(exifOverride?.model),
        measure: (text, px, weight = 600) => {
          measureCtx.font = `${weight} ${px}px ${captionFamily()}`;
          return measureCtx.measureText(text).width;
        },
      },
    );
  }

  /** Draws `photo` with border, caption and logo into `canvas` (resized to fit). */
  // ─── Brand logos (brand bar) ───────────────────────────────────────────────
  // Loaded once from public/brands/; the frame redraws when one arrives.
  const logoImages = {};
  function brandLogo(name) {
    if (!logoImages[name]) {
      const img = new Image();
      img.onload = () => scheduleRender();
      img.src = `${import.meta.env.BASE_URL}brands/${name}.svg`;
      logoImages[name] = img;
    }
    const img = logoImages[name];
    return img.complete && img.naturalWidth ? img : null;
  }
  // Black wordmarks (SONY, FUJIFILM…) are rasterised at the exact size and their black parts take the caption
  // colour, so they read on a dark frame; coloured accents (Fujifilm's red) stay. Badges are drawn as they are.
  const tintedLogos = new Map();
  function tintLogo(img, w, h, color) {
    const key = `${img.src}|${Math.round(w)}x${Math.round(h)}|${color}`;
    if (tintedLogos.has(key)) return tintedLogos.get(key);
    if (tintedLogos.size > 40) tintedLogos.clear(); // preview and export sizes come and go
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(img, 0, 0, c.width, c.height);
    const px = g.getImageData(0, 0, c.width, c.height);
    const d = px.data;
    const [r, gr, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
    for (let i = 0; i < d.length; i += 4) {
      if (Math.max(d[i], d[i + 1], d[i + 2]) < 70) {
        d[i] = r;
        d[i + 1] = gr;
        d[i + 2] = b;
      }
    }
    g.putImageData(px, 0, 0);
    tintedLogos.set(key, c);
    return c;
  }

  function drawFramed(canvas, photo, item) {
    const L = layoutFrame(photo.width, photo.height, item);
    if (canvas.width !== L.canvasW || canvas.height !== L.canvasH) {
      canvas.width = L.canvasW;
      canvas.height = L.canvasH;
    }
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = frame.backgroundColor;
    ctx.fillRect(0, 0, L.canvasW, L.canvasH);
    // Carousels fill the whole strip: the layout says which part of the photo to draw (L.crop).
    const { sx, sy, sw, sh } = L.crop ?? { sx: 0, sy: 0, sw: photo.width, sh: photo.height };
    ctx.drawImage(photo, sx, sy, sw, sh, L.imgX, L.imgY, sw, sh);
    if (L.caption?.style === "spread") {
      const c = L.caption;
      const fam = captionFamily();
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillStyle = frame.textColor;
      ctx.font = `500 ${c.size}px ${fam}`;
      for (const it of c.items) ctx.fillText(it.text, it.x, c.y);
      // The name sits on the photo: white with a soft shadow so it reads on light and dark areas.
      ctx.save();
      ctx.textAlign = "right";
      ctx.fillStyle = "#fff";
      ctx.shadowColor = "rgb(0 0 0 / 0.45)";
      for (const l of c.overlay.lines) {
        ctx.shadowBlur = l.size * 0.35;
        ctx.font = `${l.weight} ${l.size}px ${fam}`;
        ctx.fillText(l.text, c.overlay.x, l.y);
      }
      ctx.restore();
    } else if (L.caption?.style === "bar") {
      const c = L.caption;
      const fam = captionFamily();
      ctx.textBaseline = "middle";
      ctx.fillStyle = frame.textColor;
      for (const [block, align] of [
        [c.left, "left"],
        [c.right, "right"],
      ]) {
        ctx.textAlign = align;
        block.lines.forEach((line, i) => {
          ctx.globalAlpha = i ? 0.62 : 1; // second row (lens, date) is quieter
          ctx.font = `${i ? 400 : 600} ${i ? c.sub : c.size}px ${fam}`;
          ctx.fillText(line.text, block.x, block.ys[i]);
        });
      }
      ctx.globalAlpha = 1;
      const logos = c.brand?.parts.map((p) => brandLogo(p.name));
      if (logos?.length && logos.every(Boolean)) {
        c.brand.parts.forEach((p, i) => ctx.drawImage(p.tint ? tintLogo(logos[i], p.w, p.h, frame.textColor) : logos[i], p.x, p.y, p.w, p.h));
      } else if (c.brand?.text) {
        // no logo for this maker (or it's still loading): the name as a wordmark
        ctx.textAlign = "right";
        ctx.font = `800 ${c.brand.size}px ${fam}`;
        ctx.fillText(c.brand.text, c.brand.x, c.brand.y);
      }
      if (c.divider) {
        ctx.globalAlpha = 0.3;
        const w = Math.max(1, c.size * 0.07);
        ctx.fillRect(
          c.divider.x - w / 2,
          c.divider.y1,
          w,
          c.divider.y2 - c.divider.y1,
        );
        ctx.globalAlpha = 1;
      }
    } else if (L.caption) {
      const { lines, size, x, y0, lineH } = L.caption;
      ctx.textAlign = frame.textAlign;
      ctx.textBaseline = "middle";
      ctx.fillStyle = frame.textColor;
      lines.forEach((line, i) => {
        const isModel = line.type === "model";
        ctx.font = `${isModel ? 600 : 400} ${isModel ? size : size * 0.88}px ${captionFamily()}`;
        ctx.fillText(line.text, x, y0 + i * lineH);
      });
    }
    drawLogoOnCanvas(ctx, L.canvasW, L.canvasH);
    return canvas;
  }

  // ─── Caption position ──────────────────────────────────────────────────────
  function resetTextPosition() {
    frame.textPosX = ALIGN_X[frame.textAlign];
    frame.textPosY = 50;
  }

  // ─── Preview rendering (one frame per animation frame at most) ─────────────
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
    const fullScale =
      (activeItem.fullW || activeItem.previewImage.width) /
      activeItem.previewImage.width;

    // Full-resolution sizes for the info line and the export sheet.
    const L = layoutFrame(srcW, srcH, activeItem);
    framedSize = {
      w: Math.round(L.canvasW * fullScale),
      h: Math.round(L.canvasH * fullScale),
    };
    photoSize = {
      w: Math.round(srcW * fullScale),
      h: Math.round(srcH * fullScale),
    };

    if (activeTab === "editor") {
      // Edit mode shows the photo alone for clear colour judgement.
      canvasEl.width = srcW;
      canvasEl.height = srcH;
      canvasEl.getContext("2d").drawImage(processedImage, 0, 0);
    } else {
      drawFramed(canvasEl, processedImage, activeItem);
    }
    canvasAspect = canvasEl.width / canvasEl.height;
  }

  // ─── What triggers a re-render ─────────────────────────────────────────────
  $effect(() => {
    // When activeItem changes or color sliders move, schedule image update + canvas render
    const _ai = activeItem;
    const _dev = JSON.stringify(dev); // every develop slider
    const _luts = lutLib.list.length; // saved LUTs finish loading after start-up
    const _orig = showOriginal;
    const _crop = JSON.stringify(activeItem?.crop);
    const _cropping = cropping;

    scheduleRender(true);
  });

  $effect(() => {
    const _bg = frame.backgroundColor;
    if (frame.autoContrast) {
      frame.textColor = getContrastingColor(_bg);
    }
  });

  $effect(() => {
    // Redraw when any frame setting, the photo, its caption text or the logo changes.
    const _frame = JSON.stringify(frame);
    const _tab = activeTab;
    const _pi = processedImage;
    const _ai = activeItem;
    const _ov = JSON.stringify(activeItem?.exifOverride);
    const _fill = JSON.stringify(activeItem?.fill);
    const _limg = logoImage;

    scheduleRender(false);
  });

  // ─── Full-resolution export ────────────────────────────────────────────────
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
      colorCanvas = developCanvas(
        sourceCanvas,
        document.createElement("canvas"),
        item.dev,
      );
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
    const k = exportScale(
      colorCanvas.width,
      colorCanvas.height,
      mode,
      item,
    );
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
      applyAnalogEffects(colorCanvas, {
        grain: item.dev.filmGrain,
        bloom: item.dev.softBloom,
      });
    }

    if (mode === "edited") {
      return colorCanvas;
    }

    // 4. Exact Percentage Framing & Scaled Fonts for Full Resolution
    const framed = drawFramed(document.createElement("canvas"), colorCanvas, item);
    // Explicitly free temporary colorCanvas memory
    colorCanvas.width = 0;
    colorCanvas.height = 0;
    return framed;
  }

  /** Cuts a carousel frame into equal slides (the last one takes any rounding remainder). */

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
      files.push({
        name: n > 1 ? `${base}_${i + 1}of${n}.${ext}` : `${base}.${ext}`,
        blob,
      });
      parts[i].width = parts[i].height = 0;
    }
    canvas.width = canvas.height = 0;
    return files;
  }

  async function zipFiles(files) {
    const zip = new JSZip();
    for (const f of files) zip.file(f.name, f.blob);
    return zip.generateAsync(
      { type: "blob" },
      (m) => (batchProgress.percent = Math.round(m.percent)),
    );
  }

  function triggerDownload(blob, filename) {
    if (fallbackDownloadUrl?.startsWith("blob:"))
      URL.revokeObjectURL(fallbackDownloadUrl);
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

  // Phones and tablets save every photo/slide as its own image (it lands in the gallery straight away);
  // desktop gets one ZIP, which is tidier in a downloads folder.
  const savesSeparately = matchMedia("(pointer: coarse)").matches;
  // Samsung Internet keeps only the first of several downloads started without a tap, so there the rest
  // wait for one tap each (Save image 2 of 3…). Chrome and others save them all at once.
  // shortcut: detects Samsung Internet by name; add other browsers here if they turn out to block too.
  const oneSavePerTap = typeof navigator !== "undefined" && /SamsungBrowser/.test(navigator.userAgent);
  let saveQueue = $state.raw(null); // { files, next }: images still waiting for a tap
  function saveNext() {
    const { files, next } = saveQueue;
    triggerDownload(files[next].blob, files[next].name);
    saveQueue = next + 1 < files.length ? { files, next: next + 1 } : null;
    flashStatus(saveQueue ? `Saved ${next + 1} of ${files.length}. Tap Save for the next one.` : `Saved all ${files.length} images`);
  }

  async function saveFiles(files, zipName) {
    saveQueue = null;
    if (files.length === 1) return triggerDownload(files[0].blob, files[0].name);
    if (!savesSeparately) return triggerDownload(await zipFiles(files), zipName);
    if (oneSavePerTap) {
      saveQueue = { files, next: 0 };
      return saveNext();
    }
    for (const f of files) {
      const url = URL.createObjectURL(f.blob);
      const link = Object.assign(document.createElement("a"), { href: url, download: f.name });
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      await new Promise((r) => setTimeout(r, 350)); // browsers drop downloads started in the same instant
    }
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
      const name = `${cleanName(activeItem.name, "photo")}_carousel.zip`;
      await saveFiles(files, name);
      if (!saveQueue) flashStatus(
        files.length === 1 ? `Saved ${files[0].name}` : savesSeparately ? `Saved ${files.length} slides` : `Saved ${files.length} slides to ${name}`,
      );
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
    Boolean(
      navigator.canShare?.({
        files: [new File([""], "x.jpg", { type: "image/jpeg" })],
      }),
    );
  let pendingShare = $state.raw(null); // files ready but the browser wants a fresh tap to share them

  async function shareFiles(files) {
    try {
      await navigator.share({
        files: files.map(
          (f) => new File([f.blob], f.name, { type: f.blob.type }),
        ),
      });
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

  // ─── Batch export (separate images on phones/tablets, one ZIP on desktop) ───────────────────────────────────────────────────
  async function exportBatch(mode = "framed") {
    const batch = filesList.filter((item) => item.selected);
    if (batch.length === 0) return;
    isBatchExporting = true;
    const total = batch.length;
    batchProgress = { current: 0, total, percent: 0, filename: "" };
    try {
      const files = [];
      for (let i = 0; i < total; i++) {
        batchProgress = {
          current: i + 1,
          total,
          percent: Math.round(((i + 1) / total) * 100),
          filename: batch[i].name,
        };
        await new Promise((r) => setTimeout(r, 20)); // let the progress bar paint
        files.push(...(await renderFiles(batch[i], mode, i)));
      }
      batchProgress.filename = savesSeparately ? "Saving…" : "Packing the ZIP…";
      const name = `MinimalFrame_${new Date().toISOString().slice(0, 10)}_${total}photos.zip`;
      await saveFiles(files, name);
      if (!saveQueue) flashStatus(savesSeparately ? `Saved ${files.length} images` : `Saved ${total} photos to ${name}`);
    } catch (err) {
      console.error("[MinimalFrame] Batch export error:", err);
      loadError = `Batch export failed: ${err.message}`;
    } finally {
      isBatchExporting = false;
    }
  }
</script>

<input
  bind:this={fileInput}
  id="mf-file-input"
  class="sr-only"
  type="file"
  multiple
  accept="image/heic,image/heif,.jpg,.jpeg,.png,.webp,.avif,.heic,.heif,.arw,.cr2,.cr3,.dng,.nef,.orf,.raf,.rw2,.pef,.srw"
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
  ondragstart={(e) => e.preventDefault()}
  ondragenter={onDragEnter}
  ondragover={onDragOver}
  ondragleave={onDragLeave}
  ondrop={onDrop}
/>

<main
  class="app"
  class:empty={!started}
>
  <header class="bar">
    <div class="bar-side">
      <span class="wordmark"><img class="mark" src="/favicon.svg" alt="" /><span class="wm-text">MinimalFrame</span></span>
      {#if activeItem}
        <button class="photos-btn" class:on={compact && trayOpen && trayView === "photos"} onclick={togglePhotos} aria-label="Your photos ({filesList.length})" title="Your photos">
          <img src={activeItem.thumbUrl} alt="" />
          {#if filesList.length > 1}<span class="count">{filesList.length}</span>{/if}
        </button>
      {/if}
    </div>
    {#if started}
      <div class="seg modes" role="group" aria-label="Mode">
        <button aria-pressed={activeTab === "editor"} onclick={() => setMode("editor")}>Edit</button>
        <button aria-pressed={activeTab === "framing"} onclick={() => setMode("framing")}>Frame</button>
      </div>
      <div class="bar-side end">
        <button class="icon-btn add-btn" onclick={() => fileInput?.click()} aria-label="Add photos" title="Add photos"><Icon name="add" /></button>
        <button class="icon-btn" onclick={undo} disabled={!canUndo || !activeItem} aria-label="Undo" title="Undo (Ctrl+Z)"><Icon name="undo" /></button>
        <button class="icon-btn" onclick={redo} disabled={!canRedo || !activeItem} aria-label="Redo" title="Redo (Ctrl+Shift+Z)"><Icon name="redo" /></button>
        <button
          class="btn accent bar-export"
          disabled={!activeItem}
          onclick={() => {
            exportDialog?.showModal();
            exportOpen = true;
          }}><Icon name="export" />Export</button
        >
      </div>
    {/if}
  </header>

  <section class="stage" aria-label="Preview">
    <div class="fit" style:display={processedImage ? "flex" : "none"}>
      <!-- svelte-ignore a11y_no_static_element_interactions (keyboard: hold \ or the "Hold for original" button) -->
      <div
        class="print"
        class:positioning
        style:--ar={canvasAspect}
        bind:this={printEl}
        title={cropping ? undefined : positioning ? "Drag to choose which part of the photo fills the slides" : "Press and hold to see the original"}
        onpointerdown={holdPhoto}
        onpointermove={movePhoto}
        onpointerup={releasePhoto}
        onpointerleave={releasePhoto}
        onpointercancel={releasePhoto}
        oncontextmenu={(e) => e.preventDefault()}
      >
        <canvas
          bind:this={canvasEl}
          aria-label="Preview of {activeItem?.name ?? 'your photo'}"
        ></canvas>
        {#if dev.softBloom > 0}
          <div
            class="fx-bloom"
            style:opacity={(dev.softBloom / 100) * 0.85}
            style:backdrop-filter={`blur(${Math.max(2, Math.round((dev.softBloom / 100) * 10))}px) brightness(1.22)`}
            aria-hidden="true"
          ></div>
        {/if}
        {#if dev.filmGrain > 0}
          <div
            class="fx-grain"
            style:opacity={(dev.filmGrain / 100) * 0.75}
            aria-hidden="true"
          ></div>
        {/if}
        {#key activeItem?.id}<div
            class="develop"
            aria-hidden="true"
          ></div>{/key}
        {#if showOriginal}<span class="badge">Original</span>{/if}
        {#if activeTab === "framing" && slices > 1}
          {#each Array.from({ length: slices - 1 }, (_, i) => i + 1) as i (i)}
            <span
              class="slice-line"
              style:left="{(i / slices) * 100}%"
              aria-hidden="true"
            ></span>
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
              <span class="third v1"></span><span class="third v2"></span><span
                class="third h1"
              ></span><span class="third h2"></span>
              {#each ["nw", "ne", "sw", "se"] as h (h)}
                <span
                  class="handle {h}"
                  onpointerdown={(e) => startCropDrag(e, h)}
                  aria-hidden="true"
                ></span>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </div>

    {#if activeItem && processedImage}
      <p class="meta">
        <span class="meta-name">{activeItem.name}</span>
        {#if framedSize.w}<span class="meta-dim">{activeTab === "framing" ? framedSize.w : photoSize.w} × {activeTab === "framing" ? framedSize.h : photoSize.h}</span>{/if}
        {#if activeItem.rawBadge}<span class="pill">RAW</span>{/if}
      </p>
    {/if}
    {#if processedImage}
      <button
        class="hold"
        bind:this={holdEl}
        class:on={showOriginal}
        aria-label="Hold to see the original"
        title="Hold to see the original (\)"
        onpointerdown={() => (showOriginal = true)}
        onpointerup={() => (showOriginal = false)}
        onpointerleave={() => (showOriginal = false)}
        onpointercancel={() => (showOriginal = false)}
        oncontextmenu={(e) => e.preventDefault()}
        onkeydown={(e) => (e.key === " " || e.key === "Enter") && (showOriginal = true)}
        onkeyup={() => (showOriginal = false)}
      >
        <Icon name="compare" /><span>Hold for original</span>
      </button>
    {/if}

    {#if !started || !activeItem}
      <Landing
        bare={started}
        {isLoading}
        {loadingStatus}
        {isDragging}
        onchoose={() => { startPreset = null; fileInput?.click(); }}
        onsample={() => { startPreset = null; loadSamplePhoto(); }}
        onpick={(p) => { startPreset = p; fileInput?.click(); }}
      />
    {/if}

    {#if isLoading && filesList.length > 0}
      <p class="toast glass" role="status">
        <span class="spinner" aria-hidden="true"></span>{loadingStatus}
      </p>
    {/if}
    {#if loadError}
      <p class="alert glass" role="alert">
        {loadError}
        <button onclick={() => (loadError = "")} aria-label="Dismiss">×</button>
      </p>
    {/if}
  </section>

  {#if started}
    <nav class="strip" class:single={filesList.length === 1} aria-label="Your photos">
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
            <button
              class="mini-del frame-del"
              onclick={(e) => removeImage(i, e)}
              aria-label="Remove {item.name}">×</button
            >
          </li>
        {/each}
        <li>
          <button
            class="frame-add"
            onclick={() => fileInput?.click()}
            aria-label="Add photos">+</button
          >
        </li>
      </ol>
      {#if filesList.length > 1}<p class="strip-note">
          {selectedCount} of {filesList.length} in batch
        </p>{/if}
    </nav>

    <nav class="rail" aria-label="Tools">
      {#each TOOLS[activeTab] as [id, name] (id)}
        <button
          class="tab"
          title={TOOL_HINTS[id]}
          aria-pressed={toolOpen(id)}
          onclick={() => pickTool(id)}
        >
          <Icon name={id} /><span>{name}</span>
        </button>
      {/each}
    </nav>

    <aside class="panel" class:open={trayOpen} class:closing={trayClosing} aria-label="{TOOLS[activeTab].find(([id]) => id === activeTool[activeTab])[1]} settings">
      <div class="panel-head">
        <div>
          <h2>{compact && trayView === "photos" ? "Photos" : TOOLS[activeTab].find(([id]) => id === activeTool[activeTab])[1]}</h2>
          <p class="tool-hint">{TOOL_HINTS[activeTool[activeTab]]}</p>
        </div>
        <button class="btn accent done" onclick={() => glide(closeTray)}>Done</button>
      </div>

      <div class="body" id="tool-body">
        {#if compact && trayView === "photos"}
          <PhotosTray
            bind:filesList
            activeIndex={activeImageIndex}
            onpick={(i) => glide(() => (setActiveImage(i), closeTray()))}
            onremove={removeImage}
            onadd={() => fileInput?.click()}
          />
        {:else if activeTab === "editor" && !activeItem}
          <p class="tool-hint">Add a photo to edit it.</p>
        {:else if activeTab === "editor"}
          {@const tool = activeTool.editor}
          {#if histo}<Histogram bins={histo} />{/if}
          {#if !canDevelop}
            <p class="hint">
              This device can't run the full editor, so only exposure, contrast
              and saturation are applied.
            </p>
          {/if}
          {#if tool === "looks"}
            <LooksTool
              bind:dev={() => dev, keep}
              bind:item={() => activeItem, keep}
              bind:filesList
              {selectedCount}
              {canDevelop}
              {userLooks}
              onsavelook={(name) => openSave("look", name)}
              ondeletelook={deleteLook}
              onerror={(msg) => (loadError = msg)}
            />
          {:else if tool === "crop"}
            <CropTool
              {crop}
              canReset={!isIdentity(activeItem?.crop)}
              onratio={setCropRatio}
              onturn={turnCrop}
              onchange={setCrop}
              onreset={resetCrop}
            />
          {:else if tool === "light"}
            <DevelopSliders group="light" bind:dev={() => dev, keep} />
          {:else if tool === "color"}
            <DevelopSliders group="color" bind:dev={() => dev, keep} />
          {:else if tool === "curve"}
            <CurveTool bind:dev={() => dev, keep} />
          {:else if tool === "mixer"}
            <MixerTool bind:dev={() => dev, keep} />
          {:else if tool === "detail"}
            <DevelopSliders group="detail" bind:dev={() => dev, keep} />
          {:else if tool === "film"}
            <DevelopSliders group="film" bind:dev={() => dev, keep} />
          {/if}
        {:else}
          {@const tool = activeTool.framing}
          {#if tool === "templates"}
            <TemplatesTool
              {userPresets}
              hasLooks={userLooks.length > 0}
              {libraryMessage}
              onapply={applyPreset}
              ondelete={deletePreset}
              onsave={() => openSave("template")}
              onexport={exportLibrary}
              onimport={importLibrary}
            />
          {:else if tool === "ratio"}
            <RatioTool bind:frame={() => frame, keep} bind:item={() => activeItem, keep} {slices} {fillAxis} />
          {:else if tool === "border"}
            <BorderTool bind:frame={() => frame, keep} {autoAxis} />
          {:else if tool === "colors"}
            <ColorsTool
              bind:frame={() => frame, keep}
              photoPalette={activeItem?.palette}
            />
          {:else if tool === "caption"}
            <CaptionTool
              bind:frame={() => frame, keep}
              bind:item={() => activeItem, keep}
            />
          {:else if tool === "position"}
            <PositionTool
              bind:frame={() => frame, keep}
              onreset={resetTextPosition}
            />
          {:else if tool === "logo"}
            <LogoTool
              bind:frame={() => frame, keep}
              {logoImage}
              {logoName}
              onupload={onLogoInput}
              onremove={removeLogo}
            />
          {/if}
        {/if}
      </div>
    </aside>
  {/if}

  <!-- ─── Export sheet ──────────────────────────────────────────────────── -->
  <ExportSheet
    bind:dialog={exportDialog}
    bind:exportOpen
    bind:exportPrefs
    {batchProgress}
    {canShareFiles}
    {downloadImage}
    {downloadStatus}
    {exportBatch}
    {fallbackDownloadUrl}
    {fallbackFilename}
    {filesList}
    {isBatchExporting}
    {isDownloading}
    {pendingShare}
    {saveQueue}
    {saveNext}
    {processedImage}
    {selectedCount}
    {shareFiles}
    {shareImage}
    {sizeEstimate}
    {sizeLabel}
    {slices}
    {savesSeparately}
  />


  {#if showSavePresetModal}
    <SaveDialog
      kind={saveKind}
      bind:name={newPresetName}
      onsave={saveNamed}
      onclose={() => (showSavePresetModal = false)}
    />
  {/if}

  {#if isDragging}
    <div class="drop-overlay" aria-hidden="true">
      <p>Drop anywhere to upload a <em>shoot</em></p>
    </div>
  {/if}
</main>

<style>
  /* ── Shell ───────────────────────────────────────────────────────────────
     Darkroom: a neutral workspace (it doesn't tint how you judge colour), one amber accent, flat
     surfaces split by hairlines. Desktop: the photo, then one dock beside it (the tool's settings next to
     the photo, the tool rail on the outer edge), so picking, adjusting and judging stay in one small area. */
  .app {
    position: relative;
    height: 100dvh;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 340px 88px;
    grid-template-rows: auto minmax(0, 1fr) auto;
    grid-template-areas:
      "bar bar bar"
      "stage panel rail"
      "strip panel rail";
    padding-top: env(safe-area-inset-top);
    padding-bottom: env(safe-area-inset-bottom);
    background: var(--stage);
  }
  .app.empty {
    grid-template-columns: 1fr;
    grid-template-rows: auto minmax(0, 1fr);
    grid-template-areas: "bar" "stage";
    background: var(--bg);
  }
  .app > :is(.bar, .stage, .strip, .rail, .panel) {
    position: relative;
    z-index: 1;
  }
  .app > :is(.bar, .rail, .panel, .strip) {
    background: var(--surface);
  }
  /* Full-screen drop target; pointer-events: none so the drop still reaches the window listener. */
  .drop-overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: grid;
    place-items: center;
    padding: 24px;
    pointer-events: none;
    background: rgb(0 0 0 / 0.35);
    -webkit-backdrop-filter: blur(8px);
    backdrop-filter: blur(8px);
    outline: 2px dashed #f59e0b;
    outline-offset: -14px;
    animation: drop-in 180ms ease-out;
  }
  .drop-overlay p {
    max-width: 18ch;
    text-align: center;
    font-size: clamp(1.6rem, 6vw, 2.6rem);
    font-weight: 700;
    line-height: 1.15;
    letter-spacing: -0.02em;
    color: #fff;
  }
  .drop-overlay em {
    font-style: normal;
    color: #f59e0b;
  }
  @keyframes drop-in {
    from {
      opacity: 0;
    }
  }

  /* ── Top bar: name · Edit|Frame · actions ─────────────────────────────── */
  .bar {
    grid-area: bar;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 12px;
    min-height: 56px;
    padding: 6px 12px 6px 18px;
    border-bottom: 1px solid var(--line);
  }
  .app.empty .bar {
    background: transparent;
    border-bottom-color: transparent;
  }
  .bar-side {
    display: flex;
    align-items: center;
    gap: 2px;
    min-width: 0;
  }
  .bar-side.end {
    justify-content: flex-end;
  }
  /* Phones: the current photo as a button that opens the Photos tray (desktop has the strip instead). */
  .photos-btn {
    display: none;
    position: relative;
    width: 38px;
    height: 38px;
    border-radius: 10px;
    border: 1.5px solid var(--line);
  }
  .photos-btn img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 8px;
    display: block;
  }
  .photos-btn.on {
    border-color: var(--accent);
  }
  .photos-btn .count {
    position: absolute;
    right: -6px;
    bottom: -6px;
    min-width: 18px;
    height: 18px;
    padding: 0 4px;
    border-radius: 9px;
    background: var(--accent);
    color: #1a1204;
    font-size: 0.68rem;
    font-weight: 750;
    line-height: 18px;
    text-align: center;
  }
  .wordmark {
    display: flex;
    align-items: center;
    gap: 9px;
    font-stretch: 112%;
    font-weight: 750;
    font-size: 1.02rem;
    letter-spacing: -0.02em;
    white-space: nowrap;
  }
  .mark {
    width: 24px;
    height: 24px;
    display: block;
  }
  .bar .modes {
    justify-self: center;
  }
  .modes button {
    min-width: 76px;
    padding: 7px 16px;
    font-size: 0.9rem;
    font-weight: 650;
  }
  /* The main switch: the chosen mode is solid ink, so it reads at a glance on any screen. */
  .modes button[aria-pressed="true"] {
    background: var(--text);
    color: var(--bg);
    box-shadow: none;
  }
  .bar-export {
    margin-left: 8px;
    padding: 9px 16px;
  }
  /* File name and size, as a caption under the photo. */
  .meta {
    position: absolute;
    left: 16px;
    bottom: 18px;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: calc(50% - 110px);
    font-size: 0.8rem;
    color: var(--muted);
  }
  .meta-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .meta-dim {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .pill {
    padding: 1px 7px;
    border-radius: 999px;
    border: 1px solid var(--line);
    font-size: 0.68rem;
    font-weight: 650;
    letter-spacing: 0.04em;
    color: var(--accent-ink);
  }

  /* ── Stage ─────────────────────────────────────────────────────────────── */
  .stage {
    grid-area: stage;
    min-height: 0;
  }
  .fit {
    position: absolute;
    inset: 8px 8px 56px; /* bottom strip is kept free for the "Hold for original" button */
    align-items: center;
    justify-content: center;
    container-type: size;
  }
  .print.positioning {
    cursor: grab;
  }
  .print.positioning:active {
    cursor: grabbing;
  }
  .print {
    position: relative;
    /* press-and-hold to compare: no text selection, callout menu or page panning while held */
    -webkit-user-select: none;
    user-select: none;
    -webkit-touch-callout: none;
    touch-action: none;
    width: min(100cqw, 100cqh * var(--ar));
    aspect-ratio: var(--ar);
    border-radius: 3px;
    overflow: hidden;
    box-shadow:
      0 35px 120px -20px rgb(0 0 0 / 0.9),
      0 10px 40px -15px rgb(0 0 0 / 0.7);
  }
  @media (prefers-color-scheme: light) {
    /* the same lift, softened so it doesn't look like a smudge on the light background */
    .print {
      box-shadow:
        0 35px 120px -20px rgb(0 0 0 / 0.45),
        0 10px 40px -15px rgb(0 0 0 / 0.35);
    }
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
    background: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")
      0 0 / 160px 160px;
  }
  .develop {
    background: #fff;
    animation: develop 650ms cubic-bezier(0.2, 0.7, 0.2, 1) forwards;
  }
  @keyframes develop {
    from {
      opacity: 0.85;
    }
    to {
      opacity: 0;
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

  /* ── Strip ─────────────────────────────────────────────────────────────── */
  .strip {
    grid-area: strip;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 6px 14px;
    min-width: 0;
    border-top: 1px solid var(--line);
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

  /* ── Tool rail ───────────────────────────────────────────────────────── */
  .rail {
    grid-area: rail;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px 8px;
    overflow-y: auto;
    scrollbar-width: none;
    border-left: 1px solid var(--line);
  }
  .tab {
    position: relative;
    flex: none;
    display: grid;
    justify-items: center;
    gap: 5px;
    padding: 10px 4px 9px;
    border-radius: 12px;
    font-size: 0.7rem;
    font-weight: 550;
    color: var(--muted);
    transition:
      background 150ms,
      color 150ms;
  }
  .tab :global(svg) {
    width: 22px;
    height: 22px;
  }
  .tab:hover {
    color: var(--text);
    background: var(--field);
  }
  .tab[aria-pressed="true"] {
    color: var(--text);
    background: var(--field);
  }
  /* the selected tool: an amber mark on the edge facing its settings */
  .tab[aria-pressed="true"]::before {
    content: "";
    position: absolute;
    left: -8px;
    top: 12px;
    bottom: 12px;
    width: 3px;
    border-radius: 0 3px 3px 0;
    background: var(--accent);
  }
  .tab[aria-pressed="true"] :global(svg) {
    color: var(--accent-ink);
  }

  /* ── Settings panel (the selected tool's controls) ─────────────────────── */
  .panel {
    grid-area: panel;
    display: flex;
    flex-direction: column;
    min-height: 0;
    border-left: 1px solid var(--line);
    /* clip, not hidden: a hidden container can still be scrolled by focus (e.g. the visually hidden
       .cube file input), which pushed the panel's head out of view with no way to scroll back. */
    overflow: clip;
  }
  .panel-head {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 18px 18px 4px;
  }
  .panel-head h2 {
    font-size: 1.05rem;
    font-weight: 700;
    letter-spacing: -0.01em;
  }
  .tool-hint {
    margin-top: 3px;
    font-size: 0.8rem;
    line-height: 1.4;
    color: var(--muted);
  }
  .done {
    display: none;
    margin-left: auto;
    padding: 7px 18px;
    font-size: 0.88rem;
  }
  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 14px 18px 22px;
    display: flex;
    flex-direction: column;
    gap: 18px;
    scrollbar-width: thin;
  }
  /* Each tool's controls slide in when they appear (tool switch, mode switch, tray opening). */
  .body > :global(*) {
    animation: tool-in 260ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  @keyframes tool-in {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
  }
  /* Before/after: press and hold, under the photo so it's easy to find on every screen. */
  .hold {
    position: absolute;
    left: 50%;
    bottom: 12px;
    translate: -50% 0;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 14px 7px 11px;
    border-radius: 999px;
    background: var(--field);
    border: 1px solid var(--line);
    color: var(--text);
    font-size: 0.82rem;
    font-weight: 600;
    -webkit-user-select: none;
    user-select: none;
    touch-action: none;
    -webkit-touch-callout: none;
  }
  .hold :global(svg) {
    width: 16px;
    height: 16px;
  }
  .hold.on {
    background: var(--accent);
    border-color: var(--accent);
    color: #1a1204;
  }

  /* ── Bar buttons ───────────────────────────────────────────────────────── */
  .icon-btn {
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: var(--text);
    transition: background 150ms;
  }
  .icon-btn :global(svg) {
    width: 20px;
    height: 20px;
  }
  .icon-btn:hover:not(:disabled) {
    background: var(--field);
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
  .third.v1,
  .third.v2 {
    top: 0;
    bottom: 0;
    width: 1px;
  }
  .third.h1,
  .third.h2 {
    left: 0;
    right: 0;
    height: 1px;
  }
  .third.v1 {
    left: 33.333%;
  }
  .third.v2 {
    left: 66.666%;
  }
  .third.h1 {
    top: 33.333%;
  }
  .third.h2 {
    top: 66.666%;
  }
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
  .handle.nw {
    left: 0;
    top: 0;
    cursor: nwse-resize;
  }
  .handle.ne {
    right: 0;
    top: 0;
    cursor: nesw-resize;
  }
  .handle.sw {
    left: 0;
    bottom: 0;
    cursor: nesw-resize;
  }
  .handle.se {
    right: 0;
    bottom: 0;
    cursor: nwse-resize;
  }

  /* ── Compact: phones and portrait tablets (keep in step with COMPACT in the script) ──
     Same order as desktop, stacked: bar · photo · (photos) · settings tray · tool row. */
  @media (max-width: 899px) and (min-height: 501px) {
    .app {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto minmax(0, 1fr) auto auto auto;
      grid-template-areas: "bar" "stage" "strip" "panel" "rail";
    }
    .bar {
      min-height: 52px;
      gap: 6px;
      padding: 6px 8px;
    }
    .app:not(.empty) .wordmark,
    .meta,
    .add-btn,
    .strip,
    .tool-hint,
    .body > :global(.histo) {
      display: none;
    }
    .app:not(.empty) .bar {
      grid-template-columns: auto 1fr auto;
    }
    .photos-btn {
      display: block;
    }
    .modes button {
      min-width: 0;
      padding: 6px 14px;
      font-size: 0.88rem;
    }
    .icon-btn {
      width: 38px;
      height: 38px;
    }
    .bar-export {
      margin-left: 4px;
      padding: 8px 14px;
      font-size: 0.9rem;
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

    /* Tool row along the bottom, settings tray right above it while a tool is open. */
    .rail {
      flex-direction: row;
      overflow-x: auto;
      overflow-y: hidden;
      padding: 6px 8px;
      border-left: 0;
      border-top: 1px solid var(--line);
    }
    .tab {
      flex: 1 0 60px;
      gap: 3px;
      padding: 7px 4px 6px;
      font-size: 0.72rem;
    }
    .tab[aria-pressed="true"]::before {
      left: 14px;
      right: 14px;
      top: -6px;
      bottom: auto;
      width: auto;
      height: 3px;
      border-radius: 0 0 3px 3px;
    }
    .panel {
      border-left: 0;
      border-top: 1px solid var(--line);
    }
    .panel:not(.open) {
      display: none;
    }
    /* Slides up from behind the tool row with a little spring; back down when closing.
       transform/opacity only, so it stays smooth on phones. */
    .panel.open {
      animation: tray-up 380ms cubic-bezier(0.34, 1.3, 0.64, 1);
    }
    /* While closing, the tray leaves the layout so the photo can grow at the same time as the tray slides
       down. An absolute grid item is placed in its own (now zero-height) grid row, which sits right on
       top of the tool row, so bottom: 0 keeps it exactly where it was. */
    .panel.closing {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      animation: tray-down 200ms cubic-bezier(0.4, 0, 1, 1) forwards;
    }
    .rail {
      z-index: 2; /* the tray slides out from behind it */
    }
    .panel-head {
      align-items: center;
      padding: 8px 10px 0 16px;
    }
    .panel-head h2 {
      font-size: 0.95rem;
    }
    .done {
      display: block;
    }
    .body {
      max-height: 34dvh; /* about a third of the screen at most; the photo keeps the rest */
      padding: 10px 14px 12px;
      gap: 12px;
    }
    /* Rows inside a scrolling tray must keep their size (flex would squash sideways-scrolling rows). */
    .body > :global(*) {
      flex-shrink: 0;
      min-width: 0;
    }
    .hold {
      bottom: 10px;
    }
  }
  @keyframes tray-up {
    from {
      opacity: 0;
      transform: translateY(48px);
    }
  }
  @keyframes tray-down {
    to {
      opacity: 0;
      transform: translateY(48px);
    }
  }
  /* Landscape phones: desktop's left-to-right layout (a bottom tray would squash the photo), slimmer. */
  @media (max-height: 500px) {
    .app:not(.empty) {
      grid-template-columns: minmax(0, 1fr) 280px 72px;
    }
    .bar {
      min-height: 44px;
      padding: 3px 8px;
    }
    .app:not(.empty) .wm-text,
    .meta,
    .strip.single,
    .strip-note,
    .tool-hint {
      display: none;
    }
    .icon-btn {
      width: 36px;
      height: 36px;
    }
    .tab {
      padding: 7px 2px;
      font-size: 0.66rem;
    }
    .fit {
      inset: 6px 6px 48px;
    }
    .hold {
      bottom: 8px;
    }
  }
</style>
