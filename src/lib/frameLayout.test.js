// Run: node src/lib/frameLayout.test.js — sweeps layouts and checks the caption always fits the frame.
import assert from 'node:assert/strict';
import { computeFrameLayout, autoBorderAxis } from './frameLayout.js';

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

// Fixed ratio: every step of the border the user sets changes the frame (no dead zone below the ratio's own padding).
for (const [srcW, srcH] of [[1080, 720], [720, 1080], [1080, 1080]]) {
  for (const wh of [[1, 1], [4, 5], [9, 16], [16, 9]]) {
    const ratio = { w: wh[0], h: wh[1] };
    const key = autoBorderAxis(srcW, srcH, ratio) === 'v' ? 'marginH' : 'marginV';
    let prev = null;
    for (let m = 0; m <= 40; m++) {
      const L = computeFrameLayout(srcW, srcH, [], { marginH: 8, marginV: 8, [key]: m, ratioId: 'r', ratio, captionSpace: 12, fontSize: 24, zone: 'bottom', align: 'left', posX: 0, posY: 50, measure });
      const k = L.canvasW / srcW; // frame size relative to the photo
      if (prev !== null) assert.ok(k > prev, `border ${key}=${m} had no effect for ${srcW}x${srcH} in ${wh}`);
      prev = k;
    }
  }
}

// Camera-brand bar: every part inside the canvas, beside (not over) the photo, and no overlaps between parts.
let bars = 0;
for (const [srcW, srcH] of [[1080, 720], [720, 1080], [6000, 4000], [400, 1200]]) {
  for (const [ratioId, wh] of Object.entries(RATIOS)) {
    for (const zone of ['top', 'bottom']) {
      for (const fontSize of [10, 24, 80]) {
        for (const brand of ['', 'FUJIFILM',
          { text: 'SONY', parts: [{ name: 'sony', aspect: 5.69, height: 0.9 }, { name: 'sony-alpha', aspect: 1.4, height: 1.3 }] },
          { text: 'NIKON', parts: [{ name: 'nikon', aspect: 1, height: 2.1 }] }]) {
          for (const set of [lines, lines.slice(0, 1), [lines[2]]]) {
            const L = computeFrameLayout(srcW, srcH, set, {
              marginH: 0, marginV: 0, ratioId, ratio: wh && { w: wh[0], h: wh[1] }, captionSpace: 12,
              fontSize, zone, align: 'left', posX: 0, posY: 50, measure, style: 'bar', brand,
            });
            const c = L.caption;
            const where = JSON.stringify({ srcW, srcH, ratioId, zone, fontSize, brand, n: set.length });
            const bottom = c.y0 + c.blockH;
            assert.equal(c.style, 'bar');
            if (zone === 'bottom') assert.ok(c.y0 >= L.imgY + srcH - 0.5, `bar covers photo: ${where}`);
            else assert.ok(bottom <= L.imgY + 0.5, `bar covers photo: ${where}`);
            assert.ok(c.y0 >= 0 && bottom <= L.canvasH + 0.5, `bar off canvas: ${where}`);
            // Left block, brand and right block stay inside the photo's width, in that order.
            const leftEnd = c.left.x + Math.max(0, ...c.left.lines.map((l, i) => measure(l.text, i ? c.sub : c.size)));
            const brandStart = c.brand ? c.brand.x - c.brand.width : c.right.x - c.width + (leftEnd - c.left.x);
            assert.ok(c.left.x >= L.imgX && c.right.x <= L.imgX + srcW + 0.5, `bar wider than photo: ${where}`);
            if (c.brand && c.left.lines.length) assert.ok(leftEnd <= brandStart + 0.5, `left text runs into brand: ${where}`);
            // Logos: inside the bar's height, in order, ending at the brand's right edge.
            for (const [i, p] of (c.brand?.parts ?? []).entries()) {
              assert.ok(p.y >= c.y0 - 0.5 && p.y + p.h <= c.y0 + c.blockH + 0.5, `logo taller than the bar: ${where}`);
              if (i) assert.ok(p.x >= c.brand.parts[i - 1].x + c.brand.parts[i - 1].w, `logos overlap: ${where}`);
            }
            if (c.brand?.parts.length) assert.ok(Math.abs(c.brand.parts.at(-1).x + c.brand.parts.at(-1).w - c.brand.x) < 0.5, `logos don't end at the brand edge: ${where}`);
            bars++;
          }
        }
      }
    }
  }
}

