import assert from 'node:assert/strict';
import { fujiRecipeText } from './fujiRecipe.js';
import { parseRecipe } from './recipes.js';

// A MakerNote as an X-series camera writes it: "FUJIFILM", IFD offset 12, then 12-byte entries (little-endian).
function makerNote(entries) {
  const body = [];
  const extra = [];
  const ifdSize = 2 + entries.length * 12 + 4;
  const le = (v, n) => Array.from({ length: n }, (_, i) => (v >>> (8 * i)) & 0xff);
  body.push(...le(entries.length, 2));
  for (const [tag, type, vals] of entries) {
    const size = { 3: 2, 4: 4, 8: 2, 9: 4 }[type];
    const bytes = vals.flatMap((v) => le(v, size));
    body.push(...le(tag, 2), ...le(type, 2), ...le(vals.length, 4));
    if (bytes.length <= 4) body.push(...bytes, ...Array(4 - bytes.length).fill(0));
    else {
      body.push(...le(12 + ifdSize + extra.length, 4));
      extra.push(...bytes);
    }
  }
  body.push(0, 0, 0, 0);
  return new Uint8Array([...new TextEncoder().encode('FUJIFILM'), 12, 0, 0, 0, ...body, ...extra]);
}
const SHORT = 3, SLONG = 9;

// Classic Chrome, DR400, H -1, S +1, Color +2, Daylight R+2 B-4 (stored ×20), Grain weak small, CC strong, clarity -2
const cc = makerNote([
  [0x1001, SHORT, [0x84]], // sharpness +1
  [0x1002, SHORT, [0x100]], // daylight
  [0x1003, SHORT, [0x100]], // colour +2
  [0x100a, SLONG, [40, -80]], // red +2, blue -4
  [0x100f, SLONG, [-2000]], // clarity -2
  [0x1040, SLONG, [-16]], // shadow +1
  [0x1041, SLONG, [16]], // highlight -1
  [0x1047, SHORT, [32]], // grain weak
  [0x1048, SHORT, [64]], // color chrome strong
  [0x104c, SHORT, [16]], // grain small
  [0x104e, SHORT, [0]], // color chrome FX blue off
  [0x1401, SHORT, [0x600]], // classic chrome
  [0x1403, SHORT, [400]], // DR400
]);
const text = fujiRecipeText(cc, 'X-T5 recipe');
assert.equal(text, [
  'X-T5 recipe',
  'Film Simulation: Classic Chrome',
  'Dynamic Range: DR400',
  'Highlight: -1',
  'Shadow: +1',
  'Color: +2',
  'White Balance: Daylight, +2 Red & -4 Blue',
  'Grain Effect: Weak, Small',
  'Color Chrome Effect: Strong',
  'Color Chrome FX Blue: Off',
  'Clarity: -2',
  'Sharpness: +1',
].join('\n'));
// …and the app's recipe reader takes it as a whole: nothing ignored, Classic Chrome recognised.
const r = parseRecipe(text);
assert.equal(r.sim, 'classic chrome');
assert.equal(r.name, 'X-T5');
assert.deepEqual(r.ignored, []);

// Black and white: Acros with a red filter lives in the colour tag; half-step tones.
const acros = fujiRecipeText(makerNote([[0x1003, SHORT, [0x501]], [0x1040, SLONG, [-24]], [0x1401, SHORT, [0]]]));
assert.equal(acros, 'Film Simulation: Acros + R\nShadow: +1.5');
assert.equal(parseRecipe(acros).sim, 'acros');

// Kelvin white balance; old cameras with small fine-tune values.
assert.match(fujiRecipeText(makerNote([[0x1002, SHORT, [0xff0]], [0x1005, SHORT, [5600]], [0x100a, SLONG, [1, -2]]])), /White Balance: 5600K, \+1 Red & -2 Blue/);

// Not Fujifilm, too short, or broken offsets: no recipe, no crash.
assert.equal(fujiRecipeText(new TextEncoder().encode('NIKON\0\0\0\0\0\0\0\0\0')), null);
assert.equal(fujiRecipeText(new Uint8Array(4)), null);
const broken = cc.slice(); broken[8] = 250; // IFD offset past the end
assert.equal(fujiRecipeText(broken), null);

console.log('fujiRecipe: OK');
