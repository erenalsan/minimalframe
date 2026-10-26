/**
 * film.js — real film borders: the photo inside a 35 mm strip, an instant print, a darkroom print or a slide.
 * filmLayout() is pure (sizes only); drawFilm() paints the object. The object then takes the photo's place
 * in the normal frame layout, so ratio, border, caption and logo all work around it.
 *
 * Every size comes from a real film's millimetres scaled to the photo (u = px per mm), so preview and
 * full-size export match. The photo is never scaled or cropped; the border is built around it.
 */

// Instant prints: the format follows the photo's shape. Millimetres of the real film: image width,
// card border at the sides, top and bottom (the chin), corner radius.
const INSTANT = {
  square: { img: 79, side: 4.5, top: 6, bottom: 22, r: 1 },
  mini: { img: 46, side: 4, top: 7, bottom: 17, r: 3 },
  wide: { img: 99, side: 4.5, top: 7, bottom: 17, r: 3 },
};

/** The instant format for a photo of this shape. */
export const instantFormat = (w, h) => (w / h < 0.87 ? "mini" : w / h > 1.15 ? "wide" : "square");

/**
 * @param {string|null} style  "35mm" | "instant" | "darkroom" | "slide"; anything else → null
 * @param {number} w  photo width
 * @param {number} h  photo height
 * @param {number} [more]  35 mm: extra length at each end of the strip, px
 * @returns {null | { style, w, h, x, y, u, land?, format?, card?, chin? }}  object size, and where the photo goes
 */
export function filmLayout(style, w, h, more = 0) {
  if (style === "35mm") {
    // The photo is one frame of the strip: 36 mm along it, with 5.5 mm of rebate (sprocket holes and edge
    // print) on both long sides and, at each end, a 2 mm gap and 3 mm of the next frame (`more` px longer
    // ends show more of the next frames, so the strip can run to the edges of a fixed shape).
    const land = w >= h;
    const u = (land ? w : h) / 36;
    const end = 5 * u + more;
    const reb = 5.5 * u;
    return land
      ? { style, u, land, w: Math.round(w + 2 * end), h: Math.round(h + 2 * reb), x: Math.round(end), y: Math.round(reb) }
      : { style, u, land, w: Math.round(w + 2 * reb), h: Math.round(h + 2 * end), x: Math.round(reb), y: Math.round(end) };
  }
  if (style === "instant") {
    const format = instantFormat(w, h);
    const f = INSTANT[format];
    const u = w / f.img;
    const s = 3.5 * u; // room for the card's shadow
    const card = { x: s, y: s, w: w + 2 * f.side * u, h: h + (f.top + f.bottom) * u, r: f.r * u };
    return {
      style, u, format, card,
      chin: { y: s + (f.top * u) + h, h: f.bottom * u },
      w: Math.round(card.w + 2 * s), h: Math.round(card.h + 2 * s),
      x: Math.round(s + f.side * u), y: Math.round(s + f.top * u),
    };
  }
  if (style === "darkroom") {
    // A print from a filed-out negative carrier: a rough black edge around the whole frame.
    const u = Math.max(w, h) / 36;
    const pad = 2.5 * u; // 1.5 mm of black, 1 mm for its rough edge and the filed notches
    return { style, u, w: Math.round(w + 2 * pad), h: Math.round(h + 2 * pad), x: Math.round(pad), y: Math.round(pad) };
  }
  if (style === "slide") {
    // A 50 mm square mount with a 34 mm window.
    const u = Math.max(w, h) / 34;
    const s = 3 * u;
    const m = 50 * u;
    return { style, u, w: Math.round(m + 2 * s), h: Math.round(m + 2 * s), x: Math.round(s + (m - w) / 2), y: Math.round(s + (m - h) / 2) };
  }
  return null;
}

const STRIP = "#0b0b0c";
const EDGE_FONT = '"Archivo Variable", "Archivo", sans-serif';
const DX = [0.3, 0.3, 0.7, 0.3, 0.7, 0.7, 0.3, 0.3, 0.7, 0.3, 0.3, 0.7, 0.3, 0.7]; // DX barcode bar widths, mm

const dark = (hex) => {
  const n = parseInt(String(hex).slice(1, 7), 16) || 0;
  return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 < 128;
};
// Same pseudo-random edge at any size: the n-th bump of the darkroom border is always the same.
const rnd = (i) => {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};
/** Draws `img` to cover the box (centre crop). */
function cover(ctx, img, x, y, w, h) {
  const k = Math.max(w / img.width, h / img.height);
  const sw = w / k, sh = h / k;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

function photoIn(ctx, photo, x, y, r) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, photo.width, photo.height, r);
  ctx.clip();
  ctx.drawImage(photo, x, y);
  ctx.restore();
}

