/**
 * developEngine.js — MinimalFrame develop pipeline (WebGL2)
 *
 * One fragment shader runs both the live preview (≤1080px proxy) and the full-resolution export
 * (in tiles), so what you see is what you save. Every operation is per-pixel, which is what makes
 * tiling safe; anything that needs neighbouring pixels (clarity, sharpening) must not go here.
 *
 * Two inputs, one shader compiled twice:
 *  - 8-bit sRGB images (JPEG/PNG/canvas): decoded to linear, edited, re-encoded. Neutral settings = identical output.
 *  - 16-bit linear RAW data ({ width, height, data: Uint16Array RGB, linear: true } from rawEngine):
 *    uploaded as an integer texture, given a baseline lift and a soft highlight shoulder so detail
 *    the camera JPEG would clip stays recoverable with Exposure / Highlights / Whites.
 *
 * Order: linear → white balance → exposure → sRGB → (RAW shoulder) → whites/blacks → highlights/shadows
 *        → contrast → vibrance/saturation.
 */

export const DEV_DEFAULTS = Object.freeze({
  exposure: 0,     // EV, -3..3
  contrast: 0,     // -100..100
  highlights: 0,   // -100..100
  shadows: 0,      // -100..100
  whites: 0,       // -100..100
  blacks: 0,       // -100..100
  temperature: 0,  // -100 (cool) .. 100 (warm)
  tint: 0,         // -100 (green) .. 100 (magenta)
  vibrance: 0,     // -100..100
  saturation: 0,   // -100..100
  filmGrain: 0,    // 0..100, applied by effectsEngine on export
  softBloom: 0,    // 0..100, applied by effectsEngine on export
});

// Uniforms that are sliders scaled to -1..1 in the shader (exposure is passed as-is).
const SCALED = ['contrast', 'highlights', 'shadows', 'whites', 'blacks', 'temperature', 'tint', 'vibrance', 'saturation'];

const VERT = `#version 300 es
in vec2 p;
out vec2 uv;
void main() {
  uv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5); // row 0 of the image at the top of the canvas
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const FRAG = `
precision highp float;
in vec2 uv;
out vec4 o;
uniform float exposure, contrast, highlights, shadows, whites, blacks, temperature, tint, vibrance, saturation;
const vec3 W = vec3(0.2126, 0.7152, 0.0722);

vec3 toLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 toSrgb(vec3 c) { c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }

#ifdef LINEAR16
uniform highp usampler2D img;
// +0.7 EV baseline: puts LibRaw's un-brightened mid-tones near camera-JPEG brightness and maps the
// sensor clip point to ~0.99 after the shoulder below.
const float BASELINE = 1.63;
const float KNEE = 0.75;
vec3 fetchLinear() {
  ivec2 size = textureSize(img, 0);
  ivec2 px = min(ivec2(uv * vec2(size)), size - 1);
  return vec3(texelFetch(img, px, 0).rgb) / 65535.0 * BASELINE;
}
// Film-like shoulder: values above the knee roll off smoothly toward white instead of clipping.
vec3 shoulder(vec3 s) {
  vec3 over = max(s - KNEE, 0.0);
  return min(s, vec3(KNEE)) + (1.0 - KNEE) * tanh(over / (1.0 - KNEE));
}
#else
uniform sampler2D img;
vec3 fetchLinear() { return toLinear(texture(img, uv).rgb); }
#endif

