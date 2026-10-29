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
  import { onMount, tick, untrack } from "svelte";

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
  import { filmLayout, drawFilm, drawContactSheet } from "./lib/film.js";
  import { postSlides, composeLayout } from "./lib/dump.js";
  import { formatPlace, placeName } from "./lib/locationHelper.js";
  import { encodeStyle, decodeStyle, findStyleCode } from "./lib/styleCode.js";
  import { reorder } from "./lib/reorder.js";
  import { fitWidth } from "./lib/fitWidth.js";
  import PostOptions from "./components/PostOptions.svelte";
  import {
    CROP_DEFAULT,
    applyGeometry,
    isIdentity,
    normalizedAspect,
    fitRect,
    dragRect,
    turnedSize,
  } from "./lib/geometry.js";
  import { idbGet, idbSet, idbDel, idbKeys } from "./lib/store.js";
  import { withExif } from "./lib/exifWriter.js";
  import { recipeFromPhoto } from "./lib/fujiRecipe.js";
  import { openRecipe } from "./components/tools/LooksTool.svelte";
  import { t, i18n } from "./lib/i18n.svelte.js";
  import { Capacitor, registerPlugin } from "@capacitor/core";
  import { Share } from "@capacitor/share";
  import { Filesystem, Directory } from "@capacitor/filesystem";
  import { zoomAt, clampPan, NO_ZOOM, MAX_ZOOM } from "./lib/zoom.js";
  import {
    getContrastingColor,
    applyExifOrientation,
    createProxyPreview,
    decodeUpright,
    decodeProxy,
    photoPalette,
    createThumbnail,
    fmtExposure,
    cleanName,
    sliceCanvas,
    paintSamplePhoto,
  } from "./lib/imageUtils.js";
  import { isHeif, heifSource } from "./lib/heifDecoder.js";
  import { parseLibrary, sanitizeDev } from "./lib/library.js";
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
  import LanguagePicker from "./components/LanguagePicker.svelte";
  import SavedPhotos from "./components/SavedPhotos.svelte";
  import { useColor } from "./lib/colorMemory.svelte.js";
  import ThemePicker from "./components/ThemePicker.svelte";
  import { logoLib, addLogo, useLogo, deleteLogo } from "./lib/logoLibrary.svelte.js";
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

  let activeTool = $state({ editor: "looks", framing: "templates" }); // framing starts at the frames themselves
  // Compact layout (phones, portrait tablets): the photo fills the screen, the tool row sits at the bottom and a
  // tool opens in a small tray above it, closed with Done. Same query as the compact CSS block below.
  const COMPACT = "(max-width: 899px) and (min-height: 501px)";
  const compactQuery = matchMedia(COMPACT);
  let compact = $state(compactQuery.matches);
  compactQuery.addEventListener("change", (e) => (compact = e.matches));
  let trayOpen = $state(false); // compact only; the desktop panel is always open
  // The tray's height is what animates (opening, closing, switching tools, a finger pulling it down), so the
  // photo area, which is the rest of the screen, grows and shrinks with it frame by frame.
  // Closing lands when its animation ends; any tap in between cancels the close, so taps always win and in order.
  let trayClosing = $state(false);
  let trayAnim = null;
  // While anything moves (tray, frame morph, crop zoom, pinch), the photo and the tray get their own GPU
  // layers and the costly effects (big soft shadow, grain, bloom) step aside, so they aren't repainted
  // on every frame. About 3x less painting; it's what keeps big tablet screens smooth.
  let moving = $state(false);
  let movingTimer;
  function moveFor(ms) {
    moving = true;
    clearTimeout(movingTimer);
    movingTimer = setTimeout(() => (moving = false), ms);
  }
  const still = () => !compact || matchMedia("(prefers-reduced-motion: reduce)").matches;
  const trayHeight = () => panelEl?.getBoundingClientRect().height ?? 0; // mid-animation too
  function sizeTray(from, to, done) {
    trayAnim?.cancel();
    trayAnim = null;
    if (Math.abs(from - to) < 1) return done?.();
    moveFor(380);
    trayAnim = panelEl.animate([{ height: `${from}px` }, { height: `${to}px` }], {
      duration: 320,
      easing: "cubic-bezier(0.4, 0, 0.2, 1)", // eases in and out, so the photo never jumps on the first frame
    });
    trayAnim.onfinish = () => {
      trayAnim = null;
      done?.();
    };
  }
  // Also call it after changing what an open tray shows: it eases to the new content's height.
  async function openTray() {
    const from = trayOpen ? trayHeight() : 0;
    trayAnim?.cancel();
    trayClosing = false;
    trayOpen = true;
    await tick();
    if (!still() && panelEl) sizeTray(from, trayHeight());
  }
  function closeTray() {
    if (!trayOpen || trayClosing) return;
    const done = () => {
      trayOpen = false;
      trayClosing = false;
      trayPull = 0;
    };
    if (still() || !panelEl) return done();
    trayClosing = true;
    sizeTray(trayHeight(), 0, done);
  }
  let trayView = $state("tool"); // phones: the tray shows the tool's settings, or "photos"

  // Phones: pull the tray down to close it, by its head, or by its content when that is scrolled to the top
  // (the same swipe that would scroll further up). Touch events, so we can stop the page from scrolling.
  let panelEl = $state.raw(null);
  let trayPull = $state(0); // px the finger has pulled the tray down
  let pullFrom = $state(0); // the tray's height when the pull started
  $effect(() => {
    if (!compact || !panelEl) return;
    const el = panelEl;
    let g = null;
    // A finger that starts on something it drags (a curve point, a slider; marked data-drag) is working
    // that control: pulling a curve point down must not close the tray.
    const ownsDrag = (target) => target.closest?.('[data-drag], input[type="range"]');
    const down = (e) => {
      const body = el.querySelector(".body");
      const t = e.touches[0];
      g = e.touches.length === 1 && !ownsDrag(e.target) && (!body?.contains(e.target) || body.scrollTop <= 0) ? { x: t.clientX, y: t.clientY, on: false } : null;
    };
    const move = (e) => {
      if (!g) return;
      const t = e.touches[0];
      const dx = t.clientX - g.x;
      const dy = t.clientY - g.y;
      if (!g.on) {
        if (dy > 10 && dy > 1.5 * Math.abs(dx)) {
          g.on = true;
          trayAnim?.cancel();
          pullFrom = trayHeight();
        }
        else if (Math.abs(dx) > 10 || dy < -10) g = null; // a sideways row, a slider or a scroll down: not ours
        return;
      }
      e.preventDefault();
      moveFor(300);
      trayPull = Math.max(0, dy - 10);
    };
    const up = () => {
      if (g?.on) {
        if (trayPull > Math.min(60, pullFrom / 3)) closeTray(); // carries on down from where the finger let go
        else {
          sizeTray(trayHeight(), pullFrom); // not far enough: springs back
          trayPull = 0;
        }
      }
      g = null;
    };
    el.addEventListener("touchstart", down, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", up);
    el.addEventListener("touchcancel", up);
    return () => {
      el.removeEventListener("touchstart", down);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", up);
      el.removeEventListener("touchcancel", up);
    };
  });

  // Back (Android gesture or button, browser back) closes the open tray or dialog instead of leaving the
  // app: each one adds a history entry while open. Closing it any other way takes that entry back out.
  const backStack = [];
  let ignorePops = 0;
  let popped = Promise.resolve(); // history.back() lands later: a new entry waits for it, or back would remove that one
  let landPop = () => {};
  function closeOnBack(close) {
    const entry = { close };
    backStack.push(entry);
    // after this update's other effects: one opening as another closes (tray → Saved photos) must not push
    // before that one's history.back() is under way, or the back would take this entry instead
    queueMicrotask(() => popped.then(() => backStack.includes(entry) && history.pushState({ mfOverlay: true }, "")));
    return () => {
      const i = backStack.indexOf(entry);
      if (i < 0) return; // back already closed it
      backStack.splice(i, 1);
      ignorePops++;
      popped = new Promise((r) => (landPop = r));
      history.back();
    };
  }
  function onPopState() {
    if (ignorePops > 0) {
      if (--ignorePops === 0) landPop();
      return;
    }
    const entry = backStack.pop();
    if (entry && entry.close() === false) {
      backStack.push(entry); // can't close right now (e.g. a batch export is running): stay
      history.pushState({ mfOverlay: true }, "");
    }
  }
  $effect(() => {
    if (compact && trayOpen && !trayClosing) return closeOnBack(closeTray);
  });
  function pickTool(id) {
    if (trayOpen && !trayClosing && trayView === "tool" && activeTool[activeTab] === id) return closeTray(); // tapping the open tool again
    activeTool[activeTab] = id;
    trayView = "tool";
    openTray();
  }
  function togglePhotos() {
    if (trayOpen && !trayClosing && trayView === "photos") return closeTray();
    trayView = "photos";
    openTray();
  }
  function setMode(tab) {
    activeTab = tab;
    closeTray();
  }

  let printEl = $state.raw(null);
  // Revert: the photo back to how it came out of the camera, in one tap (undo brings the edits back).
  const edited = $derived(
    !!activeItem && (!isIdentity(activeItem.crop) || JSON.stringify($state.snapshot(dev)) !== JSON.stringify(freshDev())),
  );
  function revertPhoto() {
    Object.assign(dev, freshDev());
    activeItem.crop = null;
    scheduleRender(true);
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
  // What went wrong, in words people understand, instead of the browser's own message.
  function why(err) {
    const msg = `${err?.name ?? ""} ${err?.message ?? err ?? ""}`;
    if (/decod|EncodingError/i.test(msg)) return t("The photo couldn't be read. Open it again and try once more.");
    if (/memory|allocat|too large|exceed|RangeError/i.test(msg)) return t("This photo is too big for this device at this size. Choose a smaller size under Export.");
    if (/network|fetch|offline/i.test(msg)) return t("No internet connection. Try again when you're online.");
    return err?.message || String(err);
  }
  let isDragging = $state(false);
  // The size photos are worked on while editing: as sharp as this screen shows them (a phone shows a photo
  // ~1500 px tall), at least 1080. Capped at 1600 because every open photo keeps one: 20 photos at full
  // phone resolution would run a phone out of memory. Export always uses the full-size original.
  const PREVIEW = Math.round(Math.min(1600, Math.max(1080, Math.max(innerWidth, innerHeight * 0.75) * (devicePixelRatio || 1))));

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

  // Zoom: pinch with two fingers, or double-tap (double-click) to zoom in and back. While zoomed, one
  // finger pans instead of switching photos. Off while cropping or positioning a carousel.
  let zoom = $state(NO_ZOOM);
  const pointers = new Map(); // fingers on the photo: pointerId → { x, y }
  let pinch = null; // two-finger gesture: where it started
  let pan = null; // one finger dragging the zoomed photo
  let lastTap = null; // for double-tap
  // The photo's unzoomed centre and size, from its zoomed on-screen box (the zoom is around its centre).
  function photoBox() {
    const r = printEl.getBoundingClientRect();
    return { cx: r.left + r.width / 2 - zoom.x, cy: r.top + r.height / 2 - zoom.y, w: r.width / zoom.s, h: r.height / zoom.s };
  }
  const rel = (b, x, y) => ({ x: x - b.cx, y: y - b.cy });
  const setZoom = (z, b) => (zoom = z.s < 1.02 ? NO_ZOOM : clampPan(z, b.w, b.h));
  $effect(() => {
    // a new photo, cropping or carousel positioning starts back at fit
    activeItem?.id, cropping, positioning;
    zoom = NO_ZOOM;
    pointers.clear();
    pinch = pan = null;
  });
  function startPinch() {
    clearTimeout(holdTimer);
    showOriginal = false;
    swipe = pan = lastTap = null;
    const [a, b] = [...pointers.values()];
    const box = photoBox();
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: zoom, mid: rel(box, (a.x + b.x) / 2, (a.y + b.y) / 2), box };
  }

  function holdPhoto(e) {
    if (cropping || e.button > 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId); // keep getting the gesture if the finger leaves the photo
    if (positioning) return startFillDrag(e);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) return startPinch();
    if (pointers.size > 2) return;
    const now = performance.now();
    if (lastTap && now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 40) {
      lastTap = null;
      const box = photoBox();
      setZoom(zoom.s > 1 ? NO_ZOOM : zoomAt(NO_ZOOM, 2.5, rel(box, e.clientX, e.clientY)), box);
      return;
    }
    if (zoom.s > 1) pan = { x: e.clientX, y: e.clientY, z: zoom, box: photoBox() };
    swipe = { x: e.clientX, y: e.clientY, t: now };
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => (showOriginal = true), 120);
  }
  function movePhoto(e) {
    if (fillDrag) return dragFill(e);
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch) {
      if (pointers.size < 2) return;
      const [a, b] = [...pointers.values()];
      const m = rel(pinch.box, (a.x + b.x) / 2, (a.y + b.y) / 2);
      const z = zoomAt(pinch.z, (pinch.z.s * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.d, pinch.mid);
      moveFor(250);
      return setZoom({ s: z.s, x: z.x + m.x - pinch.mid.x, y: z.y + m.y - pinch.mid.y }, pinch.box); // zoom and follow the fingers
    }
    if (swipe && Math.hypot(e.clientX - swipe.x, e.clientY - swipe.y) > 12) {
      clearTimeout(holdTimer);
      showOriginal = false;
      if (pan) {
        moveFor(250);
        setZoom({ s: pan.z.s, x: pan.z.x + e.clientX - pan.x, y: pan.z.y + e.clientY - pan.y }, pan.box);
      }
    }
  }
  function releasePhoto(e) {
    fillDrag = null;
    clearTimeout(holdTimer);
    showOriginal = false;
    pointers.delete(e?.pointerId);
    if (pinch) {
      if (pointers.size < 2) pinch = null; // the finger left behind doesn't start a pan or swipe
      swipe = pan = null;
      return;
    }
    if (swipe && e?.type === "pointerup") {
      const dx = e.clientX - swipe.x;
      const dy = e.clientY - swipe.y;
      const ms = performance.now() - swipe.t;
      lastTap = ms < 250 && Math.hypot(dx, dy) < 10 ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
      if (!pan && ms < 700 && Math.abs(dx) > 50 && Math.abs(dx) > 1.5 * Math.abs(dy)) {
        stepSlide(dx < 0 ? 1 : -1);
      }
    }
    swipe = pan = null;
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
  // Lightroom-style: half a second after the crop settles (a corner let go, a ratio or rotation picked),
  // the view eases in until the crop fills the photo area. Dragging keeps working in that zoomed view.
  let settling = $state(false);
  let settleTimer;
  function fitCropSoon() {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(fitCrop, 500);
  }
  function fitCrop() {
    if (!cropping || cropDrag || !printEl || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const area = printEl.parentElement.getBoundingClientRect();
    const b = photoBox();
    const c = crop;
    const sc = Math.min(MAX_ZOOM, area.width / (c.w * b.w), area.height / (c.h * b.h));
    if (sc <= 1.02) return void (zoom = NO_ZOOM);
    // the crop's centre (relative to the photo's centre) lands on the area's centre
    const qx = (c.x + c.w / 2 - 0.5) * b.w;
    const qy = (c.y + c.h / 2 - 0.5) * b.h;
    settling = true;
    moveFor(500);
    zoom = { s: sc, x: area.left + area.width / 2 - b.cx - sc * qx, y: area.top + area.height / 2 - b.cy - sc * qy };
    setTimeout(() => (settling = false), 460);
  }
  $effect(() => {
    if (!cropping) return;
    crop.x, crop.y, crop.w, crop.h, turned;
    fitCropSoon();
  });
  function endCropDrag() {
    if (!cropDrag) return;
    cropDrag = null;
    fitCropSoon();
  }
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
    filmStyle: null, // a real film border (film.js): "35mm" | "instant" | "darkroom" | "slide"
    filmName: "SAFETY FILM 400", // 35 mm: printed along the edge
    filmFrame: 12, // frame number of the first photo; the next photos count up
    filmInk: "#f2a23c", // 35 mm edge print colour
    filmCard: "#f7f6f1", // instant card / slide mount
    filmNeighbours: true, // 35 mm: the edges of your other photos at the strip's ends
    filmDate: false, // the orange date stamp of a compact camera
    exifDisplay: {
      location: false, // off until chosen: showing it may look the place up online (see ensureLocation)
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

  const FRAME_DEFAULTS = $state.snapshot(frame); // what a style code leaves out (styleCode.js)
  const ratio = $derived(frameRatio(frame));
  const slices = $derived(ratio?.slices ?? 1);

  // ─── Photo dump (dump.js) ──────────────────────────────────────────────────
  // The ticked photos posted as one carousel, in the strip's order: one per slide, in pairs or in a grid,
  // optionally after a cover (all of them on a contact sheet). The frame goes around every slide.
  const post = $state({ layout: "single", cover: false, title: "" }); // layout: "single" | "pairs" | "grid"
  const postItems = $derived(filesList.filter((f) => f.selected));
  const dumping = $derived(postItems.length > 1 && (post.layout !== "single" || post.cover));
  const slideList = $derived(dumping ? postSlides(postItems, post.layout, post.cover) : []);
  let coverShown = $state(false); // the cover is on screen (it has no photo of its own to be "active")
  // The slide on screen: the cover, the slide holding the active photo, or that photo alone (not in the post).
  const currentSlide = $derived(
    coverShown && slideList[0]?.cover
      ? slideList[0]
      : (slideList.find((s) => !s.cover && s.items.includes(activeItem)) ?? { cover: false, items: activeItem ? [activeItem] : [] }),
  );
  function showCover() {
    coverShown = true;
    scheduleRender();
  }
  // Moves a photo in the strip (drag to reorder); the active photo stays active.
  function reorderPhoto(from, to) {
    if (from === to) return;
    const active = activeItem;
    const [item] = filesList.splice(from, 1);
    filesList.splice(to, 0, item);
    activeImageIndex = Math.max(0, filesList.indexOf(active));
    scheduleRender();
  }
  // The cover's title: what you typed, else the month the first dated photo was taken.
  function autoTitle(items) {
    const taken = items.find((f) => f.camera?.taken)?.camera.taken;
    return taken ? taken.toLocaleDateString(i18n.lang, { month: "long", year: "numeric" }) : "";
  }
  // In a fixed ratio one border is filled by the ratio itself, so only the other slider is shown.
  // A 35 mm strip runs off the frame along its length, so only the space beside it is set.
  // shortcut: a sideways strip on a taller shape (4:5) gets its top and bottom from the shape, so that slider does
  // nothing there; hide it too if anyone notices.
  const autoAxis = $derived(slices > 1 ? "v" :
    processedImage && frame.filmStyle === "35mm" && ratio?.w
      ? processedImage.width >= processedImage.height ? "h" : "v"
      : processedImage
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
  $effect(() => {
    if (frame.filmStyle || frame.filmDate)
      Promise.all(['700 40px "Space Mono"', 'condensed 700 40px "Archivo Variable"'].map((f) => document.fonts.load(f))).then(() => scheduleRender());
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

  // The logo in use comes from your saved logos (logoLibrary), so it's back after a reload.
  $effect(() => {
    const entry = logoLib.list.find((l) => l.id === logoLib.current);
    if (!entry) {
      logoImage = null;
      logoName = "";
      return;
    }
    let live = true;
    const img = new Image();
    img.onload = () => {
      if (!live) return;
      logoImage = img;
      logoName = entry.name;
      scheduleRender(false);
    };
    img.onerror = () => {
      if (!live) return;
      deleteLogo(entry.id); // not an image after all: don't keep it
      loadError = t("{name} is not an image this browser can read.", { name: entry.name });
    };
    img.src = entry.url;
    return () => (live = false);
  });

  function onLogoInput(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) addLogo(file);
  }

  const removeLogo = () => useLogo(null); // off the photo; it stays in your logos

  // ─── Templates (saved on this device) ──────────────────────────────────────
  const PRESETS_STORAGE_KEY = "mf_layout_presets_v1";
  let userPresets = $state([]);
  let showSavePresetModal = $state(false);
  $effect(() => {
    if (showSavePresetModal) return closeOnBack(() => (showSavePresetModal = false));
  });
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
    const name = `MinimalFrame_library_${new Date().toISOString().slice(0, 10)}.json`;
    if (isApp) shareInApp([{ name, blob }]).catch((err) => (libraryMessage = err.message));
    else triggerDownload(blob, name);
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
      libraryMessage = t("Added {templates} templates and {looks} looks.", { templates: templates.length, looks: looks.length });
    } catch (err) {
      libraryMessage = t("That file couldn't be imported: {error}.", { error: err.message });
    }
  }

  // ─── Style codes (styleCode.js): this frame and look as text, to send to anyone ─────────────────
  async function shareStyle() {
    const code = await encodeStyle(frameSnapshot(), $state.snapshot(dev), FRAME_DEFAULTS, freshDev());
    const text = `${t("My MinimalFrame style:")} ${code}`;
    try {
      if (isApp) await Share.share({ text, dialogTitle: t("Share to…") });
      else if (navigator.share && matchMedia("(pointer: coarse)").matches) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        libraryMessage = t("Style code copied. Send it to anyone: they paste it here.");
      }
    } catch (err) {
      if (!/cancel|abort/i.test(`${err?.name} ${err?.message}`)) libraryMessage = code; // no clipboard: copy it by hand
    }
  }
  async function applyStyleCode(text) {
    const style = await decodeStyle(text, FRAME_DEFAULTS);
    if (!style) {
      libraryMessage = t("That isn't a MinimalFrame style code.");
      return false;
    }
    applyPreset({ ...style.frame, dev: style.dev });
    libraryMessage = t("Style applied.");
    return true;
  }
  // A code shared into the app (WhatsApp → Share → MinimalFrame): apply it and show where it landed.
  async function openStyleCode(text) {
    if (!(await applyStyleCode(text))) return;
    activeTab = "framing";
    activeTool.framing = "templates";
    if (compact) openTray();
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
    morph();
    for (const k of Object.keys(frame))
      if (k !== "exifDisplay" && p[k] !== undefined) frame[k] = p[k];
    frame.captionSpace = p.captionSpace ?? 12; // older templates have none
    frame.filmStyle = p.filmStyle ?? null; // every other template is a plain frame
    frame.captionStyle = ["bar", "spread"].includes(p.captionStyle) ? p.captionStyle : "stack";
    // Templates from before the flexible carousel had fixed 2- and 3-slide ratios.
    const oldCarousel = /^carousel(\d)$/.exec(p.selectedRatioId ?? "");
    if (oldCarousel) Object.assign(frame, { selectedRatioId: "carousel", slides: Number(oldCarousel[1]), slideShape: "4:5" });
    if (p.exifDisplay)
      frame.exifDisplay = { ...frame.exifDisplay, ...p.exifDisplay };
  }

  // Frame changes (template, ratio, slides, caption style, Edit ⇄ Frame, undo) morph like a window: the new
  // picture appears at its final size and stays still, the box's edges ease to the new shape around it, and
  // the old picture (at its old size) fades out. Nothing scales, so the photo itself barely moves.
  let ghostEl = $state.raw(null);
  let morphing = $state(false);
  let morphTimer;
  function morph() {
    if (!processedImage || !canvasEl?.width || !ghostEl || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    ghostEl.width = canvasEl.width;
    ghostEl.height = canvasEl.height;
    ghostEl.getContext("2d").drawImage(canvasEl, 0, 0);
    ghostEl.style.setProperty("--pa", canvasEl.width / canvasEl.height);
    ghostEl.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 240, easing: "ease-out" });
    morphing = true;
    moveFor(420);
    clearTimeout(morphTimer);
    morphTimer = setTimeout(() => (morphing = false), 340);
  }
  $effect.pre(() => {
    // runs before the new frame is drawn, so the ghost still holds the old one
    frame.selectedRatioId, frame.slides, frame.slideShape, frame.captionStyle, activeTab;
    untrack(morph);
  });

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
    const shared = new URLSearchParams(location.search).has("shared");
    restoreSession().then(() => {
      if (shared) loadSharedFiles();
      if (isApp) openIncoming();
    });
    if (new URLSearchParams(location.search).has("fps")) import("./lib/fpsMeter.js").then((m) => m.startFpsMeter()); // testing on real devices
    loadPresets();
    // Canvas text can't swap fonts by itself; redraw once the bundled caption font is ready.
    document.fonts?.ready.then(() => scheduleRender());
  });

  // Android app: photos shared to MinimalFrame or opened with it (IncomingPlugin.java) open like dropped files,
  // at launch and while the app is running.
  async function openIncoming() {
    const Incoming = registerPlugin("Incoming");
    const open = async ({ files, text }) => {
      if (text) findStyleCode(text) ? openStyleCode(text) : showRecipe(text);
      if (!files?.length) return;
      try {
        const list = await Promise.all(
          files.map(async (f) => new File([await (await fetch(Capacitor.convertFileSrc(f.path))).blob()], f.name, { type: f.mime || "" })),
        );
        await loadFiles(list);
      } catch (err) {
        loadError = t("Could not open the shared photos: {error}", { error: err.message });
      }
    };
    Incoming.addListener("files", open);
    open(await Incoming.take());
  }

  // A recipe shared to MinimalFrame as text: the Fujifilm recipe dialog opens with it, ready to apply.
  function showRecipe(text) {
    openRecipe(text);
    activeTab = "editor";
    activeTool.editor = "looks";
    if (compact) openTray();
    if (!activeItem) loadError = t("Open a photo, then apply the recipe from Looks.");
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
        files.push(
          new File([await res.blob()], name, {
            type: res.headers.get("content-type") || "",
          }),
        );
        await cache.delete(req);
      }
      if (files.length) loadFiles(files);
    } catch (err) {
      loadError = t("Could not open the shared photos: {error}", { error: err.message });
    }
  }

  // ─── Preview canvas and export settings ────────────────────────────────────
  let canvasEl = $state.raw(null);
  let framedSize = $state({ w: 0, h: 0 }); // full-resolution size of the framed export
  let photoSize = $state({ w: 0, h: 0 }); // full-resolution size of the photo alone
  const EXPORT_KEY = "mf_export_v1";
  // keepCamera: JPEG exports keep camera, lens, settings and date (never location). Off by default.
  let exportPrefs = $state({ size: "full", format: "jpeg", quality: "high", keepCamera: false });
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
  $effect(() => {
    if (exportOpen) return closeOnBack(() => !isBatchExporting && exportDialog?.close());
  });
  let sizeEstimate = $state("");
  $effect(() => {
    if (!exportOpen || !processedImage || !activeItem) return;
    const s = EXPORT_SIZES.find((x) => x.id === exportPrefs.size);
    const { w, h } = targetDims(s, "framed");
    const [img, item] = [processedImage, activeItem];
    exportPrefs.format, exportPrefs.quality; // the estimate follows these too (read in the timer, so named here)
    let cancelled = false;
    // drawing the sample is a whole frame's work: after the sheet's opening motion, not during it
    const timer = setTimeout(async () => {
      const sample = drawFramed(document.createElement("canvas"), img, item);
      const { blob } = await encodeCanvas(sample);
      if (cancelled) return;
      const bytes = (blob.size / (sample.width * sample.height)) * w * h;
      sizeEstimate =
        bytes > 1e6
          ? t("about {size}", { size: `${(bytes / 1e6).toFixed(1)} MB` })
          : t("about {size}", { size: `${Math.max(1, Math.round(bytes / 1e3))} KB` });
    }, 320);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
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
  // Narrow phones: when the top bar's buttons don't fit (long words like "Exportieren"), the Export button
  // keeps its icon and drops its label. Worked out from sizes, never by showing the label to try (that
  // flashed), and again whenever the bar, its left side (the photo slot slides open) or the label changes.
  let barEl = $state.raw(null);
  let barTight = $state(false);
  $effect(() => {
    if (!barEl) return;
    i18n.lang, started, activeItem, compact;
    const px = (el, prop) => parseFloat(getComputedStyle(el).getPropertyValue(prop)) || 0;
    const visible = (el) => [...(el?.children ?? [])].filter((c) => c.getClientRects().length);
    const check = () => {
      const left = barEl.querySelector(".bar-side"), modes = barEl.querySelector(".modes"), end = barEl.querySelector(".bar-side.end");
      const btn = end?.querySelector(".bar-export"), label = btn?.querySelector(".bar-export-label");
      if (!modes || !label) return (barTight = false);
      const kids = visible(end);
      const now = kids.reduce((w, c) => w + c.offsetWidth + px(c, "margin-left") + px(c, "margin-right"), 0) + px(end, "column-gap") * (kids.length - 1);
      const labelRoom = label.offsetWidth + px(btn, "column-gap") + 2 * (px(btn, "--pad-x") - px(btn, "padding-left"));
      const need = now + (barTight ? labelRoom : 0); // the right side with the label showing
      const room = end.getBoundingClientRect().right - modes.getBoundingClientRect().right - px(barEl, "column-gap");
      const leftEdge = visible(left).at(-1)?.getBoundingClientRect().right ?? 0;
      barTight = need > room - 4 || leftEdge > modes.getBoundingClientRect().left - 4;
    };
    const ro = new ResizeObserver(check);
    for (const el of [barEl, barEl.querySelector(".bar-side"), barEl.querySelector(".bar-export-label")]) if (el) ro.observe(el);
    return () => ro.disconnect();
  });

  // ─── Last session ──────────────────────────────────────────────────────────
  // Open photos come back after a reload or after Android closes the app in the background: each photo's
  // original file is stored once on the device, and a small record of every photo's edits, crop, caption
  // and selection, plus the frame and mode, is saved half a second after changes settle (and at once when
  // the app goes to the background). Nothing leaves the device.
  const SESSION_KEY = "session";
  const fileKey = (id) => `session-file:${id}`;
  let sessionChecked = $state(false); // the landing page waits for this, so it doesn't flash before a restore
  let sessionReady = $state(false); // saving starts once the last session is back
  let pendingSession = null;
  let sessionTimer;
  function restoreItem(item, p) {
    if (!p) return;
    Object.assign(item.dev, sanitizeDev(p.dev));
    item.crop = p.crop ?? null;
    if (p.fill) item.fill = p.fill;
    Object.assign(item.exifOverride, p.exif);
    item.selected = p.selected ?? true;
  }
  async function restoreSession() {
    try {
      const s = await idbGet(SESSION_KEY);
      const photos = s?.photos ?? [];
      const files = await Promise.all(photos.map((p) => idbGet(fileKey(p.key))));
      const keep = new Set(photos.map((p) => fileKey(p.key)));
      for (const k of await idbKeys()) if (String(k).startsWith("session-file:") && !keep.has(k)) idbDel(k); // left by a session that never got saved
      // photos already saved or shared, unchanged since, are finished: they stay closed
      for (const [i, p] of photos.entries()) if (p.done && files[i]) idbDel(fileKey(p.key)), (files[i] = null);
      const found = photos.filter((_, i) => files[i]);
      if (!found.length) return;
      started = true;
      sessionChecked = true;
      await loadFiles(
        found.map((p) => files[photos.indexOf(p)]).map((f, i) => (f instanceof File ? f : new File([f], found[i].name))),
        found,
      );
      if (s.frame) applyFrame(s.frame); // after loading: opening photos resets the caption position
      if (s.post) Object.assign(post, s.post);
      if (s.tab === "editor" || s.tab === "framing") activeTab = s.tab;
      activeImageIndex = Math.max(0, Math.min(s.active ?? 0, filesList.length - 1));
      scheduleRender(true);
    } catch (err) {
      console.warn("[MinimalFrame] Could not restore the last session:", err);
    } finally {
      // The landing page introduces the app once. After the first photo, a launch with nothing open goes
      // straight to the workbench: people coming back want to start, not read the introduction again.
      if (!started && seenBefore()) started = true;
      sessionChecked = true;
      sessionReady = true;
    }
  }
  const SEEN_KEY = "mf_seen_v1";
  const seenBefore = () => {
    try {
      return localStorage.getItem(SEEN_KEY) === "1";
    } catch {
      return false;
    }
  };
  // A photo saved or shared and not changed since is done: reopening the app leaves it out and asks for a
  // new photo. Each photo keeps a fingerprint of its edits and the frame at its last export; any change
  // after that (more edits, another frame) makes it unfinished work again, and it comes back as usual.
  const photoSig = (f, frameJson) => JSON.stringify([f.dev, f.crop, f.fill, f.exifOverride]) + frameJson;
  let exporting = []; // the photos the export under way is made from (marked done when it succeeds)
  function markExported() {
    if (!frame.filmStyle) useColor(frame.backgroundColor); // the border colour joins the picker's recent colours
    const frameJson = JSON.stringify(frameSnapshot());
    for (const f of exporting) f.exportedSig = photoSig(f, frameJson);
  }
  function saveSessionNow() {
    clearTimeout(sessionTimer);
    if (pendingSession) idbSet(SESSION_KEY, pendingSession);
    pendingSession = null;
  }
  $effect(() => {
    const frameJson = JSON.stringify(frameSnapshot());
    const snap = {
      v: 1,
      photos: filesList.map((f) => ({
        done: f.exportedSig === photoSig(f, frameJson),
        key: f.id,
        name: f.name,
        dev: $state.snapshot(f.dev),
        crop: $state.snapshot(f.crop),
        fill: $state.snapshot(f.fill),
        exif: $state.snapshot(f.exifOverride),
        selected: f.selected,
      })),
      frame: frameSnapshot(),
      post: $state.snapshot(post),
      active: activeImageIndex,
      tab: activeTab,
    };
    if (!sessionReady) return;
    pendingSession = snap;
    clearTimeout(sessionTimer);
    sessionTimer = setTimeout(saveSessionNow, 500);
  });
  // Android may close a backgrounded app without warning: save the moment it's hidden.
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && saveSessionNow());

  let startPreset = null; // a frame picked on the landing page, applied to the photos it opens
  let started = $state(false); // once a photo has opened, removing them all leaves an empty workbench, not the landing page
  // saved: when restoring the last session, each photo's saved state (same order as fileList).
  async function loadFiles(fileList, saved = null) {
    if (!fileList || fileList.length === 0) return;
    isLoading = true;
    loadError = "";

    const newItems = [];
    let hasRaw = false;

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      loadingStatus = t("Opening {n} of {total}: {name}", { n: i + 1, total: fileList.length, name: file.name });
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
              "GPSLatitudeRef",
              "GPSLongitude",
              "GPSLongitudeRef",
            ],
          });
          if (rawExif?.Orientation) {
            detectedOrientation = Number(rawExif.Orientation);
          }
        } catch (exifErr) {
          console.warn("[MinimalFrame] EXIF parse warning:", exifErr);
        }
        // Where it was taken, named by the photo itself (IPTC City / Country, written by Lightroom and
        // agencies). A separate small read: exifr's pick list above covers only the camera blocks.
        const iptc = await exifr.parse(arrayBuffer, { iptc: true, tiff: false, exif: false, gps: false }).catch(() => null);

        // 2. Pixel decoding: RAW vs Standard
        let rawBadge = "";
        const isRaw = isRawFile(file.name);
        // Our own copy of the bytes already read above: a photo picked from an Android gallery is only lent to
        // the app, and by export time it may no longer be readable ("The source image could not be decoded").
        let sourceBlob = new Blob([arrayBuffer], { type: file.type });
        // Browsers auto-rotate standard JPEG/HEIC; RAW embedded previews carry no orientation, so rotate those manually.
        let orientationTag = 1;

        let previewImage, fullW, fullH, thumbSource, small;
        // True RAW editing needs the GPU engine; without WebGL2, fall back to an 8-bit JPEG rendering.
        const linearRaw = isRaw && canDevelop;

        if (isRaw) {
          hasRaw = true;
          const info = getRawFormatInfo(file.name);
          rawBadge = `${info.brand} (${info.extension.toUpperCase()})`;
          loadingStatus = t("Developing RAW {n} of {total}: {name}", { n: i + 1, total: fileList.length, name: file.name });
        }

        if (linearRaw) {
          // Fast half-size decode (no demosaic) for the on-screen proxy; export re-decodes at full size.
          // LibRaw applies the camera's rotation itself.
          const half = await decodeRawLinear(file, { half: true });
          previewImage = downscaleLinear(half, PREVIEW);
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
            loadingStatus = t("Opening HEIF {n} of {total}: {name}", { n: i + 1, total: fileList.length, name: file.name });
            sourceBlob = await heifSource(file); // a JPEG unless the browser reads HEIF itself
          }

          // Decode once, keep only a screen-sized proxy. The full-res source is re-decoded from sourceBlob at export.
          const { bitmap, w, h } = await decodeProxy(sourceBlob, PREVIEW);
          previewImage = applyExifOrientation(
            createProxyPreview(bitmap, PREVIEW),
            orientationTag,
          );
          const isRotated90 = orientationTag >= 5;
          fullW = isRotated90 ? h : w;
          fullH = isRotated90 ? w : h;
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
          id: saved?.[i]?.key ?? `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          file,
          name: file.name,
          sourceBlob, // Encoded original (or decoded RAW JPEG); decoded only at export
          fullW,
          fullH,
          previewImage, // screen-sized proxy (PREVIEW): a canvas, or 16-bit linear data for RAW
          linearRaw, // export re-decodes the RAW file at full size
          thumbUrl,
          isRaw,
          rawBadge,
          orientationTag,
          palette,
          rotated: detectedOrientation > 1, // shown in the UI; the browser or LibRaw may have done the rotating
          selected: true, // included in batch export
          hadGps: rawExif?.GPSLatitude != null || rawExif?.latitude != null, // exports never contain it
          // the GPS position, for the location line (looked up only when the user shows it)
          gps: Number.isFinite(rawExif?.latitude) && Number.isFinite(rawExif?.longitude) ? { lat: rawExif.latitude, lon: rawExif.longitude } : null,
          fujiRecipe: /fujifilm/i.test(rawExif?.Make ?? "") ? await recipeFromPhoto(arrayBuffer) : null, // the camera's saved recipe
          // the camera's own values, for exports that keep camera info (see exifWriter.js)
          camera: {
            make: rawExif?.Make,
            model: rawExif?.Model,
            lens: rawExif?.LensModel,
            fNumber: rawExif?.FNumber,
            exposure: rawExif?.ExposureTime,
            iso: rawExif?.ISO,
            focal: rawExif?.FocalLength,
            taken,
          },
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
            location: formatPlace(iptc ?? {}), // "" until looked up from the GPS position or typed
          },
          placeFromPhoto: Boolean(formatPlace(iptc ?? {})), // the photo names its place: no lookup needed
        });
      } catch (err) {
        console.error(`[MinimalFrame] Failed to load ${file.name}: ${err?.name}: ${err?.message}`, err);
        loadError = t("Could not load {name}: {error}", { name: file.name, error: why(err) });
      }
    }

    if (newItems.length > 0) {
      const startIndex = filesList.length;
      if (saved) newItems.forEach((item) => restoreItem(item, saved.find((p) => p.key === item.id)));
      else for (const item of newItems) idbSet(fileKey(item.id), item.file); // kept for the next launch
      filesList = [...filesList, ...newItems];
      started = true;
      try {
        localStorage.setItem(SEEN_KEY, "1");
      } catch {}
      activeImageIndex = startIndex; // Switch to first newly added photo

      if (hasRaw) {
        activeTab = "editor";
      } else if (startIndex === 0 && !saved && !startPreset) {
        // first photos of a session: the next step is picking a frame, so the frames are already on screen
        activeTab = "framing";
        activeTool.framing = "templates";
        if (compact) openTray();
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
        note: t("Lake at golden hour"),
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
    if (removed) idbDel(fileKey(removed.id));
    filesList = filesList.filter((_, idx) => idx !== index);
    if (filesList.length === 0) closeTray(); // nothing left to show in the photos tray or a tool
    if (activeImageIndex >= filesList.length) {
      activeImageIndex = Math.max(0, filesList.length - 1);
    }
    scheduleRender(true);
  }

  function setActiveImage(index) {
    activeImageIndex = index;
    coverShown = false;
    scheduleRender(true);
  }
  // Swiping moves photo by photo; in a photo dump, slide by slide (the cover first).
  function stepSlide(dir) {
    const at = activeTab === "framing" ? slideList.indexOf(currentSlide) : -1;
    if (at >= 0) {
      const to = slideList[at + dir];
      if (to?.cover) showCover();
      else if (to) setActiveImage(filesList.indexOf(to.items[0]));
      return;
    }
    const next = activeImageIndex + dir;
    if (next >= 0 && next < filesList.length) setActiveImage(next);
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
    // The histogram reads pixels back from the GPU, which stalls a frame: only once a slider pauses.
    clearTimeout(histoTimer);
    histoTimer = setTimeout(() => processedImage && (histo = histogram(processedImage)), 150);
  }
  let histoTimer;

  // ─── Location (locationHelper.js) ──────────────────────────────────────────
  // A photo with a GPS position and no place name yet gets one when the location line is on: looked up
  // online (OpenStreetMap), or its coordinates offline. Once per photo: a name the user types, or clears to
  // type a new one, is never replaced.
  let locating = $state(false);
  const showsLocation = () => frame.showExif && frame.exifDisplay.location;
  async function ensureLocation(item) {
    if (!showsLocation() || !item?.gps || item.locationTried || item.exifOverride.location?.trim()) return;
    item.locationTried = true;
    const name = await placeName(item.gps.lat, item.gps.lon, i18n.lang);
    if (!item.exifOverride.location?.trim()) item.exifOverride.location = name;
  }
  $effect(() => {
    const item = activeItem;
    if (!showsLocation() || !item?.gps || item.locationTried || item.exifOverride.location?.trim()) return;
    untrack(() => {
      locating = true;
      ensureLocation(item).finally(() => (locating = false));
    });
  });

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
    if (display.location && override.location?.trim()) extra.push(override.location.trim());
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

  // ─── Film borders (film.js) ────────────────────────────────────────────────
  // The film object (strip, print or slide with the photo in it) takes the photo's place in the layout.
  const NOTE_STYLES = ["instant", "slide"]; // the caption is handwritten on the card instead of under it
  const filmCanvas = document.createElement("canvas"); // the preview's film object, reused between redraws

  // The handwritten line on an instant print or slide: your note or the date, else the camera.
  function filmNote(item) {
    if (!frame.showExif) return "";
    const lines = buildExifLines(item?.exifOverride, frame.exifDisplay);
    return (lines.find((l) => l.type === "extra") ?? lines.find((l) => l.type === "model"))?.text ?? "";
  }

  // span: photos on this slide (a photo dump); the next frame is the photo after them.
  function filmObject(photo, film, item, reuse, span = 1) {
    const c = reuse ? filmCanvas : document.createElement("canvas");
    c.width = film.w; // (also clears it)
    c.height = film.h;
    const i = filesList.indexOf(item);
    // shortcut: neighbours are the other photos' previews, without their edits or crop; fine for a 3 mm sliver.
    const near = (k) => {
      const img = filesList[i + k]?.previewImage;
      return frame.filmNeighbours && i >= 0 && img instanceof HTMLCanvasElement ? img : null;
    };
    const taken = item?.camera?.taken;
    const yy = taken ? String(taken.getFullYear()).slice(2) : "";
    drawFilm(c.getContext("2d"), photo, film, {
      ink: frame.filmInk,
      card: frame.filmCard,
      name: frame.filmName,
      n: frame.filmFrame + Math.max(0, i),
      prev: near(-1),
      next: near(span),
      stamp: frame.filmDate && taken ? `'${yy} ${taken.getMonth() + 1} ${taken.getDate()}` : "",
      month: taken ? `${taken.toLocaleDateString(i18n.lang, { month: "short" }).toUpperCase().replace(".", "")} · ${yy}` : "",
      note: filmNote(item),
      font: captionFamily(),
    });
    return c;
  }

  // item: the photo (its caption text, and for carousels which part of it fills the strip).
  function layoutFrame(srcW, srcH, item) {
    const exifOverride = item?.exifOverride;
    const lines = frame.showExif && exifOverride && !NOTE_STYLES.includes(frame.filmStyle)
      ? buildExifLines(exifOverride, frame.exifDisplay)
      : [];
    // In a fixed shape a 35 mm strip runs off the frame at both ends; the border is the space beside it.
    let film = filmLayout(frame.filmStyle, srcW, srcH);
    const strip = film?.style === "35mm" && ratio?.w && slices === 1;
    const run = () => computeFrameLayout(
      film?.w ?? srcW,
      film?.h ?? srcH,
      lines,
      {
        marginH: strip && film.land ? 0 : frame.customMarginH,
        marginV: strip && !film.land ? 0 : frame.customMarginV,
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
    let L = run();
    if (strip) {
      // Make the strip long enough to reach the frame's edges (more of the frames before and after shows),
      // leaving the border beside it: sideways, the room the ratio left at the ends; upright, the height that
      // gives the side border asked for (the caption keeps its space below).
      let more = L.imgX;
      if (!film.land) {
        const free = frame.textZone === "top" ? L.canvasH - L.imgY - film.h : L.imgY;
        const band = L.canvasH - film.h - 2 * free;
        more = ((film.w * (1 + frame.customMarginH / 50)) / (ratio.w / ratio.h) - band - film.h) / 2;
      }
      if (more > 1) {
        film = filmLayout("35mm", srcW, srcH, more);
        L = run();
      }
    }
    return film ? { ...L, film } : L;
  }

  // Caption fonts come in character subsets (Latin, Latin Extended…) that the browser fetches only when a
  // character first needs one: ƒ in ƒ/5.6, ğ ş İ in Turkish, ß in German. Until then the canvas draws a
  // fallback glyph of another width, which shifted the rest of the line. Preview: redraw once they arrive.
  // Export: wait for them first.
  const CAPTION_WEIGHTS = [400, 500, 600, 800];
  function captionFonts(item) {
    const text = buildExifLines(item?.exifOverride, frame.exifDisplay).map((l) => l.text).join(" ");
    const faces = CAPTION_WEIGHTS.map((w) => `${w} 40px ${captionFamily()}`);
    if (!text || !document.fonts || faces.every((f) => document.fonts.check(f, text))) return null;
    return Promise.all(faces.map((f) => document.fonts.load(f, text).catch(() => {})));
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

  function drawFramed(canvas, photo, item, span = 1) {
    const L = layoutFrame(photo.width, photo.height, item);
    if (canvas.width !== L.canvasW || canvas.height !== L.canvasH) {
      canvas.width = L.canvasW;
      canvas.height = L.canvasH;
    }
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = frame.backgroundColor;
    ctx.fillRect(0, 0, L.canvasW, L.canvasH);
    const src = L.film ? filmObject(photo, L.film, item, canvas === canvasEl, span) : photo;
    // Carousels fill the whole strip: the layout says which part of the photo to draw (L.crop).
    const { sx, sy, sw, sh } = L.crop ?? { sx: 0, sy: 0, sw: src.width, sh: src.height };
    ctx.drawImage(src, sx, sy, sw, sh, L.imgX, L.imgY, sw, sh);
    if (src !== photo && src !== filmCanvas) src.width = src.height = 0; // export: free it now
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
  // ─── Photo dump slides ─────────────────────────────────────────────────────
  const shrinkTo = (c, max) => {
    const k = max / Math.max(c.width, c.height);
    if (k >= 1) return c;
    const out = document.createElement("canvas");
    out.width = Math.max(1, Math.round(c.width * k));
    out.height = Math.max(1, Math.round(c.height * k));
    const g = out.getContext("2d", { alpha: false });
    g.imageSmoothingQuality = "high";
    g.drawImage(c, 0, 0, out.width, out.height);
    return out;
  };
  // Another photo of the slide (or the cover), developed from its preview with its own edits and crop.
  const devCache = new Map(); // `${id}|${max}` → { key, canvas }
  function developedPreview(item, max = PREVIEW, keep = true) {
    if (item === activeItem && max >= PREVIEW && processedImage) return processedImage;
    const id = `${item.id}|${max}`;
    const key = JSON.stringify([item.dev, item.crop]);
    const hit = devCache.get(id);
    if (hit?.key === key) return hit.canvas;
    const base = item.previewImage;
    const src = Math.max(base.width, base.height) <= max ? base : base.linear ? downscaleLinear(base, max) : shrinkTo(base, max);
    let c = applyDetail(developCanvas(src, document.createElement("canvas"), item.dev), item.dev);
    if (!isIdentity(item.crop)) c = applyGeometry(c, item.crop);
    if (keep) {
      if (devCache.size > 40) devCache.clear(); // shortcut: forgets everything now and then instead of tracking removed photos
      devCache.set(id, { key, canvas: c });
    }
    return c;
  }
  // Several photos joined into one picture (dump.js): the gap is the film's black, the card or the background.
  function composeSlide(imgs, out = document.createElement("canvas")) {
    const L = composeLayout(imgs.map((c) => ({ w: c.width, h: c.height })));
    out.width = L.w;
    out.height = L.h;
    const ctx = out.getContext("2d");
    ctx.fillStyle = ["35mm", "darkroom"].includes(frame.filmStyle) ? "#0b0b0c" : NOTE_STYLES.includes(frame.filmStyle) ? frame.filmCard : frame.backgroundColor;
    ctx.fillRect(0, 0, L.w, L.h);
    L.cells.forEach((c, i) => ctx.drawImage(imgs[i], c.sx, c.sy, c.sw, c.sh, c.x, c.y, c.w, c.h));
    return out;
  }
  const slideCanvas = document.createElement("canvas"); // the preview's shared slide, reused
  // The cover: every photo on a contact sheet, in the frame's shape (4:5 for a carousel or a free shape).
  function drawCover(canvas, items, long, imgs) {
    const ar = ratio?.w && slices === 1 ? ratio.w / ratio.h : 4 / 5;
    canvas.width = Math.round(ar >= 1 ? long : long * ar);
    canvas.height = Math.round(canvas.width / ar);
    const taken = items.find((f) => f.camera?.taken)?.camera.taken;
    const pad = (n) => String(n).padStart(2, "0");
    const day = taken ? `${pad(taken.getDate())}.${pad(taken.getMonth() + 1)}.${String(taken.getFullYear()).slice(2)} · ` : "";
    drawContactSheet(canvas.getContext("2d"), canvas.width, canvas.height, imgs, {
      ink: frame.filmInk,
      name: frame.filmName,
      n: frame.filmFrame,
      title: post.title.trim() || autoTitle(items),
      note: `${day}${items.length}`,
      font: '"Caveat", cursive',
    });
    return canvas;
  }
  const COVER_FONT = '400 40px "Caveat"';

  function renderCanvas() {
    if (!canvasEl || !processedImage || !activeItem) return;
    const slide = activeTab === "framing" ? currentSlide : null;
    if (slide?.cover) {
      drawCover(canvasEl, slide.items, 1350, slide.items.map((f) => developedPreview(f, 540)));
      if (!document.fonts.check(COVER_FONT)) document.fonts.load(COVER_FONT).then(() => scheduleRender());
      framedSize = photoSize = { w: canvasEl.width, h: canvasEl.height };
      canvasAspect = canvasEl.width / canvasEl.height;
      return;
    }
    const group = slide?.items.length > 1 ? slide.items : null;
    const photo = group ? composeSlide(group.map((f) => developedPreview(f)), slideCanvas) : processedImage;
    const lead = group ? group[0] : activeItem; // a shared slide takes its caption from its first photo
    const srcW = photo.width;
    const srcH = photo.height;
    const fullScale =
      (activeItem.fullW || activeItem.previewImage.width) /
      activeItem.previewImage.width;

    // Full-resolution sizes for the info line and the export sheet.
    const L = layoutFrame(srcW, srcH, lead);
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
      drawFramed(canvasEl, photo, lead, group?.length ?? 1);
      captionFonts(lead)?.then(() => scheduleRender());
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
    const _post = JSON.stringify(post);
    const _slide = currentSlide;

    scheduleRender(false);
  });

  // ─── Full-resolution export ────────────────────────────────────────────────
  // 1–2 of an export: the full-size photo decoded, developed, detailed and cropped.
  async function developFull(item) {
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
    return colorCanvas;
  }

  async function generateFullResExportCanvas(item, mode = "framed") {
    if (!item) return null;
    let colorCanvas = await developFull(item);

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
    await captionFonts(item);
    const framed = drawFramed(document.createElement("canvas"), colorCanvas, item);
    // Explicitly free temporary colorCanvas memory
    colorCanvas.width = 0;
    colorCanvas.height = 0;
    return framed;
  }

  // A shared slide at full size: each photo developed alone (one full-size photo in memory at a time) and
  // kept at most 2400 px, then joined at the export size; grain and glow are each photo's own.
  async function generateSlideCanvas(items) {
    const parts = [];
    for (const item of items) {
      const c = await developFull(item);
      const small = shrinkTo(c, 2400);
      if (small !== c) c.width = c.height = 0;
      parts.push(small);
    }
    const L = composeLayout(parts.map((c) => ({ w: c.width, h: c.height })));
    const k = exportScale(L.w, L.h, "framed", items[0]);
    const cells = parts.map((c, i) => {
      const cell = L.cells[i];
      const out = document.createElement("canvas");
      out.width = Math.max(1, Math.round(cell.w * k));
      out.height = Math.max(1, Math.round(cell.h * k));
      const g = out.getContext("2d", { alpha: false });
      g.imageSmoothingQuality = "high";
      g.drawImage(c, cell.sx, cell.sy, cell.sw, cell.sh, 0, 0, out.width, out.height);
      c.width = c.height = 0;
      const d = items[i].dev;
      if (d.softBloom > 0 || d.filmGrain > 0) applyAnalogEffects(out, { grain: d.filmGrain, bloom: d.softBloom });
      return out;
    });
    const joined = composeSlide(cells);
    for (const c of cells) c.width = c.height = 0;
    await captionFonts(items[0]);
    const framed = drawFramed(document.createElement("canvas"), joined, items[0], items.length);
    joined.width = joined.height = 0;
    return framed;
  }

  // The cover at the export size; its frames come from the photos' previews (each is a third of the slide).
  async function renderCover(items, name) {
    await document.fonts.load(COVER_FONT);
    const s = EXPORT_SIZES.find((x) => x.id === exportPrefs.size);
    const ar = ratio?.w && slices === 1 ? ratio.w / ratio.h : 4 / 5;
    const long = s?.width ? (ar >= 1 ? s.width : s.width / ar) : (s?.long ?? 3240);
    const canvas = drawCover(document.createElement("canvas"), items, long, items.map((f) => developedPreview(f, 1080, false)));
    const { blob, ext } = await encodeCanvas(canvas);
    canvas.width = canvas.height = 0;
    return [{ name: `${name}.${ext}`, blob }];
  }

  /** Renders one photo for export: one file, or one per slide for carousel ratios. */
  // group: the photos sharing this slide of a photo dump; name: the file name to use (without extension).
  async function renderFiles(item, mode, index = 0, group = null, name = null) {
    if (mode === "framed") for (const it of group ?? [item]) await ensureLocation(it);
    const canvas = group ? await generateSlideCanvas(group) : await generateFullResExportCanvas(item, mode);
    if (!canvas) throw new Error("could not render the photo");
    const base = name ?? `${cleanName(item.name, `photo_${index + 1}`)}_${mode === "edited" ? "edited" : "framed"}`;
    const n = mode === "framed" ? slices : 1;
    const parts = n > 1 ? sliceCanvas(canvas, n) : [canvas];
    const files = [];
    for (let i = 0; i < parts.length; i++) {
      let { blob, ext } = await encodeCanvas(parts[i]);
      if (exportPrefs.keepCamera && ext === "jpg" && item.camera) blob = await withExif(blob, item.camera);
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
  // The Android app saves each one straight into the gallery's "MinimalFrame" album (GalleryPlugin.java).
  const isApp = Capacitor.isNativePlatform();
  const Gallery = registerPlugin("Gallery");
  let savedOpen = $state(false); // the saved-photos screen (app only)
  // shortcut: Android 7–9 keep exports outside the album, so the screen is offered on Android 10+ only
  let savedSupported = $state(false);
  if (isApp) Gallery.list().then((r) => (savedSupported = r.supported), () => {});
  const savesSeparately = isApp || matchMedia("(pointer: coarse)").matches;
  const base64 = (blob) =>
    new Promise((ok, fail) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result).split(",")[1]);
      r.onerror = () => fail(r.error);
      r.readAsDataURL(blob);
    });
  // Samsung Internet keeps only the first of several downloads started without a tap, so there the rest
  // wait for one tap each (Save image 2 of 3…). Chrome and others save them all at once.
  // shortcut: detects Samsung Internet by name; add other browsers here if they turn out to block too.
  const oneSavePerTap = typeof navigator !== "undefined" && /SamsungBrowser/.test(navigator.userAgent);
  let saveQueue = $state.raw(null); // { files, next }: images still waiting for a tap
  function saveNext() {
    const { files, next } = saveQueue;
    triggerDownload(files[next].blob, files[next].name);
    saveQueue = next + 1 < files.length ? { files, next: next + 1 } : null;
    flashStatus(
      saveQueue
        ? t("Saved {n} of {total}. Tap Save for the next one.", { n: next + 1, total: files.length })
        : t("Saved all {n} images", { n: files.length }),
    );
  }

  async function saveFiles(files, zipName) {
    saveQueue = null;
    if (isApp) {
      for (const f of files) await Gallery.save({ data: await base64(f.blob), name: f.name, mime: f.blob.type || "image/jpeg" });
      return;
    }
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

  let statusDone = $state(false); // the status says something finished (Saved, Shared): shown in green
  function flashStatus(text) {
    markExported(); // only finished saves and shares say so
    statusDone = true;
    downloadStatus = text;
    setTimeout(() => downloadStatus === text && (downloadStatus = ""), 5000);
  }

  async function downloadImage(mode = "framed") {
    if (!processedImage || !activeItem) return;
    exporting = [activeItem];
    isDownloading = true;
    statusDone = false, downloadStatus = t("Exporting…");
    try {
      await new Promise((r) => setTimeout(r, 20)); // let the status paint
      const files = await renderFiles(activeItem, mode);
      const name = `${cleanName(activeItem.name, "photo")}_carousel.zip`;
      await saveFiles(files, name);
      if (!saveQueue) flashStatus(
        isApp
          ? t("Saved to your gallery")
          : files.length === 1
          ? t("Saved {name}", { name: files[0].name })
          : savesSeparately
            ? t("Saved {n} slides", { n: files.length })
            : t("Saved {n} slides to {name}", { n: files.length, name }),
      );
    } catch (err) {
      console.error("[MinimalFrame] Download failed:", err);
      loadError = t("Export failed: {error}", { error: why(err) });
      statusDone = false, downloadStatus = t("Export failed. See the message above the photo.");
    } finally {
      isDownloading = false;
    }
  }

  // Native share sheet (Android/iOS browsers, installed PWA): sends the photo straight to Instagram & co.
  const canShareFiles =
    isApp ||
    Boolean(
      navigator.canShare?.({
        files: [new File([""], "x.jpg", { type: "image/jpeg" })],
      }),
    );
  let pendingShare = $state.raw(null); // files ready but the browser wants a fresh tap to share them

  // The Android app shares through Android's own share menu: the files go to the app's cache first.
  let sharedThisLaunch = false; // the share folder exists; earlier launches' files are cleared at start (IncomingPlugin)
  async function shareInApp(files) {
    if (sharedThisLaunch) await Filesystem.rmdir({ path: "share", directory: Directory.Cache, recursive: true }).catch(() => {});
    sharedThisLaunch = true;
    const uris = [];
    for (const f of files) {
      const { uri } = await Filesystem.writeFile({ path: `share/${f.name}`, data: await base64(f.blob), directory: Directory.Cache, recursive: true });
      uris.push(uri);
    }
    try {
      await Share.share({ files: uris, dialogTitle: t("Share to…") });
      flashStatus(t("Shared"));
    } catch (err) {
      if (!/cancel/i.test(err?.message ?? "")) throw err; // closed the share menu
    }
  }

  async function shareFiles(files) {
    if (isApp) return shareInApp(files);
    try {
      await navigator.share({
        files: files.map(
          (f) => new File([f.blob], f.name, { type: f.blob.type }),
        ),
      });
      pendingShare = null;
      flashStatus(t("Shared"));
    } catch (err) {
      if (err.name === "AbortError") return; // closed the share sheet
      // Rendering can outlast the tap that started it; keep the files and ask for one more tap.
      if (err.name === "NotAllowedError") pendingShare = files;
      else throw err;
    }
  }

  async function shareImage() {
    if (!activeItem) return;
    exporting = [activeItem];
    isDownloading = true;
    statusDone = false, downloadStatus = t("Preparing…");
    try {
      await shareFiles(await renderFiles(activeItem, "framed"));
      if (pendingShare) statusDone = false, downloadStatus = t("Ready to share");
    } catch (err) {
      console.error("[MinimalFrame] Share failed:", err);
      loadError = t("Share failed: {error}", { error: why(err) });
      downloadStatus = "";
    } finally {
      isDownloading = false;
    }
  }

  // ─── Batch export (separate images on phones/tablets, one ZIP on desktop) ───────────────────────────────────────────────────
  // A photo dump exports its slides in posting order (and can share them all at once).
  async function exportBatch(mode = "framed", share = false) {
    const asPost = dumping && mode === "framed";
    const batch = asPost ? slideList : filesList.filter((item) => item.selected).map((item) => ({ cover: false, items: [item] }));
    if (batch.length === 0) return;
    exporting = batch.flatMap((b) => (b.cover ? [] : b.items));
    isBatchExporting = true;
    const total = batch.length;
    const stamp = new Date().toISOString().slice(0, 10);
    batchProgress = { current: 0, total, percent: 0, filename: "" };
    try {
      const files = [];
      for (let i = 0; i < total; i++) {
        batchProgress = {
          current: i + 1,
          total,
          percent: Math.round(((i + 1) / total) * 100),
          filename: batch[i].cover ? t("Cover slide") : batch[i].items.map((f) => f.name).join(", "),
        };
        await new Promise((r) => setTimeout(r, 20)); // let the progress bar paint
        const { cover, items } = batch[i];
        const name = asPost ? `MinimalFrame_${stamp}_${String(i + 1).padStart(2, "0")}of${String(total).padStart(2, "0")}` : null;
        files.push(...(cover ? await renderCover(items, name) : await renderFiles(items[0], mode, i, asPost && items.length > 1 ? items : null, name)));
      }
      if (share) {
        await shareFiles(files);
        if (pendingShare) statusDone = false, downloadStatus = t("Ready to share");
        return;
      }
      batchProgress.filename = savesSeparately ? t("Saving…") : t("Packing the ZIP…");
      const name = `MinimalFrame_${new Date().toISOString().slice(0, 10)}_${total}photos.zip`;
      await saveFiles(files, name);
      if (!saveQueue)
        flashStatus(
          isApp
            ? t("Saved to your gallery")
            : savesSeparately
              ? t("Saved {n} images", { n: files.length })
              : t("Saved {n} photos to {name}", { n: total, name }),
        );
    } catch (err) {
      console.error("[MinimalFrame] Batch export error:", err);
      loadError = t("Batch export failed: {error}", { error: why(err) });
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
  onpopstate={onPopState}
  onkeydown={onKeydown}
  onkeyup={onKeyup}
  onpointermove={moveCropDrag}
  onpointerup={endCropDrag}
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
  class:moving
>
  <header class="bar" class:tight={barTight} bind:this={barEl}>
    <div class="bar-side">
      <span class="wordmark"
        ><svg class="mark" viewBox="0 0 108 108" aria-hidden="true"
          ><rect width="108" height="108" rx="24" fill="var(--mark-wall)" /><rect x="27.5" y="25.5" width="53" height="57" fill="none" stroke="var(--mark-ink)" stroke-width="4" /><rect x="38" y="36" width="32" height="36" fill="var(--mark-print)" /><circle cx="61" cy="46" r="4.5" fill="#f59e0b" /></svg
        ><span class="wm-text">MinimalFrame</span></span
      >
      {#if started}
        <!-- Phones: the photos button grows in from the left when the first photo arrives, sliding the
             Edit/Frame switch over to make room. Several photos show as a small fanned stack with their count. -->
        <div class="photos-slot" class:shown={!!activeItem}>
          {#if activeItem}
            <button class="photos-btn" class:on={compact && trayOpen && trayView === "photos"} onclick={togglePhotos} aria-label={t("Your photos ({n})", { n: filesList.length })} title={t("Your photos")}>
              {#each filesList.filter((f) => f !== activeItem).slice(0, 2).reverse() as f, i (f.id)}
                <img class="card" style:--i={filesList.length > 2 ? 2 - i : 1} src={f.thumbUrl} alt="" />
              {/each}
              <img src={activeItem.thumbUrl} alt="" />
              {#if filesList.length > 1}<span class="count">{filesList.length}</span>{/if}
            </button>
          {/if}
        </div>
        {#if !compact && filesList.length > 1}<span class="photo-count">{t("{n} photos", { n: filesList.length })}</span>{/if}
      {/if}
    </div>
    {#if started}
      <div class="seg modes" role="group" aria-label={t("Mode")}>
        <button use:fitWidth aria-pressed={activeTab === "editor"} onclick={() => setMode("editor")}>{t("Edit")}</button>
        <button use:fitWidth aria-pressed={activeTab === "framing"} onclick={() => setMode("framing")}>{t("Frame")}</button>
      </div>
      <div class="bar-side end">
        {#if !compact}<ThemePicker /><LanguagePicker />{/if}
        <button class="icon-btn add-btn" onclick={() => fileInput?.click()} aria-label={t("Add photos")} title={t("Add photos")}><Icon name="add" /></button>
        <button class="icon-btn" onclick={undo} disabled={!canUndo || !activeItem} aria-label={t("Undo")} title={t("Undo (Ctrl+Z)")}><Icon name="undo" /></button>
        <button class="icon-btn" onclick={redo} disabled={!canRedo || !activeItem} aria-label={t("Redo")} title={t("Redo (Ctrl+Shift+Z)")}><Icon name="redo" /></button>
        <button
          class="btn accent bar-export"
          aria-label={t("Export")}
          disabled={!activeItem}
          onclick={() => {
            exportDialog?.showModal();
            exportOpen = true;
          }}><Icon name="export" /><span class="bar-export-label">{t("Export")}</span></button
        >
      </div>
    {:else}
      <!-- first visit: the language is the one setting people may need before anything else -->
      <div class="bar-side end"><LanguagePicker /></div>
    {/if}
  </header>

  <section class="stage" aria-label={t("Preview")}>
    <div class="fit" style:display={processedImage ? "flex" : "none"}>
      <!-- svelte-ignore a11y_no_static_element_interactions (keyboard: hold \ or the "Hold for original" button) -->
      <div
        class="print"
        class:positioning
        class:morphing
        class:settling
        style:--ar={canvasAspect}
        style:--zs={zoom.s}
        style:--print-bg={activeTab === "framing" ? frame.backgroundColor : "transparent"}
        bind:this={printEl}
        style:transform={zoom.s > 1 ? `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.s})` : undefined}
        title={cropping ? undefined : positioning ? t("Drag to choose which part of the photo fills the slides") : t("Press and hold to see the original. Pinch or double-tap to zoom.")}
        onpointerdown={holdPhoto}
        onpointermove={movePhoto}
        onpointerup={releasePhoto}
        onpointerleave={releasePhoto}
        onpointercancel={releasePhoto}
        oncontextmenu={(e) => e.preventDefault()}
      >
        <canvas
          bind:this={canvasEl}
          style:--pa={canvasAspect}
          aria-label={t("Preview of {name}", { name: activeItem?.name ?? "" })}
        ></canvas>
        <canvas class="morph-ghost" bind:this={ghostEl} aria-hidden="true"></canvas>
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
              aria-label={t("Crop area. Arrow keys move it, Shift plus arrow keys resize it.")}
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
    {#if processedImage && (edited || showOriginal)}
      <button
        class="hold"
        class:on={showOriginal}
        aria-label={t("Hold to see the original")}
        title={t("Hold to see the original") + " (\\)"}
        onpointerdown={() => (showOriginal = true)}
        onpointerup={() => (showOriginal = false)}
        onpointerleave={() => (showOriginal = false)}
        onpointercancel={() => (showOriginal = false)}
        oncontextmenu={(e) => e.preventDefault()}
        onkeydown={(e) => (e.key === " " || e.key === "Enter") && (showOriginal = true)}
        onkeyup={() => (showOriginal = false)}
      >
        <Icon name="compare" /><span>{t("Hold for original")}</span>
      </button>
    {/if}

    {#if zoom.s > 1 && !cropping}
      <button class="zoom-pill glass" onclick={() => (zoom = NO_ZOOM)} aria-label={t("Zoomed {n} times. Fit the photo", { n: zoom.s.toFixed(1) })}>{zoom.s.toFixed(1)}× · {t("Fit")}</button>
    {/if}

    {#if sessionChecked && (!started || !activeItem)}
      <Landing
        bare={started}
        langInWell={compact}
        {isLoading}
        {loadingStatus}
        {isDragging}
        onchoose={() => { startPreset = null; fileInput?.click(); }}
        onsample={() => { startPreset = null; loadSamplePhoto(); }}
        onpick={(p) => { startPreset = p; fileInput?.click(); }}
        onsaved={savedSupported ? () => (savedOpen = true) : null}
      />
    {/if}

    {#if isLoading && filesList.length > 0}
      <p class="toast glass" role="status">
        <span class="spinner" aria-hidden="true"></span>{loadingStatus}
      </p>
    {/if}
    {#if loadError}
      {@const [head, ...rest] = loadError.split(/:\s(.*)/s)}
      <div class="alert" role="alert">
        <span class="alert-icon" aria-hidden="true"><Icon name="alert" /></span>
        <p>
          <strong>{rest.length ? head : loadError}</strong>
          {#if rest[0]}<span>{rest[0]}</span>{/if}
        </p>
        <button onclick={() => (loadError = "")} aria-label={t("Dismiss")}><Icon name="close" /></button>
      </div>
    {/if}
  </section>

  {#if started}
    <nav class="strip" class:single={filesList.length === 1} aria-label={t("Your photos")}>
      <ol use:reorder={{ onmove: reorderPhoto }}>
        {#if dumping && post.cover}
          <li class="frame" class:active={coverShown}>
            <button class="frame-pick frame-cover" onclick={showCover} aria-current={coverShown ? "true" : undefined} aria-label={t("Cover slide")}>
              <i></i><i></i>
            </button>
          </li>
        {/if}
        {#each filesList as item, i (item.id)}
          <li class="frame" class:active={activeImageIndex === i && !(coverShown && dumping && post.cover)} data-index={i}>
            <button
              class="frame-pick"
              onclick={() => setActiveImage(i)}
              aria-current={activeImageIndex === i ? "true" : undefined}
              aria-label={t("Show {name}", { name: item.name })}
            >
              <img src={item.thumbUrl} alt="" />
              {#if item.isRaw}<span class="frame-raw">RAW</span>{/if}
            </button>
            <label class="frame-sel" title={t("Include in batch export")}>
              <input type="checkbox" bind:checked={item.selected} />
              <span class="sr-only">{t("Include {name} in batch export", { name: item.name })}</span>
            </label>
            <button
              class="mini-del frame-del"
              onclick={(e) => removeImage(i, e)}
              aria-label={t("Remove {name}", { name: item.name })}>×</button
            >
          </li>
        {/each}
        <li>
          <button
            class="frame-add"
            onclick={() => fileInput?.click()}
            aria-label={t("Add photos")}>+</button
          >
        </li>
      </ol>
      {#if filesList.length > 1}<p class="strip-note">
          {t("{n} of {total} in batch", { n: selectedCount, total: filesList.length })}
        </p>{/if}
      {#if selectedCount > 1}<PostOptions bind:post={() => post, keep} count={selectedCount} autoTitle={autoTitle(postItems)} row />{/if}
    </nav>

    <nav class="rail" aria-label={t("Tools")}>
      {#each TOOLS[activeTab] as [id, name] (id)}
        <button
          class="tab"
          title={t(TOOL_HINTS[id])}
          aria-pressed={toolOpen(id)}
          onclick={() => pickTool(id)}
        >
          <Icon name={id} /><span>{t(name)}</span>
        </button>
      {/each}
    </nav>

    <aside
      class="panel"
      bind:this={panelEl}
      style:height={trayPull ? `${Math.max(0, pullFrom - trayPull)}px` : undefined}
      class:open={trayOpen}
      class:closing={trayClosing}
      aria-label={t("{tool} settings", { tool: t(TOOLS[activeTab].find(([id]) => id === activeTool[activeTab])[1]) })}>
      <div class="panel-head">
        <div>
          <!-- phones: the tool's name is already lit up in the tab row below, so only Photos shows its title -->
          <h2 class:sr-only={compact && trayView !== "photos"}>{compact && trayView === "photos" ? t("Photos") : t(TOOLS[activeTab].find(([id]) => id === activeTool[activeTab])[1])}</h2>
          <p class="tool-hint">{t(TOOL_HINTS[activeTool[activeTab]])}</p>
        </div>
        <div class="head-actions">
          {#if activeTab === "editor" && activeItem && !(compact && trayView === "photos")}
            <button class="btn ghost revert" onclick={revertPhoto} disabled={!edited} title={t("Remove every edit and the crop from this photo")}><Icon name="revert" /><span class="btn-label">{t("Revert")}</span></button>
          {/if}
          <button class="btn ink done" onclick={closeTray} title={t("Done")}><Icon name="check" /><span class="sr-only">{t("Done")}</span></button>
        </div>
      </div>

      <div class="body" id="tool-body">
        {#if compact && trayView === "photos"}
          <PhotosTray
            bind:filesList
            bind:post={() => post, keep}
            activeIndex={activeImageIndex}
            coverOn={dumping && post.cover}
            coverShown={coverShown && dumping && post.cover}
            autoTitle={autoTitle(postItems)}
            onpick={(i) => (setActiveImage(i), closeTray())}
            onpickcover={() => (showCover(), closeTray())}
            onremove={removeImage}
            onadd={() => fileInput?.click()}
            onmove={reorderPhoto}
            onsaved={savedSupported ? () => (closeTray(), (savedOpen = true)) : null}
          />
        {:else if activeTab === "editor" && !activeItem}
          <p class="tool-hint">{t("Add a photo to edit it.")}</p>
        {:else if activeTab === "editor"}
          {@const tool = activeTool.editor}
          {#if histo}<Histogram bins={histo} />{/if}
          {#if !canDevelop}
            <p class="hint" role="note">
              {t("This device can't run the full editor, so only exposure, contrast and saturation are applied.")}
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
              bind:frame={() => frame, keep}
              index={activeImageIndex}
              {userPresets}
              hasLooks={userLooks.length > 0}
              {libraryMessage}
              onapply={applyPreset}
              ondelete={deletePreset}
              onsave={() => openSave("template")}
              onexport={exportLibrary}
              onimport={importLibrary}
              onsharestyle={shareStyle}
              onapplystyle={applyStyleCode}
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
              {locating}
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
    onsaved={savedSupported ? () => (savedOpen = true) : null}
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
    {statusDone}
    postSlides={dumping ? slideList.length : 0}
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
      <p>{t("Drop anywhere to open your photos")}</p>
    </div>
  {/if}
</main>

{#if savedSupported}<SavedPhotos bind:open={savedOpen} {Gallery} {closeOnBack} />{/if}

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
    outline: 2px dashed var(--accent);
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
    color: var(--accent);
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
  .app > .bar {
    z-index: 5; /* its language menu opens over the photo area */
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
    grid-column: -2; /* the right edge, also on the landing page where there is no Edit/Frame switch */
    justify-content: flex-end;
  }
  /* Phones: the current photo as a button that opens the Photos tray (desktop has the strip instead). */
  .photos-slot {
    display: none;
  }
  .photos-btn {
    position: relative;
    width: 38px;
    height: 38px;
    border-radius: 10px;
    border: 1.5px solid var(--line);
    animation: photos-in 300ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  @keyframes photos-in {
    from {
      opacity: 0;
      scale: 0.6;
    }
  }
  .photos-btn img {
    position: relative;
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 8px;
    display: block;
  }
  /* the other photos, fanned behind the current one: "there are more" at a glance */
  .photos-btn .card {
    position: absolute;
    inset: 0;
    border: 1.5px solid var(--surface);
    translate: calc(var(--i) * 4px) calc(var(--i) * -3px);
    rotate: calc(var(--i) * 6deg);
    opacity: calc(1 - var(--i) * 0.2);
  }
  .photo-count {
    margin-left: 14px;
    padding-left: 14px;
    border-left: 1px solid var(--line);
    font-size: var(--fs-label);
    color: var(--muted);
    white-space: nowrap;
  }
  .photos-btn.on {
    border-color: var(--text);
  }
  .photos-btn .count {
    position: absolute;
    right: -6px;
    bottom: -6px;
    min-width: 18px;
    height: 18px;
    padding: 0 4px;
    border-radius: 9px;
    background: var(--text); /* neutral: amber is for actions only */
    color: var(--bg);
    box-shadow: 0 0 0 2px var(--surface);
    font-size: 0.7rem;
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
  /* One fixed size in every language; long words are drawn narrower to fit (fitWidth.js) */
  .modes button {
    width: 88px;
    padding: 7px 10px;
    font-size: 0.9rem;
    font-weight: 650;
    white-space: nowrap;
    overflow: hidden;
  }
  /* The main switch: the chosen mode is solid ink, so it reads at a glance on any screen. */
  .modes button[aria-pressed="true"] {
    background: var(--text);
    color: var(--bg);
    box-shadow: none;
  }
  .bar-export {
    --pad-x: 16px; /* read by the barTight check */
    margin-left: 8px;
    padding: 9px var(--pad-x);
    white-space: nowrap; /* a long label ("Dışa aktar") goes icon-only instead of wrapping (see barTight) */
  }
  /* the right side never squeezes its buttons; when they don't fit, Export drops its label instead */
  .bar-side.end > :global(*) {
    flex-shrink: 0;
  }
  /* hidden but still measured, so the check knows when it would fit again */
  .bar.tight .bar-export {
    position: relative;
  }
  .bar.tight .bar-export-label {
    position: absolute;
    right: 0; /* inside the button, so it never widens the page */
    visibility: hidden;
  }
  .bar.tight .bar-export {
    padding-inline: 11px;
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
    overflow: clip; /* a zoomed photo stays inside its area */
  }
  .zoom-pill {
    position: absolute;
    top: 14px;
    left: 50%;
    z-index: 3;
    transform: translateX(-50%);
    padding: 7px 14px;
    border-radius: 999px;
    border: 1px solid var(--line);
    font-size: 0.85rem;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
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
    box-shadow: var(--shadow-print);
  }
  /* Each picture keeps the size it has at its own aspect ratio (--pa), centred: equal to the box once it
     settles; mid-morph the box's edges move around it instead of the picture being rescaled. */
  canvas {
    position: absolute;
    left: 50%;
    top: 50%;
    translate: -50% -50%; /* centred even when wider than the box (auto margins only centre what fits) */
    display: block;
    width: min(100cqw, 100cqh * var(--pa));
    height: auto;
  }
  .morph-ghost {
    opacity: 0;
    pointer-events: none;
  }
  .print {
    background: var(--print-bg);
  }
  .print.morphing {
    transition: --ar 300ms cubic-bezier(0.4, 0, 0.2, 1);
  }
  .print.settling {
    transition: transform 450ms cubic-bezier(0.4, 0, 0.2, 1);
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
  .fx-bloom,
  .fx-grain {
    transition: opacity 150ms;
  }
  /* see `moving` in the script: nothing costly is repainted while things move */
  .app.moving .print {
    will-change: transform;
    box-shadow: 0 12px 30px -12px rgb(0 0 0 / 0.6);
  }
  .app.moving .panel > :global(*) {
    will-change: transform;
  }
  .app.moving :is(.fx-bloom, .fx-grain) {
    opacity: 0 !important;
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
  /* A message card: icon, what happened, what to do, close. Warm (warn) rather than alarming red. */
  .alert {
    top: 12px;
    z-index: 6;
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: start;
    gap: 12px;
    width: min(440px, calc(100% - 32px));
    padding: 12px 8px 12px 14px;
    border-radius: var(--radius);
    background: var(--surface);
    border: 1px solid color-mix(in srgb, var(--warn) 35%, var(--line));
    box-shadow: var(--shadow-float);
    animation: alert-in 240ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  @keyframes alert-in {
    from {
      opacity: 0;
      translate: -50% -12px;
    }
  }
  .alert-icon {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--warn) 16%, transparent);
    color: var(--warn);
  }
  .alert-icon :global(svg) {
    width: 18px;
    height: 18px;
  }
  .alert p {
    display: grid;
    gap: 2px;
    padding-top: 1px;
    font-size: var(--fs-label);
    line-height: 1.4;
    color: var(--muted);
    overflow-wrap: anywhere;
  }
  .alert strong {
    font-size: 0.9rem;
    font-weight: 650;
    color: var(--text);
  }
  .alert button {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    color: var(--muted);
  }
  .alert button:hover {
    background: var(--field);
    color: var(--text);
  }
  .alert button :global(svg) {
    width: 16px;
    height: 16px;
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
  /* the cover: a tiny contact sheet */
  .frame-cover {
    width: 46px;
    background: #f7f6f2;
    display: grid;
    align-content: center;
    gap: 4px;
    padding: 0 6px;
  }
  .frame-cover i {
    height: 12px;
    background: #0b0b0c;
    border-radius: 1px;
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
    background: var(--text);
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
    gap: var(--sp-2);
    padding: var(--sp-3) var(--sp-3) 4px;
  }
  .panel-head h2 {
    font-size: 1.05rem;
    font-weight: 700;
    letter-spacing: -0.01em;
  }
  .head-actions {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 8px;
    flex: none;
  }
  .revert {
    padding: 7px 14px 7px 11px;
    gap: 6px;
    font-size: 0.85rem;
  }
  .revert :global(svg) {
    width: 16px;
    height: 16px;
  }
  .tool-hint {
    margin-top: 3px;
    font-size: var(--fs-label);
    line-height: 1.4;
    color: var(--muted);
  }
  .done {
    display: none;
    margin-left: auto;
  }
  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: var(--sp-2) var(--sp-3) var(--sp-4);
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
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
    background: var(--text);
    border-color: var(--text);
    color: var(--bg);
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
  /* "Original" while holding: a frosted pill, readable on any photo (its own colour, not the page's text colour) */
  .badge {
    position: absolute;
    top: 10px;
    left: 10px;
    padding: 4px 11px;
    border-radius: 999px;
    background: rgb(20 20 22 / 0.42);
    -webkit-backdrop-filter: blur(8px);
    backdrop-filter: blur(8px);
    border: 1px solid rgb(255 255 255 / 0.18);
    color: #fff;
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
  /* Corner handles sit inside the crop box (the photo clips anything outside it, which hid half of each
     round dot at the photo's edges): a 44px touch area with a white L bracket in the corner. */
  .handle {
    position: absolute;
    width: 44px;
    height: 44px;
    touch-action: none;
  }
  .handle::after {
    content: "";
    position: absolute;
    width: 22px;
    height: 22px;
    border: 0 solid #fff;
    filter: drop-shadow(0 0 1.5px rgb(0 0 0 / 0.7));
  }
  .handle {
    scale: calc(1 / var(--zs, 1)); /* same size on screen while the crop view is zoomed */
  }
  .handle.nw { left: 0; top: 0; cursor: nwse-resize; transform-origin: 0 0; }
  .handle.ne { right: 0; top: 0; cursor: nesw-resize; transform-origin: 100% 0; }
  .handle.sw { left: 0; bottom: 0; cursor: nesw-resize; transform-origin: 0 100%; }
  .handle.se { right: 0; bottom: 0; cursor: nwse-resize; transform-origin: 100% 100%; }
  .handle.nw::after { left: 0; top: 0; border-width: 4px 0 0 4px; }
  .handle.ne::after { right: 0; top: 0; border-width: 4px 4px 0 0; }
  .handle.sw::after { left: 0; bottom: 0; border-width: 0 0 4px 4px; }
  .handle.se::after { right: 0; bottom: 0; border-width: 0 4px 4px 0; }

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
    /* No photo yet: the switch sits at the left edge; the photos button's room opens as photos arrive. */
    .photos-slot {
      display: flex;
      width: 0;
      margin-right: -6px; /* cancels the bar's gap while empty */
      transition: width 300ms cubic-bezier(0.2, 0.8, 0.2, 1), margin 300ms cubic-bezier(0.2, 0.8, 0.2, 1);
    }
    .photos-slot.shown {
      width: 48px;
      margin-right: 0;
    }
    .bar .modes {
      justify-self: start;
    }
    .modes button {
      width: 70px;
      padding: 6px 8px;
      font-size: 0.88rem;
    }
    .icon-btn {
      width: 38px;
      height: 38px;
    }
    .bar-export {
      --pad-x: 14px;
      margin-left: 4px;
      padding: 8px var(--pad-x);
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
    /* Grab bar: says the tray can be pulled down. */
    .panel::before {
      content: "";
      flex: none;
      width: 36px;
      height: 4px;
      margin: 6px auto 0;
      border-radius: 2px;
      background: color-mix(in srgb, var(--text) 22%, transparent);
    }
    .panel:not(.open) {
      display: none;
    }
    /* While the tray's height animates, its content keeps its size and is clipped at the tool row. */
    .panel > :global(*) {
      flex-shrink: 0;
    }
    .panel .body {
      flex: none;
    }
    .rail {
      z-index: 2; /* the tray slides out from behind it */
    }
    /* One slim row: the grab bar in the middle, Revert and Done as round icon buttons on the right. */
    .panel {
      position: relative;
      --tray-max: max(26dvh, 200px); /* the tray's body at most (see .body) */
    }
    .panel::before {
      position: absolute;
      top: 6px;
      left: 50%;
      translate: -50% 0;
      margin: 0;
    }
    .panel-head {
      align-items: center;
      padding: 4px 10px 0 var(--sp-3);
    }
    .done,
    .revert {
      width: 36px;
      height: 36px;
      padding: 0;
    }
    .done :global(svg),
    .revert :global(svg) {
      width: 20px;
      height: 20px;
    }
    .revert .btn-label {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
    /* Phones: no explanations in the tray (each slider's ⓘ still has one); messages with a role stay. */
    .body :global(.hint:not([role]):not(.warn)) {
      display: none;
    }
    .panel-head h2 {
      font-size: 0.95rem;
    }
    .done {
      display: inline-flex;
    }
    .body {
      /* about a quarter of the screen at most: the photo is what you're looking at; on small phones enough
         for a tool's controls without scrolling (Crop's rotate row) */
      max-height: var(--tray-max);
      padding: var(--sp-1) var(--sp-3) var(--sp-2);
      gap: var(--sp-3);
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
