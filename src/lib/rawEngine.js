/**
 * rawEngine.js — MinimalFrame RAW decoding
 *
 *  1. If the RAW carries a large embedded JPEG (Canon, Nikon, Fuji, most DNGs), use it: instant and full quality.
 *  2. Otherwise demosaic the sensor data with LibRaw (WebAssembly, runs in a Web Worker).
 *  3. If LibRaw fails, fall back to whatever embedded preview exists, else report a clear error.
 */
import * as exifr from 'exifr';

export const RAW_EXTENSIONS = [
  'arw', 'cr2', 'cr3', 'dng', 'nef',
  'orf', 'raf', 'rw2', 'pef', 'srw'
];

const RAW_EXTENSION_REGEX = new RegExp(`\\.(${RAW_EXTENSIONS.join('|')})$`, 'i');

// Embedded previews at least this large are treated as full quality (skips the slow LibRaw path).
const MIN_PREVIEW_EDGE = 3000;

export function isRawFile(fileOrName) {
  if (!fileOrName) return false;
  const name = typeof fileOrName === 'string' ? fileOrName : fileOrName.name;
  return Boolean(name && RAW_EXTENSION_REGEX.test(name));
}

export function getRawFormatInfo(filename) {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  const brandMap = {
    arw: 'Sony RAW',
    cr2: 'Canon RAW',
    cr3: 'Canon RAW',
    dng: 'DNG',
    nef: 'Nikon RAW',
    orf: 'Olympus RAW',
    raf: 'Fujifilm RAW',
    rw2: 'Panasonic RAW',
    pef: 'Pentax RAW',
    srw: 'Samsung RAW'
  };
  return { extension: ext, brand: brandMap[ext] || 'RAW' };
}

/** EXIF orientation (1 = upright, 3 = 180°, 6 = 90° CW, 8 = 90° CCW, …). */
export async function getRawOrientation(arrayBuffer) {
  try {
    const o = await exifr.orientation(arrayBuffer);
    return typeof o === 'number' ? o : 1;
  } catch {
    return 1;
  }
}

// ─── Embedded JPEG preview ─────────────────────────────────────────────────────
function getJpegDimensions(bytes, start, end) {
  let i = start + 2;
  const scanLimit = Math.min(end, start + 65536);
  while (i < scanLimit - 8) {
    if (bytes[i] === 0xff) {
      const marker = bytes[i + 1];
      if (marker >= 0xc0 && marker <= 0xc3) {
        const h = (bytes[i + 5] << 8) | bytes[i + 6];
        const w = (bytes[i + 7] << 8) | bytes[i + 8];
        if (w > 0 && h > 0) return { width: w, height: h };
      }
      const len = (bytes[i + 2] << 8) | bytes[i + 3];
      if (len > 0) {
        i += 2 + len;
        continue;
      }
    }
    i++;
  }
  return { width: 0, height: 0 };
}

/** Returns the largest embedded JPEG as { blob, width, height }, or null. */
export function extractEmbeddedJpeg(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const len = bytes.length;
  let best = null;

  for (let i = 0; i < len - 4; i++) {
    if (bytes[i] !== 0xff || bytes[i + 1] !== 0xd8 || bytes[i + 2] !== 0xff) continue;
    const start = i;
    const maxScan = Math.min(len - 1, start + 35 * 1024 * 1024);
    let end = -1;
    for (let j = start + 4; j < maxScan; j++) {
      if (bytes[j] === 0xff && bytes[j + 1] === 0xd9) {
        end = j + 2;
        break;
      }
    }
    if (end === -1) continue;
    if (end - start > 12000) {
      const dims = getJpegDimensions(bytes, start, end);
      const pixels = dims.width * dims.height;
      if (!best || pixels > best.pixels) best = { start, end, pixels, ...dims };
    }
    i = end - 1;
  }

  if (!best) return null;
  return {
    blob: new Blob([bytes.slice(best.start, best.end)], { type: 'image/jpeg' }),
    width: best.width,
    height: best.height
  };
}

// ─── LibRaw (WebAssembly) ──────────────────────────────────────────────────────
async function libRawImage(arrayBuffer, settings) {
  // Loaded on demand so the ~1.4 MB wasm only ships to people who open RAW files.
  const { default: LibRaw } = await import('libraw-wasm');
  const raw = new LibRaw();
  try {
    // Copy: the worker may take ownership of the buffer it is given.
    await raw.open(new Uint8Array(arrayBuffer.slice(0)), settings);
    const img = await raw.imageData();
    if (!img || img.colors !== 3 || img.bits !== settings.outputBps) throw new Error('Unexpected LibRaw output format');
    return img;
  } finally {
    raw.dispose();
  }
}

/**
 * Decodes the sensor data to linear-light, 16-bit RGB (sRGB primaries, camera white balance, no tone curve,
 * no auto-brightening). Keeps the highlight headroom the camera JPEG throws away; developEngine renders it.
 * `half` skips demosaicing for a quick half-size decode (used for the on-screen proxy).
 * @returns {Promise<{ width: number, height: number, data: Uint16Array, linear: true }>}
 */
export async function decodeRawLinear(file, { half = false } = {}) {
  const img = await libRawImage(await file.arrayBuffer(), {
    outputBps: 16,
    gamm: [1, 1],
    noAutoBright: true,
    useCameraWb: true,
    outputColor: 1,
    halfSize: half,
  });
  return { width: img.width, height: img.height, data: img.data, linear: true };
}

// 8-bit decode → JPEG, for devices without WebGL2 (they cannot render linear data).
async function decodeWithLibRaw(arrayBuffer) {
  const img = await libRawImage(arrayBuffer, { useCameraWb: true, outputBps: 8 });

  const { width, height, data } = img;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
    rgba[j] = data[i];
    rgba[j + 1] = data[i + 1];
    rgba[j + 2] = data[i + 2];
    rgba[j + 3] = 255;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').putImageData(new ImageData(rgba, width, height), 0, 0);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.95));
  canvas.width = canvas.height = 0;
  if (!blob) throw new Error('Could not encode decoded RAW');
  return blob;
}

/**
 * Decodes a RAW file into a JPEG blob.
 * `oriented` is true when the pixels are already upright (LibRaw applies the camera's rotation itself).
 * @param {File} file
 * @returns {Promise<{ blob: Blob, oriented: boolean }>}
 */
export async function processRawFile(file) {
  const arrayBuffer = await file.arrayBuffer();
  const preview = extractEmbeddedJpeg(arrayBuffer);

  if (preview && Math.max(preview.width, preview.height) >= MIN_PREVIEW_EDGE) {
    return { blob: preview.blob, oriented: false };
  }

  try {
    return { blob: await decodeWithLibRaw(arrayBuffer), oriented: true };
  } catch (err) {
    console.warn('[rawEngine] LibRaw decode failed:', err);
    if (preview) return { blob: preview.blob, oriented: false };
    throw new Error(`this ${getRawFormatInfo(file.name).brand} file could not be decoded`);
  }
}
