import assert from 'node:assert/strict';
import { filmLayout, instantFormat } from './film.js';

// Every style: the photo sits whole inside the object, and the same photo at another resolution gets the
// same border (so the preview and the full-size export match).
const sizes = [[1080, 720], [720, 1080], [1000, 1000], [864, 1080], [1080, 608], [608, 1080], [3000, 2000]];
for (const style of ['35mm', 'instant', 'darkroom', 'slide']) {
  for (const [w, h] of sizes) {
    const L = filmLayout(style, w, h);
    const where = `${style} ${w}×${h}`;
    assert.ok(L.x > 0 && L.y > 0 && L.x + w < L.w && L.y + h < L.h, `photo outside the object: ${where}`);
    const big = filmLayout(style, w * 4, h * 4);
    assert.ok(Math.abs(big.w / (w * 4) - L.w / w) < 0.005 && Math.abs(big.h / (h * 4) - L.h / h) < 0.005, `border changes with size: ${where}`);
  }
}

// 35 mm: a strip that runs along the photo's long side, 5.5 mm of rebate each side of a 36 mm frame.
const land = filmLayout('35mm', 1080, 720);
assert.equal(land.land, true);
assert.equal(land.h, 720 + 2 * Math.round(1080 / 36 * 5.5));
assert.equal(land.w, 1080 + 2 * 150);
const tall = filmLayout('35mm', 720, 1080);
assert.equal(tall.land, false);
assert.deepEqual([tall.w, tall.h, tall.x, tall.y], [land.h, land.w, land.y, land.x]);
// Longer ends (to reach the edges of a fixed shape) add length only, and keep the photo centred.
const longer = filmLayout('35mm', 720, 1080, 100);
assert.deepEqual([longer.w, longer.h, longer.x, longer.y], [tall.w, tall.h + 200, tall.x, tall.y + 100]);

// Instant: the format follows the photo's shape; the chin is the card's widest border.
assert.equal(instantFormat(1000, 1000), 'square');
assert.equal(instantFormat(1080, 1350), 'mini');
assert.equal(instantFormat(1080, 720), 'wide');
for (const [w, h] of sizes) {
  const L = filmLayout('instant', w, h);
  assert.ok(L.chin.h > L.x - L.card.x && L.chin.h > L.y - L.card.y, `chin not the widest border: ${w}×${h}`);
  assert.ok(Math.abs(L.chin.y + L.chin.h - (L.card.y + L.card.h)) < 1, `chin not at the bottom: ${w}×${h}`);
}

// Slide: a square mount, photo in the middle.
const slide = filmLayout('slide', 1080, 720);
assert.equal(slide.w, slide.h);
assert.ok(Math.abs(slide.x - (slide.w - 1080) / 2) <= 1 && Math.abs(slide.y - (slide.h - 720) / 2) <= 1);

// No film style: no film object.
assert.equal(filmLayout(null, 100, 100), null);
assert.equal(filmLayout('polaroid', 100, 100), null);

console.log('film tests passed');
