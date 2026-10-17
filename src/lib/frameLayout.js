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
 * @param {"stack"|"bar"|"spread"} [o.style]  "bar": camera-brand bar (model and lens left; brand, divider and settings
 *   right). "spread": one slim row of settings spaced across the photo's width, camera name laid on the photo.
 * @param {boolean} [o.fill]  with a ratio: crop the photo to fill the frame instead of padding (carousels);
 *   the result then has crop = { sx, sy, sw, sh } (the part of the photo to draw) and the photo's size is sw × sh
 * @param {number} [o.fillX]  fill only: which part shows across, 0 (left edge) … 1 (right edge); 0.5 = centre
 * @param {number} [o.fillY]  fill only: which part shows up/down, 0 (top) … 1 (bottom); 0.5 = centre
 * @param {string|{ text: string, parts: { aspect: number, height: number }[] }} [o.brand]  the bar's brand: a text
 *   wordmark ("SONY"), or logos (see brandLogos.js) given by shape: width/height and height relative to text size
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

  // Caption size; shrunk so the longest line is never wider than the photo (w: the photo's width).
  const captionFor = (w, scale = 1) => {
    const fontPx = o.fontSize * unit * scale;
    if (lines.length && o.style === "spread") {
      const spread = spreadMetrics(w, lines, fontPx, o);
      // only the name on the photo: no caption border at all
      return { ...spread, band: spread.parts.length ? spread.blockH + 2 * spread.gap : 0, spread };
    }
    if (lines.length && o.style === "bar") {
      const bar = barMetrics(w, lines, fontPx, o);
      return { ...bar, band: bar.blockH + 2 * bar.gap, bar };
    }
    if (!lines.length) return { size: 0, width: 0, blockH: 0, gap: 0, band: 0 };
    let size = fontPx;
    let width = Math.max(...lines.map((l) => o.measure(l.text, size)));
    if (width > w * 0.96) {
      size *= (w * 0.96) / width;
      width = w * 0.96;
    }
    const blockH = (lines.length - 1) * size * 1.5 + size;
    const gap = size * 0.8;
    return { size, width, blockH, gap, band: blockH + 2 * gap }; // band: border needed to hold the caption
  };
  let cap = captionFor(srcW);
  const top = o.zone === "top";
  let canvasW, canvasH, imgX, imgY, crop = null;

  if (o.fill && o.ratio?.w) {
    // Fill (carousel): the canvas has the ratio's shape and the photo is cropped to exactly the space left
    // after an even border and the caption, so it spans every slide. A photo wider than the strip keeps its
    // full height and loses a little from its sides instead.
    const ar = o.ratio.w / o.ratio.h;
    const margins = (c, pad) => {
      const zone = c.band ? Math.ceil(Math.max(c.band, pad)) : pad;
      return top ? [zone, pad] : [pad, zone];
    };
    // Border and caption depend on the photo's width, and the width (for photos wider than the strip) on
    // them; a few rounds settle it.
    let w = srcW, h = srcH, pad = 0, mt = 0, mb = 0;
    for (let i = 0; i < 8; i++) {
      // Border as a share of the strip's height (its short side), so it stays slim on a long strip.
      // From pad = m × stripH and stripH = (w + 2·pad) / ar: pad = m·w / (ar − 2m).
      const m = o.marginH / 100;
      pad = Math.round((m * w) / Math.max(0.1, ar - 2 * m));
      cap = captionFor(w);
      // A long thin strip (many slides) can't hold a full-size caption: keep it to 30% of the strip's height.
      const stripH = (w + 2 * pad) / ar;
      // (Text already shrunk to fit the width only gets smaller once the requested size drops below that,
      // so shrink step by step until it fits.)
      for (let k = 1, j = 0; cap.band > stripH * 0.3 && j < 12; j++) cap = captionFor(w, (k *= (stripH * 0.3) / cap.band));
      [mt, mb] = margins(cap, pad);
      h = Math.round((w + 2 * pad) / ar) - mt - mb;
      if (h <= srcH) break; // tall enough: the photo keeps its full width
      const narrower = Math.round((srcH + mt + mb) * ar) - 2 * pad;
      if (narrower >= w) break;
      w = Math.max(1, narrower);
    }
    w = Math.max(1, Math.min(srcW, w));
    h = Math.max(1, Math.min(srcH, h));
    // Which part of the photo: 0 = left/top edge, 1 = right/bottom edge, 0.5 = centre (the default).
    const at = (v) => Math.min(1, Math.max(0, v ?? 0.5));
    crop = { sx: Math.round((srcW - w) * at(o.fillX)), sy: Math.round((srcH - h) * at(o.fillY)), sw: w, sh: h };
    srcW = w;
    srcH = h;
    canvasW = w + 2 * pad;
    canvasH = h + mt + mb;
    imgX = pad;
    imgY = mt;
  } else {
    let mTop = padY, mBottom = padY;
    if (cap.band) {
      const extra = o.ratioId === "orig" ? (srcH * o.captionSpace) / 100 : 0;
      const zone = Math.ceil(Math.max(cap.band, padY + extra));
      if (top) mTop = zone;
      else mBottom = zone;
    }
    canvasW = srcW + 2 * padX;
    canvasH = srcH + mTop + mBottom;
    imgX = padX;
    imgY = mTop;
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
  }
  const { size, width, blockH, gap, band, bar, spread } = cap;

  let caption = null;
  if (spread) {
    const zoneStart = top ? 0 : imgY + srcH;
    const zoneEnd = top ? imgY : canvasH;
    const t = Math.min(1, Math.max(0, (top ? 100 - o.posY : o.posY) / 100));
    const y0 = zoneStart + gap + (zoneEnd - zoneStart - 2 * gap - blockH) * t;
    caption = placeSpread(spread, imgX, imgY, srcW, srcH, y0, lines);
  } else if (band && bar) {
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
  return { canvasW, canvasH, imgX, imgY, caption, crop };
}

