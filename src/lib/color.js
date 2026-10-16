/**
 * color.js — colour math for the develop engine (pure, no DOM).
 *  - whiteBalanceMatrix: Bradford chromatic adaptation along the Planckian locus (linear sRGB).
 *  - curveLUT: monotone cubic tone curve → 256-entry lookup table.
 */

const RGB_TO_XYZ = [
  [0.4124564, 0.3575761, 0.1804375],
  [0.2126729, 0.7151522, 0.072175],
  [0.0193339, 0.119192, 0.9503041],
];
const XYZ_TO_RGB = [
  [3.2404542, -1.5371385, -0.4985314],
  [-0.969266, 1.8760108, 0.041556],
  [0.0556434, -0.2040259, 1.0572252],
];
const BRADFORD = [
  [0.8951, 0.2664, -0.1614],
  [-0.7502, 1.7135, 0.0367],
  [0.0389, -0.0685, 1.0296],
];
const BRADFORD_INV = [
  [0.9869929, -0.1470543, 0.1599627],
  [0.4323053, 0.5183603, 0.0492912],
  [-0.0085287, 0.0400428, 0.9684867],
];
const D65 = [0.31271, 0.32902];

const mul = (A, B) => A.map((row) => B[0].map((_, j) => row.reduce((s, a, k) => s + a * B[k][j], 0)));
const apply = (M, v) => M.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);
const xyToXYZ = ([x, y]) => [x / y, 1, (1 - x - y) / y];

/** Chromaticity of a black body at `k` kelvin (Kim et al. cubic fit, 1667–25000 K). */
export function planckianXY(k) {
  const T = Math.min(25000, Math.max(1667, k));
  const x =
    T <= 4000
      ? -0.2661239e9 / T ** 3 - 0.2343589e6 / T ** 2 + 0.8776956e3 / T + 0.17991
      : -3.0258469e9 / T ** 3 + 2.1070379e6 / T ** 2 + 0.2226347e3 / T + 0.24039;
  const y =
    T <= 2222
      ? -1.1063814 * x ** 3 - 1.3481102 * x ** 2 + 2.18555832 * x - 0.20219683
      : T <= 4000
        ? -0.9549476 * x ** 3 - 1.37418593 * x ** 2 + 2.09137015 * x - 0.16748867
        : 3.081758 * x ** 3 - 5.8733867 * x ** 2 + 3.75112997 * x - 0.37001483;
  return [x, y];
}

/**
 * 3×3 matrix (row-major) for linear sRGB that warms/cools and shifts green↔magenta.
 * temperature, tint: −100…100. Warming adapts from a bluer illuminant to D65, as a real raw converter does.
 */
export function whiteBalanceMatrix(temperature, tint) {
  if (!temperature && !tint) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const kelvin = 6504 * 2 ** ((temperature / 100) * 0.9);
  // Offset the black-body curve so 6504 K lands exactly on D65 (daylight sits slightly off the curve).
  const base = planckianXY(6504);
  const p = planckianXY(kelvin);
  const src = [p[0] + D65[0] - base[0], p[1] + D65[1] - base[1] + (tint / 100) * 0.03];

  const s = apply(BRADFORD, xyToXYZ(src));
  const d = apply(BRADFORD, xyToXYZ(D65));
  const scale = [
    [d[0] / s[0], 0, 0],
    [0, d[1] / s[1], 0],
    [0, 0, d[2] / s[2]],
  ];
  const M = mul(XYZ_TO_RGB, mul(BRADFORD_INV, mul(scale, mul(BRADFORD, RGB_TO_XYZ))));
  return M.flat();
}

export const CURVE_IDENTITY = Object.freeze([
  [0, 0],
  [1, 1],
]);

/**
 * Monotone cubic (Fritsch–Carlson) interpolation through the control points → 256 values (0–255).
 * Monotone means no overshoot: the curve never bends past its neighbouring points.
 * @param {number[][]} points  [[x, y], …] in 0–1, any order
 */
export function curveLUT(points) {
  const p = [...points].sort((a, b) => a[0] - b[0]);
  const n = p.length;
  const out = new Uint8Array(256);
  const dx = [], m = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = p[i + 1][0] - p[i][0];
    m[i] = dx[i] > 0 ? (p[i + 1][1] - p[i][1]) / dx[i] : 0;
  }
  const t = new Array(n);
  t[0] = m[0] ?? 0;
  t[n - 1] = m[n - 2] ?? 0;
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = t[i + 1] = 0;
      continue;
    }
    const a = t[i] / m[i], b = t[i + 1] / m[i];
    const h = a * a + b * b;
    if (h > 9) {
      const k = 3 / Math.sqrt(h);
      t[i] = k * a * m[i];
      t[i + 1] = k * b * m[i];
    }
  }
  for (let v = 0; v < 256; v++) {
    const x = v / 255;
    let y;
    if (x <= p[0][0]) y = p[0][1];
    else if (x >= p[n - 1][0]) y = p[n - 1][1];
    else {
      let i = 0;
      while (x > p[i + 1][0]) i++;
      const h = dx[i], s = (x - p[i][0]) / h;
      const h00 = (1 + 2 * s) * (1 - s) ** 2, h10 = s * (1 - s) ** 2, h01 = s * s * (3 - 2 * s), h11 = s * s * (s - 1);
      y = h00 * p[i][1] + h10 * h * t[i] + h01 * p[i + 1][1] + h11 * h * t[i + 1];
    }
    out[v] = Math.round(Math.min(1, Math.max(0, y)) * 255);
  }
  return out;
}

/** RGBA lookup table (256×1) combining the master curve with the per-channel curves. */
export function curvesTexture(curves) {
  const master = curveLUT(curves.rgb);
  const r = curveLUT(curves.r), g = curveLUT(curves.g), b = curveLUT(curves.b);
  const out = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const v = master[i];
    out[i * 4] = r[v];
    out[i * 4 + 1] = g[v];
    out[i * 4 + 2] = b[v];
    out[i * 4 + 3] = 255;
  }
  return out;
}

export const isIdentityCurve = (pts) =>
  pts.length === 2 && pts[0][0] === 0 && pts[0][1] === 0 && pts[1][0] === 1 && pts[1][1] === 1;
