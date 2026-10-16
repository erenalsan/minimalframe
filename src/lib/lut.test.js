// Run: node src/lib/lut.test.js
import assert from 'node:assert/strict';
import { parseCube } from './lut.js';

// 2×2×2 identity LUT with a title, comments and Windows line endings.
const identity = [
  '# made by hand', 'TITLE "Identity"', 'LUT_3D_SIZE 2', '',
  '0 0 0', '1 0 0', '0 1 0', '1 1 0', '0 0 1', '1 0 1', '0 1 1', '1 1 1',
].join('\r\n');
const lut = parseCube(identity);
assert.equal(lut.title, 'Identity');
assert.equal(lut.size, 2);
assert.deepEqual([...lut.data.slice(3, 6)], [1, 0, 0]); // red changes fastest
assert.deepEqual([...lut.data.slice(-3)], [1, 1, 1]);

// Domain is rescaled to 0..1.
const scaled = parseCube(['LUT_3D_SIZE 2', 'DOMAIN_MIN 0 0 0', 'DOMAIN_MAX 2 2 2', ...Array(8).fill('2 1 0')].join('\n'));
assert.deepEqual([...scaled.data.slice(0, 3)], [1, 0.5, 0]);

assert.throws(() => parseCube('LUT_1D_SIZE 4\n0 0 0'), /1D/);
assert.throws(() => parseCube('LUT_3D_SIZE 2\n0 0 0'), /Expected 8/);
assert.throws(() => parseCube('0 0 0'), /LUT_3D_SIZE/);
assert.throws(() => parseCube('LUT_3D_SIZE 2\n' + Array(8).fill('0 x 0').join('\n')), /Bad LUT line/);
console.log('lut: OK');
