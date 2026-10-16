/**
 * developEngine.js — MinimalFrame develop pipeline (WebGL2)
 *
 * The same shaders run the live preview (≤1080px proxy) and the full-resolution export, so what you see
 * is what you save.
 *
 * 1. develop(): per-pixel tone and colour, in tiles that fit the GPU's texture limit. Two inputs, one shader:
 *    - 8-bit sRGB images (JPEG/PNG/canvas): decoded to linear, edited, re-encoded. Neutral settings = identical.
 *    - 16-bit linear RAW data ({ width, height, data: Uint16Array RGB, linear: true } from rawEngine): uploaded
 *      as an integer texture, given a baseline lift and a soft highlight shoulder so clipped-looking detail
 *      stays recoverable.
 *    Order: linear → white balance (Bradford) → exposure → sRGB → (RAW shoulder) → whites/blacks
 *           → highlights/shadows → contrast → tone curve → colour mixer → vibrance/saturation.
 * 2. applyDetail(): clarity and sharpening. These need neighbouring pixels, so they run as a separate pass
 *    on overlapping tiles, with radii relative to the image size so preview and export match.
 */
import { whiteBalanceMatrix, curvesTexture, isIdentityCurve, CURVE_IDENTITY } from './color.js';

const MIXER_BANDS = ['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta'];
export { MIXER_BANDS };

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
  clarity: 0,      // -100..100, local contrast (detail pass)
  sharpen: 0,      // 0..100 (detail pass)
  curve: Object.freeze({ rgb: CURVE_IDENTITY, r: CURVE_IDENTITY, g: CURVE_IDENTITY, b: CURVE_IDENTITY }),
  // Per hue band: [hue shift, saturation, luminance], each -100..100.
  mixer: Object.freeze(Object.fromEntries(MIXER_BANDS.map((b) => [b, Object.freeze([0, 0, 0])]))),
  filmGrain: 0,    // 0..100, applied by effectsEngine on export
  softBloom: 0,    // 0..100, applied by effectsEngine on export
});

/** A fresh, unfrozen copy of the defaults (nested curve/mixer included). */
export const freshDev = () => JSON.parse(JSON.stringify(DEV_DEFAULTS));

// Uniforms that are sliders scaled to -1..1 in the shader (exposure is passed as-is).
const SCALED = ['contrast', 'highlights', 'shadows', 'whites', 'blacks', 'vibrance', 'saturation'];

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
uniform float exposure, contrast, highlights, shadows, whites, blacks, vibrance, saturation;
uniform mat3 wb;
uniform sampler2D lut;       // 256×1 tone curve (unit 1)
uniform bool useLut;
uniform vec3 mixer[8];       // per hue band: hue shift, saturation, luminance (-1..1)
uniform bool useMixer;
const vec3 W = vec3(0.2126, 0.7152, 0.0722);
const float CENTERS[8] = float[8](0.0, 30.0, 60.0, 120.0, 180.0, 225.0, 275.0, 320.0);

vec3 toLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 toSrgb(vec3 c) { c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }

