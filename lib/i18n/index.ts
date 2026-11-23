import { cookies } from "next/headers";
import type { Locale } from "@/lib/db/schema";
import type { DisplayCurrency } from "@/lib/money";
import { LOCALES } from "./strings";

export { LOCALES, LOCALE_NAMES, strings } from "./strings";

export type TextSize = "md" | "lg" | "xl";
export type Prefs = { locale: Locale; currency: DisplayCurrency; text: TextSize; dir: "ltr" | "rtl" };

export async function getPrefs(fallback?: Locale): Promise<Prefs> {
  const c = await cookies();
  const l = c.get("evra_lang")?.value as Locale | undefined;
  const locale = l && LOCALES.includes(l) ? l : (fallback ?? "en");
  const currency: DisplayCurrency = "USD";
  const t = c.get("evra_text")?.value as TextSize | undefined;
  return { locale, currency, text: t && ["md", "lg", "xl"].includes(t) ? t : "md", dir: locale === "ar" ? "rtl" : "ltr" };
}