void main() {
  vec3 c = fetchLinear();

  // shortcut: white balance as luminance-neutral channel gains on top of the camera's own WB,
  // not a full chromatic-adaptation transform; upgrade with a Bradford CAT if colour casts look off.
  vec3 wb = vec3(1.0 + 0.3 * temperature, 1.0 - 0.2 * tint, 1.0 - 0.3 * temperature);
  c *= wb / dot(wb, W) * exp2(exposure);

  vec3 s = toSrgb(c);
#ifdef LINEAR16
  s = shoulder(s);
#endif

  // Whites / blacks move the end points (levels).
  float bp = -0.12 * blacks;
  float wp = 1.0 - 0.15 * whites;
  s = (s - bp) / (wp - bp);

  // Highlights / shadows: luminance-masked lift or pull, applied as a ratio so hue is kept.
  // Squared masks keep mid-tones out of it; a per-pixel tool can't do local tone mapping, so it stays gentle.
  float L = dot(s, W);
  float hiMask = smoothstep(0.5, 1.0, L);
  float shMask = 1.0 - smoothstep(0.0, 0.5, L);
  float Ln = L
    + 0.3 * shadows * shMask * shMask * smoothstep(0.0, 0.08, L)
    + 0.3 * highlights * hiMask * hiMask;
  s *= max(Ln, 0.0) / max(L, 1e-4);

  s = (s - 0.5) * (1.0 + contrast) + 0.5;

  // Vibrance boosts muted colours more than already-saturated ones.
  L = dot(s, W);
  float sat = clamp(max(s.r, max(s.g, s.b)) - min(s.r, min(s.g, s.b)), 0.0, 1.0);
  s = mix(vec3(L), s, 1.0 + saturation + vibrance * (1.0 - sat));

  o = vec4(clamp(s, 0.0, 1.0), 1.0);
}`;

let gl = null;
let glCanvas = null;
let programs = null; // { srgb8, linear16 }: { prog, tex, uniforms }
let lastLinearUpload = null; // skips re-uploading an unchanged RAW proxy on every slider tick
let initTried = false;

function init() {
  if (initTried) return gl;
  initTried = true;
  glCanvas = document.createElement('canvas');
  gl = glCanvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false, premultipliedAlpha: false });
  if (!gl) return null;

  const shader = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const build = (defines) => {
    const prog = gl.createProgram();
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, `#version 300 es\n${defines}${FRAG}`));
    gl.bindAttribLocation(prog, 0, 'p');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    // NEAREST is required for integer textures and is exact for 1:1 rendering anyway.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const uniforms = Object.fromEntries(['exposure', ...SCALED].map((k) => [k, gl.getUniformLocation(prog, k)]));
    return { prog, tex, uniforms };
  };
  programs = { srgb8: build(''), linear16: build('#define LINEAR16\n') };

  // One oversized triangle covers the viewport.
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  return gl;
}

export function isDevelopSupported() {
  try {
    return Boolean(init());
  } catch (err) {
    console.warn('[developEngine] WebGL2 unavailable:', err);
    gl = null;
    return false;
  }
}

function draw(program, params, w, h) {
  glCanvas.width = w;
  glCanvas.height = h;
  gl.viewport(0, 0, w, h);
  gl.useProgram(program.prog);
  gl.uniform1f(program.uniforms.exposure, params.exposure ?? 0);
  for (const k of SCALED) gl.uniform1f(program.uniforms[k], (params[k] ?? 0) / 100);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  return glCanvas;
}

/** 8-bit image or canvas → shared WebGL canvas (copy from it before the next call). */
function developImage(source, params) {
  const p = programs.srgb8;
  gl.bindTexture(gl.TEXTURE_2D, p.tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
  return draw(p, params, source.width, source.height);
}

/** Region of 16-bit linear RGB data → shared WebGL canvas. Uploads straight from the array, no copy. */
function developLinear(src, params, x, y, w, h) {
  const p = programs.linear16;
  gl.bindTexture(gl.TEXTURE_2D, p.tex);
  const key = `${x},${y},${w},${h}`;
  if (lastLinearUpload?.src !== src || lastLinearUpload.key !== key) {
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 2);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, src.width);
    gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, x);
    gl.pixelStorei(gl.UNPACK_SKIP_ROWS, y);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB16UI, w, h, 0, gl.RGB_INTEGER, gl.UNSIGNED_SHORT, src.data);
    // Reset so later image uploads are not offset.
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
    gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
    gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    lastLinearUpload = { src, key };
  }
  return draw(p, params, w, h);
}

