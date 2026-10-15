/**
 * MinimalFrame — Analog Effects Engine
 * Pure Canvas 2D image processing for Film Grain and Black Mist / Soft Bloom
 * Optimized for high-resolution photo export (e.g., 24MP) with minimal memory footprint
 */

/**
 * Applies randomized monochrome film grain to a canvas in-place.
 * Optimized with inlined LCG PRNG for extreme throughput on 24MP+ images.
 * @param {HTMLCanvasElement} canvas
 * @param {number} intensity - 0 to 100
 */
export function applyFilmGrain(canvas, intensity) {
  if (!intensity || intensity <= 0) return canvas;

  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const len = data.length;

  // Maximum RGB delta scaled by intensity (up to ±58 at 100%)
  const maxDelta = (intensity / 100) * 58;
  const factor = maxDelta / 128;
  let seed = (Date.now() & 0xffff) + 1;

  // Ultra-fast inlined LCG loop: no function call overhead
  for (let i = 0; i < len; i += 4) {
    seed = (seed * 1664525 + 1013904223) | 0;
    const delta = ((seed >>> 24) - 128) * factor;
    data[i]     = Math.min(255, Math.max(0, data[i] + delta));     // R
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + delta)); // G
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + delta)); // B
    // data[i + 3] (Alpha) is preserved
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

/**
 * Applies a Soft Bloom / Black Mist diffusion filter to a canvas.
 * Simulates optical diffusion filters (Black Pro-Mist, CineBloom).
 * Downsamples the bloom buffer to ensure fast, memory-safe execution on 24MP images.
 * @param {HTMLCanvasElement} canvas
 * @param {number} intensity - 0 to 100
 */
export function applySoftBloom(canvas, intensity) {
  if (!intensity || intensity <= 0) return canvas;

  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const w = canvas.width;
  const h = canvas.height;

  // Performance optimization: downsample bloom buffer (max 1600px)
  const maxBloomDim = 1600;
  const downscale = Math.min(1, maxBloomDim / Math.max(w, h));
  const bloomW = Math.max(1, Math.round(w * downscale));
  const bloomH = Math.max(1, Math.round(h * downscale));

  const blurCanvas = document.createElement('canvas');
  blurCanvas.width = bloomW;
  blurCanvas.height = bloomH;
  const blurCtx = blurCanvas.getContext('2d');
  if (!blurCtx) return canvas;

  const blurRadius = Math.max(10, Math.round(Math.min(bloomW, bloomH) * 0.022));

  blurCtx.filter = `blur(${blurRadius}px)`;
  blurCtx.drawImage(canvas, 0, 0, bloomW, bloomH);

  // Composite the bloom over the original canvas at full resolution
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = Math.min(0.85, (intensity / 100) * 0.75);
  ctx.drawImage(blurCanvas, 0, 0, w, h);
  ctx.restore();

  // Free blurCanvas memory explicitly for mobile RAM safety
  blurCanvas.width = 0;
  blurCanvas.height = 0;

  return canvas;
}

/**
 * Combines Soft Bloom and Film Grain in order.
 * Bloom is applied first (so grain sits naturally on top of the diffused image).
 * @param {HTMLCanvasElement} canvas
 * @param {{ grain?: number, bloom?: number }} options
 * @returns {HTMLCanvasElement}
 */
export function applyAnalogEffects(canvas, { grain = 0, bloom = 0 } = {}) {
  if (!canvas) return canvas;
  if ((!grain || grain <= 0) && (!bloom || bloom <= 0)) return canvas;

  if (bloom > 0) {
    applySoftBloom(canvas, bloom);
  }

  if (grain > 0) {
    applyFilmGrain(canvas, grain);
  }

  return canvas;
}
