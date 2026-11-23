import type { Locale } from "@/lib/db/schema";

export const LOCALES: Locale[] = ["en", "ar", "hi"];
export const LOCALE_NAMES: Record<Locale, string> = { en: "English", ar: "العربية", hi: "हिन्दी" };

type DeepPartial<T> = { [K in keyof T]?: T[K] extends (...a: never[]) => unknown ? T[K] : T[K] extends object ? DeepPartial<T[K]> : T[K] };

function merge<T>(base: T, over: unknown): T {
  if (!over || typeof over !== "object" || Array.isArray(over)) return (over ?? base) as T;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over)) {
    const b = (base as Record<string, unknown>)[k];
    out[k] = b && typeof b === "object" && !Array.isArray(b) && typeof v === "object" ? merge(b, v) : v;
  }
  return out as T;
}

// Each module keeps its strings next to its code; Arabic and Hindi fall back to English key by key.
export function strings<T extends object>(defs: { en: T; ar?: DeepPartial<T>; hi?: DeepPartial<T> }) {
  const cache = new Map<Locale, T>();
  return (locale: Locale): T => {
    if (locale === "en" || !defs[locale]) return defs.en;
    if (!cache.has(locale)) cache.set(locale, merge(defs.en, defs[locale]));
    return cache.get(locale)!;
  };
}
