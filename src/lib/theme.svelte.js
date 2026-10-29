// Light, dark, or the device's own setting ("auto"), remembered on this device. The colours themselves are
// tokens in app.css; this only sets <html data-theme> (absent for auto), so every component follows at once.
const KEY = "mf_theme_v1";
const read = () => {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "auto";
  } catch {
    return "auto";
  }
};

export const theme = $state({ choice: read() });

function apply() {
  const root = document.documentElement;
  if (theme.choice === "auto") delete root.dataset.theme;
  else root.dataset.theme = theme.choice;
  // the phone's status bar and the browser's toolbar take the app's surface colour
  const surface = getComputedStyle(root).getPropertyValue("--surface").trim();
  for (const m of document.querySelectorAll('meta[name="theme-color"]')) m.content = surface;
}

export function setTheme(choice) {
  if (choice === theme.choice) return;
  theme.choice = choice;
  try {
    localStorage.setItem(KEY, choice);
  } catch {}
  // a short cross-fade instead of a flash (app.css, html.theme-fade)
  const root = document.documentElement;
  root.classList.add("theme-fade");
  apply();
  setTimeout(() => root.classList.remove("theme-fade"), 350);
}

if (typeof document !== "undefined") apply();
