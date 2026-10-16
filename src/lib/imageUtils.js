// Canvas, colour and file-name helpers used by the editor. No component state in here.
import { extractPalette } from "./palette.js";

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

export function getContrastingColor(bgColor) {
  // 0.179 is where black and white give equal WCAG contrast ratios.
  return calculateLuminance(bgColor) > 0.179 ? "#000000" : "#ffffff";
}

// ─── EXIF Orientation Transformer (Auto-Rotation) ──────────────────────────
export function applyExifOrientation(source, orientation = 1) {
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
export function createProxyPreview(sourceCanvas, maxDim = 1080) {
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
export async function decodeUpright(blob) {
  try {
    return await createImageBitmap(blob, { imageOrientation: "from-image" });
  } catch {
    return await createImageBitmap(blob);
  }
}

// Dominant hue (saturation-weighted circular mean) tints the UI to match the photo; null when near-grey.
export function dominantHue(source) {
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
export function photoPalette(source) {
  const c = document.createElement("canvas");
  c.width = c.height = 40;
  const x = c.getContext("2d", { willReadFrequently: true });
  x.drawImage(source, 0, 0, 40, 40);
  return extractPalette(x.getImageData(0, 0, 40, 40).data, 5);
}

// ─── Filmstrip Thumbnail Generator ─────────────────────────────────────────
export function createThumbnail(baseCanvas) {
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
export function fmtExposure(et) {
  if (et == null) return "";
  return et >= 1 ? `${et}s` : `1/${Math.round(1 / et)}s`;
}

// ─── Saving and sharing ────────────────────────────────────────────────────
export const cleanName = (name, fallback) =>
  name.replace(/\.[^.]+$/, "").replace(/[^\p{L}\p{N}_\-\s]/gu, "").trim() || fallback;

export function sliceCanvas(canvas, n) {
  const w = Math.round(canvas.width / n);
  return Array.from({ length: n }, (_, i) => {
    const part = document.createElement("canvas");
    part.width = i === n - 1 ? canvas.width - w * i : w;
    part.height = canvas.height;
    part.getContext("2d").drawImage(canvas, w * i, 0, part.width, part.height, 0, 0, part.width, part.height);
    return part;
  });
}

// The built-in sample photo (a lake at sunset), painted rather than downloaded so it works offline.
export function paintSamplePhoto() {
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
  return c;
}
