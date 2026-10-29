import assert from 'node:assert/strict';
import { encodeStyle, decodeStyle, findStyleCode } from './styleCode.js';
import { freshDev } from './developEngine.js';

const defaults = {
  selectedRatioId: '4:5', customMarginH: 8, backgroundColor: '#ffffff', selectedFontId: 'archivo', filmStyle: null, filmName: 'SAFETY FILM 400',
  showExif: true, exifDisplay: { model: true, lens: true, date: false, location: false },
};
const frame = { ...defaults, selectedRatioId: '1:1', backgroundColor: '#0d0f12', filmStyle: '35mm', filmName: 'PAN 400', exifDisplay: { ...defaults.exifDisplay, lens: false, date: true } };
const dev = { ...freshDev(), exposure: 0.35, contrast: 12, filmGrain: 20, curve: { ...freshDev().curve, rgb: [[0, 0.05], [0.5, 0.55], [1, 1]] } };

// Round trip: the same frame and look come back, film border and caption choices included.
const code = await encodeStyle(frame, dev, defaults, freshDev());
assert.match(code, /^MF1\.[A-Za-z0-9_-]+$/);
assert.ok(code.length < 400, `code is short enough to paste in a chat (${code.length})`);
const back = await decodeStyle(code, defaults);
assert.deepEqual(back.frame, frame);
assert.equal(back.dev.exposure, 0.35);
assert.equal(back.dev.filmGrain, 20);
assert.deepEqual(back.dev.curve.rgb, dev.curve.rgb);
assert.equal(back.dev.saturation, 0, 'untouched sliders come back at their defaults');

// The default style is the shortest code; it decodes to the defaults.
const plain = await decodeStyle(await encodeStyle(defaults, freshDev(), defaults, freshDev()), defaults);
assert.deepEqual(plain.frame, defaults);

// A code inside a chat message is found; anything else is not a code.
assert.equal(findStyleCode(`My MinimalFrame style: ${code} 👍`), code);
assert.equal(await decodeStyle('hello', defaults), null);
assert.equal(await decodeStyle('MF1.!!!!!!!!!!', defaults), null);
assert.equal(await decodeStyle('MF1.AAAAAAAAAAAA', defaults), null);

// Codes come from strangers: unknown keys, wrong types and bad numbers are dropped.
const evil = await (async () => {
  const json = JSON.stringify({ f: { __proto__x: 1, evilKey: '<script>', customMarginH: 'lots', selectedRatioId: 42, backgroundColor: '#123456' }, d: { exposure: 'NaN', contrast: 1e999, lut: '../../etc', curve: { rgb: [[0, 9]] } } });
  const bytes = new Uint8Array(await new Response(new Blob([new TextEncoder().encode(json)]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
  return 'MF1.' + btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
})();
const safe = await decodeStyle(evil, defaults);
assert.equal(safe.frame.evilKey, undefined);
assert.equal(safe.frame.customMarginH, 8);
assert.equal(safe.frame.selectedRatioId, '4:5');
assert.equal(safe.frame.backgroundColor, '#123456');
assert.equal(safe.dev.exposure, 0);
assert.equal(safe.dev.lut, freshDev().lut);
assert.deepEqual(safe.dev.curve, freshDev().curve);

console.log('styleCode: OK');