vec3 rgb2hsl(vec3 c) {
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
  float l = (mx + mn) * 0.5, d = mx - mn;
  if (d < 1e-5) return vec3(0.0, 0.0, l);
  float s = d / (1.0 - abs(2.0 * l - 1.0));
  float h = mx == c.r ? mod((c.g - c.b) / d, 6.0) : mx == c.g ? (c.b - c.r) / d + 2.0 : (c.r - c.g) / d + 4.0;
  return vec3(h * 60.0, s, l);
}
vec3 hsl2rgb(vec3 hsl) {
  float c = (1.0 - abs(2.0 * hsl.z - 1.0)) * hsl.y;
  float h = mod(hsl.x, 360.0) / 60.0;
  float x = c * (1.0 - abs(mod(h, 2.0) - 1.0));
  vec3 rgb = h < 1.0 ? vec3(c, x, 0) : h < 2.0 ? vec3(x, c, 0) : h < 3.0 ? vec3(0, c, x)
           : h < 4.0 ? vec3(0, x, c) : h < 5.0 ? vec3(x, 0, c) : vec3(c, 0, x);
  return rgb + hsl.z - c * 0.5;
}

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
  vec3 c = wb * fetchLinear() * exp2(exposure);

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

  if (useLut) {
    s = clamp(s, 0.0, 1.0) * (255.0 / 256.0) + 0.5 / 256.0; // sample texel centres
    s = vec3(texture(lut, vec2(s.r, 0.5)).r, texture(lut, vec2(s.g, 0.5)).g, texture(lut, vec2(s.b, 0.5)).b);
  }

  if (useMixer) {
    vec3 hsl = rgb2hsl(clamp(s, 0.0, 1.0));
    // Each band's weight falls off linearly to its neighbours' centres, so weights always sum to 1.
    vec3 adj = vec3(0.0);
    for (int i = 0; i < 8; i++) {
      float c0 = CENTERS[i];
      float prev = CENTERS[(i + 7) % 8] - (i == 0 ? 360.0 : 0.0);
      float next = CENTERS[(i + 1) % 8] + (i == 7 ? 360.0 : 0.0);
      float h = hsl.x;
      if (h - c0 > 180.0) h -= 360.0;
      if (c0 - h > 180.0) h += 360.0;
      float w = h < c0 ? (h - prev) / (c0 - prev) : (next - h) / (next - c0);
      adj += mixer[i] * clamp(w, 0.0, 1.0);
    }
    float chroma = smoothstep(0.0, 0.2, hsl.y * (1.0 - abs(2.0 * hsl.z - 1.0))); // greys are left alone
    adj *= chroma;
    hsl.x += adj.x * 30.0;
    hsl.y = clamp(hsl.y * (1.0 + adj.y), 0.0, 1.0);
    hsl.z = clamp(hsl.z + adj.z * 0.2, 0.0, 1.0);
    s = hsl2rgb(hsl);
  }

  // Vibrance boosts muted colours more than already-saturated ones.
  L = dot(s, W);
  float sat = clamp(max(s.r, max(s.g, s.b)) - min(s.r, min(s.g, s.b)), 0.0, 1.0);
  s = mix(vec3(L), s, 1.0 + saturation + vibrance * (1.0 - sat));

  o = vec4(clamp(s, 0.0, 1.0), 1.0);
}`;

// Detail pass: separable blur (for clarity) and a final unsharp-mask / local-contrast combine.
const BLUR_FRAG = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 o;
uniform sampler2D src;
uniform vec2 dir; // one texel step along the blur axis
void main() {
  // 9-tap Gaussian (sigma ≈ 2 texels) using 5 bilinear fetches.
  vec3 c = texture(src, uv).rgb * 0.2270270;
  c += (texture(src, uv + dir * 1.3846154).rgb + texture(src, uv - dir * 1.3846154).rgb) * 0.3162162;
  c += (texture(src, uv + dir * 3.2307692).rgb + texture(src, uv - dir * 3.2307692).rgb) * 0.0702703;
  o = vec4(c, 1.0);
}`;

