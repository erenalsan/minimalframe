// HEIF/HEIC photos ("high efficiency" mode on Samsung phones, iPhones). Chrome on Android can't decode them,
// so they go through libheif (libheif-js: WebAssembly, ~2 MB, LGPL-3.0, loaded only when a HEIF file is
// opened). The result is a high-quality JPEG, so preview, editing and export treat it like any photo.

export const isHeif = (file) => /\.(heic|heif|hif)$/i.test(file.name) || /^image\/hei[cf]/i.test(file.type);

let libheif = null;

/** A blob the browser can decode: the file itself where HEIF is supported natively (Safari), else a JPEG. */
export async function heifSource(file) {
  try {
    (await createImageBitmap(file)).close();
    return file;
  } catch {} // not supported natively: decode it ourselves
  libheif ??= import("libheif-js/libheif-wasm/libheif-bundle.mjs").then((m) => m.default());
  const lib = await libheif;
  const decoder = new lib.HeifDecoder();
  const images = decoder.decode(new Uint8Array(await file.arrayBuffer()));
  if (!images?.length) throw new Error("this HEIF file has no image this app can read");
  const image = images[0]; // the primary image; the camera's rotation is applied by libheif
  const width = image.get_width();
  const height = image.get_height();
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const pixels = ctx.createImageData(width, height);
  await new Promise((ok, fail) => image.display(pixels, (out) => (out ? ok() : fail(new Error("HEIF decoding failed")))));
  ctx.putImageData(pixels, 0, 0);
  for (const img of images) img.free?.();
  const blob = await new Promise((ok) => canvas.toBlob(ok, "image/jpeg", 0.95));
  canvas.width = canvas.height = 0; // release the full-size bitmap now
  if (!blob) throw new Error("could not convert the HEIF photo");
  return blob;
}
