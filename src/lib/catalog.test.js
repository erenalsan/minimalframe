// Run: node src/lib/catalog.test.js
import assert from 'node:assert/strict';
import { frameRatio } from './catalog.js';

assert.deepEqual(frameRatio({ selectedRatioId: '4:5' }), { id: '4:5', label: 'Feed portrait', w: 4, h: 5 });
// Carousel: n slides side by side, each 4:5 or square, n kept to 2–10.
assert.deepEqual(frameRatio({ selectedRatioId: 'carousel', slides: 3, slideShape: '4:5' }), { id: 'carousel', label: 'Carousel', w: 12, h: 5, slices: 3 });
assert.deepEqual(frameRatio({ selectedRatioId: 'carousel', slides: 5, slideShape: '1:1' }), { id: 'carousel', label: 'Carousel', w: 5, h: 1, slices: 5 });
assert.equal(frameRatio({ selectedRatioId: 'carousel', slides: 40 }).slices, 10);
assert.equal(frameRatio({ selectedRatioId: 'carousel', slides: 1 }).slices, 2);
assert.equal(frameRatio({ selectedRatioId: 'carousel' }).slices, 3);
assert.equal(frameRatio({ selectedRatioId: 'gone' }), undefined);
console.log('catalog: OK');
