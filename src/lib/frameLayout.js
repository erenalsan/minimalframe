/**
 * frameLayout.js — where the photo and caption go inside the frame.
 * Pure function (no DOM) shared by the live preview and the full-resolution export, so both match.
 * Every size is proportional to the photo, so the same settings give the same result at any resolution.
 *
 * Guarantees: the caption is never wider than the photo, never covers it, and never leaves the canvas;
 * the border on the caption side grows to fit it.
 */

/**
 * @param {number} srcW  photo width
 * @param {number} srcH  photo height
 * @param {{ type: string, text: string }[]} lines  caption lines (empty = no caption)
 * @param {object} o
 * @param {number} o.marginH  side border, % of photo width
 * @param {number} o.marginV  top/bottom border, % of photo height
 * @param {string} o.ratioId  "orig" (photo + caption), "custom" (even border) or a fixed ratio id
 * @param {{ w: number|null, h: number|null }} [o.ratio]
 * @param {number} o.captionSpace  "orig" only: extra caption border, % of photo height
 * @param {number} o.fontSize  caption size in px at a 1080px long edge
 * @param {"top"|"bottom"} o.zone
 * @param {"left"|"center"|"right"} o.align
 * @param {number} o.posX  0–100 across the photo's width
 * @param {number} o.posY  0–100 inside the caption border (0 = next to the photo)
 * @param {(text: string, px: number) => number} o.measure  text width at a given size
 */
export function computeFrameLayout(srcW, srcH, lines, o) {
  const unit = Math.max(srcW, srcH) / 1080;
  const padX = Math.round((srcW * o.marginH) / 100);
  const padY = Math.round((srcH * o.marginV) / 100);

  // Caption size; shrunk so the longest line is never wider than the photo.
  let size = 0, width = 0, blockH = 0, gap = 0, band = 0;
  if (lines.length) {
    size = o.fontSize * unit;
    width = Math.max(...lines.map((l) => o.measure(l.text, size)));
    const maxW = srcW * 0.96;
    if (width > maxW) {
      size *= maxW / width;
      width = maxW;
    }
    blockH = (lines.length - 1) * size * 1.5 + size;
    gap = size * 0.8;
    band = blockH + 2 * gap; // border needed to hold the caption
  }

  const top = o.zone === "top";
  let mTop = padY, mBottom = padY;
  if (band) {
    const extra = o.ratioId === "orig" ? (srcH * o.captionSpace) / 100 : 0;
    const zone = Math.ceil(Math.max(band, padY + extra));
    if (top) mTop = zone;
    else mBottom = zone;
  }
  let canvasW = srcW + 2 * padX;
  let canvasH = srcH + mTop + mBottom;
  let imgX = padX;
  let imgY = mTop;
  if (o.ratio?.w) {
    // Pad out to the target ratio; extra space is shared, so the caption border only grows.
    const ar = o.ratio.w / o.ratio.h;
    if (canvasW / canvasH >= ar) {
      const h = Math.round(canvasW / ar);
      imgY += Math.floor((h - canvasH) / 2);
      canvasH = h;
    } else {
      const w = Math.round(canvasH * ar);
      imgX += Math.floor((w - canvasW) / 2);
      canvasW = w;
    }
  }

  let caption = null;
  if (band) {
    const zoneStart = top ? 0 : imgY + srcH;
    const zoneEnd = top ? imgY : canvasH;
    const t = Math.min(1, Math.max(0, (top ? 100 - o.posY : o.posY) / 100));
    const lo = zoneStart + gap + blockH / 2;
    const hi = zoneEnd - gap - blockH / 2;
    const centerY = lo + (hi - lo) * t;
    // Anchor across the photo, then keep the whole line inside the canvas.
    const left = o.align === "left" ? 0 : o.align === "center" ? width / 2 : width;
    const right = width - left;
    const x = Math.min(canvasW - gap - right, Math.max(gap + left, imgX + (srcW * o.posX) / 100));
    caption = { lines, size, width, x, y0: centerY - blockH / 2 + size / 2, lineH: size * 1.5, blockH };
  }
  return { canvasW, canvasH, imgX, imgY, caption };
}
