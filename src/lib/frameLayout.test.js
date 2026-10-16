// Run: node src/lib/frameLayout.test.js — sweeps layouts and checks the caption always fits the frame.
import assert from 'node:assert/strict';
import { computeFrameLayout } from './frameLayout.js';

const RATIOS = { orig: null, custom: null, '1:1': [1, 1], '4:5': [4, 5], '9:16': [9, 16], '3:2': [3, 2], '16:9': [16, 9] };
const measure = (text, px) => text.length * px * 0.6; // generous stand-in for real glyph widths
const lines = [
  { type: 'model', text: 'Fujifilm X-T5' },
  { type: 'lens', text: 'XF 16-55mm F2.8 R LM WR with a very long lens name' },
  { type: 'settings', text: '23mm  ·  ƒ/2  ·  1/500s  ·  ISO 160' },
];

let n = 0;
for (const [srcW, srcH] of [[1080, 720], [720, 1080], [1080, 1080], [6000, 4000], [3000, 6000]]) {
  for (const [ratioId, wh] of Object.entries(RATIOS)) {
    for (const zone of ['top', 'bottom']) {
      for (const align of ['left', 'center', 'right']) {
        for (const margin of [0, 5, 20, 40]) {
          for (const fontSize of [10, 24, 50, 80]) {
            for (const [posX, posY] of [[0, 0], [100, 100], [50, 50], [0, 100], [100, 0]]) {
              const o = {
                marginH: margin, marginV: margin, ratioId, ratio: wh && { w: wh[0], h: wh[1] },
                captionSpace: 12, fontSize, zone, align, posX, posY, measure,
              };
              const L = computeFrameLayout(srcW, srcH, lines, o);
              const c = L.caption;
              const where = JSON.stringify({ srcW, srcH, ratioId, zone, align, margin, fontSize, posX, posY });
              const left = c.x - (align === 'left' ? 0 : align === 'center' ? c.width / 2 : c.width);
              const top = c.y0 - c.size / 2;
              const bottom = c.y0 + (lines.length - 1) * c.lineH + c.size / 2;

              assert.ok(left >= 0 && left + c.width <= L.canvasW + 0.5, `caption off the side: ${where}`);
              assert.ok(top >= 0 && bottom <= L.canvasH + 0.5, `caption off the top/bottom: ${where}`);
              assert.ok(c.width <= srcW, `caption wider than photo: ${where}`);
              if (zone === 'bottom') assert.ok(top >= L.imgY + srcH, `caption covers photo: ${where}`);
              else assert.ok(bottom <= L.imgY, `caption covers photo: ${where}`);
              assert.ok(L.imgX >= 0 && L.imgY >= 0 && L.imgX + srcW <= L.canvasW && L.imgY + srcH <= L.canvasH, `photo outside canvas: ${where}`);
              if (wh) assert.ok(Math.abs(L.canvasW / L.canvasH - wh[0] / wh[1]) < 0.01, `wrong ratio: ${where}`);
              n++;
            }
          }
        }
      }
    }
  }
}

// No caption: plain even border.
const plain = computeFrameLayout(1000, 500, [], { marginH: 10, marginV: 10, ratioId: 'custom', captionSpace: 12, fontSize: 24, zone: 'bottom', align: 'left', posX: 0, posY: 50, measure });
assert.deepEqual([plain.canvasW, plain.canvasH, plain.imgX, plain.imgY, plain.caption], [1200, 600, 100, 50, null]);

console.log(`frameLayout: ${n} layouts OK`);
