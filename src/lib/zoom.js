// Pinch / double-tap zoom on the photo preview: a scale and a pan (screen pixels), applied as a CSS
// transform around the photo's centre. Points are relative to that (unzoomed) centre.

export const MAX_ZOOM = 4;
export const NO_ZOOM = { s: 1, x: 0, y: 0 };

/** Zoom to scale s while the content under point p stays under p. */
export function zoomAt(z, s, p) {
  s = Math.min(MAX_ZOOM, Math.max(1, s));
  const k = s / z.s;
  return { s, x: p.x - (p.x - z.x) * k, y: p.y - (p.y - z.y) * k };
}

/** Keep the zoomed photo covering its box: no pulling it past an edge. w, h: unzoomed size. */
export function clampPan(z, w, h) {
  const mx = ((z.s - 1) * w) / 2;
  const my = ((z.s - 1) * h) / 2;
  return { s: z.s, x: Math.min(mx, Math.max(-mx, z.x)), y: Math.min(my, Math.max(-my, z.y)) };
}
