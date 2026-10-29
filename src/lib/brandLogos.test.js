// Run: node src/lib/brandLogos.test.js
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { brandMark } from './brandLogos.js';

const names = (m) => m.parts.map((p) => p.name);
assert.deepEqual(names(brandMark('SONY ILCE-7M3')), ['sony', 'sony-alpha']);
assert.deepEqual(names(brandMark('SONY ILCE-7RM4')), ['sony', 'sony-alpha']);
assert.deepEqual(names(brandMark('ILCE-1')), ['sony', 'sony-alpha']);
assert.deepEqual(names(brandMark('SONY ILCE-7SM3')), ['sony', 'sony-alpha']);
assert.deepEqual(names(brandMark('SONY ILCE-7CR')), ['sony', 'sony-alpha']);
assert.deepEqual(names(brandMark('SONY ILCE-9M2')), ['sony', 'sony-alpha']);
assert.deepEqual(names(brandMark('SONY ILCE-6400')), ['sony']); // A6000 series: APS-C, no orange α
assert.deepEqual(names(brandMark('SONY ILCE-6700')), ['sony']);
assert.deepEqual(names(brandMark('SONY ILCE-6000')), ['sony']);
assert.deepEqual(names(brandMark('Sony A7C')), ['sony', 'sony-alpha']); // typed by hand
assert.deepEqual(names(brandMark('SONY DSC-RX100M7')), ['sony']); // not an Alpha
assert.deepEqual(names(brandMark('SONY ZV-E10')), ['sony']);
assert.deepEqual(names(brandMark('Canon Canon EOS R5')), ['canon']);
assert.deepEqual(names(brandMark('NIKON CORPORATION NIKON Z 6_2')), ['nikon']);
assert.deepEqual(names(brandMark('FUJIFILM X-T5')), ['fujifilm']);
assert.deepEqual(names(brandMark('Panasonic DC-S5M2')), ['lumix']);
assert.deepEqual(names(brandMark('Leica Camera AG LEICA Q2')), ['leica']);

// Black wordmarks follow the caption colour; badges (Nikon's black-on-yellow) keep theirs.
assert.equal(brandMark('SONY ILCE-7M3').parts[0].tint, true);
assert.equal(brandMark('SONY ILCE-7M3').parts[1].tint, undefined);
assert.equal(brandMark('NIKON Z 6_2').parts[0].tint, undefined);

// No logo file: the maker's name as text; unknown cameras: nothing.
assert.deepEqual(names(brandMark('Apple iPhone 15 Pro')), ['apple']); // the bitten apple, in the caption colour
assert.equal(brandMark('Apple iPhone 15 Pro').parts[0].tint, true);
assert.deepEqual(brandMark('Google Pixel 9'), { text: 'GOOGLE', parts: [] });
assert.deepEqual(brandMark('Acme Cam 3000'), { text: '', parts: [] });
assert.deepEqual(brandMark(''), { text: '', parts: [] });

// Every logo the module can pick exists in public/brands/.
for (const name of ['sony', 'sony-alpha', 'canon', 'nikon', 'fujifilm', 'leica', 'lumix', 'omsystem', 'ricoh', 'pentax', 'hasselblad', 'apple']) {
  assert.ok(existsSync(new URL(`../../public/brands/${name}.svg`, import.meta.url)), `missing public/brands/${name}.svg`);
}
console.log('brandLogos: OK');
