/**
 * dump.js — a photo dump: several photos posted as one carousel, in the order you set.
 * Pure functions (no DOM): which photos go on which slide, and where each sits when several share a slide.
 * A shared slide is one picture (the photos joined with a gap); the frame then goes around it like any photo.
 */

/** Photos per slide for each layout. */
export const PER_SLIDE = { single: 1, pairs: 2, grid: 4 };

/**
 * The post's slides, in order: the cover (every photo on a contact sheet) first if wanted, then the photos
 * grouped by the layout. The last group may be smaller (5 photos in pairs: 2, 2, 1).
 * @returns {({ cover: true, items: any[] } | { cover: false, items: any[] })[]}
 */
export function postSlides(items, layout, cover) {
  const per = PER_SLIDE[layout] ?? 1;
  const slides = cover && items.length > 1 ? [{ cover: true, items }] : [];
  for (let i = 0; i < items.length; i += per) slides.push({ cover: false, items: items.slice(i, i + per) });
  return slides;
}

/**
 * Where each photo goes when several share a slide.
 * 2–3 photos: side by side at the same height, or one above the other at the same width when they are all
 * landscape (so they stay big). Nothing is cropped. 4 photos: a 2×2 grid of 4:5 cells, each photo
 * centre-cropped to fill its cell. Sizes come from the smallest photo, so nothing is enlarged.
 * @param {{ w: number, h: number }[]} sizes  the photos' sizes
 * @returns {{ w: number, h: number, cells: { x, y, w, h, sx, sy, sw, sh }[] }}  sx…sh: the part of the photo shown
 */
export function composeLayout(sizes) {
  const whole = (s) => ({ sx: 0, sy: 0, sw: s.w, sh: s.h });
  if (sizes.length === 1) return { w: sizes[0].w, h: sizes[0].h, cells: [{ x: 0, y: 0, w: sizes[0].w, h: sizes[0].h, ...whole(sizes[0]) }] };
  if (sizes.length >= 4) {
    const cw = Math.round(Math.min(...sizes.slice(0, 4).map((s) => Math.min(s.w, s.h * 0.8))));
    const ch = Math.round(cw / 0.8);
    const gap = Math.round(cw * 0.03);
    const cells = sizes.slice(0, 4).map((s, i) => {
      const k = Math.max(cw / s.w, ch / s.h); // cover
      const sw = cw / k, sh = ch / k;
      return { x: (i % 2) * (cw + gap), y: Math.floor(i / 2) * (ch + gap), w: cw, h: ch, sx: (s.w - sw) / 2, sy: (s.h - sh) / 2, sw, sh };
    });
    return { w: 2 * cw + gap, h: 2 * ch + gap, cells };
  }
  const stack = sizes.every((s) => s.w > s.h);
  const common = Math.min(...sizes.map((s) => (stack ? s.w : s.h)));
  const gap = Math.round(common * 0.03);
  let at = 0;
  const cells = sizes.map((s) => {
    const k = common / (stack ? s.w : s.h);
    const w = Math.round(s.w * k), h = Math.round(s.h * k);
    const cell = stack ? { x: 0, y: at, w, h } : { x: at, y: 0, w, h };
    at += (stack ? h : w) + gap;
    return { ...cell, ...whole(s) };
  });
  return stack ? { w: common, h: at - gap, cells } : { w: at - gap, h: common, cells };
}
