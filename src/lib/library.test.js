// Run: node src/lib/library.test.js
import assert from 'node:assert/strict';
import { parseLibrary } from './library.js';

const shape = { customMarginH: 8, backgroundColor: '#ffffff', showExif: true, exifDisplay: { model: true, lens: true } };

const { templates, looks } = parseLibrary({
  app: 'MinimalFrame',
  templates: [
    {
      name: '  Mine  ', id: 'preset_builtin_x', customMarginH: 12, backgroundColor: 42, showExif: false, extra: '<script>',
      exifDisplay: { model: false, lens: 'yes', evil: true },
      dev: { exposure: 1, contrast: 'high', lut: 'lut_123_0', curve: { rgb: [[0, 0], [1, 1]], r: [[0, 2], [1, 1]] }, mixer: { red: [1, 2, 3], blue: [1, 2] } },
    },
    'not an object',
  ],
  looks: [{ name: '', params: { saturation: 20, lut: '../../etc' } }],
}, shape, 7);

const t = templates[0];
assert.equal(t.id, 'preset_user_7_0');          // never keeps the file's own id
assert.equal(t.name, 'Mine');
assert.equal(t.customMarginH, 12);
assert.equal(t.showExif, false);
assert.equal('backgroundColor' in t, false);    // wrong type dropped
assert.equal('extra' in t, false);              // unknown key dropped
assert.deepEqual(t.exifDisplay, { model: false });
assert.equal(t.dev.exposure, 1);
assert.equal(t.dev.contrast, 0);
assert.equal(t.dev.lut, 'lut_123_0');
assert.deepEqual(t.dev.curve.rgb, [[0, 0], [1, 1]]);
assert.deepEqual(t.dev.curve.r, [[0, 0], [1, 1]]);  // out-of-range point → default curve
assert.deepEqual(t.dev.mixer.red, [1, 2, 3]);
assert.deepEqual(t.dev.mixer.blue, [0, 0, 0]);
assert.deepEqual(templates[1], { name: 'Imported', id: 'preset_user_7_1' });
assert.equal(looks[0].name, 'Imported');
assert.equal(looks[0].params.saturation, 20);
assert.equal(looks[0].params.lut, '');          // bad LUT id dropped

assert.throws(() => parseLibrary({ app: 'Other' }, shape), /not a MinimalFrame/);
assert.throws(() => parseLibrary(null, shape), /not a MinimalFrame/);
assert.equal(parseLibrary({ app: 'MinimalFrame', templates: Array(900).fill({}) }, shape).templates.length, 500);
console.log('library: OK');
