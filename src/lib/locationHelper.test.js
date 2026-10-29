import assert from 'node:assert/strict';
import { formatPlace, formatCoords, placeFromNominatim, placeName } from './locationHelper.js';

// IPTC fields: "City, Country"; the state stands in for a missing city.
assert.equal(formatPlace({ City: 'Passau', State: 'Bavaria', Country: 'Germany' }), 'Passau, Germany');
assert.equal(formatPlace({ State: 'Bavaria', Country: 'Germany' }), 'Bavaria, Germany');
assert.equal(formatPlace({ Country: ' Germany ' }), 'Germany');
assert.equal(formatPlace({}), '');
assert.equal(formatPlace(undefined), '');

// Coordinates: two decimals and the hemisphere.
assert.equal(formatCoords(48.5667, 13.4319), '48.57° N, 13.43° E');
assert.equal(formatCoords(-33.8688, -151.2093), '33.87° S, 151.21° W');

// Nominatim answers: the town (or the nearest named area) and the country.
assert.equal(placeFromNominatim({ address: { city: 'Passau', state: 'Bavaria', country: 'Germany' } }), 'Passau, Germany');
assert.equal(placeFromNominatim({ address: { village: 'Hallstatt', country: 'Austria' } }), 'Hallstatt, Austria');
assert.equal(placeFromNominatim({ address: { county: 'Inyo County', country: 'United States' } }), 'Inyo County, United States');
assert.equal(placeFromNominatim({ error: 'Unable to geocode' }), '');

// Lookups: asked once per place and language, then remembered.
const store = new Map();
const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
let calls = 0;
const fetch = async (url) => {
  calls++;
  assert.match(url, /nominatim\.openstreetmap\.org\/reverse\?.*lat=48\.567&lon=13\.432&accept-language=tr/, 'sent rounded to ~100 m');
  return { ok: true, json: async () => ({ address: { city: 'Passau', country: 'Almanya' } }) };
};
assert.equal(await placeName(48.5667, 13.4319, 'tr', { fetch, storage }), 'Passau, Almanya');
assert.equal(await placeName(48.56671, 13.43191, 'tr', { fetch, storage }), 'Passau, Almanya', 'a few metres away: the same place');
assert.equal(calls, 1, 'the second lookup comes from the cache');

// Offline (or blocked): the coordinates, and nothing cached so a later try can still find the name.
const offline = async () => { throw new TypeError('Failed to fetch'); };
assert.equal(await placeName(-33.8688, 151.2093, 'en', { fetch: offline, storage }), '33.87° S, 151.21° E');
assert.equal([...store.keys()].some((k) => k.includes('-33.869')), false);
// A refused request (rate limit) falls back the same way.
const refused = async () => ({ ok: false, status: 429, json: async () => ({}) });
assert.equal(await placeName(40, 29, 'en', { fetch: refused, storage }), '40.00° N, 29.00° E');
// No storage at all (private mode) still works.
assert.equal(await placeName(48.5667, 13.4319, 'de', { fetch: async () => ({ ok: true, json: async () => ({ address: { city: 'Passau', country: 'Deutschland' } }) }), storage: null }), 'Passau, Deutschland');

console.log('locationHelper: OK');
