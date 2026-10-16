// Run: node src/lib/palette.test.js
import assert from 'node:assert/strict';
import { extractPalette, tint } from './palette.js';

// 60% red, 30% blue, 10% white → those three, most common first.
const px = [];
const add = (rgb, n) => { for (let i = 0; i < n; i++) px.push(...rgb, 255); };
add([200, 30, 30], 600);
add([20, 40, 200], 300);
add([250, 250, 250], 100);
const pal = extractPalette(new Uint8ClampedArray(px), 3);
assert.deepEqual(pal, ['#c81e1e', '#1428c8', '#fafafa']);

// Asking for more colours than exist doesn't invent any.
assert.equal(extractPalette(new Uint8ClampedArray(px), 6).length, 3);
assert.deepEqual(extractPalette(new Uint8ClampedArray([]), 3), []);

assert.equal(tint('#000000', 0.5), '#808080');
assert.equal(tint('#ffffff'), '#ffffff');
console.log('palette: OK');
