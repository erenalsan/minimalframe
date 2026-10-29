import assert from 'node:assert/strict';
import { postSlides, composeLayout } from './dump.js';

// Slides: the cover first, then the photos grouped in order; a smaller last group.
const items = ['a', 'b', 'c', 'd', 'e'];
assert.deepEqual(postSlides(items, 'pairs', false).map((s) => s.items), [['a', 'b'], ['c', 'd'], ['e']]);
assert.deepEqual(postSlides(items, 'grid', true).map((s) => [s.cover, s.items.length]), [[true, 5], [false, 4], [false, 1]]);
assert.equal(postSlides(items, 'single', false).length, 5);
assert.equal(postSlides(['a'], 'single', true).length, 1, 'no cover for a single photo');

// Two portraits: side by side at the same height, nothing cropped, a small gap.
let L = composeLayout([{ w: 600, h: 900 }, { w: 800, h: 1000 }]);
assert.equal(L.h, 900);
assert.deepEqual([L.cells[0].w, L.cells[1].w, L.cells[1].h], [600, 720, 900]);
assert.equal(L.cells[1].x, 600 + 27);
assert.equal(L.w, 600 + 27 + 720);
assert.deepEqual([L.cells[1].sw, L.cells[1].sh], [800, 1000]);

// Two landscapes: one above the other at the same width.
L = composeLayout([{ w: 1200, h: 800 }, { w: 900, h: 600 }]);
assert.equal(L.w, 900);
assert.deepEqual(L.cells.map((c) => [c.y, c.w, c.h]), [[0, 900, 600], [627, 900, 600]]);

// Four: a 2×2 grid of 4:5 cells, centre-cropped, from the smallest photo.
L = composeLayout([{ w: 1200, h: 800 }, { w: 800, h: 1200 }, { w: 1000, h: 1000 }, { w: 900, h: 1350 }]);
const cw = 640, ch = 800; // the landscape limits it: 800 × 0.8
assert.ok(L.cells.every((c) => c.w === cw && c.h === ch));
assert.ok(L.cells.every((c) => Math.abs(c.sw / c.sh - 0.8) < 1e-9 && c.sx >= 0 && c.sy >= 0));
assert.equal(L.w, 2 * cw + Math.round(cw * 0.03));

// One photo: as it is.
L = composeLayout([{ w: 500, h: 400 }]);
assert.deepEqual([L.w, L.h, L.cells[0].sw], [500, 400, 500]);

console.log('dump: OK');