// ─── Camera-brand bar ────────────────────────────────────────────────────────
// Left: model (bold) over lens. Right: brand wordmark | divider | settings over date/note.
// Sized so the whole row fits inside the photo's width with an inset on both sides.
const SUB = 0.78; // second-row text size, relative to the first
const BRAND = 1.3; // wordmark size, relative to the first row
const LOGO_GAP = 0.45; // space between two logos (SONY  α), relative to text size

function barMetrics(srcW, lines, size0, o) {
  const left = lines.filter((l) => l.type === "model" || l.type === "lens");
  const right = lines.filter((l) => l.type === "settings" || l.type === "extra");
  const mark = typeof o.brand === "object" && o.brand ? o.brand : { text: o.brand ?? "", parts: [] };
  const text = (mark.text ?? "").trim();
  const parts = mark.parts ?? [];
  const brand = parts.length > 0 || text.length > 0;
  const brandW = (size) =>
    parts.length
      ? parts.reduce((w, p) => w + p.height * size * p.aspect, 0) + (parts.length - 1) * size * LOGO_GAP
      : text ? o.measure(text, size * BRAND, 800) : 0;
  const brandH = (size) => (parts.length ? Math.max(...parts.map((p) => p.height * size)) : size * BRAND);
  const inset = srcW * 0.03;
  const blockW = (block, size) =>
    Math.max(0, ...block.map((l, i) => o.measure(l.text, i ? size * SUB : size, i ? 400 : 600)));
  const widthAt = (size) => {
    const lw = blockW(left, size);
    const rw = blockW(right, size);
    const bw = brandW(size);
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
  const blockH = Math.max(rows === 2 ? lineH + size * SUB : size, brand ? brandH(size) : 0);
  return { left, right, brand, text, parts, inset, size, lineH, rows, blockH, gap: size * 1.1, width: w.total, ...w };
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
    brand: m.brand ? { x: brandRight, y: mid, text: m.text, size: m.size * BRAND, width: m.bw, parts: placeLogos(m, brandRight - m.bw, mid) } : null,
    divider: m.brand && m.right.length ? { x: rightX - m.rw - m.size, y1: mid - m.blockH / 2, y2: mid + m.blockH / 2 } : null,
  };
}

// Logos left to right, ending at the brand's right edge, each centred on the row.
function placeLogos(m, x, mid) {
  return m.parts.map((p) => {
    const h = p.height * m.size;
    const w = h * p.aspect;
    const placed = { name: p.name, tint: p.tint, x, y: mid - h / 2, w, h };
    x += w + m.size * LOGO_GAP;
    return placed;
  });
}

// ─── Spread ──────────────────────────────────────────────────────────────────
// A slim row under the photo with each setting spaced evenly across its width ("1/200   F/10   ISO 1600"),
// and the camera name (and lens) laid on the photo's bottom-right corner in white.
const OVER_MAX = 0.6; // the name on the photo never takes more than this share of the photo's width

function spreadMetrics(srcW, lines, size0, o) {
  const parts = lines.filter((l) => l.type === "settings" || l.type === "extra").flatMap((l) => l.parts ?? [l.text]);
  const over = lines.filter((l) => l.type === "model" || l.type === "lens");
  // Row text a little smaller than the stacked caption: it's one line of numbers.
  let size = size0 * 0.8;
  const widthsAt = (s) => parts.map((t) => o.measure(t, s, 500));
  let widths = widthsAt(size);
  const total = widths.reduce((a, b) => a + b, 0) + (parts.length + 1) * size * 1.2; // room for a clear gap
  if (total > srcW) {
    size *= srcW / total; // widths and gaps scale with size, so this fits exactly
    widths = widthsAt(size);
  }
  let overSize = size0 * 1.1;
  const overW = Math.max(0, ...over.map((l) => o.measure(l.text, l.type === "model" ? overSize : overSize * 0.75, l.type === "model" ? 600 : 400)));
  if (overW > srcW * OVER_MAX) overSize *= (srcW * OVER_MAX) / overW;
  return { parts, widths, over, overSize, size, blockH: size, gap: size * 0.9 };
}

function placeSpread(m, imgX, imgY, srcW, srcH, y0, lines) {
  const step = (srcW - m.widths.reduce((a, b) => a + b, 0)) / (m.parts.length + 1); // equal space around every item
  let x = imgX + step;
  const items = m.parts.map((text, i) => {
    const item = { text, x, width: m.widths[i] };
    x += m.widths[i] + step;
    return item;
  });
  const inset = srcW * 0.045;
  let y = imgY + srcH - inset;
  const overlay = [...m.over].reverse().map((l) => {
    const size = l.type === "model" ? m.overSize : m.overSize * 0.75;
    const line = { text: l.text, size, weight: l.type === "model" ? 600 : 400, y: y - size / 2 };
    y -= size * 1.45;
    return line;
  }).reverse();
  return {
    style: "spread",
    lines,
    size: m.size,
    y0,
    blockH: m.blockH,
    y: y0 + m.blockH / 2,
    items,
    overlay: { x: imgX + srcW - inset, lines: overlay },
  };
}