// Spread: row items inside the photo's width, in order, not touching; the row stays off the photo;
// the name on the photo stays inside it.
let spreads = 0;
const parted = [lines[0], lines[1], { type: 'settings', text: '', parts: ['1/200', 'F/10', 'ISO 1600', '+/1.3', '55mm'] }, { type: 'extra', text: '', parts: ['Kyoto, a very long note about the evening'] }];
for (const [srcW, srcH] of [[1080, 720], [720, 1080], [6000, 4000], [400, 1200]]) {
  for (const [ratioId, wh] of Object.entries(RATIOS)) {
    for (const zone of ['top', 'bottom']) {
      for (const fontSize of [10, 24, 80]) {
        for (const set of [parted, parted.slice(0, 1), parted.slice(2, 3)]) {
          const L = computeFrameLayout(srcW, srcH, set, {
            marginH: 2, marginV: 2, ratioId, ratio: wh && { w: wh[0], h: wh[1] }, captionSpace: 12,
            fontSize, zone, align: 'left', posX: 0, posY: 50, measure, style: 'spread',
          });
          const c = L.caption;
          const where = JSON.stringify({ srcW, srcH, ratioId, zone, fontSize, n: set.length });
          assert.equal(c.style, 'spread');
          let prevEnd = L.imgX;
          for (const it of c.items) {
            assert.ok(it.x >= prevEnd - 0.5, `items overlap or out of order: ${where}`);
            prevEnd = it.x + measure(it.text, c.size);
          }
          assert.ok(prevEnd <= L.imgX + srcW + 0.5, `row wider than photo: ${where}`);
          if (c.items.length) {
            if (zone === 'bottom') assert.ok(c.y0 >= L.imgY + srcH - 0.5, `row covers photo: ${where}`);
            else assert.ok(c.y0 + c.blockH <= L.imgY + 0.5, `row covers photo: ${where}`);
            assert.ok(c.y0 >= 0 && c.y0 + c.blockH <= L.canvasH + 0.5, `row off canvas: ${where}`);
          }
          for (const l of c.overlay.lines) {
            assert.ok(l.y - l.size / 2 >= L.imgY && l.y + l.size / 2 <= L.imgY + srcH, `name off the photo: ${where}`);
            assert.ok(measure(l.text, l.size) <= srcW * 0.6 + 0.5, `name too wide: ${where}`);
          }
          spreads++;
        }
      }
    }
  }
}

// Fill (carousel): exact strip shape, photo spans the full width inside an even border, cropped from the
// centre of the source, never upscaled, caption beside (not over) the photo.
let fills = 0;
for (const [srcW, srcH] of [[2400, 3000], [6000, 4000], [12000, 2000], [4000, 4000], [800, 2400]]) {
  for (const slides of [2, 3, 5, 10]) {
    for (const [w1, h1] of [[4, 5], [1, 1]]) {
      for (const style of ['stack', 'bar', 'spread']) {
        for (const set of [lines, []]) {
          for (const zone of ['top', 'bottom']) {
            const ratio = { w: w1 * slides, h: h1 };
            const L = computeFrameLayout(srcW, srcH, set, {
              marginH: 3, marginV: 3, ratioId: 'carousel', ratio, captionSpace: 12, fontSize: 24, zone, align: 'left',
              posX: 0, posY: 50, measure, style, fill: true, brand: 'SONY',
            });
            const where = JSON.stringify({ srcW, srcH, slides, w1, style, n: set.length, zone });
            const c = L.crop;
            assert.ok(Math.abs(L.canvasW / L.canvasH / (ratio.w / ratio.h) - 1) < 0.01, `wrong strip shape: ${where}`); // 1 px of rounding on a thin strip
            assert.ok(c.sw <= srcW && c.sh <= srcH && c.sx >= 0 && c.sy >= 0 && c.sx + c.sw <= srcW && c.sy + c.sh <= srcH, `crop outside photo: ${where}`);
            assert.ok(Math.abs(L.imgX - (L.canvasW - c.sw) / 2) <= 1, `photo not centred across: ${where}`);
            assert.ok(L.imgY + c.sh <= L.canvasH, `photo off canvas: ${where}`);
            if (L.caption && style === 'stack') {
              const capTop = L.caption.y0 - L.caption.size / 2;
              if (zone === 'bottom') assert.ok(capTop >= L.imgY + c.sh - 0.5, `caption covers photo: ${where}`);
              assert.ok(L.caption.width <= c.sw + 0.5, `caption wider than photo: ${where}`);
            }
            fills++;
          }
        }
      }
    }
  }
}

// Fill position: 0 and 1 reach the photo's edges, out-of-range values are clamped, and the crop's size
// doesn't depend on where it sits.
const fillAt = (srcW, srcH, fillX, fillY) => computeFrameLayout(srcW, srcH, [], {
  marginH: 3, marginV: 3, ratioId: 'carousel', ratio: { w: 12, h: 5 }, captionSpace: 12, fontSize: 24, zone: 'bottom',
  align: 'left', posX: 0, posY: 50, measure, fill: true, fillX, fillY,
}).crop;
const tall = [fillAt(2400, 3000, 0.5, 0), fillAt(2400, 3000, 0.5, 1), fillAt(2400, 3000, 0.5, 0.5), fillAt(2400, 3000, 0.5, -3)];
assert.equal(tall[0].sy, 0);
assert.equal(tall[1].sy + tall[1].sh, 3000);
assert.ok(Math.abs(tall[2].sy - (3000 - tall[2].sh) / 2) <= 1);
assert.equal(tall[3].sy, 0);
assert.ok(tall.every((c) => c.sh === tall[0].sh && c.sx === 0));
const wide = [fillAt(12000, 2000, 0, 0.5), fillAt(12000, 2000, 1, 0.5)];
assert.equal(wide[0].sx, 0);
assert.equal(wide[1].sx + wide[1].sw, 12000);

console.log(`frameLayout: ${n} layouts + ${bars} bars + ${spreads} spreads + ${fills} fills OK`);
