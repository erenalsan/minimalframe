// Run: node src/lib/recipes.test.js
import assert from 'node:assert/strict';
import { parseRecipe } from './recipes.js';

const r = parseRecipe(`Golden Hour Chrome
Film Simulation: Classic Chrome
Dynamic Range: DR400
Highlight: -1
Shadow: +1
Color: +2
Noise Reduction: -4
Sharpening: +1
Clarity: -2
Grain Effect: Weak, Small
Color Chrome Effect: Strong
Color Chrome FX Blue: Weak
White Balance: Daylight, +2 Red & -4 Blue
ISO: Auto, up to ISO 6400
Exposure Compensation: +1/3 to +2/3 (typically)`);

assert.equal(r.name, 'Golden Hour Chrome');
assert.equal(r.sim, 'classic chrome');
const p = r.params;
assert.equal(p.highlights, -24 - 12);          // DR400 (2 stops) + Highlight -1
assert.equal(p.shadows, -10 + 10 - 12);         // sim + DR400 + Shadow +1 (deeper)
assert.equal(p.saturation, -22 + 16 + 8);       // sim + Color +2 + Color Chrome Strong
assert.equal(p.contrast, 10 + 6);
assert.equal(p.clarity, -20);
assert.equal(p.sharpen, 12);
assert.equal(p.filmGrain, 15);
assert.equal(p.temperature, (2 + 4) * 4);       // +2R −4B → warmer
assert.equal(p.tint, (2 - 4) * 2.5);
assert.equal(p.exposure, 0.33);
assert.deepEqual(p.mixer.blue, [-10, -15 + 8, -10 - 8]);
assert.deepEqual(p.curve.b, [[0, 0.04], [1, 0.96]]);
assert.deepEqual(r.ignored, ['Noise Reduction: -4', 'ISO: Auto, up to ISO 6400']);

// B&W filters, Kelvin white balance and the short tone-curve form.
const bw = parseRecipe('Film Simulation: Acros+R\nTone Curve: H+1 S-0.5\nWhite Balance: 6500K, 0 Red & 0 Blue');
assert.equal(bw.sim, 'acros');
assert.equal(bw.params.saturation, -100);
assert.deepEqual(bw.params.mixer.red, [0, 0, 20]);
assert.equal(bw.params.highlights, 12);
assert.equal(bw.params.shadows, 6);
assert.equal(bw.params.temperature, 16.67);

// Everything stays inside the slider ranges, and unknown simulations are reported, not guessed.
const extreme = parseRecipe('Film Simulation: Velvia\nColor: +4\nColor Chrome Effect: Strong\nWhite Balance: Incandescent, -9 Red & +9 Blue');
assert.equal(extreme.params.saturation, 25 + 32 + 8);
assert.equal(extreme.params.temperature, -97);
assert.ok(Object.values(extreme.params).every((v) => typeof v !== 'number' || Math.abs(v) <= 100));
assert.deepEqual(parseRecipe('Film Simulation: Kodak Gold').ignored, ['Film Simulation: Kodak Gold']);
console.log('recipes: OK');
