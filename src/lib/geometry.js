/**
 * geometry.js — crop, straighten, quarter-turn rotation and flip.
 * Applied to the developed image (develop is per-pixel, so the order doesn't change the result).
 *
 * crop = { rot: 0–3 quarter turns clockwise, flip: mirror left↔right, angle: straighten in degrees (−45…45),
 *          x, y, w, h: crop rectangle as 0–1 fractions of the turned + straightened image,
 *          ratio: id of the locked crop ratio ("free", "orig", "1:1", …) }
 */

export const CROP_DEFAULT = Object.freeze({ rot: 0, flip: false, angle: 0, x: 0, y: 0, w: 1, h: 1, ratio: 'free' });

export const CROP_RATIOS = [
  { id: 'free', label: 'Free' },
  { id: 'orig', label: 'Original' },
  { id: '1:1', label: '1:1', w: 1, h: 1 },
  { id: '4:5', label: '4:5', w: 4, h: 5 },
  { id: '9:16', label: '9:16', w: 9, h: 16 },
  { id: '3:2', label: '3:2', w: 3, h: 2 },
  { id: '16:9', label: '16:9', w: 16, h: 9 },
];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const MIN = 0.05; // smallest crop side, as a fraction of the image

export const isIdentity = (c) =>
  !c || (!c.rot && !c.flip && !c.angle && c.x === 0 && c.y === 0 && c.w === 1 && c.h === 1);

/** Size after quarter turns. */
export const turnedSize = (w, h, rot) => (rot % 2 ? [h, w] : [w, h]);

/** Zoom that hides the empty corners when a w×h image is rotated by `deg`. */
export function straightenScale(w, h, deg) {
  const a = Math.abs((deg * Math.PI) / 180);
  const c = Math.cos(a), s = Math.sin(a);
  return Math.max((w * c + h * s) / w, (w * s + h * c) / h);
}

/**
 * Crop rectangle aspect in normalized units (w/h of the 0–1 rect) for a ratio id, or null for free.
 * @param {string} ratioId
 * @param {number} W  turned image width
 * @param {number} H  turned image height
 */
export function normalizedAspect(ratioId, W, H) {
  if (ratioId === 'orig') return 1;
  const r = CROP_RATIOS.find((x) => x.id === ratioId);
  return r?.w ? (r.w / r.h) * (H / W) : null;
}

/** Largest centered rect with the given normalized aspect. */
export function fitRect(aspect) {
  if (!aspect) return { x: 0, y: 0, w: 1, h: 1 };
  let w = 1, h = 1 / aspect;
  if (h > 1) {
    h = 1;
    w = aspect;
  }
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
}

/**
 * Moves the whole rect ("move") or one corner ("nw", "ne", "sw", "se") by dx, dy (fractions of the image),
 * keeping the opposite corner fixed, the rect inside the image and, when `aspect` is set, its ratio.
 */
export function dragRect(r, handle, dx, dy, aspect) {
  if (handle === 'move') {
    return { ...r, x: clamp(r.x + dx, 0, 1 - r.w), y: clamp(r.y + dy, 0, 1 - r.h) };
  }
  const west = handle.includes('w');
  const north = handle.includes('n');
  const ax = west ? r.x + r.w : r.x; // fixed corner
  const ay = north ? r.y + r.h : r.y;
  const px = clamp((west ? r.x : r.x + r.w) + dx, 0, 1);
  const py = clamp((north ? r.y : r.y + r.h) + dy, 0, 1);
  const maxW = west ? ax : 1 - ax;
  const maxH = north ? ay : 1 - ay;
  let w = Math.max(MIN, west ? ax - px : px - ax);
  let h = Math.max(MIN, north ? ay - py : py - ay);
  if (aspect) {
    if (w / h > aspect) h = w / aspect;
    else w = h * aspect;
    const k = Math.min(1, maxW / w, maxH / h);
    w *= k;
    h *= k;
  } else {
    w = Math.min(w, maxW);
    h = Math.min(h, maxH);
  }
  return { ...r, x: west ? ax - w : ax, y: north ? ay - h : ay, w, h };
}

/**
 * Draws `src` (canvas or ImageBitmap) turned, flipped, straightened and cropped into `target`.
 * @returns {HTMLCanvasElement}
 */
export function applyGeometry(src, crop, target = document.createElement('canvas')) {
  const c = { ...CROP_DEFAULT, ...crop };
  const [W, H] = turnedSize(src.width, src.height, c.rot);
  target.width = Math.max(1, Math.round(c.w * W));
  target.height = Math.max(1, Math.round(c.h * H));
  const ctx = target.getContext('2d', { alpha: false });
  ctx.imageSmoothingQuality = 'high';
  ctx.translate(-c.x * W, -c.y * H);
  ctx.translate(W / 2, H / 2);
  ctx.rotate((c.angle * Math.PI) / 180);
  const s = straightenScale(W, H, c.angle);
  ctx.scale(s, s);
  if (c.flip) ctx.scale(-1, 1); // mirrors what you see, whatever the turn
  ctx.rotate((c.rot * Math.PI) / 2);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return target;
}
