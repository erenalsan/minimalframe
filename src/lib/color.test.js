// Run: node src/lib/color.test.js
import assert from 'node:assert/strict';
import { whiteBalanceMatrix, curveLUT, curvesTexture, planckianXY, CURVE_IDENTITY } from './color.js';

const apply = (M, v) => [0, 1, 2].map((r) => M[r * 3] * v[0] + M[r * 3 + 1] * v[1] + M[r * 3 + 2] * v[2]);
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

// Neutral settings: exact identity.
assert.deepEqual(whiteBalanceMatrix(0, 0), [1, 0, 0, 0, 1, 0, 0, 0, 1]);

// Tiny moves are tiny (the curve offset really lands on D65).
const tiny = apply(whiteBalanceMatrix(0.5, 0), [0.5, 0.5, 0.5]);
assert.ok(tiny.every((v) => Math.abs(v - 0.5) < 0.01), `tiny shift too big: ${tiny}`);

// Warm: grey gets redder than blue; cool: the opposite. Brightness of grey is kept (Bradford keeps Y of white).
const grey = [0.4, 0.4, 0.4];
const warm = apply(whiteBalanceMatrix(60, 0), grey);
const cool = apply(whiteBalanceMatrix(-60, 0), grey);
assert.ok(warm[0] > warm[2] * 1.15, `warm not warm: ${warm}`);
assert.ok(cool[2] > cool[0] * 1.15, `cool not cool: ${cool}`);
assert.ok(Math.abs(lum(warm) - 0.4) < 0.01 && Math.abs(lum(cool) - 0.4) < 0.01, 'grey brightness kept');

// Tint: + is magenta (less green), − is green.
assert.ok(apply(whiteBalanceMatrix(0, 60), grey)[1] < 0.39);
assert.ok(apply(whiteBalanceMatrix(0, -60), grey)[1] > 0.41);

// Black body: ~2856 K (illuminant A) and 6504 K land near their known chromaticities.
const A = planckianXY(2856);
assert.ok(Math.abs(A[0] - 0.4476) < 0.003 && Math.abs(A[1] - 0.4074) < 0.003, `A: ${A}`);

// Curves: identity is identity; points are hit; monotone input never overshoots.
const id = curveLUT(CURVE_IDENTITY);
for (let i = 0; i < 256; i++) assert.equal(id[i], i);
const s = curveLUT([[0, 0], [0.25, 0.15], [0.75, 0.85], [1, 1]]);
assert.ok(Math.abs(s[64] - 0.15 * 255) <= 2 && Math.abs(s[191] - 0.85 * 255) <= 2, 'S-curve passes its points');
for (let i = 1; i < 256; i++) assert.ok(s[i] >= s[i - 1], 'monotone');
const steep = curveLUT([[0, 0], [0.5, 0.9], [0.55, 0.95], [1, 1]]);
assert.ok(Math.max(...steep) <= 255 && Math.min(...steep) >= 0);
for (let i = 1; i < 256; i++) assert.ok(steep[i] >= steep[i - 1], 'no overshoot');

// Combined texture: per-channel curves applied after the master curve.
const tex = curvesTexture({ rgb: CURVE_IDENTITY, r: [[0, 0], [1, 0.5]], g: CURVE_IDENTITY, b: CURVE_IDENTITY });
assert.equal(tex[255 * 4], 128);
assert.equal(tex[255 * 4 + 1], 255);

console.log('color: OK');
