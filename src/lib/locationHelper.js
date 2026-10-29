/**
 * locationHelper.js — the place a photo was taken, as caption text ("Passau, Germany").
 * From the photo's own IPTC place fields when it has them (no network). From its GPS position otherwise:
 * looked up on OpenStreetMap's Nominatim, once per place (kept in localStorage), and only when the user turns
 * the location on. Offline, or if the lookup fails, the coordinates themselves ("48.57° N, 13.43° E").
 */

const NOMINATIM = "https://nominatim.openstreetmap.org/reverse";
const CACHE_PREFIX = "mf_geo_v1:";
const GAP_MS = 1100; // Nominatim's usage policy: at most one request per second

/** "City, Country" from IPTC fields (state when there is no city); "" when there's nothing to show. */
export function formatPlace({ City, State, Country } = {}) {
  const clean = (s) => (typeof s === "string" ? s.trim() : "");
  const place = clean(City) || clean(State);
  return [place, clean(Country)].filter(Boolean).join(", ");
}

/** "48.57° N, 13.43° E" */
export function formatCoords(lat, lon) {
  const part = (v, pos, neg) => `${Math.abs(v).toFixed(2)}° ${v >= 0 ? pos : neg}`;
  return `${part(lat, "N", "S")}, ${part(lon, "E", "W")}`;
}

/** The place name in a Nominatim reverse-lookup answer: town (or the nearest named area) and country. */
export function placeFromNominatim(json) {
  const a = json?.address;
  if (!a) return "";
  const town = a.city || a.town || a.village || a.municipality || a.county || a.state;
  return [town, a.country].filter(Boolean).join(", ");
}

const keyFor = (lat, lon, lang) => `${CACHE_PREFIX}${lat.toFixed(3)},${lon.toFixed(3)}:${lang}`; // ~100 m
const read = (storage, key) => {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
};
const write = (storage, key, value) => {
  try {
    storage?.setItem(key, value);
  } catch {} // private mode or full: the next lookup just asks again
};

let queue = Promise.resolve();
let last = 0;
/** Runs `job` after the previous one, at least GAP_MS after the last request started. */
function spaced(job) {
  const run = queue.then(async () => {
    const wait = last + GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    return job();
  });
  queue = run.catch(() => {});
  return run;
}

/**
 * The place name for a GPS position, in the given language; the coordinates when it can't be looked up.
 * @param {number} lat
 * @param {number} lon
 * @param {string} [lang]  interface language, so names come back as the user reads them ("Almanya")
 * @param {{ fetch?: typeof fetch, storage?: Storage }} [env]  for tests
 */
export async function placeName(lat, lon, lang = "en", env = {}) {
  const storage = "storage" in env ? env.storage : globalThis.localStorage;
  const doFetch = env.fetch ?? globalThis.fetch;
  const key = keyFor(lat, lon, lang);
  const cached = read(storage, key);
  if (cached) return cached;
  try {
    const name = await spaced(async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      try {
        // ~100 m is plenty for a town's name, and sends less about where the user was than the exact fix
        const url = `${NOMINATIM}?format=jsonv2&zoom=10&addressdetails=1&lat=${lat.toFixed(3)}&lon=${lon.toFixed(3)}&accept-language=${encodeURIComponent(lang)}`;
        const res = await doFetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return placeFromNominatim(await res.json());
      } finally {
        clearTimeout(timer);
      }
    });
    if (name) {
      write(storage, key, name);
      return name;
    }
  } catch {} // offline, blocked or slow: fall back to the coordinates (not cached, so a later try can still find the name)
  return formatCoords(lat, lon);
}