const DETAIL_FRAG = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 o;
uniform sampler2D base;   // developed tile (unit 0)
uniform sampler2D blurred; // blurred tile for clarity (unit 1)
uniform vec2 texel;
uniform float clarity, sharpen;
const vec3 W = vec3(0.2126, 0.7152, 0.0722);
void main() {
  vec3 b = texture(base, uv).rgb;
  vec3 s = b;
  if (sharpen > 0.0) {
    vec3 n = (texture(base, uv + vec2(texel.x, 0.0)).rgb + texture(base, uv - vec2(texel.x, 0.0)).rgb
            + texture(base, uv + vec2(0.0, texel.y)).rgb + texture(base, uv - vec2(0.0, texel.y)).rgb) * 0.25;
    s += sharpen * 1.6 * (b - n);
  }
  if (clarity != 0.0) {
    float L = dot(b, W);
    float Lb = dot(texture(blurred, uv).rgb, W);
    float mid = 1.0 - pow(abs(2.0 * L - 1.0), 2.0); // strongest in mid-tones, spares highlights and shadows
    s += clarity * 0.9 * (L - Lb) * mid;
  }
  o = vec4(clamp(s, 0.0, 1.0), 1.0);
}`;

let gl = null;
let glCanvas = null;
let programs = null; // { srgb8, linear16, blur, detail }
let lutTex = null;
let lastLut = null;
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
  const texture = (filter) => {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  };
  const build = (frag, names, samplers = {}) => {
    const prog = gl.createProgram();
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, frag));
    gl.bindAttribLocation(prog, 0, 'p');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    for (const [name, unit] of Object.entries(samplers)) gl.uniform1i(gl.getUniformLocation(prog, name), unit);
    const uniforms = Object.fromEntries(names.map((k) => [k, gl.getUniformLocation(prog, k)]));
    return { prog, uniforms };
  };

  const developUniforms = ['exposure', ...SCALED, 'wb', 'useLut', 'useMixer', 'mixer'];
  programs = {
    // NEAREST is required for integer textures and is exact for 1:1 rendering anyway.
    srgb8: { ...build(`#version 300 es\n${FRAG}`, developUniforms, { img: 0, lut: 1 }), tex: texture(gl.NEAREST) },
    linear16: { ...build(`#version 300 es\n#define LINEAR16\n${FRAG}`, developUniforms, { img: 0, lut: 1 }), tex: texture(gl.NEAREST) },
    blur: build(BLUR_FRAG, ['dir'], { src: 0 }),
    detail: build(DETAIL_FRAG, ['texel', 'clarity', 'sharpen'], { base: 0, blurred: 1 }),
  };
  lutTex = texture(gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(1024));

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

function setDevelopUniforms(program, params) {
  const u = program.uniforms;
  gl.useProgram(program.prog);
  gl.uniform1f(u.exposure, params.exposure ?? 0);
  for (const k of SCALED) gl.uniform1f(u[k], (params[k] ?? 0) / 100);
  gl.uniformMatrix3fv(u.wb, true, whiteBalanceMatrix(params.temperature ?? 0, params.tint ?? 0));

  const curve = params.curve ?? DEV_DEFAULTS.curve;
  const useLut = !['rgb', 'r', 'g', 'b'].every((k) => isIdentityCurve(curve[k]));
  gl.uniform1i(u.useLut, useLut);
  if (useLut) {
    const key = JSON.stringify(curve);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, lutTex);
    if (key !== lastLut) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, curvesTexture(curve));
      lastLut = key;
    }
    gl.activeTexture(gl.TEXTURE0);
  }

  const mixer = params.mixer ?? DEV_DEFAULTS.mixer;
  const flat = MIXER_BANDS.flatMap((b) => (mixer[b] ?? [0, 0, 0]).map((v) => v / 100));
  gl.uniform1i(u.useMixer, flat.some((v) => v !== 0));
  gl.uniform3fv(u.mixer, flat);
}

function draw(w, h) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  glCanvas.width = w;
  glCanvas.height = h;
  gl.viewport(0, 0, w, h);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  return glCanvas;
}

/** 8-bit image or canvas → shared WebGL canvas (copy from it before the next call). */
function developImage(source, params) {
  const p = programs.srgb8;
  setDevelopUniforms(p, params);
  gl.bindTexture(gl.TEXTURE_2D, p.tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
  return draw(source.width, source.height);
}

/** Region of 16-bit linear RGB data → shared WebGL canvas. Uploads straight from the array, no copy. */
function developLinear(src, params, x, y, w, h) {
  const p = programs.linear16;
  setDevelopUniforms(p, params);
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
  return draw(w, h);
}

const maxTile = () => Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), 4096);

/**
 * Develops `source` into `target` (a 2D canvas, resized to match), in tiles that fit the GPU.
 * @param {HTMLCanvasElement|ImageBitmap|{width:number,height:number,data:Uint16Array,linear:true}} source
 * @param {object} params  see DEV_DEFAULTS
 * @param {HTMLCanvasElement} [target]
 */