/** The orange date a compact camera burns into the corner of the picture ('26 7 19). */
function dateStamp(ctx, text, x, y, w, h) {
  if (!text) return;
  const s = Math.min(w, h) * 0.05;
  ctx.save();
  ctx.font = `700 ${s}px "Space Mono", monospace`;
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#ffb547";
  ctx.shadowColor = "rgb(255 120 30 / 0.85)";
  ctx.shadowBlur = s * 0.3;
  ctx.globalAlpha = 0.92;
  ctx.fillText(text, x + w - s * 0.9, y + h - s * 0.8);
  ctx.restore();
}

function card(ctx, c, color, u) {
  ctx.save();
  ctx.shadowColor = "rgb(0 0 0 / 0.22)";
  ctx.shadowBlur = 2.5 * u;
  ctx.shadowOffsetY = u;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(c.x, c.y, c.w, c.h, c.r);
  ctx.fill();
  ctx.restore();
}

/**
 * Paints the film object of layout `L` (from filmLayout) at 0,0 of an empty, transparent `ctx` of L.w × L.h.
 * @param {object} o
 * @param {string} o.ink     35 mm edge print colour
 * @param {string} o.card    instant card / slide mount colour
 * @param {string} o.name    35 mm film name printed along the edge
 * @param {number} o.n       frame number
 * @param {CanvasImageSource|null} [o.prev]  35 mm: the photo before (its edge shows at the start of the strip)
 * @param {CanvasImageSource|null} [o.next]  … and the one after
 * @param {string} [o.stamp] date stamp text, or "" for none
 * @param {string} [o.month] slide mount: processing month ("JUL · 26")
 * @param {string} [o.note]  instant and slide: the handwritten line
 * @param {string} [o.font]  CSS font family for the handwritten line
 */
