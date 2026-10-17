// "Match look": nudges one photo's sliders until its overall brightness, white balance, contrast and
// colourfulness match a reference photo, so a set of photos looks consistent in a carousel or feed.
// Works on the real develop result (passed in as `measure`), so it accounts for whatever the photo already has.

/** Summary of an RGBA pixel array (0..255): mean luma, its spread, warm/cool and magenta/green balance, colourfulness. */
export function imageStats(px) {
  let L = 0, L2 = 0, a = 0, b = 0, chroma = 0;
  const n = px.length / 4;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i] / 255, g = px[i + 1] / 255, bl = px[i + 2] / 255;
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * bl;
    L += y;
    L2 += y * y;
    a += (r + bl) / 2 - g; // + magenta, − green
    b += (r + g) / 2 - bl; // + warm, − cool
    chroma += Math.max(r, g, bl) - Math.min(r, g, bl);
  }
  L /= n;
  return { L, sd: Math.sqrt(Math.max(0, L2 / n - L * L)), a: a / n, b: b / n, chroma: chroma / n };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const r2 = (v) => Math.round(v * 100) / 100;

/**
 * @param {object} params  the photo's current develop settings (not modified)
 * @param {ReturnType<typeof imageStats>} target  stats of the reference photo, as developed
 * @param {(params: object) => ReturnType<typeof imageStats>} measure  develops the photo with params and measures it
 * @returns {object}  new develop settings
 */
export function matchLook(params, target, measure, iterations = 6) {
  const p = structuredClone(params);
  for (let i = 0; i < iterations; i++) {
    const cur = measure(p);
    // Damped steps: each slider is roughly linear in its statistic, so a few rounds converge.
    p.exposure = r2(clamp(p.exposure + 1.8 * Math.log2(Math.max(target.L, 1e-3) / Math.max(cur.L, 1e-3)), -3, 3));
    p.temperature = r2(clamp(p.temperature + 220 * (target.b - cur.b), -100, 100));
    p.tint = r2(clamp(p.tint + 220 * (target.a - cur.a), -100, 100));
    p.contrast = r2(clamp(p.contrast + 70 * (target.sd / Math.max(cur.sd, 1e-3) - 1), -100, 100));
    p.saturation = r2(clamp(p.saturation + 70 * (target.chroma / Math.max(cur.chroma, 1e-3) - 1), -100, 100));
  }
  return p;
}

/**
 * Where "Auto" aims, from the photo's own stats (as shot): brightness pulled most of the way to a mid-tone,
 * flat photos given more contrast (never less), colour casts reduced but not erased (a sunset stays warm),
 * and a little more colour for muted photos only.
 */
export function autoTarget(s) {
  return {
    L: s.L + (0.46 - s.L) * 0.7,
    sd: Math.max(s.sd, 0.2),
    a: s.a * 0.4,
    b: s.b * 0.55,
    chroma: Math.max(s.chroma, Math.min(0.16, s.chroma * 1.35)),
  };
}
