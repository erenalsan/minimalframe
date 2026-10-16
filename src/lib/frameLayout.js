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
 * @param {(text: string, px: number, weight?: number) => number} o.measure  text width at a given size
 * @param {"stack"|"bar"} [o.style]  "bar": camera-brand bar (model and lens left; brand, divider and settings right)
 * @param {string} [o.brand]  brand wordmark for the bar, e.g. "SONY"
 */
/**
 * In a fixed ratio, which border the ratio fills by itself: "v" (top and bottom) for photos wider than
 * the ratio, "h" (sides) for taller ones. A user margin on that axis would only be swallowed by the
 * padding, so it is ignored, and the other border is the one the user sets. null when no fixed ratio.
 */
export function autoBorderAxis(srcW, srcH, ratio) {
  if (!ratio?.w) return null;
  return srcW / srcH >= ratio.w / ratio.h ? "v" : "h";
}

export function computeFrameLayout(srcW, srcH, lines, o) {
  const unit = Math.max(srcW, srcH) / 1080;
  const auto = autoBorderAxis(srcW, srcH, o.ratio);
  const padX = auto === "h" ? 0 : Math.round((srcW * o.marginH) / 100);
  const padY = auto === "v" ? 0 : Math.round((srcH * o.marginV) / 100);

  // Caption size; shrunk so the longest line is never wider than the photo.
  let size = 0, width = 0, blockH = 0, gap = 0, band = 0, bar = null;
  if (lines.length && o.style === "bar") {
    bar = barMetrics(srcW, lines, o.fontSize * unit, o);
    ({ size, width, blockH, gap } = bar);
    band = blockH + 2 * gap;
  } else if (lines.length) {
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
  if (band && bar) {
    const zoneStart = top ? 0 : imgY + srcH;
    const zoneEnd = top ? imgY : canvasH;
    const t = Math.min(1, Math.max(0, (top ? 100 - o.posY : o.posY) / 100));
    const y0 = zoneStart + gap + (zoneEnd - zoneStart - 2 * gap - blockH) * t; // top of the block
    caption = placeBar(bar, imgX, srcW, y0, lines);
  } else if (band) {
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

// ─── Camera-brand bar ────────────────────────────────────────────────────────
// Left: model (bold) over lens. Right: brand wordmark | divider | settings over date/note.
// Sized so the whole row fits inside the photo's width with an inset on both sides.
const SUB = 0.78; // second-row text size, relative to the first
const BRAND = 1.3; // wordmark size, relative to the first row

function barMetrics(srcW, lines, size0, o) {
  const left = lines.filter((l) => l.type === "model" || l.type === "lens");
  const right = lines.filter((l) => l.type === "settings" || l.type === "extra");
  const brand = (o.brand ?? "").trim();
  const inset = srcW * 0.03;
  const blockW = (block, size) =>
    Math.max(0, ...block.map((l, i) => o.measure(l.text, i ? size * SUB : size, i ? 400 : 600)));
  const widthAt = (size) => {
    const lw = blockW(left, size);
    const rw = blockW(right, size);
    const bw = brand ? o.measure(brand, size * BRAND, 800) : 0;
    const gaps = (left.length && (right.length || brand) ? 2 : 0) + (brand && right.length ? 2 : 0);
    return { lw, rw, bw, total: lw + rw + bw + gaps * size };
  };
  let size = size0;
  let w = widthAt(size);
  const maxW = srcW - 2 * inset;
  if (w.total > maxW) {
    size *= maxW / w.total; // every part scales with size, so this fits exactly
    w = widthAt(size);
  }
  const rows = Math.max(left.length, right.length, 1);
  const lineH = size * 1.45;
  const blockH = Math.max(rows === 2 ? lineH + size * SUB : size, brand ? size * BRAND : 0);
  return { left, right, brand, inset, size, lineH, rows, blockH, gap: size * 1.1, width: w.total, ...w };
}

function placeBar(m, imgX, srcW, top, lines) {
  const mid = top + m.blockH / 2;
  // A one-line block is centred on the row; a two-line block fills it.
  const rowsY = (block) =>
    block.length === 2 ? [mid - m.lineH / 2, mid + m.lineH / 2 - (m.size - m.size * SUB) / 2] : [mid];
  const rightX = imgX + srcW - m.inset;
  const brandRight = m.right.length ? rightX - m.rw - 2 * m.size : rightX;
  return {
    style: "bar",
    lines,
    size: m.size,
    sub: m.size * SUB,
    width: m.width,
    blockH: m.blockH,
    x: imgX + m.inset,
    y0: top,
    left: { x: imgX + m.inset, lines: m.left, ys: rowsY(m.left) },
    right: { x: rightX, lines: m.right, ys: rowsY(m.right) },
    brand: m.brand ? { x: brandRight, y: mid, text: m.brand, size: m.size * BRAND, width: m.bw } : null,
    divider: m.brand && m.right.length ? { x: rightX - m.rw - m.size, y1: mid - m.blockH / 2, y2: mid + m.blockH / 2 } : null,
  };
}
