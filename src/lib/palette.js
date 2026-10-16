/**
 * palette.js — dominant colours of a photo, for border suggestions (pure, no DOM).
 * k-means on RGB pixels, seeded deterministically (k-means++ style) so the same photo always gives the same swatches.
 */

const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

/**
 * @param {Uint8ClampedArray} rgba  pixel data (e.g. from getImageData of a small thumbnail)
 * @param {number} k  number of colours
 * @returns {string[]} hex colours, most common first
 */
export function extractPalette(rgba, k = 5) {
  const px = [];
  for (let i = 0; i < rgba.length; i += 4) px.push([rgba[i], rgba[i + 1], rgba[i + 2]]);
  if (!px.length) return [];

  // Seeds: start from the mean, then repeatedly take the pixel farthest from every seed so far.
  const mean = [0, 1, 2].map((c) => px.reduce((s, p) => s + p[c], 0) / px.length);
  const centers = [mean];
  while (centers.length < k) {
    let best = px[0], bestD = -1;
    for (const p of px) {
      const d = Math.min(...centers.map((c) => dist2(p, c)));
      if (d > bestD) (bestD = d), (best = p);
    }
    if (bestD <= 0) break; // fewer distinct colours than k
    centers.push([...best]);
  }

  let counts = [];
  for (let iter = 0; iter < 12; iter++) {
    const sums = centers.map(() => [0, 0, 0]);
    counts = centers.map(() => 0);
    for (const p of px) {
      let j = 0, d = Infinity;
      centers.forEach((c, i) => {
        const e = dist2(p, c);
        if (e < d) (d = e), (j = i);
      });
      sums[j][0] += p[0];
      sums[j][1] += p[1];
      sums[j][2] += p[2];
      counts[j]++;
    }
    centers.forEach((c, i) => counts[i] && (centers[i] = sums[i].map((v) => v / counts[i])));
  }
  return centers
    .map((c, i) => ({ c, n: counts[i] }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .map((x) => hex(x.c));
}

/** A pale tint of a colour (mixed toward white), which usually makes a better mat than the raw colour. */
export function tint(hexColor, amount = 0.82) {
  const c = [1, 3, 5].map((i) => parseInt(hexColor.slice(i, i + 2), 16));
  return hex(c.map((v) => v + (255 - v) * amount));
}
