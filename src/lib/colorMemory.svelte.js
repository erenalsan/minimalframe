// Colours the picker remembers on this device: the last three used (set with the picker, or exported from
// anywhere, the photo's own colours included) and the ones saved on purpose. The quick picks are always on
// show, so they're never added.
import { QUICK_BACKGROUNDS } from "./catalog.js";

const KEY = "mf_colors_v1";
const HEX = /^#[0-9a-f]{6}$/;
function load() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    const ok = (list) => (Array.isArray(list) ? list.filter((c) => HEX.test(c)) : []);
    return { recent: ok(v?.recent).slice(0, 3), saved: ok(v?.saved) };
  } catch {
    return { recent: [], saved: [] };
  }
}
export const colors = $state(load());
function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(colors));
  } catch {}
}

export function useColor(c) {
  c = String(c).toLowerCase();
  if (!HEX.test(c) || QUICK_BACKGROUNDS.includes(c)) return;
  colors.recent = [c, ...colors.recent.filter((x) => x !== c)].slice(0, 3);
  persist();
}
export function saveColor(c) {
  c = String(c).toLowerCase();
  if (!HEX.test(c) || colors.saved.includes(c)) return;
  colors.saved = [...colors.saved, c].slice(-12); // shortcut: keeps the 12 newest; a bigger palette needs its own screen
  persist();
}
export function forgetColor(c) {
  colors.saved = colors.saved.filter((x) => x !== c);
  persist();
}