export function drawFilm(ctx, photo, L, o) {
  const { u, x, y } = L;
  const pw = photo.width, ph = photo.height;

  if (L.style === "35mm") {
    const { land } = L;
    // along / across the strip → canvas x / y
    const R = (a, c, la, lc) => (land ? [a, c, la, lc] : [c, a, lc, la]);
    const along = land ? L.w : L.h, across = land ? L.h : L.w;
    const a0 = land ? x : y, c0 = land ? y : x;
    const A = land ? pw : ph, C = land ? ph : pw;
    ctx.fillStyle = STRIP;
    ctx.fillRect(0, 0, L.w, L.h);
    // the frames before and after, cut off by the strip's ends
    for (const [img, start] of [[o.prev, a0 - 2 * u - A], [o.next, a0 + A + 2 * u]]) {
      if (!img?.width) continue;
      const [bx, by, bw, bh] = R(start, c0, A, C);
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, 0.35 * u);
      ctx.clip();
      cover(ctx, img, bx, by, bw, bh);
      ctx.restore();
    }
    photoIn(ctx, photo, x, y, 0.35 * u);
    dateStamp(ctx, o.stamp, x, y, pw, ph);

    // Sprocket holes, punched through so the background shows: 8 per frame, 4.75 mm apart, 2 mm from the edge.
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    const pitch = 4.75 * u, hl = 2.79 * u, hc = 1.98 * u, edge = 2 * u;
    for (let i = Math.floor(-(a0 + A / 2) / pitch) - 1; i * pitch < along - a0 - A / 2 + pitch; i++) {
      const ca = a0 + A / 2 + (i + 0.5) * pitch;
      if (ca + hl / 2 < 0 || ca - hl / 2 > along) continue;
      for (const cc of [edge, across - edge - hc]) ctx.roundRect(...R(ca - hl / 2, cc, hl, hc), 0.45 * u);
    }
    ctx.fill();
    ctx.restore();

    // Edge print between the holes and the film's edge, reading along the strip.
    ctx.fillStyle = o.ink;
    ctx.font = `condensed 700 ${1.4 * u}px ${EDGE_FONT}`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    const print = (text, a, far, max) => {
      const [px, py] = R(a, far ? across - u : u, 0, 0);
      ctx.save();
      ctx.translate(px, py);
      if (!land) ctx.rotate(Math.PI / 2);
      ctx.fillText(text, 0, 0, max);
      ctx.restore();
    };
    const n = Math.round(o.n) || 0;
    print(`▸ ${n}`, a0 + 0.6 * u);
    if (o.name?.trim()) print(o.name.trim().toUpperCase(), a0 + 9 * u, false, 15 * u);
    print(`▸ ${n}A`, a0 + 26 * u);
    print(`▸ ${n + 1}`, a0 + A + 2.6 * u);
    print(`${n}`, a0 + 19 * u, true);
    print(`${n}A`, a0 + A + 2.6 * u, true);
    let a = a0 + 1.5 * u;
    for (const bw of DX) {
      ctx.fillRect(...R(a, across - 1.45 * u, bw * u, 0.9 * u));
      a += (bw + 0.3) * u;
    }
    return;
  }

  if (L.style === "instant") {
    card(ctx, L.card, o.card, u);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, pw, ph, 0.3 * u);
    ctx.clip();
    ctx.drawImage(photo, x, y);
    // instant film's soft fall-off towards the edges
    const d = Math.hypot(pw, ph) / 2;
    const g = ctx.createRadialGradient(x + pw / 2, y + ph / 2, d * 0.55, x + pw / 2, y + ph / 2, d * 1.05);
    g.addColorStop(0, "rgb(20 10 0 / 0)");
    g.addColorStop(1, "rgb(20 10 0 / 0.3)");
    ctx.fillStyle = g;
    ctx.fillRect(x, y, pw, ph);
    ctx.strokeStyle = "rgb(0 0 0 / 0.16)";
    ctx.lineWidth = 0.25 * u;
    ctx.strokeRect(x, y, pw, ph);
    ctx.restore();
    dateStamp(ctx, o.stamp, x, y, pw, ph);
    if (o.note) {
      ctx.fillStyle = dark(o.card) ? "#efede6" : "#2f3a52";
      ctx.font = `400 ${L.chin.h * 0.34}px ${o.font}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(o.note, L.card.x + L.card.w / 2, L.chin.y + L.chin.h * 0.46, pw * 0.92);
    }
    return;
  }

  if (L.style === "darkroom") {
    const m = u; // the rough edge stays inside this margin
    const l = m, t = m, r = L.w - m, b = L.h - m;
    // Fine grit on a slow wobble: a hand-filed edge, thicker in some places than others.
    const step = 0.22 * u;
    let k = 1;
    const off = (p, side) => 0.12 * u * rnd(k++) + 0.3 * u * (0.5 + 0.5 * Math.sin(p / (3.7 * u) + side * 1.9));
    const pts = [];
    for (let p = l; p < r; p += step) pts.push([p, t - off(p, 0)]);
    for (let p = t; p < b; p += step) pts.push([r + off(p, 1), p]);
    for (let p = r; p > l; p -= step) pts.push([p, b + off(p, 2)]);
    for (let p = b; p > t; p -= step) pts.push([l - off(p, 3), p]);
    ctx.fillStyle = "#101011";
    ctx.beginPath();
    pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.closePath();
    // the notches filed into the carrier
    ctx.rect(l + (r - l) * 0.22, t - 0.65 * u, 1.2 * u, 0.7 * u);
    ctx.rect(r - 0.1 * u, t + (b - t) * 0.47, 0.6 * u, 1.1 * u);
    ctx.fill("nonzero");
    photoIn(ctx, photo, x, y, 0.45 * u);
    return;
  }

  if (L.style === "slide") {
    const s = 3 * u, M = 50 * u;
    const darkMount = dark(o.card);
    card(ctx, { x: s, y: s, w: M, h: M, r: 2 * u }, o.card, u);
    ctx.strokeStyle = darkMount ? "rgb(255 255 255 / 0.08)" : "rgb(0 0 0 / 0.08)";
    ctx.lineWidth = 0.12 * u;
    ctx.beginPath();
    ctx.roundRect(s + 2.6 * u, s + 2.6 * u, M - 5.2 * u, M - 5.2 * u, 1.4 * u);
    ctx.stroke();
    ctx.fillStyle = STRIP;
    ctx.beginPath();
    ctx.roundRect(x - 0.15 * u, y - 0.15 * u, pw + 0.3 * u, ph + 0.3 * u, 0.7 * u);
    ctx.fill();
    photoIn(ctx, photo, x, y, 0.6 * u);
    dateStamp(ctx, o.stamp, x, y, pw, ph);
    const ink = darkMount ? "#e9e6dc" : "#2c2b28";
    ctx.fillStyle = ink;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.font = `condensed 700 ${2.1 * u}px ${EDGE_FONT}`;
    ctx.fillText(`${Math.round(o.n) || 0}`, s + 5 * u, s + 5.5 * u);
    if (o.month) {
      ctx.textAlign = "right";
      ctx.font = `condensed 600 ${1.8 * u}px ${EDGE_FONT}`;
      ctx.fillText(o.month, s + M - 5 * u, s + 5.5 * u);
    }
    if (o.note) {
      ctx.textAlign = "left";
      ctx.fillStyle = darkMount ? "#efede6" : "#33405a";
      ctx.font = `400 ${3.4 * u}px ${o.font}`;
      ctx.fillText(o.note, s + 5 * u, s + M - 4.6 * u, M - 10 * u);
    }
    ctx.fillStyle = "#c2410c";
    ctx.beginPath();
    ctx.arc(s + 5.6 * u, s + M - 9.6 * u, 0.75 * u, 0, Math.PI * 2);
    ctx.fill();
  }
}
