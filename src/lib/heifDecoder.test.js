// Run: node src/lib/heifDecoder.test.js
import assert from 'node:assert/strict';
import { isHeif } from './heifDecoder.js';

// By extension (any case) or by MIME type; Android pickers sometimes give only one of them.
assert.ok(isHeif({ name: '20261017_101500.heic', type: '' }));
assert.ok(isHeif({ name: 'IMG_0001.HEIC', type: '' }));
assert.ok(isHeif({ name: 'photo.heif', type: '' }));
assert.ok(isHeif({ name: 'shared', type: 'image/heic' }));
assert.ok(isHeif({ name: 'shared', type: 'image/heif-sequence' }));
assert.ok(!isHeif({ name: 'photo.jpg', type: 'image/jpeg' }));
assert.ok(!isHeif({ name: 'theheic.jpg', type: 'image/jpeg' }));
console.log('heifDecoder: OK');
