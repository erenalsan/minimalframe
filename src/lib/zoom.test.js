import assert from 'node:assert/strict';
import { zoomAt, clampPan, NO_ZOOM, MAX_ZOOM } from './zoom.js';

// The point under the fingers stays put: content point q = (p - pan) / s is the same before and after.
const p = { x: 40, y: -30 };
const z = zoomAt(NO_ZOOM, 2, p);
assert.deepEqual(z, { s: 2, x: -40, y: 30 });
const z2 = zoomAt(z, 3, p);
assert.equal((p.x - z2.x) / z2.s, (p.x - z.x) / z.s);
assert.equal((p.y - z2.y) / z2.s, (p.y - z.y) / z.s);

// Scale is kept between 1 and MAX_ZOOM; zooming back to 1 at the same point recentres.
assert.equal(zoomAt(NO_ZOOM, 10, p).s, MAX_ZOOM);
assert.deepEqual(zoomAt(z, 0.2, p), { s: 1, x: 0, y: 0 });

// Panning stops at the edges: at 2x a 100x200 photo can move 50 / 100 px each way.
assert.deepEqual(clampPan({ s: 2, x: 80, y: -500 }, 100, 200), { s: 2, x: 50, y: -100 });
assert.deepEqual(clampPan({ s: 1, x: 5, y: 5 }, 100, 200), { s: 1, x: 0, y: 0 });

console.log('zoom: OK');
