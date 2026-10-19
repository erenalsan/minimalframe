// Interface language. The English text is the key: t("Export") gives the Turkish or German version when there
// is one, otherwise the English itself, so a missing translation never blanks the interface.
// {name} placeholders are filled from vars: t("Saved {n} images", { n: 3 }).
// The choice is remembered on this device; the first visit follows the phone's language.
import tr from "./locales/tr.js";
import de from "./locales/de.js";

export const LANGUAGES = [
  ["en", "English"],
  ["tr", "Türkçe"],
  ["de", "Deutsch"],
];
const DICTS = { tr, de };
const KEY = "mf_lang";

function initialLang() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && LANGUAGES.some(([id]) => id === saved)) return saved;
  } catch {}
  const wanted = typeof navigator !== "undefined" ? navigator.languages ?? [navigator.language] : [];
  for (const l of wanted) {
    const id = String(l).slice(0, 2).toLowerCase();
    if (LANGUAGES.some(([x]) => x === id)) return id;
  }
  return "en";
}

export const i18n = $state({ lang: initialLang() });
if (typeof document !== "undefined") document.documentElement.lang = i18n.lang;

export function setLang(lang) {
  i18n.lang = lang;
  document.documentElement.lang = lang;
  try {
    localStorage.setItem(KEY, lang);
  } catch {}
}

export function t(text, vars) {
  const out = DICTS[i18n.lang]?.[text] ?? text;
  return vars ? out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)) : out;
}
