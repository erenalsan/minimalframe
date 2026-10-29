/**
 * styleCode.js — a frame and a look as one short piece of text ("MF1.…") to send to anyone: they paste it
 * (or share it into the app) and get the same style. Only what differs from the defaults is kept, then
 * compressed. Codes come from other people, so decoding goes through the same checks as an imported library.
 */
import { sanitizeTemplate, sanitizeDev } from "./library.js";

const PREFIX = "MF1.";
const MAX_JSON = 32_000; // a real style is well under 2 KB; anything bigger isn't one

/** The first style code in a message ("My MinimalFrame style: MF1.…"), or null. */
export const findStyleCode = (text) => String(text ?? "").match(/MF1\.[A-Za-z0-9_-]{8,8000}/)?.[0] ?? null;

const changed = (obj, base) => Object.fromEntries(Object.entries(obj).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(base?.[k])));
const through = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
const toB64u = (bytes) => btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join("")).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

/** @returns {Promise<string>} "MF1.…" */
export async function encodeStyle(frame, dev, frameDefaults, devDefaults) {
  const json = JSON.stringify({ f: changed(frame, frameDefaults), d: changed(dev, devDefaults) });
  return PREFIX + toB64u(await through(new TextEncoder().encode(json), new CompressionStream("deflate-raw")));
}

/**
 * @param {string} text  a code, or a message containing one
 * @param {object} frameDefaults  the app's default frame settings (allowed keys and types)
 * @returns {Promise<null | { frame: object, dev: object }>}  the whole style (defaults plus the code), or null
 */
export async function decodeStyle(text, frameDefaults) {
  const code = findStyleCode(text);
  if (!code) return null;
  try {
    const bytes = await through(fromB64u(code.slice(PREFIX.length)), new DecompressionStream("deflate-raw"));
    if (bytes.length > MAX_JSON) return null;
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (!data || typeof data !== "object") return null;
    const { name, dev: _, ...f } = sanitizeTemplate(data.f, frameDefaults);
    return {
      frame: { ...frameDefaults, ...f, exifDisplay: { ...frameDefaults.exifDisplay, ...f.exifDisplay } },
      dev: sanitizeDev(data.d),
    };
  } catch {
    return null; // not base64, not deflate, not JSON: not a code
  }
}
