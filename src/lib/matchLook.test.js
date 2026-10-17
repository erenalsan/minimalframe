// Run: node src/lib/matchLook.test.js
import assert from 'node:assert/strict';
import { imageStats, matchLook, autoTarget } from './matchLook.js';

// Stats of flat colours.
const grey = imageStats(new Uint8ClampedArray([128, 128, 128, 255, 128, 128, 128, 255]));
assert.ok(Math.abs(grey.L - 128 / 255) < 1e-9 && grey.sd < 1e-9 && grey.a === 0 && grey.b === 0 && grey.chroma === 0);
const warm = imageStats(new Uint8ClampedArray([255, 200, 100, 255]));
assert.ok(warm.b > 0 && warm.chroma > 0.5);
const split = imageStats(new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]));
assert.ok(Math.abs(split.sd - 0.5) < 1e-9);

// A stand-in "photo" whose stats respond to the sliders the way a real develop roughly does.
const measure = (p) => ({
  L: 0.35 * 2 ** (p.exposure / 2.2),
  sd: 0.12 * (1 + p.contrast / 100),
  a: 0.004 + p.tint / 400,
  b: -0.03 + p.temperature / 400,
  chroma: 0.15 * (1 + p.saturation / 100),
});
const start = { exposure: 0, contrast: 0, temperature: 0, tint: 0, saturation: 0, clarity: 12 };
const target = { L: 0.5, sd: 0.16, a: -0.01, b: 0.05, chroma: 0.2 };
const out = matchLook(start, target, measure);
const got = measure(out);
for (const k of Object.keys(target)) assert.ok(Math.abs(got[k] - target[k]) < 0.01, `${k}: ${got[k]} vs ${target[k]}`);
assert.equal(out.clarity, 12);      // sliders it doesn't match are kept
assert.equal(start.exposure, 0);    // input not modified

// Unreachable targets stay inside the slider ranges.
const far = matchLook(start, { L: 1, sd: 1, a: 1, b: 1, chroma: 5 }, measure);
assert.ok(far.exposure <= 3 && far.contrast <= 100 && far.temperature <= 100 && far.saturation <= 100);
// Auto: dark photos get brighter, bright ones darker, both toward a mid-tone; contrast never drops;
// casts shrink but keep their direction; colourful photos keep their colour, muted ones get a little more.
const dark = autoTarget({ L: 0.2, sd: 0.1, a: 0.05, b: 0.1, chroma: 0.05 });
assert.ok(dark.L > 0.2 && dark.L < 0.46);
assert.equal(dark.sd, 0.2);
assert.ok(dark.a > 0 && dark.a < 0.05 && dark.b > 0 && dark.b < 0.1);
assert.ok(dark.chroma > 0.05 && dark.chroma < 0.07);
const bright = autoTarget({ L: 0.8, sd: 0.3, a: -0.02, b: -0.04, chroma: 0.3 });
assert.ok(bright.L < 0.8 && bright.L > 0.46);
assert.equal(bright.sd, 0.3);
assert.equal(bright.chroma, 0.3);
// End to end with the stand-in photo above: Auto lands on its own target.
const autoP = matchLook(start, autoTarget(measure(start)), measure);
const got2 = measure(autoP), want2 = autoTarget(measure(start));
for (const k of Object.keys(want2)) assert.ok(Math.abs(got2[k] - want2[k]) < 0.01, `auto ${k}`);
console.log('matchLook: OK');
