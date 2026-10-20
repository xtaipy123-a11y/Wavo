export type Locale = "en" | "de" | "ru" | "uk" | "es";

const LOCALE_STORAGE_KEY = "wavo_locale";

export function getStoredLocale(): Locale {
  if (typeof window === "undefined" || !window.localStorage) return "en";
  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  if (stored === "en" || stored === "de" || stored === "ru" || stored === "uk" || stored === "es") return stored;
  // Handle legacy stored 'ua'
  if (stored === "ua") {
    storeLocale("uk");
    return "uk";
  }
  return getBrowserLocale();
}

export function storeLocale(locale: Locale): void {
  if (typeof window !== "undefined") {
    const changed = window.localStorage.getItem(LOCALE_STORAGE_KEY) !== locale;
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    if (changed && typeof window.dispatchEvent === "function") window.dispatchEvent(new Event("wavo:locale-changed"));
  }
}

export function getBrowserLocale(): Locale {
  if (typeof window === "undefined") return "ru";
  const langs = window.navigator.languages ?? [window.navigator.language];
  for (const l of langs) {
    const code = l.slice(0, 2).toLowerCase();
    if (code === "en") return "en";
    if (code === "de") return "de";
    if (code === "es") return "es";
    if (code === "ru") return "ru";
    if (code === "uk" || code === "ua") return "uk";
  }
  return "ru";
}
