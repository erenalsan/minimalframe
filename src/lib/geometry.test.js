// Run: node src/lib/geometry.test.js
import assert from 'node:assert/strict';
import { dragRect, fitRect, normalizedAspect, straightenScale, turnedSize, isIdentity, CROP_DEFAULT } from './geometry.js';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const inside = (r) => r.x >= -1e-9 && r.y >= -1e-9 && r.x + r.w <= 1 + 1e-9 && r.y + r.h <= 1 + 1e-9;

assert.deepEqual(turnedSize(600, 400, 1), [400, 600]);
assert.deepEqual(turnedSize(600, 400, 2), [600, 400]);
assert.equal(straightenScale(600, 400, 0), 1);
assert.ok(straightenScale(600, 400, 10) > 1);
assert.ok(isIdentity(null) && isIdentity(CROP_DEFAULT) && !isIdentity({ ...CROP_DEFAULT, rot: 1 }));

// 4:5 on a 3:2 landscape: full height, 4/5 × 2/3 of the width.
const a45 = normalizedAspect('4:5', 600, 400);
const f = fitRect(a45);
assert.ok(near(f.h, 1) && near(f.w, (4 / 5) * (400 / 600)) && near(f.x, (1 - f.w) / 2));
assert.equal(normalizedAspect('free', 600, 400), null);

// Random drags never leave the image, never go below the minimum and keep a locked ratio.
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31) * 2 - 1;
for (const aspect of [null, a45, 1, 2.5]) {
  let r = { ...CROP_DEFAULT, ...fitRect(aspect) };
  for (let i = 0; i < 5000; i++) {
    const handle = ['move', 'nw', 'ne', 'sw', 'se'][i % 5];
    r = dragRect(r, handle, rnd() * 0.4, rnd() * 0.4, aspect);
    assert.ok(inside(r), `outside image: ${JSON.stringify(r)}`);
    assert.ok(r.w >= 0.05 - 1e-9 || (aspect && r.h >= 0.05 - 1e-9) || r.w >= 0.049, `too small: ${JSON.stringify(r)}`);
    if (aspect) assert.ok(near(r.w / r.h, aspect, 1e-6), `ratio lost: ${JSON.stringify(r)}`);
  }
}

// Dragging a corner keeps the opposite corner fixed.
const r0 = { x: 0.2, y: 0.2, w: 0.5, h: 0.5 };
const r1 = dragRect(r0, 'se', 0.1, 0.05, null);
assert.ok(near(r1.x, 0.2) && near(r1.y, 0.2) && near(r1.w, 0.6) && near(r1.h, 0.55));
const r2 = dragRect(r0, 'nw', -0.1, -0.1, null);
assert.ok(near(r2.x + r2.w, 0.7) && near(r2.y + r2.h, 0.7));

console.log('geometry: OK');