export function develop(source, params, target = document.createElement('canvas')) {
  const { width, height } = source;
  target.width = width;
  target.height = height;
  const ctx = target.getContext('2d', { alpha: false });
  const T = maxTile();

  if (source.linear) {
    for (let y = 0; y < height; y += T) {
      for (let x = 0; x < width; x += T) {
        const w = Math.min(T, width - x);
        const h = Math.min(T, height - y);
        ctx.drawImage(developLinear(source, params, x, y, w, h), x, y);
      }
    }
  } else if (width <= T && height <= T) {
    ctx.drawImage(developImage(source, params), 0, 0);
  } else {
    const tile = document.createElement('canvas');
    const tctx = tile.getContext('2d', { alpha: false });
    for (let y = 0; y < height; y += T) {
      for (let x = 0; x < width; x += T) {
        tile.width = Math.min(T, width - x);
        tile.height = Math.min(T, height - y);
        tctx.drawImage(source, x, y, tile.width, tile.height, 0, 0, tile.width, tile.height);
        ctx.drawImage(developImage(tile, params), x, y);
      }
    }
    tile.width = tile.height = 0;
  }
  return target;
}

// ─── Detail pass (clarity + sharpening) ────────────────────────────────────────
function renderTarget(w, h) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return { tex, fb, w, h, free: () => (gl.deleteTexture(tex), gl.deleteFramebuffer(fb)) };
}

/** Clarity radius in pixels: 1% of the long edge, so preview and full-size export look alike. */
const clarityRadius = (w, h) => Math.max(w, h) * 0.01;

/**
 * Applies clarity and sharpening to a developed canvas. Returns `canvas` itself when both are 0,
 * otherwise a new canvas (tiles read their neighbours, so they can't be written back in place).
 */
export function applyDetail(canvas, params) {
  const clarity = (params.clarity ?? 0) / 100;
  const sharpen = (params.sharpen ?? 0) / 100;
  if (!clarity && !sharpen) return canvas;

  const { width, height } = canvas;
  const radius = clarityRadius(width, height);
  const down = Math.max(1, Math.round(radius / 2)); // blur at reduced size: sigma 2 texels × down ≈ radius
  const margin = Math.ceil(radius * 3) + 2;
  const T = maxTile() - 2 * margin;

  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const octx = out.getContext('2d', { alpha: false });
  const tile = document.createElement('canvas');
  const tctx = tile.getContext('2d', { alpha: false });

  for (let y = 0; y < height; y += T) {
    for (let x = 0; x < width; x += T) {
      const w = Math.min(T, width - x), h = Math.min(T, height - y);
      // Tile plus a margin of neighbours (clipped at the image edge).
      const x0 = Math.max(0, x - margin), y0 = Math.max(0, y - margin);
      const x1 = Math.min(width, x + w + margin), y1 = Math.min(height, y + h + margin);
      tile.width = x1 - x0;
      tile.height = y1 - y0;
      tctx.drawImage(canvas, x0, y0, tile.width, tile.height, 0, 0, tile.width, tile.height);

      const base = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, base);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, tile);

      // Blur: downsample + horizontal, then vertical, at 1/down size.
      const bw = Math.max(1, Math.round(tile.width / down)), bh = Math.max(1, Math.round(tile.height / down));
      const A = renderTarget(bw, bh), B = renderTarget(bw, bh);
      gl.useProgram(programs.blur.prog);
      gl.viewport(0, 0, bw, bh);
      gl.bindFramebuffer(gl.FRAMEBUFFER, A.fb);
      gl.bindTexture(gl.TEXTURE_2D, base);
      gl.uniform2f(programs.blur.uniforms.dir, down / tile.width, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, B.fb);
      gl.bindTexture(gl.TEXTURE_2D, A.tex);
      gl.uniform2f(programs.blur.uniforms.dir, 0, 1 / bh);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // Combine at full tile size into the canvas, then keep only the inner (margin-free) part.
      gl.useProgram(programs.detail.prog);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, B.tex);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, base);
      gl.uniform2f(programs.detail.uniforms.texel, 1 / tile.width, 1 / tile.height);
      gl.uniform1f(programs.detail.uniforms.clarity, clarity);
      gl.uniform1f(programs.detail.uniforms.sharpen, sharpen);
      draw(tile.width, tile.height);
      octx.drawImage(glCanvas, x - x0, y - y0, w, h, x, y, w, h);

      A.free();
      B.free();
      gl.deleteTexture(base);
    }
  }
  tile.width = tile.height = 0;
  return out;
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

/** Area-averaging downscale of 16-bit linear RGB data (averaging in linear light is the correct way). */
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
