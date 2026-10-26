// Camera info for exports that keep it: a small EXIF block (camera, lens, settings, date) written into a JPEG.
// Location, serial numbers and everything else are never written. Little-endian TIFF, as cameras write it.

const ASCII = 2, SHORT = 3, LONG = 4, RATIONAL = 5;

const ascii = (s) => [...new TextEncoder().encode(String(s)), 0];
const le = (v, n) => Array.from({ length: n }, (_, i) => (v >>> (8 * i)) & 0xff);
const rational = (num, den) => [...le(num, 4), ...le(den, 4)];
const tenths = (v) => rational(Math.round(v * 10), 10);
const pad = (n) => String(n).padStart(2, "0");
const exifDate = (d) =>
  `${d.getFullYear()}:${pad(d.getMonth() + 1)}:${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

/**
 * cam: { make, model, lens, fNumber, exposure (seconds), iso, focal (mm), taken (Date) }, any of them missing.
 * @returns {Uint8Array | null} the APP1 payload ("Exif\0\0" + TIFF), or null when there is nothing to write
 */
export function buildExif(cam) {
  const e = (tag, type, data, count = type === ASCII ? data.length : data.length / { 3: 2, 4: 4, 5: 8 }[type]) => ({ tag, type, data, count });
  const exif = [
    cam.exposure > 0 && e(0x829a, RATIONAL, cam.exposure < 1 ? rational(1, Math.round(1 / cam.exposure)) : tenths(cam.exposure)),
    cam.fNumber > 0 && e(0x829d, RATIONAL, tenths(cam.fNumber)),
    cam.iso > 0 && e(0x8827, SHORT, le(Math.min(65535, Math.round(cam.iso)), 2)),
    cam.taken instanceof Date && !isNaN(cam.taken) && e(0x9003, ASCII, ascii(exifDate(cam.taken))),
    cam.focal > 0 && e(0x920a, RATIONAL, tenths(cam.focal)),
    cam.lens && e(0xa434, ASCII, ascii(cam.lens)),
  ].filter(Boolean);
  const ifd0 = [
    cam.make && e(0x010f, ASCII, ascii(cam.make)),
    cam.model && e(0x0110, ASCII, ascii(cam.model)),
    e(0x0112, SHORT, le(1, 2)), // the pixels are already upright
    e(0x0131, ASCII, ascii("MinimalFrame")),
  ].filter(Boolean);
  if (!exif.length && ifd0.length === 2) return null;

  // header · IFD0 · IFD0 values · Exif IFD · Exif values
  const ifdSize = (n) => 2 + n * 12 + 4;
  const valuesSize = (list) => list.reduce((a, x) => a + (x.data.length > 4 ? x.data.length + (x.data.length & 1) : 0), 0);
  const exifStart = 8 + ifdSize(ifd0.length + 1) + valuesSize(ifd0);
  ifd0.push(e(0x8769, LONG, le(exifStart, 4))); // where the Exif IFD starts
  ifd0.sort((a, b) => a.tag - b.tag);
  const total = exifStart + ifdSize(exif.length) + valuesSize(exif);

  const out = new Uint8Array(6 + total);
  out.set([0x45, 0x78, 0x69, 0x66, 0, 0]); // "Exif\0\0"
  const tiff = out.subarray(6);
  tiff.set([0x49, 0x49, 42, 0, 8, 0, 0, 0]); // "II", 42, IFD0 at 8
  const writeIfd = (list, start) => {
    tiff.set(le(list.length, 2), start);
    let values = start + ifdSize(list.length);
    list.forEach((x, i) => {
      const at = start + 2 + i * 12;
      tiff.set([...le(x.tag, 2), ...le(x.type, 2), ...le(x.count, 4)], at);
      if (x.data.length <= 4) tiff.set(x.data, at + 8);
      else {
        tiff.set(le(values, 4), at + 8);
        tiff.set(x.data, values);
        values += x.data.length + (x.data.length & 1);
      }
    });
    // next-IFD offset stays 0
  };
  writeIfd(ifd0, 8);
  writeIfd(exif, exifStart);
  return out;
}

/** The JPEG with the EXIF block inserted after its start (and after a JFIF header, when there is one). */
export async function withExif(jpeg, cam) {
  const payload = buildExif(cam);
  if (!payload || payload.length > 65533) return jpeg;
  const bytes = new Uint8Array(await jpeg.arrayBuffer());
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return jpeg; // not a JPEG: leave it alone
  const at = bytes[2] === 0xff && bytes[3] === 0xe0 ? 4 + ((bytes[4] << 8) | bytes[5]) : 2;
  const len = payload.length + 2;
  const app1 = new Uint8Array([0xff, 0xe1, len >> 8, len & 0xff, ...payload]);
  return new Blob([bytes.subarray(0, at), app1, bytes.subarray(at)], { type: jpeg.type || "image/jpeg" });
}
