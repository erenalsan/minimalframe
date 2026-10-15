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
  } from "./lib/rawEngine.js";
  import { applyAnalogEffects } from "./lib/effectsEngine.js";

  // ─── Mode Navigation ───────────────────────────────────────────────────────
  // 'editor' = Color & Light Adjustments | 'framing' = Frame & EXIF Typography
  let activeTab = $state("framing");

  // ─── Batch / Multi-File State Management ───────────────────────────────────
  // Each item in filesList contains:
  // { id, file, name, baseImage, thumbUrl, isRaw, rawBadge, orientationTag, exifOverride }
  let filesList = $state([]);
  let activeImageIndex = $state(0);
  let isLoading = $state(false);
  let loadingStatus = $state("");
  let loadError = $state("");
  let isDragging = $state(false);

  // Active Item Helper
  const activeItem = $derived(
    filesList.length > 0 && activeImageIndex < filesList.length
      ? filesList[activeImageIndex]
      : null,
  );

  // Processed image for the active item (after color/light adjustments)
  let processedImage = $state.raw(null);

  // ─── Mode 1: Photo Editor State (Color, Light & Analog Effects) ─────────────
  let exposure = $state(0); // -2.0 to +2.0 EV
  let brightness = $state(0); // -100 to +100 %
  let contrast = $state(0); // -100 to +100 %
  let saturation = $state(0); // -100 to +100 %
  let filmGrain = $state(0); // 0 to 100 %
  let softBloom = $state(0); // 0 to 100 %

  function resetColorAdjustments() {
    exposure = 0;
    brightness = 0;
    contrast = 0;
    saturation = 0;
    filmGrain = 0;
    softBloom = 0;
  }

  function applyPresetLook(preset) {
    if (preset === "raw-fix") {
      exposure = 0.25;
      brightness = 5;
      contrast = 18;
      saturation = 14;
      filmGrain = 0;
      softBloom = 0;
    } else if (preset === "vivid") {
      exposure = 0.1;
      brightness = 0;
      contrast = 20;
      saturation = 35;
      filmGrain = 0;
      softBloom = 0;
    } else if (preset === "bw-contrast") {
      exposure = 0.05;
      brightness = 0;
      contrast = 35;
      saturation = -100;
      filmGrain = 20;
      softBloom = 0;
    } else if (preset === "warm") {
      exposure = 0.15;
      brightness = 6;
      contrast = 12;
      saturation = 22;
      filmGrain = 10;
      softBloom = 15;
    } else if (preset === "moody") {
      exposure = -0.3;
      brightness = -5;
      contrast = 25;
      saturation = -15;
      filmGrain = 25;
      softBloom = 30;
    }
  }

  // ─── Mode 2: Frame & EXIF State ────────────────────────────────────────────
  let customMarginH = $state(8); // Horizontal margin % (5 - 50%)
  let customMarginV = $state(8); // Vertical margin % (5 - 50%)

  const RATIOS = [
    { id: "orig", label: "Original Frame", w: null, h: null },
    { id: "1:1", label: "1:1 Square", w: 1, h: 1 },
    { id: "4:5", label: "4:5 Instagram", w: 4, h: 5 },
    { id: "9:16", label: "9:16 Story", w: 9, h: 16 },
    { id: "16:9", label: "16:9 Landscape", w: 16, h: 9 },
    { id: "3:2", label: "3:2 Print", w: 3, h: 2 },
    { id: "custom", label: "Custom Manual", w: null, h: null },
  ];
  let selectedRatioId = $state("orig");

  // Colors & Auto-Contrast
  let backgroundColor = $state("#ffffff");
  let textColor = $state("#000000");
  let autoContrast = $state(true);

  // EXIF Typography & Custom Fonts
  let showExif = $state(true);

  const SYSTEM_FONTS = [
    {
      id: "system",
      label: "System UI",
      css: "system-ui, -apple-system, sans-serif",
    },
    { id: "inter", label: "Inter", css: '"Inter", system-ui, sans-serif' },
    { id: "sans", label: "Sans-Serif", css: "sans-serif" },
    {
      id: "serif",
      label: "Serif (Editorial)",
      css: 'Georgia, Cambria, "Times New Roman", serif',
    },
    {
      id: "mono",
      label: "Monospace (Modern)",
      css: '"JetBrains Mono", Consolas, monospace',
    },
    {
      id: "impact",
      label: "Impact (Poster)",
      css: 'Impact, "Arial Black", sans-serif',
    },
    {
      id: "courier",
      label: "Courier New",
      css: '"Courier New", Courier, monospace',
    },
    {
      id: "playfair",
      label: "Classic Editorial",
      css: '"Playfair Display", Georgia, serif',
    },
  ];
  let selectedFontId = $state("inter");

  // Font Size: Dynamic vs Manual Override
  let autoFontSize = $state(true);
  let manualFontSize = $state(42);

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
  let textPosX = $state(8); // Horizontal % (0 - 100)
  let textPosY = $state(93); // Vertical % constrained to margin

  // Dynamic slider bounds based on imageRect (zero overlap)
  let ySliderMin = $state(86);
  let ySliderMax = $state(98);

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

  const BUILTIN_PRESETS = [
    {
      id: "preset_minimal_white",
      name: "Minimal Gallery",
      customMarginH: 8,
      customMarginV: 8,
      selectedRatioId: "orig",
      backgroundColor: "#ffffff",
      textColor: "#111111",
      autoContrast: true,
      textAlign: "left",
      textZone: "bottom",
      textPosX: 8,
      textPosY: 93,
      selectedFontId: "inter",
      autoFontSize: true,
      manualFontSize: 42,
      showExif: true,
      filmGrain: 0,
      softBloom: 0,
      logoScale: 12,
      logoOpacity: 85,
      logoPosX: 92,
      logoPosY: 93,
    },
    {
      id: "preset_editorial_dark",
      name: "Editorial Dark",
      customMarginH: 10,
      customMarginV: 10,
      selectedRatioId: "4:5",
      backgroundColor: "#121212",
      textColor: "#f0f0f5",
      autoContrast: true,
      textAlign: "center",
      textZone: "bottom",
      textPosX: 50,
      textPosY: 93,
      selectedFontId: "serif",
      autoFontSize: true,
      manualFontSize: 42,
      showExif: true,
      filmGrain: 15,
      softBloom: 20,
      logoScale: 10,
      logoOpacity: 70,
      logoPosX: 50,
      logoPosY: 7,
    },
    {
      id: "preset_square_exhibition",
      name: "Square Exhibition",
      customMarginH: 12,
      customMarginV: 12,
      selectedRatioId: "1:1",
      backgroundColor: "#f7f6f2",
      textColor: "#222222",
      autoContrast: true,
      textAlign: "center",
      textZone: "bottom",
      textPosX: 50,
      textPosY: 92,
      selectedFontId: "playfair",
      autoFontSize: true,
      manualFontSize: 46,
      showExif: true,
      filmGrain: 0,
      softBloom: 0,
      logoScale: 12,
      logoOpacity: 85,
      logoPosX: 90,
      logoPosY: 92,
    },
    {
      id: "preset_analog_cine",
      name: "Analog Cine 16:9",
      customMarginH: 6,
      customMarginV: 6,
      selectedRatioId: "16:9",
      backgroundColor: "#0a0a0c",
      textColor: "#e0e0ea",
      autoContrast: true,
      textAlign: "right",
      textZone: "bottom",
      textPosX: 92,
      textPosY: 94,
      selectedFontId: "mono",
      autoFontSize: true,
      manualFontSize: 38,
      showExif: true,
      filmGrain: 30,
      softBloom: 35,
      logoScale: 10,
      logoOpacity: 75,
      logoPosX: 8,
      logoPosY: 94,
    },
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
      filmGrain,
      softBloom,
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
    if (p.filmGrain !== undefined) filmGrain = p.filmGrain;
    if (p.softBloom !== undefined) softBloom = p.softBloom;

    updateProcessedImage();
    scheduleRender();
  }

  onMount(() => {
    loadPalettes();
    loadPresets();
  });

  // ─── Canvas Refs & Dimensions ──────────────────────────────────────────────
  let canvasEl = $state.raw(null);
  let canvasDisplayWidth = $state(0);
  let canvasDisplayHeight = $state(0);
  let jpegQuality = $state(0.95);

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
    return calculateLuminance(bgColor) > 0.45 ? "#000000" : "#ffffff";
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

        if (detectedOrientation === 1) {
          detectedOrientation = await getRawOrientation(arrayBuffer);
        }

        // 2. Pixel decoding: RAW vs Standard
        let decodedSource = null;
        let rawBadge = "";
        const isRaw = isRawFile(file.name);

        if (isRaw) {
          hasRaw = true;
          const info = getRawFormatInfo(file.name);
          rawBadge = `${info.brand} (${info.extension.toUpperCase()})`;
          const rawBlob = await processRawFile(file);
          decodedSource = await createImageBitmap(rawBlob);
        } else {
          const blob = new Blob([arrayBuffer], {
            type: file.type || "image/jpeg",
          });
          decodedSource = await createImageBitmap(blob);
        }

        // 3. Upright Full-Resolution Base Canvas (kept untouched in memory)
        const fullResCanvas = applyExifOrientation(
          decodedSource,
          detectedOrientation,
        );
        decodedSource.close?.();

        // 4. Scaled-Down Proxy Preview (Strictly max 1080p for mobile CPU efficiency)
        const proxyCanvas = createProxyPreview(fullResCanvas, 1080);

        // 5. Filmstrip Thumbnail (120px)
        const thumbUrl = createThumbnail(proxyCanvas);

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
          originalImage: fullResCanvas,       // 24MP full-res source untouched in memory for export
          originalImageBlob: file,            // Original file/blob preserved
          previewImage: proxyCanvas,          // Scaled-down proxy (max 1920px) for live preview
          baseImage: proxyCanvas,             // Backwards compatibility alias
          thumbUrl,
          isRaw,
          rawBadge,
          orientationTag: detectedOrientation,
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
      if (removed.originalImage) {
        removed.originalImage.width = 0;
        removed.originalImage.height = 0;
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
      if (item.originalImage) {
        item.originalImage.width = 0;
        item.originalImage.height = 0;
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

  // ─── Color & Light Engine (Proxy / Live Preview Only) ──────────────────────
  function updateProcessedImage() {
    // Live preview operates strictly on the proxy preview image!
    const base = activeItem?.previewImage || activeItem?.baseImage;
    if (!base) {
      processedImage = null;
      return;
    }

    const offscreen = document.createElement("canvas");
    offscreen.width = base.width;
    offscreen.height = base.height;
    const ctx = offscreen.getContext("2d", { alpha: false });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const exposureFactor = Math.pow(2, exposure);
    const totalBrightness = Math.max(
      0,
      Math.round((100 + brightness) * exposureFactor),
    );
    const totalContrast = Math.max(0, 100 + contrast);
    const totalSaturation = Math.max(0, 100 + saturation);

    ctx.filter = `brightness(${totalBrightness}%) contrast(${totalContrast}%) saturate(${totalSaturation}%)`;
    ctx.drawImage(base, 0, 0);

    // ZERO JS pixel math during live preview!
    // Film Grain and Soft Bloom are faked on the live preview via GPU-accelerated CSS overlays.
    // Heavy pixel-by-pixel applyAnalogEffects is executed strictly during full-resolution export.

    processedImage = offscreen;
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

  // ─── Text Placement & Bounds Clamping ──────────────────────────────────────
  function setAlignment(align) {
    textAlign = align;
    if (align === "left") {
      textPosX = Math.max(5, customMarginH);
    } else if (align === "center") {
      textPosX = 50;
    } else if (align === "right") {
      textPosX = Math.min(95, 100 - customMarginH);
    }
  }

  function setZone(zone) {
    textZone = zone;
    if (zone === "bottom") {
      textPosY = Math.max(ySliderMin, Math.min(93, ySliderMax));
    } else {
      textPosY = Math.max(ySliderMin, Math.min(5, ySliderMax));
    }
  }

  function resetTextPosition() {
    setAlignment(textAlign);
    if (textZone === "bottom") {
      textPosY = Math.max(ySliderMin, Math.min(93, ySliderMax));
    } else {
      textPosY = Math.max(ySliderMin, Math.min(5, ySliderMax));
    }
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

    const ctx = canvasEl.getContext("2d");
    const srcW = processedImage.width;
    const srcH = processedImage.height;

    // ── CASE A: Photo Editor Mode ──────────────────────────────────────────
    if (activeTab === "editor") {
      if (canvasEl.width !== srcW || canvasEl.height !== srcH) {
        canvasEl.width = srcW;
        canvasEl.height = srcH;
      }
      // Report full-resolution 24MP export dimensions to the UI badge
      const fullResW = activeItem.originalImage ? activeItem.originalImage.width : srcW;
      const fullResH = activeItem.originalImage ? activeItem.originalImage.height : srcH;
      canvasDisplayWidth = fullResW;
      canvasDisplayHeight = fullResH;

      ctx.drawImage(processedImage, 0, 0);
      return;
    }

    // ── CASE B: Frame & EXIF Mode ──────────────────────────────────────────
    const effMarginH = Math.max(5, customMarginH) / 100;
    const effMarginV = Math.max(5, customMarginV) / 100;

    const padX = Math.round(srcW * effMarginH);
    const padY = Math.round(srcH * effMarginV);

    let canvasW, canvasH;
    let imgX, imgY, drawW, drawH;
    drawW = srcW;
    drawH = srcH;

    const ratio = RATIOS.find((r) => r.id === selectedRatioId) || RATIOS[0];

    if (ratio.id === "custom") {
      canvasW = srcW + 2 * padX;
      canvasH = srcH + 2 * padY;
      imgX = padX;
      imgY = padY;
    } else if (ratio.id === "orig") {
      canvasW = srcW + 2 * padX;
      const extraBottom =
        showExif && textZone === "bottom" ? Math.round(srcH * 0.12) : 0;
      const extraTop =
        showExif && textZone === "top" ? Math.round(srcH * 0.12) : 0;
      canvasH = srcH + 2 * padY + extraBottom + extraTop;
      imgX = padX;
      imgY = padY + extraTop;
    } else {
      const minContentW = srcW + 2 * padX;
      const minContentH = srcH + 2 * padY;
      const targetAR = ratio.w / ratio.h;

      if (minContentW / minContentH >= targetAR) {
        canvasW = minContentW;
        canvasH = Math.round(minContentW / targetAR);
      } else {
        canvasH = minContentH;
        canvasW = Math.round(minContentH * targetAR);
      }

      imgX = Math.round((canvasW - drawW) / 2);
      imgY = Math.round((canvasH - drawH) / 2);
    }

    if (canvasEl.width !== canvasW || canvasEl.height !== canvasH) {
      canvasEl.width = canvasW;
      canvasEl.height = canvasH;
    }

    // Report full-resolution 24MP framed dimensions to the UI badge
    const fullSourceW = activeItem.originalImage ? activeItem.originalImage.width : srcW;
    const fullSourceH = activeItem.originalImage ? activeItem.originalImage.height : srcH;
    const fullScale = fullSourceW / srcW;
    canvasDisplayWidth = Math.round(canvasW * fullScale);
    canvasDisplayHeight = Math.round(canvasH * fullScale);

    // 1. Background Fill
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvasW, canvasH);

    // 2. Draw Processed Image
    ctx.drawImage(processedImage, imgX, imgY, drawW, drawH);

    // 3. EXIF Typography with Editable Overrides & Non-Overlapping Math
    const imageRect = {
      left: imgX,
      right: imgX + drawW,
      top: imgY,
      bottom: imgY + drawH,
    };

    if (showExif && activeItem.exifOverride && selectedExifCount > 0) {
      const exifLines = buildExifLines(activeItem.exifOverride, exifDisplay);
      if (exifLines.length > 0) {
        const basePx = Math.max(18, Math.min(68, Math.round(canvasW * 0.018)));
        const finalFontSize = autoFontSize
          ? Math.round(basePx * dynamicScaleFactor)
          : manualFontSize;

        const lineH = Math.round(finalFontSize * 1.55);
        const totalBlockH = (exifLines.length - 1) * lineH;
        const halfBlockH =
          Math.round(totalBlockH / 2) + Math.round(finalFontSize * 0.5);
        const padPx = 14;

        if (textZone === "bottom") {
          const minSafeY = Math.ceil(
            ((imageRect.bottom + halfBlockH + padPx) / canvasH) * 100,
          );
          const maxSafeY = Math.floor(
            ((canvasH - halfBlockH - padPx) / canvasH) * 100,
          );
          ySliderMin = Math.max(0, Math.min(minSafeY, 98));
          ySliderMax = Math.max(ySliderMin, Math.min(maxSafeY, 99));
        } else {
          const minSafeY = Math.ceil(((halfBlockH + padPx) / canvasH) * 100);
          const maxSafeY = Math.floor(
            ((imageRect.top - halfBlockH - padPx) / canvasH) * 100,
          );
          ySliderMin = Math.max(1, Math.min(minSafeY, 98));
          ySliderMax = Math.max(ySliderMin, Math.min(maxSafeY, 99));
        }

        const clampedYPercent = Math.max(
          ySliderMin,
          Math.min(textPosY, ySliderMax),
        );
        const anchorX = Math.round((textPosX / 100) * canvasW);
        const anchorY = Math.round((clampedYPercent / 100) * canvasH);

        let safeAnchorY = anchorY;
        if (textZone === "bottom") {
          safeAnchorY = Math.max(
            imageRect.bottom + halfBlockH + padPx,
            anchorY,
          );
        } else {
          safeAnchorY = Math.min(imageRect.top - halfBlockH - padPx, anchorY);
        }

        ctx.textAlign = textAlign;
        ctx.textBaseline = "middle";
        ctx.fillStyle = textColor;

        const selectedFontObj =
          SYSTEM_FONTS.find((f) => f.id === selectedFontId) || SYSTEM_FONTS[1];
        const fontCssFamily = selectedFontObj.css;

        const startY = safeAnchorY - Math.round(totalBlockH / 2);

        exifLines.forEach((line, i) => {
          const isModel = line.type === "model";
          const fw = isModel ? "600" : "400";
          const size = isModel
            ? finalFontSize
            : Math.round(finalFontSize * 0.88);
          ctx.font = `${fw} ${size}px ${fontCssFamily}`;
          ctx.fillText(line.text, anchorX, startY + i * lineH);
        });
      }
    }

    // 4. Personal Logo & Watermark
    if (logoImage) {
      drawLogoOnCanvas(ctx, canvasW, canvasH);
    }
  }

  // ─── Reactive State Subscriptions (rAF Throttled) ──────────────────────────
  $effect(() => {
    // When activeItem changes or color sliders move, schedule image update + canvas render
    const _ai = activeItem;
    const _exp = exposure;
    const _br = brightness;
    const _co = contrast;
    const _sa = saturation;

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

  // ─── Offscreen Canvas Generator for Guaranteed Export ───────────────────────
  function generateFramedCanvasForImage(processedCanvas, exifOverride) {
    if (!processedCanvas) return null;

    const srcW = processedCanvas.width;
    const srcH = processedCanvas.height;

    const effMarginH = Math.max(5, customMarginH) / 100;
    const effMarginV = Math.max(5, customMarginV) / 100;

    const padX = Math.round(srcW * effMarginH);
    const padY = Math.round(srcH * effMarginV);

    let canvasW, canvasH;
    let imgX, imgY, drawW, drawH;
    drawW = srcW;
    drawH = srcH;

    const ratio = RATIOS.find((r) => r.id === selectedRatioId) || RATIOS[0];

    if (ratio.id === "custom") {
      canvasW = srcW + 2 * padX;
      canvasH = srcH + 2 * padY;
      imgX = padX;
      imgY = padY;
    } else if (ratio.id === "orig") {
      canvasW = srcW + 2 * padX;
      const extraBottom =
        showExif && textZone === "bottom" ? Math.round(srcH * 0.12) : 0;
      const extraTop =
        showExif && textZone === "top" ? Math.round(srcH * 0.12) : 0;
      canvasH = srcH + 2 * padY + extraBottom + extraTop;
      imgX = padX;
      imgY = padY + extraTop;
    } else {
      const minContentW = srcW + 2 * padX;
      const minContentH = srcH + 2 * padY;
      const targetAR = ratio.w / ratio.h;

      if (minContentW / minContentH >= targetAR) {
        canvasW = minContentW;
        canvasH = Math.round(minContentW / targetAR);
      } else {
        canvasH = minContentH;
        canvasW = Math.round(minContentH * targetAR);
      }

      imgX = Math.round((canvasW - drawW) / 2);
      imgY = Math.round((canvasH - drawH) / 2);
    }

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = canvasW;
    exportCanvas.height = canvasH;
    const ctx = exportCanvas.getContext("2d");

    // Fill background
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Draw processed image
    ctx.drawImage(processedCanvas, imgX, imgY, drawW, drawH);

    // Draw EXIF typography
    const imageRect = {
      left: imgX,
      right: imgX + drawW,
      top: imgY,
      bottom: imgY + drawH,
    };

    if (showExif && exifOverride && selectedExifCount > 0) {
      const exifLines = buildExifLines(exifOverride, exifDisplay);
      if (exifLines.length > 0) {
        // Font sizing calibrated proportionally to canvas resolution
        const previewRefW = canvasEl?.width || 1920;
        const scaleFactor = canvasW / previewRefW;
        const basePx = Math.max(18, Math.round(canvasW * 0.018));
        const finalFontSize = autoFontSize
          ? Math.round(basePx * dynamicScaleFactor)
          : Math.max(12, Math.round(manualFontSize * scaleFactor));

        const lineH = Math.round(finalFontSize * 1.55);
        const totalBlockH = (exifLines.length - 1) * lineH;
        const halfBlockH =
          Math.round(totalBlockH / 2) + Math.round(finalFontSize * 0.5);
        const padPx = Math.round(14 * scaleFactor);

        const minSafeY =
          textZone === "bottom"
            ? Math.ceil(
                ((imageRect.bottom + halfBlockH + padPx) / canvasH) * 100,
              )
            : Math.ceil(((halfBlockH + padPx) / canvasH) * 100);
        const maxSafeY =
          textZone === "bottom"
            ? Math.floor(((canvasH - halfBlockH - padPx) / canvasH) * 100)
            : Math.floor(
                ((imageRect.top - halfBlockH - padPx) / canvasH) * 100,
              );

        const clampedYPercent = Math.max(
          minSafeY,
          Math.min(textPosY, maxSafeY),
        );
        const anchorX = Math.round((textPosX / 100) * canvasW);
        const anchorY = Math.round((clampedYPercent / 100) * canvasH);

        let safeAnchorY = anchorY;
        if (textZone === "bottom") {
          safeAnchorY = Math.max(
            imageRect.bottom + halfBlockH + padPx,
            anchorY,
          );
        } else {
          safeAnchorY = Math.min(imageRect.top - halfBlockH - padPx, anchorY);
        }

        ctx.textAlign = textAlign;
        ctx.textBaseline = "middle";
        ctx.fillStyle = textColor;

        const selectedFontObj =
          SYSTEM_FONTS.find((f) => f.id === selectedFontId) || SYSTEM_FONTS[1];
        const fontCssFamily = selectedFontObj.css;
        const startY = safeAnchorY - Math.round(totalBlockH / 2);

        exifLines.forEach((line, i) => {
          const isModel = line.type === "model";
          const fw = isModel ? "600" : "400";
          const size = isModel
            ? finalFontSize
            : Math.round(finalFontSize * 0.88);
          ctx.font = `${fw} ${size}px ${fontCssFamily}`;
          ctx.fillText(line.text, anchorX, startY + i * lineH);
        });
      }
    }

    // Draw Personal Logo & Watermark
    if (logoImage) {
      drawLogoOnCanvas(ctx, canvasW, canvasH);
    }

    return exportCanvas;
  }

  // ─── Heavy Full-Resolution Export Engine (Off-Screen 24MP Processing) ──────
  async function generateFullResExportCanvas(item, mode = "framed") {
    if (!item) return null;

    // 1. Obtain full-res base source canvas (untouched 24MP canvas)
    let sourceCanvas = item.originalImage || item.baseImage;
    if (!sourceCanvas && item.originalImageBlob) {
      try {
        const bitmap = await createImageBitmap(item.originalImageBlob);
        sourceCanvas = applyExifOrientation(bitmap, item.orientationTag || 1);
        bitmap.close?.();
      } catch (e) {
        console.warn("[MinimalFrame] Failed to decode originalImageBlob, using fallback:", e);
      }
    }
    if (!sourceCanvas) return null;

    const fullW = sourceCanvas.width;
    const fullH = sourceCanvas.height;

    // 2. Full-Resolution Color & Light Adjustment Canvas
    const colorCanvas = document.createElement("canvas");
    colorCanvas.width = fullW;
    colorCanvas.height = fullH;
    const colorCtx = colorCanvas.getContext("2d", { alpha: false });
    colorCtx.imageSmoothingEnabled = true;
    colorCtx.imageSmoothingQuality = "high";

    const exposureFactor = Math.pow(2, exposure);
    const totalBrightness = Math.max(
      0,
      Math.round((100 + brightness) * exposureFactor),
    );
    const totalContrast = Math.max(0, 100 + contrast);
    const totalSaturation = Math.max(0, 100 + saturation);

    colorCtx.filter = `brightness(${totalBrightness}%) contrast(${totalContrast}%) saturate(${totalSaturation}%)`;
    colorCtx.drawImage(sourceCanvas, 0, 0);

    // 3. Heavy Pixel Math (Film Grain & Soft Bloom) executed strictly on export!
    if (softBloom > 0 || filmGrain > 0) {
      applyAnalogEffects(colorCanvas, { grain: filmGrain, bloom: softBloom });
    }

    if (mode === "edited") {
      return colorCanvas;
    }

    // 4. Exact Percentage Framing & Scaled Fonts for Full Resolution
    const framed = generateFramedCanvasForImage(colorCanvas, item.exifOverride);
    // Explicitly free temporary colorCanvas memory
    colorCanvas.width = 0;
    colorCanvas.height = 0;
    return framed;
  }

  // ─── Single Image Downloader ───────────────────────────────────────────────
  async function downloadImage(mode = "auto") {
    if (!processedImage || !activeItem) return;

    isDownloading = true;
    downloadStatus = "Processing 24MP full-resolution export…";

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
      const filename = `${cleanName}${suffix}.jpg`;
      fallbackFilename = filename;

      let blob = null;
      try {
        blob = await new Promise((resolve) => {
          exportCanvas.toBlob((b) => resolve(b), "image/jpeg", jpegQuality);
        });
      } catch (blobErr) {
        console.warn(
          "[MinimalFrame] toBlob error, falling back to dataUrl:",
          blobErr,
        );
      }

      let downloadUrl;
      if (blob && blob.size > 0) {
        if (fallbackDownloadUrl && fallbackDownloadUrl.startsWith("blob:")) {
          URL.revokeObjectURL(fallbackDownloadUrl);
        }
        downloadUrl = URL.createObjectURL(blob);
      } else {
        downloadUrl = exportCanvas.toDataURL("image/jpeg", jpegQuality);
      }

      fallbackDownloadUrl = downloadUrl;

      // Chrome Android APK compliant download trigger with explicit .jpg extension
      const link = document.createElement("a");
      link.style.display = "none";
      link.href = downloadUrl;
      link.setAttribute("download", filename);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        link.remove();
        if (downloadUrl.startsWith("blob:")) {
          URL.revokeObjectURL(downloadUrl);
          if (fallbackDownloadUrl === downloadUrl) fallbackDownloadUrl = null;
        }
      }, 2000);

      downloadStatus = "✓ Downloaded (Full-Res)!";
      setTimeout(() => {
        downloadStatus = "";
      }, 4000);
    } catch (err) {
      console.error("[MinimalFrame] Download failed:", err);
      loadError = `Download failed: ${err.message}`;
      downloadStatus = "⚠️ Download error";
    } finally {
      isDownloading = false;
    }
  }

  // ─── Batch Export All (.zip) with JSZip ────────────────────────────────────
  async function exportBatch() {
    if (filesList.length === 0) return;

    isBatchExporting = true;
    const total = filesList.length;
    batchProgress = { current: 0, total, percent: 0, filename: "" };

    try {
      let zip = new JSZip();

      for (let i = 0; i < total; i++) {
        const item = filesList[i];
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
          activeTab === "editor" ? "edited" : "framed",
        );
        if (!exportCanvas) continue;

        // Convert to JPEG Blob
        const blob = await new Promise((resolve) => {
          exportCanvas.toBlob(resolve, "image/jpeg", jpegQuality);
        });

        if (blob) {
          const rawName = item.name.replace(/\.[^.]+$/, "");
          const cleanName =
            rawName.replace(/[^a-zA-Z0-9_\-\s]/g, "").trim() ||
            `photo_${i + 1}`;
          let entryName = `framed_${cleanName}.jpg`;
          if (!entryName.toLowerCase().endsWith(".jpg")) entryName += ".jpg";
          zip.file(entryName, blob);
        }
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

      downloadStatus = `✓ Exported ${total} photos in ZIP!`;
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

<!-- ═══════════════════════════════════════════════════════════════════════════
     TEMPLATE: Dual-Mode Desktop Dashboard with Filmstrip & Batch Export
════════════════════════════════════════════════════════════════════════════ -->

<main id="mf-app">
  <!-- ─── Top Navigation Bar ──────────────────────────────────────────────── -->
  <header class="mf-header">
    <div class="mf-logo" aria-label="MinimalFrame">
      <svg
        viewBox="0 0 28 28"
        fill="none"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <rect x="2" y="5" width="24" height="18" rx="3" />
        <rect x="5" y="8" width="14" height="11" rx="1.5" />
        <circle cx="22" cy="10" r="1.3" fill="currentColor" stroke="none" />
      </svg>
      <span>MinimalFrame</span>
    </div>

    <!-- Mode Switcher Tabs -->
    <div class="mf-nav-tabs" role="tablist" aria-label="Tool Modes">
      <button
        id="tab-editor"
        class="mf-tab-btn"
        class:active={activeTab === "editor"}
        onclick={() => {
          activeTab = "editor";
        }}
        role="tab"
        aria-selected={activeTab === "editor"}
      >
        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path
            fill-rule="evenodd"
            d="M4 2a2 2 0 00-2 2v11a3 3 0 106 0V4a2 2 0 00-2-2H4zm1 14a1 1 0 100-2 1 1 0 000 2zm5-1.757l4.9-4.9a2 2 0 000-2.828L13.485 5.1a2 2 0 00-2.828 0L10 5.757v8.486zM16 18H9.071l6-6H16a2 2 0 012 2v2a2 2 0 01-2 2z"
            clip-rule="evenodd"
          />
        </svg>
        <span>Photo Editor</span>
      </button>

      <button
        id="tab-framing"
        class="mf-tab-btn"
        class:active={activeTab === "framing"}
        onclick={() => {
          activeTab = "framing";
        }}
        role="tab"
        aria-selected={activeTab === "framing"}
      >
        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path
            d="M3 4a1 1 0 011-1h12a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm2 1v10h10V5H5z"
          />
        </svg>
        <span>Frame & EXIF</span>
      </button>
    </div>

    <!-- Header Status Indicator -->
    <div class="mf-header-status">
      {#if filesList.length > 0}
        <span class="mf-batch-count-pill" title="Total Loaded Photos">
          {filesList.length}
          {filesList.length === 1 ? "Photo" : "Photos"}
        </span>
      {/if}
      {#if activeItem?.rawBadge}
        <span class="mf-raw-pill">{activeItem.rawBadge}</span>
      {/if}
      {#if activeItem?.orientationTag > 1}
        <span class="mf-orient-pill" title="Auto-Rotated via EXIF Orientation">
          ↺ Auto-Rotated
        </span>
      {/if}
    </div>
  </header>

  <!-- ─── 100vh Desktop Dashboard Layout ──────────────────────────────────── -->
  <div class="mf-layout">
    <!-- ════════════════════ LEFT: Contextual Control Column ═════════════════ -->
    <aside class="mf-sidebar" aria-label="Controls">
      <!-- ── Section A: Photo Source (Batch & Drag-Drop) ──────────────────── -->
      <section class="mf-card" aria-labelledby="lbl-open">
        <div class="mf-card-title-row">
          <h2 class="mf-card-title" id="lbl-open">
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path
                d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"
              />
            </svg>
            Photos ({filesList.length})
          </h2>
          {#if filesList.length > 0}
            <button
              class="mf-btn-micro"
              onclick={clearAllImages}
            >
              Clear All
            </button>
          {/if}
        </div>

        <!-- svelte-ignore a11y_interactive_supports_focus -->
        <div
          id="drop-zone"
          class="mf-drop-zone"
          class:dragging={isDragging}
          class:loaded={filesList.length > 0}
          ondrop={onDrop}
          ondragover={onDragOver}
          ondragleave={onDragLeave}
          role="button"
          aria-label="Drop multiple images or click Browse"
          onkeydown={(e) => {
            if (e.key === "Enter" || e.key === " ")
              document.getElementById("mf-file-input").click();
          }}
          tabindex="0"
        >
          {#if isLoading}
            <span class="mf-spinner" role="status" aria-label="Loading"></span>
            <span class="dz-label">{loadingStatus || "Decoding photos…"}</span>
          {:else if filesList.length > 0}
            <svg
              class="dz-icon ok"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M8 12l3 3 5-5" />
            </svg>
            <span class="dz-filename">{activeItem?.name}</span>
            <span class="dz-hint">Drop more photos to add to batch</span>
          {:else}
            <svg
              class="dz-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.4"
              aria-hidden="true"
            >
              <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
            <span class="dz-label">Drop photos or RAW files</span>
            <span class="dz-hint"
              >Batch support: JPEG · PNG · ARW · CR2 · CR3 · DNG · NEF</span
            >
          {/if}

          <label for="mf-file-input" class="mf-browse-label"
            >Browse Files…</label
          >
          <input
            id="mf-file-input"
            type="file"
            multiple
            accept=".jpg,.jpeg,.png,.webp,.avif,.arw,.cr2,.cr3,.dng,.nef,.orf,.raf,.rw2,.pef,.srw"
            onchange={onFileInput}
          />
        </div>

        {#if loadError}
          <div class="mf-alert-warn" role="alert">{loadError}</div>
        {/if}
      </section>

      <!-- ── Section: Layout Presets & Templates ──────────────────────────── -->
      <section class="mf-card" aria-labelledby="lbl-presets">
        <div class="mf-card-title-row">
          <h2 class="mf-card-title" id="lbl-presets">
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" />
            </svg>
            Presets & Templates
          </h2>
          <button
            class="mf-btn-micro highlight"
            onclick={() => {
              newPresetName = "";
              showSavePresetModal = true;
            }}
            title="Save current layout & effects as a reusable preset"
          >
            + Save Current
          </button>
        </div>

        <div class="mf-presets-container">
          <div class="mf-preset-chips" role="group" aria-label="Layout Presets">
            {#each BUILTIN_PRESETS as p (p.id)}
              <button
                class="mf-preset-chip"
                onclick={() => applyPreset(p)}
                title="Apply {p.name}"
              >
                <span>{p.name}</span>
              </button>
            {/each}

            {#each userPresets as p (p.id)}
              <div class="mf-preset-chip-user">
                <button
                  class="mf-preset-chip custom"
                  onclick={() => applyPreset(p)}
                  title="Apply custom preset {p.name}"
                >
                  <span>★ {p.name}</span>
                </button>
                <button
                  class="mf-preset-del"
                  onclick={(e) => deletePreset(p.id, e)}
                  title="Delete preset"
                  aria-label="Delete preset">×</button
                >
              </div>
            {/each}
          </div>
        </div>
      </section>

      <!-- ═══════════ MODE 1: PHOTO EDITOR PANEL ═══════════ -->
      {#if activeTab === "editor"}
        <section class="mf-card" aria-labelledby="lbl-color-adjust">
          <div class="mf-card-title-row">
            <h2 class="mf-card-title" id="lbl-color-adjust">
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path
                  fill-rule="evenodd"
                  d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z"
                  clip-rule="evenodd"
                />
              </svg>
              Light & Color Engine
            </h2>
            <button class="mf-btn-micro" onclick={resetColorAdjustments}
              >Reset All</button
            >
          </div>

          <!-- Quick Looks -->
          <div class="mf-control-group">
            <span class="mf-group-label">Global Color Looks</span>
            <div class="mf-preset-pill-row">
              <button
                class="mf-pill-btn"
                onclick={() => applyPresetLook("raw-fix")}>✦ RAW Lift</button
              >
              <button
                class="mf-pill-btn"
                onclick={() => applyPresetLook("vivid")}>Vivid</button
              >
              <button
                class="mf-pill-btn"
                onclick={() => applyPresetLook("warm")}>Warm</button
              >
              <button
                class="mf-pill-btn"
                onclick={() => applyPresetLook("moody")}>Moody</button
              >
              <button
                class="mf-pill-btn"
                onclick={() => applyPresetLook("bw-contrast")}>B&W</button
              >
            </div>
          </div>

          <!-- Exposure Slider -->
          <div class="mf-slider-field">
            <div class="mf-slider-header">
              <label for="slider-exposure" class="mf-slider-label"
                >Exposure (EV)</label
              >
              <div class="mf-num-wrap">
                <input
                  id="exposure-num"
                  type="number"
                  min="-2"
                  max="2"
                  step="0.05"
                  bind:value={exposure}
                  class="mf-num-input"
                />
                <span class="mf-unit">EV</span>
              </div>
            </div>
            <input
              id="slider-exposure"
              type="range"
              min="-2"
              max="2"
              step="0.05"
              bind:value={exposure}
              aria-label="Exposure EV"
            />
          </div>

          <!-- Brightness Slider -->
          <div class="mf-slider-field">
            <div class="mf-slider-header">
              <label for="slider-brightness" class="mf-slider-label"
                >Brightness</label
              >
              <div class="mf-num-wrap">
                <input
                  id="brightness-num"
                  type="number"
                  min="-100"
                  max="100"
                  step="1"
                  bind:value={brightness}
                  class="mf-num-input"
                />
                <span class="mf-unit">%</span>
              </div>
            </div>
            <input
              id="slider-brightness"
              type="range"
              min="-100"
              max="100"
              step="1"
              bind:value={brightness}
              aria-label="Brightness"
            />
          </div>

          <!-- Contrast Slider -->
          <div class="mf-slider-field">
            <div class="mf-slider-header">
              <label for="slider-contrast" class="mf-slider-label"
                >Contrast</label
              >
              <div class="mf-num-wrap">
                <input
                  id="contrast-num"
                  type="number"
                  min="-100"
                  max="100"
                  step="1"
                  bind:value={contrast}
                  class="mf-num-input"
                />
                <span class="mf-unit">%</span>
              </div>
            </div>
            <input
              id="slider-contrast"
              type="range"
              min="-100"
              max="100"
              step="1"
              bind:value={contrast}
              aria-label="Contrast"
            />
          </div>

          <!-- Saturation Slider -->
          <div class="mf-slider-field">
            <div class="mf-slider-header">
              <label for="slider-saturation" class="mf-slider-label"
                >Saturation</label
              >
              <div class="mf-num-wrap">
                <input
                  id="saturation-num"
                  type="number"
                  min="-100"
                  max="100"
                  step="1"
                  bind:value={saturation}
                  class="mf-num-input"
                />
                <span class="mf-unit">%</span>
              </div>
            </div>
            <input
              id="slider-saturation"
              type="range"
              min="-100"
              max="100"
              step="1"
              bind:value={saturation}
              aria-label="Saturation"
            />
          </div>

          <!-- Analog Effects: Film Grain & Soft Bloom (Black Mist) -->
          <div class="mf-divider"></div>
          <div class="mf-section-subtitle">Analog Effects</div>

          <!-- Film Grain Slider -->
          <div class="mf-slider-field">
            <div class="mf-slider-header">
              <label for="slider-grain" class="mf-slider-label">Film Grain</label>
              <div class="mf-num-wrap">
                <input
                  id="grain-num"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  bind:value={filmGrain}
                  class="mf-num-input"
                />
                <span class="mf-unit">%</span>
              </div>
            </div>
            <input
              id="slider-grain"
              type="range"
              min="0"
              max="100"
              step="1"
              bind:value={filmGrain}
              aria-label="Film Grain"
            />
          </div>

          <!-- Soft Bloom (Black Mist) Slider -->
          <div class="mf-slider-field">
            <div class="mf-slider-header">
              <label for="slider-bloom" class="mf-slider-label">Soft Bloom (Black Mist)</label>
              <div class="mf-num-wrap">
                <input
                  id="bloom-num"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  bind:value={softBloom}
                  class="mf-num-input"
                />
                <span class="mf-unit">%</span>
              </div>
            </div>
            <input
              id="slider-bloom"
              type="range"
              min="0"
              max="100"
              step="1"
              bind:value={softBloom}
              aria-label="Soft Bloom (Black Mist)"
            />
          </div>

          <button
            class="mf-btn mf-btn-ghost full-width"
            onclick={() => {
              activeTab = "framing";
            }}
            style="margin-top: 6px;"
          >
            Proceed to Framing & EXIF →
          </button>
        </section>

        <!-- ═══════════ MODE 2: FRAME & EXIF PANEL ═══════════ -->
      {:else}
        <!-- Frame & Margins Card -->
        <section class="mf-card" aria-labelledby="lbl-frame">
          <div class="mf-card-title-row">
            <h2 class="mf-card-title" id="lbl-frame">
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path
                  d="M3 4a1 1 0 011-1h12a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm2 1v10h10V5H5z"
                />
              </svg>
              Frame & Margins
            </h2>
            <button class="mf-btn-micro" onclick={resetMargins}>Reset</button>
          </div>

          <!-- Presets -->
          <div
            class="mf-ratio-grid"
            role="group"
            aria-label="Aspect Ratio Presets"
          >
            {#each RATIOS as r (r.id)}
              <button
                id="ratio-{r.id}"
                class="mf-ratio-btn"
                class:active={selectedRatioId === r.id}
                onclick={() => {
                  selectedRatioId = r.id;
                }}
                aria-pressed={selectedRatioId === r.id}
              >
                {r.label}
              </button>
            {/each}
          </div>

          <!-- Horizontal Margin -->
          <div class="mf-slider-field">
            <div class="mf-slider-header">
              <label for="margin-h" class="mf-slider-label"
                >Horizontal Margin</label
              >
              <div class="mf-num-wrap">
                <input
                  id="margin-h-num"
                  type="number"
                  min="5"
                  max="50"
                  step="1"
                  bind:value={customMarginH}
                  class="mf-num-input"
                />
                <span class="mf-unit">%</span>
              </div>
            </div>
            <input
              id="margin-h"
              type="range"
              min="5"
              max="50"
              step="1"
              bind:value={customMarginH}
            />
          </div>

          <!-- Vertical Margin -->
          <div class="mf-slider-field">
            <div class="mf-slider-header">
              <label for="margin-v" class="mf-slider-label"
                >Vertical Margin</label
              >
              <div class="mf-num-wrap">
                <input
                  id="margin-v-num"
                  type="number"
                  min="5"
                  max="50"
                  step="1"
                  bind:value={customMarginV}
                  class="mf-num-input"
                />
                <span class="mf-unit">%</span>
              </div>
            </div>
            <input
              id="margin-v"
              type="range"
              min="5"
              max="50"
              step="1"
              bind:value={customMarginV}
            />
          </div>
        </section>

        <!-- EXIF Typography & Manual Editable Overrides -->
        <section class="mf-card" aria-labelledby="lbl-exif">
          <div class="mf-card-title-row">
            <h2 class="mf-card-title" id="lbl-exif">
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path
                  fill-rule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clip-rule="evenodd"
                />
              </svg>
              EXIF & Typography
            </h2>
            <label class="mf-toggle-compact" for="toggle-exif">
              <span class="mf-switch" class:on={showExif} aria-hidden="true">
                <span class="mf-switch-thumb"></span>
              </span>
              <input
                id="toggle-exif"
                type="checkbox"
                bind:checked={showExif}
                role="switch"
                class="sr-only"
              />
            </label>
          </div>

          {#if showExif}
            <!-- Font Family Selector -->
            <div class="mf-control-group">
              <label for="select-font-family" class="mf-group-label"
                >Font Family</label
              >
              <select
                id="select-font-family"
                class="mf-select-input"
                bind:value={selectedFontId}
              >
                {#each SYSTEM_FONTS as f (f.id)}
                  <option value={f.id}>{f.label}</option>
                {/each}
              </select>
            </div>

            <!-- Font Size -->
            <div class="mf-control-group">
              <div class="mf-group-header">
                <label for="manual-font-size" class="mf-group-label"
                  >Font Size</label
                >
                <button
                  class="mf-btn-micro"
                  class:active={autoFontSize}
                  onclick={() => {
                    autoFontSize = !autoFontSize;
                  }}
                >
                  {autoFontSize ? "✓ Auto-Scaled" : "Manual Override"}
                </button>
              </div>

              {#if autoFontSize}
                <div class="mf-auto-font-badge">
                  <span
                    >Dynamic Weight: {Math.round(
                      dynamicScaleFactor * 100,
                    )}%</span
                  >
                  <span class="mf-badge-detail"
                    >({selectedExifCount}/6 properties)</span
                  >
                </div>
              {:else}
                <div class="mf-slider-field">
                  <div class="mf-slider-header">
                    <span class="mf-slider-label">Manual Size (px)</span>
                    <div class="mf-num-wrap">
                      <input
                        id="manual-font-num"
                        type="number"
                        min="16"
                        max="120"
                        step="1"
                        bind:value={manualFontSize}
                        class="mf-num-input"
                      />
                      <span class="mf-unit">px</span>
                    </div>
                  </div>
                  <input
                    id="manual-font-size"
                    type="range"
                    min="16"
                    max="120"
                    step="1"
                    bind:value={manualFontSize}
                  />
                </div>
              {/if}
            </div>

            <!-- Manual Editable EXIF Overrides (Per-Image) -->
            {#if activeItem}
              <div class="mf-control-group">
                <div class="mf-group-header">
                  <span class="mf-group-label">Editable EXIF Metadata</span>
                  <span class="mf-edit-hint">Instant Canvas Sync</span>
                </div>

                <div class="mf-exif-inputs-list">
                  <div class="mf-input-row">
                    <label class="mf-input-lbl">
                      <input
                        type="checkbox"
                        bind:checked={exifDisplay.model}
                        class="mf-checkbox-mini"
                      />
                      Model
                    </label>
                    <input
                      type="text"
                      bind:value={activeItem.exifOverride.model}
                      placeholder="e.g. Sony A7 IV"
                      class="mf-text-input"
                    />
                  </div>

                  <div class="mf-input-row">
                    <label class="mf-input-lbl">
                      <input
                        type="checkbox"
                        bind:checked={exifDisplay.lens}
                        class="mf-checkbox-mini"
                      />
                      Lens
                    </label>
                    <input
                      type="text"
                      bind:value={activeItem.exifOverride.lens}
                      placeholder="e.g. Helios 44-2 58mm f/2"
                      class="mf-text-input"
                    />
                  </div>

                  <div class="mf-input-grid-2">
                    <div class="mf-input-row">
                      <label class="mf-input-lbl">
                        <input
                          type="checkbox"
                          bind:checked={exifDisplay.focalLength}
                          class="mf-checkbox-mini"
                        />
                        Focal
                      </label>
                      <input
                        type="text"
                        bind:value={activeItem.exifOverride.focalLength}
                        placeholder="58mm"
                        class="mf-text-input"
                      />
                    </div>
                    <div class="mf-input-row">
                      <label class="mf-input-lbl">
                        <input
                          type="checkbox"
                          bind:checked={exifDisplay.aperture}
                          class="mf-checkbox-mini"
                        />
                        Aperture
                      </label>
                      <input
                        type="text"
                        bind:value={activeItem.exifOverride.aperture}
                        placeholder="ƒ/2.0"
                        class="mf-text-input"
                      />
                    </div>
                  </div>

                  <div class="mf-input-grid-2">
                    <div class="mf-input-row">
                      <label class="mf-input-lbl">
                        <input
                          type="checkbox"
                          bind:checked={exifDisplay.shutterSpeed}
                          class="mf-checkbox-mini"
                        />
                        Shutter
                      </label>
                      <input
                        type="text"
                        bind:value={activeItem.exifOverride.shutterSpeed}
                        placeholder="1/500s"
                        class="mf-text-input"
                      />
                    </div>
                    <div class="mf-input-row">
                      <label class="mf-input-lbl">
                        <input
                          type="checkbox"
                          bind:checked={exifDisplay.iso}
                          class="mf-checkbox-mini"
                        />
                        ISO
                      </label>
                      <input
                        type="text"
                        bind:value={activeItem.exifOverride.iso}
                        placeholder="ISO 400"
                        class="mf-text-input"
                      />
                    </div>
                  </div>
                </div>
              </div>
            {/if}

            <!-- Alignment & Zone Selection -->
            <div class="mf-control-group">
              <span class="mf-group-label">Alignment & Margin Zone</span>
              <div
                class="mf-align-group"
                role="group"
                aria-label="Text Alignment"
              >
                <button
                  class="mf-align-btn"
                  class:active={textAlign === "left"}
                  onclick={() => setAlignment("left")}>Left</button
                >
                <button
                  class="mf-align-btn"
                  class:active={textAlign === "center"}
                  onclick={() => setAlignment("center")}>Center</button
                >
                <button
                  class="mf-align-btn"
                  class:active={textAlign === "right"}
                  onclick={() => setAlignment("right")}>Right</button
                >
              </div>

              <div class="mf-zone-group" role="group" aria-label="Margin Zone">
                <button
                  class="mf-zone-btn"
                  class:active={textZone === "bottom"}
                  onclick={() => setZone("bottom")}>Bottom Margin</button
                >
                <button
                  class="mf-zone-btn"
                  class:active={textZone === "top"}
                  onclick={() => setZone("top")}>Top Margin</button
                >
              </div>
            </div>

            <!-- Position Sliders (Zero Overlap) -->
            <div class="mf-control-group">
              <div class="mf-card-title-row">
                <span class="mf-group-label"
                  >Position (No-Overlap Constrained)</span
                >
                <button class="mf-btn-micro" onclick={resetTextPosition}
                  >Reset Pos</button
                >
              </div>

              <div class="mf-slider-field">
                <div class="mf-slider-header">
                  <label for="pos-x" class="mf-slider-label">X Position</label>
                  <div class="mf-num-wrap">
                    <input
                      id="pos-x-num"
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      bind:value={textPosX}
                      class="mf-num-input"
                    />
                    <span class="mf-unit">%</span>
                  </div>
                </div>
                <input
                  id="pos-x"
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  bind:value={textPosX}
                />
              </div>

              <div class="mf-slider-field">
                <div class="mf-slider-header">
                  <label for="pos-y" class="mf-slider-label">
                    Y Position <span class="mf-range-hint"
                      >({ySliderMin}% – {ySliderMax}%)</span
                    >
                  </label>
                  <div class="mf-num-wrap">
                    <input
                      id="pos-y-num"
                      type="number"
                      min={ySliderMin}
                      max={ySliderMax}
                      step="1"
                      bind:value={textPosY}
                      class="mf-num-input"
                    />
                    <span class="mf-unit">%</span>
                  </div>
                </div>
                <input
                  id="pos-y"
                  type="range"
                  min={ySliderMin}
                  max={ySliderMax}
                  step="1"
                  bind:value={textPosY}
                />
              </div>
            </div>
          {/if}
        </section>

        <!-- Colors & Auto-Contrast Card -->
        <section class="mf-card" aria-labelledby="lbl-colors">
          <h2 class="mf-card-title" id="lbl-colors">
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path
                d="M2 10a8 8 0 1116 0 4 4 0 01-8 4 2 2 0 00-2 2 8 8 0 01-6-6zm14-2a6 6 0 10-12 0c0 1.09.29 2.12.8 3A4 4 0 0110 9a4 4 0 014 3.47A6 6 0 0016 8z"
              />
            </svg>
            Colors & Contrast
          </h2>

          <label class="mf-checkbox-label mf-auto-contrast-row">
            <input
              type="checkbox"
              bind:checked={autoContrast}
              class="mf-checkbox"
            />
            <span class="mf-auto-contrast-text">
              Smart Auto-Contrast
              <span class="mf-lum-indicator">
                (Luminance: {Math.round(
                  calculateLuminance(backgroundColor) * 100,
                )}%)
              </span>
            </span>
          </label>

          <div class="mf-color-row">
            <div class="mf-color-field">
              <label for="color-bg" class="mf-color-field-label"
                >Background</label
              >
              <div class="mf-color-picker-wrap">
                <span
                  class="mf-color-swatch"
                  style="background:{backgroundColor}"
                ></span>
                <input
                  id="color-bg"
                  type="color"
                  bind:value={backgroundColor}
                  title="Background color"
                />
              </div>
              <code class="mf-color-hex">{backgroundColor}</code>
            </div>

            <div class="mf-color-field" class:disabled={autoContrast}>
              <label for="color-text" class="mf-color-field-label">
                EXIF Text {autoContrast ? "(Auto)" : ""}
              </label>
              <div class="mf-color-picker-wrap">
                <span class="mf-color-swatch" style="background:{textColor}"
                ></span>
                <input
                  id="color-text"
                  type="color"
                  bind:value={textColor}
                  disabled={autoContrast}
                  title="EXIF text color"
                />
              </div>
              <code class="mf-color-hex">{textColor}</code>
            </div>
          </div>

          <button
            id="btn-save-palette"
            class="mf-btn mf-btn-ghost full-width"
            onclick={savePalette}
          >
            Save Palette
          </button>

          {#if palettes.length > 0}
            <div class="mf-palette-row" role="list">
              {#each palettes as pal, i (i)}
                <div class="mf-pal-item" role="listitem">
                  <button
                    class="mf-pal-swatch"
                    style="background:{pal.bg}; --text-dot:{pal.text}"
                    onclick={() => applyPalette(pal)}
                    title="Apply: bg {pal.bg} · text {pal.text}"
                  >
                    <span class="pal-dot" style="background:{pal.text}"></span>
                  </button>
                  <button
                    class="mf-pal-del"
                    onclick={() => deletePalette(i)}
                    title="Remove">×</button
                  >
                </div>
              {/each}
            </div>
          {/if}
        </section>

        <!-- Personal Logo & Watermark Card -->
        <section class="mf-card" aria-labelledby="lbl-logo">
          <div class="mf-card-title-row">
            <h2 class="mf-card-title" id="lbl-logo">
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fill-rule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clip-rule="evenodd" />
              </svg>
              Logo & Watermark
            </h2>
            {#if logoImage}
              <button class="mf-btn-micro danger" onclick={removeLogo}>Remove</button>
            {/if}
          </div>

          {#if logoImage}
            <div class="mf-logo-active-box">
              <div class="mf-logo-preview-thumb">
                <img src={logoImage.src} alt="Uploaded logo" />
              </div>
              <div class="mf-logo-meta">
                <span class="mf-logo-name">{logoName || "Custom Watermark"}</span>
                <span class="mf-logo-dims">{logoImage.naturalWidth || logoImage.width} × {logoImage.naturalHeight || logoImage.height} px</span>
              </div>
            </div>

            <!-- Quick Placement Shortcuts -->
            <div class="mf-control-group">
              <span class="mf-group-label">Quick Placement</span>
              <div class="mf-preset-pill-row">
                <button class="mf-pill-btn" onclick={() => setLogoPreset("bottom-right")}>Bottom-R</button>
                <button class="mf-pill-btn" onclick={() => setLogoPreset("bottom-left")}>Bottom-L</button>
                <button class="mf-pill-btn" onclick={() => setLogoPreset("top-right")}>Top-R</button>
                <button class="mf-pill-btn" onclick={() => setLogoPreset("top-left")}>Top-L</button>
                <button class="mf-pill-btn" onclick={() => setLogoPreset("center")}>Center</button>
              </div>
            </div>

            <!-- Scale Slider -->
            <div class="mf-slider-field">
              <div class="mf-slider-header">
                <label for="logo-scale" class="mf-slider-label">Scale (Size)</label>
                <div class="mf-num-wrap">
                  <input
                    id="logo-scale-num"
                    type="number"
                    min="3"
                    max="45"
                    step="1"
                    bind:value={logoScale}
                    class="mf-num-input"
                  />
                  <span class="mf-unit">%</span>
                </div>
              </div>
              <input
                id="logo-scale"
                type="range"
                min="3"
                max="45"
                step="1"
                bind:value={logoScale}
              />
            </div>

            <!-- Opacity Slider -->
            <div class="mf-slider-field">
              <div class="mf-slider-header">
                <label for="logo-opacity" class="mf-slider-label">Opacity</label>
                <div class="mf-num-wrap">
                  <input
                    id="logo-opacity-num"
                    type="number"
                    min="5"
                    max="100"
                    step="1"
                    bind:value={logoOpacity}
                    class="mf-num-input"
                  />
                  <span class="mf-unit">%</span>
                </div>
              </div>
              <input
                id="logo-opacity"
                type="range"
                min="5"
                max="100"
                step="1"
                bind:value={logoOpacity}
              />
            </div>

            <!-- X Position Slider -->
            <div class="mf-slider-field">
              <div class="mf-slider-header">
                <label for="logo-pos-x" class="mf-slider-label">X Position</label>
                <div class="mf-num-wrap">
                  <input
                    id="logo-pos-x-num"
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    bind:value={logoPosX}
                    class="mf-num-input"
                  />
                  <span class="mf-unit">%</span>
                </div>
              </div>
              <input
                id="logo-pos-x"
                type="range"
                min="0"
                max="100"
                step="1"
                bind:value={logoPosX}
              />
            </div>

            <!-- Y Position Slider -->
            <div class="mf-slider-field">
              <div class="mf-slider-header">
                <label for="logo-pos-y" class="mf-slider-label">Y Position</label>
                <div class="mf-num-wrap">
                  <input
                    id="logo-pos-y-num"
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    bind:value={logoPosY}
                    class="mf-num-input"
                  />
                  <span class="mf-unit">%</span>
                </div>
              </div>
              <input
                id="logo-pos-y"
                type="range"
                min="0"
                max="100"
                step="1"
                bind:value={logoPosY}
              />
            </div>
          {:else}
            <!-- Logo Upload Trigger -->
            <div class="mf-logo-drop">
              <label for="mf-logo-input" class="mf-logo-upload-btn">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width: 22px; height: 22px; color: var(--accent-light);">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="2" x2="12" y2="15"/>
                </svg>
                <span>Upload Logo / Watermark</span>
                <span class="mf-logo-subtext">PNG, SVG, or WebP with transparency</span>
              </label>
              <input
                id="mf-logo-input"
                type="file"
                accept=".png,.svg,.webp,.jpg,.jpeg"
                onchange={onLogoInput}
                class="sr-only"
              />
            </div>
          {/if}
        </section>
      {/if}
    </aside>

    <!-- ════════════════════ RIGHT: Live Preview & Filmstrip ════════════════ -->
    <section class="mf-main" aria-label="Preview Dashboard">
      <div class="mf-preview-card">
        <!-- Top Bar with Mode Context & Resolution -->
        <div class="mf-card-header">
          <div class="mf-header-title-wrap">
            <h2 class="mf-card-title">
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                <path
                  fill-rule="evenodd"
                  d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
                  clip-rule="evenodd"
                />
              </svg>
              Live Preview
            </h2>
            <span class="mf-mode-tag">
              {activeTab === "editor"
                ? "Photo Editor Mode"
                : "Framed & EXIF Mode"}
            </span>
          </div>

          <div class="mf-card-header-right">
            {#if processedImage && canvasDisplayWidth}
              <span class="mf-canvas-dims">
                {canvasDisplayWidth} × {canvasDisplayHeight} px
              </span>
            {/if}
          </div>
        </div>

        <!-- Viewport (Proxy Live Canvas with GPU-Accelerated Overlays) -->
        <div class="mf-preview-viewport" id="preview-viewport">
          <div
            class="mf-canvas-container"
            style:display={processedImage ? "flex" : "none"}
            style:aspect-ratio={canvasEl && canvasEl.height > 0 ? `${canvasEl.width} / ${canvasEl.height}` : "auto"}
          >
            <canvas
              bind:this={canvasEl}
              id="mf-render-canvas"
              class="mf-preview-canvas"
              aria-label="Framed Live Preview"
            ></canvas>

            <!-- GPU-Accelerated Live Preview Soft Bloom (Zero JS Pixel Math) -->
            {#if softBloom > 0}
              <div
                class="mf-live-bloom-overlay"
                style:opacity={(softBloom / 100) * 0.85}
                style:filter={`blur(${Math.max(2, Math.round((softBloom / 100) * 12))}px)`}
                style:backdrop-filter={`blur(${Math.max(2, Math.round((softBloom / 100) * 10))}px) brightness(1.22)`}
                aria-hidden="true"
              ></div>
            {/if}

            <!-- GPU-Accelerated Live Preview Film Grain (Zero JS Pixel Math) -->
            {#if filmGrain > 0}
              <div
                class="mf-live-grain-overlay"
                style:opacity={(filmGrain / 100) * 0.75}
                aria-hidden="true"
              ></div>
            {/if}
          </div>
          {#if !processedImage}
            <div class="mf-preview-empty">
              <svg
                viewBox="0 0 64 64"
                fill="none"
                stroke="currentColor"
                stroke-width="1.1"
                aria-hidden="true"
              >
                <rect x="8" y="8" width="48" height="48" rx="6" />
                <circle cx="22" cy="24" r="5" />
                <path d="M8 44 l14-14 8 8 10-12 16 18" />
              </svg>
              <p>Drop photos or RAW files (.ARW, .CR2, .DNG) to start</p>
            </div>
          {/if}
        </div>

        <!-- ─── Horizontal Filmstrip Gallery ──────────────────────────────── -->
        {#if filesList.length > 0}
          <div class="mf-filmstrip-bar" aria-label="Loaded Photos Gallery">
            <div class="mf-filmstrip-track">
              {#each filesList as item, i (item.id)}
                <div
                  class="mf-filmstrip-item"
                  class:active={activeImageIndex === i}
                  role="button"
                  tabindex="0"
                  onclick={() => setActiveImage(i)}
                  onkeydown={(e) => {
                    if (e.key === "Enter" || e.key === " ") setActiveImage(i);
                  }}
                  title={item.name}
                >
                  <img
                    src={item.thumbUrl}
                    alt={item.name}
                    class="mf-filmstrip-thumb"
                  />
                  <span class="mf-filmstrip-num">{i + 1}</span>
                  {#if item.isRaw}
                    <span class="mf-filmstrip-raw-tag">RAW</span>
                  {/if}
                  <button
                    class="mf-filmstrip-del"
                    onclick={(e) => removeImage(i, e)}
                    title="Remove from batch"
                    aria-label="Remove image">×</button
                  >
                </div>
              {/each}

              <!-- Add More Button inside filmstrip -->
              <label
                for="mf-file-input"
                class="mf-filmstrip-add"
                title="Add more photos to batch"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path
                    fill-rule="evenodd"
                    d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
                    clip-rule="evenodd"
                  />
                </svg>
                <span>Add</span>
              </label>
            </div>
          </div>
        {/if}

        <!-- ─── Bottom Download & Batch Export Bar ────────────────────────── -->
        <div class="mf-download-bar">
          <div class="mf-quality-wrap">
            <label for="quality-range" class="mf-quality-label">
              Quality
              <strong>{Math.round(jpegQuality * 100)}%</strong>
            </label>
            <input
              id="quality-range"
              type="range"
              min="0.5"
              max="1"
              step="0.01"
              bind:value={jpegQuality}
            />
          </div>

          <!-- Single Download Button -->
          <button
            id="btn-download"
            class="mf-btn mf-btn-primary"
            onclick={() => downloadImage("framed")}
            disabled={!processedImage || isDownloading || isBatchExporting}
            title="Download active framed image"
          >
            {#if isDownloading}
              <span class="mf-spinner-sm" aria-hidden="true"></span>
              Exporting…
            {:else}
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path
                  fill-rule="evenodd"
                  d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
                  clip-rule="evenodd"
                />
              </svg>
              Download JPEG
            {/if}
          </button>

          <!-- Batch Export Button (JSZip) -->
          <button
            id="btn-batch-export"
            class="mf-btn mf-btn-accent"
            onclick={exportBatch}
            disabled={filesList.length === 0 ||
              isBatchExporting ||
              isDownloading}
            title="Export all loaded photos framed into a single .zip file"
          >
            {#if isBatchExporting}
              <span class="mf-spinner-sm" aria-hidden="true"></span>
              Batch ({batchProgress.current}/{batchProgress.total})
            {:else}
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path
                  fill-rule="evenodd"
                  d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
                  clip-rule="evenodd"
                />
              </svg>
              Batch Export All ({filesList.length}) (.zip)
            {/if}
          </button>

          {#if activeTab === "editor"}
            <button
              id="btn-download-edited"
              class="mf-btn mf-btn-ghost"
              onclick={() => downloadImage("edited")}
              disabled={!processedImage || isDownloading || isBatchExporting}
              title="Export color-adjusted photo without frame"
            >
              Export Unframed
            </button>
          {/if}

          {#if downloadStatus}
            <span class="mf-dl-status">{downloadStatus}</span>
          {/if}

          {#if fallbackDownloadUrl}
            <a
              id="btn-direct-download"
              href={fallbackDownloadUrl}
              download={fallbackFilename}
              class="mf-direct-link"
              title="Click to save directly"
            >
              💾 Save {fallbackFilename}
            </a>
          {/if}
        </div>
      </div>
    </section>
  </div>

  <!-- ─── Batch Export Progress Modal ─────────────────────────────────────── -->
  {#if isBatchExporting}
    <div
      class="mf-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Batch Export Progress"
    >
      <div class="mf-modal-card">
        <div class="mf-modal-header">
          <span class="mf-spinner" aria-hidden="true"></span>
          <h3>Batch Exporting Photos</h3>
        </div>
        <p class="mf-modal-status">
          Processing {batchProgress.current} of {batchProgress.total}…
        </p>
        <span class="mf-modal-file">{batchProgress.filename}</span>
        <div class="mf-progress-track">
          <div
            class="mf-progress-fill"
            style="width: {batchProgress.percent}%;"
          ></div>
        </div>
        <span class="mf-modal-note">{batchProgress.percent}% complete</span>
      </div>
    </div>
  {/if}

  <!-- ─── Save Preset Modal ──────────────────────────────────────────────── -->
  {#if showSavePresetModal}
    <div
      class="mf-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Save Current Preset"
      tabindex="-1"
      onclick={(e) => {
        if (e.target === e.currentTarget) showSavePresetModal = false;
      }}
      onkeydown={(e) => {
        if (e.key === "Escape") showSavePresetModal = false;
      }}
    >
      <div class="mf-modal-card">
        <div class="mf-modal-header">
          <svg viewBox="0 0 20 20" fill="currentColor" style="width: 20px; height: 20px; color: var(--accent-light);">
            <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z"/>
          </svg>
          <h3>Save Layout Preset</h3>
        </div>
        <p class="mf-modal-status">
          Save your current margins, aspect ratio, fonts, colors, analog effects, and logo setup to LocalStorage.
        </p>
        <input
          type="text"
          class="mf-text-input full-width"
          placeholder="e.g. Minimalist White Gallery"
          bind:value={newPresetName}
          onkeydown={(e) => {
            if (e.key === "Enter") saveCurrentPreset(newPresetName);
            if (e.key === "Escape") showSavePresetModal = false;
          }}
        />
        <div class="mf-modal-actions">
          <button
            class="mf-btn mf-btn-ghost"
            onclick={() => {
              showSavePresetModal = false;
            }}
          >
            Cancel
          </button>
          <button
            class="mf-btn mf-btn-primary"
            onclick={() => saveCurrentPreset(newPresetName)}
            disabled={!newPresetName.trim()}
          >
            Save Preset
          </button>
        </div>
      </div>
    </div>
  {/if}
</main>

<!-- ═══════════════════════════════════════════════════════════════════════════
     STYLES: Minimalist Dark Mode (#121212) & Filmstrip UI
════════════════════════════════════════════════════════════════════════════ -->
<style>
  :global(:root) {
    --bg: #121212;
    --surface: #18181c;
    --surface-2: #1e1e24;
    --surface-3: #262630;
    --border: rgba(255, 255, 255, 0.08);
    --border-hi: rgba(255, 255, 255, 0.15);
    --text: #e2e2ec;
    --text-dim: #88889c;
    --text-dimmer: #525268;
    --accent: #7c6ff5;
    --accent-light: #a899ff;
    --accent-glow: rgba(124, 111, 245, 0.24);
    --ok: #3ecf8e;
    --warn: #f6a623;
    --danger: #f87171;
    --radius: 10px;
    --radius-sm: 6px;
    --radius-xs: 4px;
    --shadow-md: 0 12px 36px rgba(0, 0, 0, 0.65);
    --transition: 0.15s ease;
    --font: "Inter", system-ui, -apple-system, sans-serif;
    --mono: "JetBrains Mono", "Fira Code", ui-monospace, monospace;
  }

  :global(*, *::before, *::after) {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }
  :global(html) {
    font-size: 14px;
    color-scheme: dark;
    overflow-x: hidden;
    width: 100%;
  }
  :global(body) {
    background: var(--bg);
    color: var(--text);
    font-family: var(--font);
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
    height: 100vh;
    overflow-x: hidden;
    width: 100%;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  #mf-app {
    height: 100vh;
    max-height: 100vh;
    display: flex;
    flex-direction: column;
    overflow-x: hidden;
    width: 100%;
    max-width: 100vw;
    box-sizing: border-box;
    padding: 0 16px;
    background: var(--bg);
    position: relative;
  }

  /* ── Header ──────────────────────────────────────────────────────────────── */
  .mf-header {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 48px;
    padding: 0 4px;
    border-bottom: 1px solid var(--border);
    gap: 12px;
  }

  .mf-logo {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 1rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: var(--text);
  }
  .mf-logo svg {
    width: 22px;
    height: 22px;
    color: var(--accent-light);
    flex-shrink: 0;
  }

  .mf-nav-tabs {
    display: flex;
    align-items: center;
    gap: 4px;
    background: var(--surface-2);
    padding: 3px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-hi);
  }

  .mf-tab-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 13px;
    border-radius: var(--radius-xs);
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--text-dim);
    cursor: pointer;
    transition: all var(--transition);
    border: 1px solid transparent;
  }
  .mf-tab-btn svg {
    width: 13px;
    height: 13px;
    opacity: 0.8;
  }
  .mf-tab-btn:hover {
    color: var(--text);
  }
  .mf-tab-btn.active {
    background: var(--surface-3);
    color: var(--accent-light);
    border-color: var(--border-hi);
    font-weight: 600;
  }

  .mf-header-status {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .mf-batch-count-pill {
    font-size: 0.65rem;
    font-weight: 600;
    color: var(--accent-light);
    background: rgba(124, 111, 245, 0.14);
    border: 1px solid rgba(124, 111, 245, 0.3);
    padding: 2px 7px;
    border-radius: var(--radius-xs);
    font-family: var(--mono);
  }

  .mf-raw-pill {
    font-size: 0.65rem;
    font-weight: 600;
    color: var(--ok);
    background: rgba(62, 207, 142, 0.12);
    border: 1px solid rgba(62, 207, 142, 0.3);
    padding: 2px 7px;
    border-radius: var(--radius-xs);
    font-family: var(--mono);
  }

  .mf-orient-pill {
    font-size: 0.65rem;
    font-weight: 600;
    color: var(--accent-light);
    background: rgba(124, 111, 245, 0.12);
    border: 1px solid rgba(124, 111, 245, 0.3);
    padding: 2px 7px;
    border-radius: var(--radius-xs);
    font-family: var(--mono);
  }

  /* ── Layout ──────────────────────────────────────────────────────────────── */
  .mf-layout {
    flex: 1;
    display: grid;
    grid-template-columns: 350px 1fr;
    gap: 14px;
    height: calc(100vh - 48px);
    min-height: 0;
    overflow: hidden;
    padding: 8px 0;
  }

  @media (max-width: 900px) {
    #mf-app {
      height: 100vh;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 0 8px;
    }
    .mf-layout {
      grid-template-columns: 100%;
      height: auto;
      overflow-x: hidden;
      gap: 10px;
    }
    .mf-sidebar {
      padding-right: 0;
      overflow-x: hidden;
    }
  }

  /* ── Left Sidebar ───────────────────────────────────────────────────────── */
  .mf-sidebar {
    height: 100%;
    overflow-y: auto;
    padding-right: 6px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .mf-sidebar::-webkit-scrollbar {
    width: 5px;
  }
  .mf-sidebar::-webkit-scrollbar-thumb {
    background: var(--surface-3);
    border-radius: 4px;
  }

  .mf-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .mf-card-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }

  .mf-card-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-dim);
    line-height: 1;
  }
  .mf-card-title svg {
    width: 13px;
    height: 13px;
    flex-shrink: 0;
    opacity: 0.7;
  }

  .mf-btn-micro {
    font-size: 0.66rem;
    font-weight: 500;
    color: var(--accent-light);
    background: transparent;
    padding: 2px 7px;
    border-radius: var(--radius-xs);
    border: 1px solid rgba(124, 111, 245, 0.25);
    cursor: pointer;
    transition: all var(--transition);
  }
  .mf-btn-micro:hover,
  .mf-btn-micro.active {
    background: var(--accent-glow);
    border-color: var(--accent);
  }

  /* ── Drop Zone ──────────────────────────────────────────────────────────── */
  .mf-drop-zone {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 12px 10px 38px;
    min-height: 94px;
    border: 1.5px dashed var(--border-hi);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text-dim);
    text-align: center;
    font-size: 0.78rem;
    outline: none;
    transition:
      border-color var(--transition),
      background var(--transition);
  }
  .mf-drop-zone:hover {
    border-color: var(--accent);
    background: rgba(124, 111, 245, 0.06);
  }
  .mf-drop-zone.dragging {
    border-color: var(--accent);
    background: rgba(124, 111, 245, 0.12);
    border-style: solid;
  }
  .mf-drop-zone.loaded {
    border-color: var(--ok);
    border-style: solid;
  }

  .dz-icon {
    width: 22px;
    height: 22px;
    opacity: 0.35;
  }
  .dz-icon.ok {
    opacity: 1;
    color: var(--ok);
    width: 18px;
    height: 18px;
  }
  .dz-label {
    font-size: 0.8rem;
    color: var(--text);
  }
  .dz-filename {
    font-size: 0.76rem;
    font-weight: 600;
    color: var(--ok);
    max-width: 240px;
    word-break: break-all;
  }
  .dz-hint {
    font-size: 0.67rem;
    opacity: 0.55;
  }

  .mf-browse-label {
    position: absolute;
    bottom: 6px;
    padding: 3px 12px;
    border-radius: var(--radius-sm);
    background: var(--surface-3);
    border: 1px solid var(--border-hi);
    color: var(--text);
    font-size: 0.72rem;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--transition);
  }
  .mf-browse-label:hover {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
  #mf-file-input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
    width: 0;
    height: 0;
  }

  .mf-spinner {
    width: 20px;
    height: 20px;
    border: 2px solid var(--border-hi);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: mf-spin 0.65s linear infinite;
  }
  @keyframes mf-spin {
    to {
      transform: rotate(360deg);
    }
  }

  .mf-alert-warn {
    padding: 8px 10px;
    border-radius: var(--radius-sm);
    background: rgba(246, 166, 35, 0.1);
    border: 1px solid rgba(246, 166, 35, 0.3);
    color: var(--warn);
    font-size: 0.74rem;
  }

  /* ── Presets & Pills ────────────────────────────────────────────────────── */
  .mf-preset-pill-row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .mf-pill-btn {
    padding: 4px 8px;
    border-radius: var(--radius-xs);
    background: var(--surface-2);
    border: 1px solid var(--border-hi);
    color: var(--text-dim);
    font-size: 0.7rem;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--transition);
  }
  .mf-pill-btn:hover {
    background: var(--surface-3);
    color: var(--accent-light);
    border-color: var(--accent);
  }

  /* ── Sliders & Controls ─────────────────────────────────────────────────── */
  .mf-control-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .mf-group-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .mf-group-label {
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .mf-edit-hint {
    font-size: 0.64rem;
    font-family: var(--mono);
    color: var(--ok);
  }

  .mf-slider-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .mf-slider-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .mf-slider-label {
    font-size: 0.72rem;
    color: var(--text);
    font-weight: 500;
  }
  .mf-range-hint {
    font-size: 0.66rem;
    color: var(--accent-light);
    font-family: var(--mono);
  }

  .mf-num-wrap {
    display: flex;
    align-items: center;
    gap: 2px;
    background: var(--surface-2);
    border: 1px solid var(--border-hi);
    border-radius: var(--radius-xs);
    padding: 1px 5px;
  }
  .mf-num-input {
    width: 36px;
    background: transparent;
    border: none;
    color: var(--accent-light);
    font-family: var(--mono);
    font-size: 0.74rem;
    font-weight: 600;
    text-align: right;
    outline: none;
  }
  .mf-num-input::-webkit-inner-spin-button {
    display: none;
  }
  .mf-unit {
    font-size: 0.68rem;
    font-family: var(--mono);
    color: var(--text-dimmer);
  }

  input[type="range"] {
    appearance: none;
    -webkit-appearance: none;
    width: 100%;
    height: 4px;
    border-radius: 2px;
    background: var(--surface-3);
    outline: none;
    cursor: pointer;
  }
  input[type="range"]::-webkit-slider-thumb {
    appearance: none;
    -webkit-appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--accent);
    border: 2px solid var(--accent-light);
    cursor: pointer;
    transition: transform var(--transition);
  }
  input[type="range"]::-webkit-slider-thumb:hover {
    transform: scale(1.2);
  }

  /* ── Dropdown Select ────────────────────────────────────────────────────── */
  .mf-select-input {
    width: 100%;
    padding: 5px 8px;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    border: 1px solid var(--border-hi);
    color: var(--text);
    font-family: var(--font);
    font-size: 0.75rem;
    outline: none;
    cursor: pointer;
  }
  .mf-select-input option {
    background: var(--surface-2);
    color: var(--text);
  }

  /* ── Presets Grid ───────────────────────────────────────────────────────── */
  .mf-ratio-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
  }
  .mf-ratio-btn {
    padding: 6px 4px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-hi);
    background: var(--surface-2);
    color: var(--text-dim);
    font-size: 0.72rem;
    text-align: center;
    cursor: pointer;
    transition: all var(--transition);
  }
  .mf-ratio-btn:hover {
    background: var(--surface-3);
    color: var(--text);
  }
  .mf-ratio-btn.active {
    background: var(--accent-glow);
    border-color: var(--accent);
    color: var(--accent-light);
    font-weight: 600;
  }

  /* ── Editable EXIF Metadata Inputs ──────────────────────────────────────── */
  .mf-exif-inputs-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: var(--surface-2);
    padding: 8px 10px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
  }

  .mf-input-row {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .mf-input-grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .mf-input-lbl {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 0.69rem;
    color: var(--text-dim);
    font-weight: 500;
    user-select: none;
    cursor: pointer;
  }

  .mf-checkbox-mini {
    appearance: none;
    -webkit-appearance: none;
    width: 13px;
    height: 13px;
    border: 1.5px solid var(--border-hi);
    border-radius: 3px;
    background: var(--surface-3);
    cursor: pointer;
    position: relative;
    flex-shrink: 0;
  }
  .mf-checkbox-mini:checked {
    background: var(--accent);
    border-color: var(--accent);
  }
  .mf-checkbox-mini:checked::after {
    content: "";
    position: absolute;
    top: 1px;
    left: 3px;
    width: 3px;
    height: 6px;
    border: solid #fff;
    border-width: 0 1.5px 1.5px 0;
    transform: rotate(45deg);
  }

  .mf-text-input {
    width: 100%;
    padding: 4px 7px;
    border-radius: var(--radius-xs);
    background: var(--surface-3);
    border: 1px solid var(--border-hi);
    color: var(--text);
    font-family: var(--font);
    font-size: 0.74rem;
    outline: none;
    transition: border-color var(--transition);
  }
  .mf-text-input:focus {
    border-color: var(--accent);
  }
  .mf-text-input::placeholder {
    color: var(--text-dimmer);
  }

  .mf-auto-font-badge {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 7px;
    background: rgba(124, 111, 245, 0.08);
    border: 1px solid rgba(124, 111, 245, 0.22);
    border-radius: var(--radius-xs);
    font-size: 0.69rem;
    font-family: var(--mono);
    color: var(--accent-light);
  }
  .mf-badge-detail {
    color: var(--text-dim);
    font-size: 0.64rem;
  }

  /* ── Alignment & Zone Buttons ───────────────────────────────────────────── */
  .mf-align-group,
  .mf-zone-group {
    display: grid;
    gap: 3px;
    background: var(--surface-2);
    padding: 3px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
  }
  .mf-align-group {
    grid-template-columns: 1fr 1fr 1fr;
  }
  .mf-zone-group {
    grid-template-columns: 1fr 1fr;
  }

  .mf-align-btn,
  .mf-zone-btn {
    padding: 5px 6px;
    border-radius: var(--radius-xs);
    font-size: 0.71rem;
    font-weight: 500;
    color: var(--text-dim);
    background: transparent;
    border: 1px solid transparent;
    cursor: pointer;
    transition: all var(--transition);
    text-align: center;
  }
  .mf-align-btn.active,
  .mf-zone-btn.active {
    background: var(--surface-3);
    color: var(--accent-light);
    border-color: var(--border-hi);
    font-weight: 600;
  }

  /* ── Colors & Auto Contrast ─────────────────────────────────────────────── */
  .mf-auto-contrast-row {
    background: rgba(124, 111, 245, 0.08);
    padding: 5px 7px;
    border-radius: var(--radius-xs);
    border: 1px solid rgba(124, 111, 245, 0.2);
  }
  .mf-auto-contrast-text {
    font-size: 0.71rem;
    font-weight: 600;
    color: var(--accent-light);
  }
  .mf-lum-indicator {
    font-size: 0.64rem;
    font-family: var(--mono);
    color: var(--text-dim);
    font-weight: 400;
  }

  .mf-color-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .mf-color-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .mf-color-field.disabled {
    opacity: 0.6;
    pointer-events: none;
  }
  .mf-color-field-label {
    font-size: 0.71rem;
    color: var(--text-dim);
    font-weight: 500;
  }

  .mf-color-picker-wrap {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .mf-color-swatch {
    width: 22px;
    height: 22px;
    border-radius: var(--radius-xs);
    border: 1px solid var(--border-hi);
    flex-shrink: 0;
  }
  input[type="color"] {
    appearance: none;
    -webkit-appearance: none;
    flex: 1;
    height: 26px;
    border: 1px solid var(--border-hi);
    border-radius: var(--radius-xs);
    background: var(--surface-2);
    padding: 1px 2px;
    cursor: pointer;
  }
  input[type="color"]::-webkit-color-swatch-wrapper {
    padding: 0;
  }
  input[type="color"]::-webkit-color-swatch {
    border: none;
    border-radius: 3px;
  }
  .mf-color-hex {
    font-size: 0.66rem;
    font-family: var(--mono);
    color: var(--text-dimmer);
  }

  .mf-palette-row {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .mf-pal-item {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .mf-pal-swatch {
    width: 26px;
    height: 26px;
    border-radius: var(--radius-sm);
    border: 2px solid rgba(255, 255, 255, 0.15);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .pal-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }
  .mf-pal-del {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--surface-3);
    color: var(--text-dim);
    font-size: 0.72rem;
    cursor: pointer;
    border: 1px solid var(--border-hi);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .mf-toggle-compact {
    display: flex;
    align-items: center;
    cursor: pointer;
  }
  .mf-switch {
    width: 32px;
    height: 18px;
    border-radius: 9px;
    background: var(--surface-3);
    border: 1px solid var(--border-hi);
    display: flex;
    align-items: center;
    padding: 1px;
    cursor: pointer;
    transition: background var(--transition);
  }
  .mf-switch.on {
    background: var(--accent);
    border-color: var(--accent);
  }
  .mf-switch-thumb {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--text-dim);
    transition: transform var(--transition);
  }
  .mf-switch.on .mf-switch-thumb {
    transform: translateX(14px);
    background: #fff;
  }

  /* ── Right Main Section ─────────────────────────────────────────────────── */
  .mf-main {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .mf-preview-card {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  .mf-card-header {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 14px;
    border-bottom: 1px solid var(--border);
  }

  .mf-header-title-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .mf-mode-tag {
    font-size: 0.64rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background: rgba(124, 111, 245, 0.18);
    color: var(--accent-light);
    border: 1px solid rgba(124, 111, 245, 0.35);
    padding: 1px 6px;
    border-radius: var(--radius-xs);
  }
  .mf-card-header-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .mf-canvas-dims {
    font-size: 0.71rem;
    font-family: var(--mono);
    color: var(--text-dimmer);
  }

  /* ── Viewport ───────────────────────────────────────────────────────────── */
  .mf-preview-viewport {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 14px;
    overflow: hidden;
    position: relative;
    background:
      radial-gradient(
        ellipse 60% 50% at 50% 50%,
        rgba(124, 111, 245, 0.03) 0%,
        transparent 70%
      ),
      repeating-conic-gradient(var(--surface-2) 0% 25%, var(--surface) 0% 50%) 0
        0 / 16px 16px;
  }

  .mf-canvas-container {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    max-width: 100%;
    max-height: 100%;
    width: auto;
    height: auto;
    line-height: 0;
    will-change: transform;
    transform: translateZ(0);
    backface-visibility: hidden;
  }

  .mf-preview-canvas {
    width: 100%;
    height: 100%;
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    box-shadow: var(--shadow-md);
    border-radius: 4px;
    display: block;
    will-change: transform;
    transform: translateZ(0);
    backface-visibility: hidden;
    animation: mf-fade-in 0.2s ease;
  }

  .mf-live-bloom-overlay {
    position: absolute;
    inset: 0;
    pointer-events: none;
    mix-blend-mode: screen;
    backdrop-filter: blur(10px) brightness(1.2);
    -webkit-backdrop-filter: blur(10px) brightness(1.2);
    border-radius: 4px;
    will-change: opacity, transform;
    transform: translateZ(0);
    transition: opacity 0.05s linear;
  }

  .mf-live-grain-overlay {
    position: absolute;
    inset: 0;
    pointer-events: none;
    mix-blend-mode: overlay;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
    background-repeat: repeat;
    background-size: 160px 160px;
    border-radius: 4px;
    will-change: opacity, transform;
    transform: translateZ(0);
    transition: opacity 0.05s linear;
  }

  @keyframes mf-fade-in {
    from {
      opacity: 0;
      transform: scale(0.99);
    }
  }

  .mf-preview-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    color: var(--text-dimmer);
    opacity: 0.5;
  }
  .mf-preview-empty svg {
    width: 52px;
    height: 52px;
  }
  .mf-preview-empty p {
    font-size: 0.82rem;
  }

  /* ── Filmstrip Bar ──────────────────────────────────────────────────────── */
  .mf-filmstrip-bar {
    flex-shrink: 0;
    height: 72px;
    background: var(--surface-2);
    border-top: 1px solid var(--border);
    padding: 7px 12px;
    overflow-x: auto;
    overflow-y: hidden;
    display: flex;
    align-items: center;
  }

  .mf-filmstrip-bar::-webkit-scrollbar {
    height: 4px;
  }
  .mf-filmstrip-bar::-webkit-scrollbar-thumb {
    background: var(--surface-3);
    border-radius: 2px;
  }

  .mf-filmstrip-track {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .mf-filmstrip-item {
    position: relative;
    width: 68px;
    height: 52px;
    border-radius: var(--radius-xs);
    overflow: hidden;
    background: var(--surface-3);
    border: 2px solid rgba(255, 255, 255, 0.1);
    cursor: pointer;
    flex-shrink: 0;
    transition: all var(--transition);
  }
  .mf-filmstrip-item:hover {
    border-color: var(--accent-light);
    transform: translateY(-1px);
  }
  .mf-filmstrip-item.active {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-glow);
  }

  .mf-filmstrip-thumb {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .mf-filmstrip-num {
    position: absolute;
    bottom: 2px;
    left: 3px;
    font-size: 0.58rem;
    font-family: var(--mono);
    color: #fff;
    background: rgba(0, 0, 0, 0.65);
    padding: 0 3px;
    border-radius: 2px;
    line-height: 1.2;
  }

  .mf-filmstrip-raw-tag {
    position: absolute;
    top: 2px;
    left: 2px;
    font-size: 0.54rem;
    font-family: var(--mono);
    font-weight: 700;
    color: var(--ok);
    background: rgba(0, 0, 0, 0.7);
    padding: 0 3px;
    border-radius: 2px;
    line-height: 1.2;
  }

  .mf-filmstrip-del {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 15px;
    height: 15px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.75);
    color: var(--text-dim);
    font-size: 0.72rem;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    opacity: 0;
    border: none;
    transition: all var(--transition);
  }
  .mf-filmstrip-item:hover .mf-filmstrip-del {
    opacity: 1;
  }
  .mf-filmstrip-del:hover {
    background: var(--danger);
    color: #fff;
  }

  .mf-filmstrip-add {
    width: 52px;
    height: 52px;
    border-radius: var(--radius-xs);
    border: 1.5px dashed var(--border-hi);
    background: rgba(255, 255, 255, 0.02);
    color: var(--text-dim);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    font-size: 0.65rem;
    cursor: pointer;
    flex-shrink: 0;
    transition: all var(--transition);
  }
  .mf-filmstrip-add svg {
    width: 14px;
    height: 14px;
  }
  .mf-filmstrip-add:hover {
    border-color: var(--accent);
    color: var(--accent-light);
    background: rgba(124, 111, 245, 0.06);
  }

  /* ── Download Bar ───────────────────────────────────────────────────────── */
  .mf-download-bar {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    padding: 9px 14px;
    border-top: 1px solid var(--border);
    background: var(--surface);
  }

  .mf-quality-wrap {
    display: flex;
    flex-direction: column;
    gap: 3px;
    max-width: 150px;
    flex: 1;
  }

  .mf-quality-label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.7rem;
    color: var(--text-dim);
    font-weight: 500;
  }
  .mf-quality-label strong {
    font-family: var(--mono);
    color: var(--accent-light);
    font-size: 0.73rem;
  }

  .mf-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    border-radius: var(--radius-sm);
    font-size: 0.78rem;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid transparent;
    transition: all var(--transition);
    white-space: nowrap;
  }
  .mf-btn svg {
    width: 13px;
    height: 13px;
  }

  .mf-btn-primary {
    background: var(--accent);
    color: #fff;
    border-color: var(--accent);
    box-shadow: 0 2px 10px var(--accent-glow);
  }
  .mf-btn-primary:hover:not(:disabled) {
    background: var(--accent-light);
    border-color: var(--accent-light);
    transform: translateY(-1px);
  }
  .mf-btn-primary:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .mf-btn-accent {
    background: rgba(62, 207, 142, 0.15);
    color: var(--ok);
    border-color: rgba(62, 207, 142, 0.35);
  }
  .mf-btn-accent:hover:not(:disabled) {
    background: var(--ok);
    color: #0c1a13;
    border-color: var(--ok);
    transform: translateY(-1px);
  }
  .mf-btn-accent:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .mf-btn-ghost {
    background: var(--surface-2);
    color: var(--text-dim);
    border-color: var(--border-hi);
  }
  .mf-btn-ghost:hover {
    background: var(--surface-3);
    border-color: var(--accent);
    color: var(--accent-light);
  }
  .mf-btn-ghost.full-width {
    width: 100%;
    justify-content: center;
  }

  .mf-spinner-sm {
    width: 13px;
    height: 13px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: mf-spin 0.65s linear infinite;
  }

  .mf-dl-status {
    font-size: 0.71rem;
    font-family: var(--mono);
    color: var(--ok);
    animation: mf-fade-in 0.2s ease;
  }

  .mf-direct-link {
    font-size: 0.71rem;
    font-family: var(--mono);
    color: var(--ok);
    text-decoration: none;
    cursor: pointer;
    padding: 3px 8px;
    background: rgba(62, 207, 142, 0.12);
    border: 1px solid rgba(62, 207, 142, 0.35);
    border-radius: var(--radius-xs);
    transition: all var(--transition);
    display: inline-flex;
    align-items: center;
    gap: 4px;
    animation: mf-fade-in 0.25s ease;
  }
  .mf-direct-link:hover {
    background: rgba(62, 207, 142, 0.25);
    color: #fff;
    border-color: var(--ok);
  }

  /* ── Modal Backdrop & Card ──────────────────────────────────────────────── */
  .mf-modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.72);
    backdrop-filter: blur(6px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 20px;
    animation: mf-fade-in 0.2s ease;
  }

  .mf-modal-card {
    background: var(--surface);
    border: 1px solid var(--border-hi);
    border-radius: var(--radius);
    padding: 24px;
    width: 100%;
    max-width: 420px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 12px;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.8);
  }

  .mf-modal-header {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .mf-modal-header h3 {
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--text);
  }

  .mf-modal-status {
    font-size: 0.8rem;
    color: var(--text-dim);
  }

  .mf-modal-file {
    font-size: 0.73rem;
    font-family: var(--mono);
    color: var(--accent-light);
    max-width: 360px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mf-progress-track {
    width: 100%;
    height: 8px;
    border-radius: 4px;
    background: var(--surface-3);
    overflow: hidden;
    border: 1px solid var(--border);
  }

  .mf-progress-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--accent) 0%, var(--ok) 100%);
    border-radius: 4px;
    transition: width 0.2s ease;
  }

  .mf-modal-note {
    font-size: 0.72rem;
    font-family: var(--mono);
    color: var(--text-dimmer);
  }

  /* ── Presets & Templates ─────────────────────────────────────────────────── */
  .mf-presets-container {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .mf-preset-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .mf-preset-chip {
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text-dim);
    font-size: 0.72rem;
    font-weight: 500;
    padding: 4px 10px;
    border-radius: var(--radius-xs);
    cursor: pointer;
    transition: all var(--transition);
    display: inline-flex;
    align-items: center;
  }
  .mf-preset-chip:hover {
    background: var(--surface-3);
    color: var(--text);
    border-color: var(--accent);
  }
  .mf-preset-chip.custom {
    background: rgba(124, 111, 245, 0.12);
    border-color: rgba(124, 111, 245, 0.35);
    color: var(--accent-light);
  }
  .mf-preset-chip-user {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    position: relative;
  }
  .mf-preset-del {
    background: transparent;
    border: none;
    color: var(--text-dimmer);
    font-size: 0.85rem;
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
    transition: color var(--transition);
  }
  .mf-preset-del:hover {
    color: var(--danger);
  }
  .mf-btn-micro.highlight {
    color: var(--accent-light);
    border-color: rgba(124, 111, 245, 0.4);
    background: rgba(124, 111, 245, 0.12);
  }
  .mf-btn-micro.highlight:hover {
    background: var(--accent);
    color: #fff;
  }
  .mf-btn-micro.danger {
    color: var(--danger);
    border-color: rgba(248, 113, 113, 0.3);
  }
  .mf-btn-micro.danger:hover {
    background: var(--danger);
    color: #fff;
  }

  /* ── Logo & Watermark ────────────────────────────────────────────────────── */
  .mf-logo-drop {
    display: flex;
    flex-direction: column;
    align-items: center;
    border: 1px dashed var(--border-hi);
    border-radius: var(--radius-sm);
    padding: 16px 12px;
    text-align: center;
    background: var(--surface-2);
    transition: border-color var(--transition);
  }
  .mf-logo-drop:hover {
    border-color: var(--accent);
  }
  .mf-logo-upload-btn {
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--text);
  }
  .mf-logo-subtext {
    font-size: 0.68rem;
    color: var(--text-dim);
    font-weight: 400;
  }
  .mf-logo-active-box {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    margin-bottom: 8px;
  }
  .mf-logo-preview-thumb {
    width: 38px;
    height: 38px;
    border-radius: var(--radius-xs);
    background: #202028;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    flex-shrink: 0;
    border: 1px solid var(--border);
  }
  .mf-logo-preview-thumb img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
  .mf-logo-meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
  }
  .mf-logo-name {
    font-size: 0.74rem;
    font-weight: 600;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mf-logo-dims {
    font-size: 0.66rem;
    font-family: var(--mono);
    color: var(--text-dim);
  }

  /* ── Subtitles & Dividers ────────────────────────────────────────────────── */
  .mf-divider {
    height: 1px;
    background: var(--border);
    margin: 12px 0 8px;
  }
  .mf-section-subtitle {
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--accent-light);
    margin-bottom: 6px;
  }
  .mf-modal-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    width: 100%;
    margin-top: 8px;
  }
</style>
