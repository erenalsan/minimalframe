// How people reach the developer, and which build they're on.
export const VERSION = __APP_VERSION__;
export const EMAIL = "eren.alsan@outlook.com";
export const PRIVACY_URL = "https://github.com/erenalsan/minimalframe/blob/main/PRIVACY.md";

// The subject carries the version and the device, so a report says which build it's about.
export function feedbackHref() {
  const isApp = typeof window !== "undefined" && !!window.Capacitor?.isNativePlatform?.();
  const subject = `MinimalFrame ${VERSION} feedback (${isApp ? "Android app" : "web"})`;
  const body = `\n\n---\n${typeof navigator !== "undefined" ? navigator.userAgent : ""}`;
  return `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
