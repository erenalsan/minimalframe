import assert from 'node:assert/strict';
import exifr from 'exifr';
import { buildExif, withExif } from './exifWriter.js';

// A tiny JPEG shell (SOI, JFIF APP0, EOI) is enough for EXIF readers.
const jfif = [0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0];
const jpeg = new Blob([new Uint8Array([0xff, 0xd8, ...jfif, 0xff, 0xd9])], { type: 'image/jpeg' });

const cam = {
  make: 'SONY', model: 'ILCE-7M3', lens: 'FE 24-70mm F2.8 GM',
  fNumber: 5.6, exposure: 1 / 250, iso: 100, focal: 35, taken: new Date(2026, 9, 12, 18, 5, 9),
};
const out = await withExif(jpeg, cam);
const bytes = new Uint8Array(await out.arrayBuffer());
assert.deepEqual([...bytes.subarray(0, 2 + jfif.length)], [0xff, 0xd8, ...jfif], 'JFIF header stays first');
assert.deepEqual([...bytes.subarray(2 + jfif.length, 2 + jfif.length + 2)], [0xff, 0xe1], 'EXIF follows it');

const read = await exifr.parse(Buffer.from(bytes), { tiff: true, exif: true, gps: true, reviveValues: false, translateValues: false });
assert.equal(read.Make, 'SONY');
assert.equal(read.Model, 'ILCE-7M3');
assert.equal(read.LensModel, 'FE 24-70mm F2.8 GM');
assert.equal(read.FNumber, 5.6);
assert.equal(read.ExposureTime, 1 / 250);
assert.equal(read.ISO, 100);
assert.equal(read.FocalLength, 35);
assert.equal(read.DateTimeOriginal, '2026:10:12 18:05:09');
assert.equal(read.Orientation, 1);
assert.equal(read.GPSLatitude, undefined, 'location is never written');

// Long exposures, partial info, nothing to write, and non-JPEG input.
assert.equal((await exifr.parse(Buffer.from(buildExif({ exposure: 2.5 }).subarray(6)), { exif: true })).ExposureTime, 2.5);
assert.equal(buildExif({}), null);
const png = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])]);
assert.equal(await withExif(png, cam), png);

console.log('exifWriter: OK');