/**
 * Develops `source` into `target` (a 2D canvas, resized to match). Large images are processed in
 * tiles so they fit the GPU's texture limit (often 4096px on phones).
 * @param {HTMLCanvasElement|ImageBitmap|{width:number,height:number,data:Uint16Array,linear:true}} source
 * @param {object} params  see DEV_DEFAULTS
 * @param {HTMLCanvasElement} [target]
 */
export function develop(source, params, target = document.createElement('canvas')) {
  const { width, height } = source;
  target.width = width;
  target.height = height;
  const ctx = target.getContext('2d', { alpha: false });
  const maxTile = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), 4096);

  if (source.linear) {
    for (let y = 0; y < height; y += maxTile) {
      for (let x = 0; x < width; x += maxTile) {
        const w = Math.min(maxTile, width - x);
        const h = Math.min(maxTile, height - y);
        ctx.drawImage(developLinear(source, params, x, y, w, h), x, y);
      }
    }
    return target;
  }

  if (width <= maxTile && height <= maxTile) {
    ctx.drawImage(developImage(source, params), 0, 0);
    return target;
  }
  const tile = document.createElement('canvas');
  const tctx = tile.getContext('2d', { alpha: false });
  for (let y = 0; y < height; y += maxTile) {
    for (let x = 0; x < width; x += maxTile) {
      tile.width = Math.min(maxTile, width - x);
      tile.height = Math.min(maxTile, height - y);
      tctx.drawImage(source, x, y, tile.width, tile.height, 0, 0, tile.width, tile.height);
      ctx.drawImage(developImage(tile, params), x, y);
    }
  }
  tile.width = tile.height = 0;
  return target;
}

/**
 * Area-averaging downscale of 16-bit linear RGB data (averaging in linear light is the correct way).
 * @returns {{ width: number, height: number, data: Uint16Array, linear: true }}
 */
export function downscaleLinear(src, maxDim) {
  const scale = Math.min(1, maxDim / Math.max(src.width, src.height));
  const w = Math.max(1, Math.round(src.width * scale));
  const h = Math.max(1, Math.round(src.height * scale));
  const sum = new Float64Array(w * h * 3);
  const count = new Uint32Array(w * h);
  const d = src.data;
  for (let y = 0; y < src.height; y++) {
    const ty = Math.min(h - 1, Math.floor((y * h) / src.height));
    for (let x = 0; x < src.width; x++) {
      const t = ty * w + Math.min(w - 1, Math.floor((x * w) / src.width));
      const i = (y * src.width + x) * 3;
      sum[t * 3] += d[i];
      sum[t * 3 + 1] += d[i + 1];
      sum[t * 3 + 2] += d[i + 2];
      count[t]++;
    }
  }
  const data = new Uint16Array(w * h * 3);
  for (let t = 0; t < w * h; t++) {
    for (let k = 0; k < 3; k++) data[t * 3 + k] = Math.round(sum[t * 3 + k] / count[t]);
  }
  return { width: w, height: h, data, linear: true };
}

/** CSS-filter approximation for devices without WebGL2: only exposure, contrast and saturation apply. */
export function cssFilterFor(p) {
  const b = Math.round(100 * Math.pow(2, p.exposure ?? 0));
  return `brightness(${b}%) contrast(${Math.max(0, 100 + (p.contrast ?? 0))}%) saturate(${Math.max(0, 100 + (p.saturation ?? 0))}%)`;
}

/** 64-bin luminance + RGB histogram from a small downsample of `canvas`. */
export function histogram(canvas) {
  const w = 160;
  const h = Math.max(1, Math.round((canvas.height / canvas.width) * w));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const bins = { r: new Uint32Array(64), g: new Uint32Array(64), b: new Uint32Array(64), l: new Uint32Array(64) };
  for (let i = 0; i < d.length; i += 4) {
    bins.r[d[i] >> 2]++;
    bins.g[d[i + 1] >> 2]++;
    bins.b[d[i + 2] >> 2]++;
    bins.l[(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) >> 2]++;
  }
  return bins;
}
