// Money is stored as integer US cents everywhere in the app and shown in US dollars.
export const FEE_BPS = 500;

export const feeCents = (cents: number, bps = FEE_BPS) => Math.floor((cents * bps) / 10_000);

export type DisplayCurrency = "USD";

export function formatMoney(cents: number, currency: DisplayCurrency = "USD", locale = "en") {
  // Number formatting follows the reader's language; the amount is always US dollars.
  const tag = locale === "ar" ? "ar-AE" : locale === "hi" ? "hi-IN" : "en-US";
  return new Intl.NumberFormat(tag, {
    style: "currency",
    currency,
    // Whole dollars show no cents; anything else shows exact cents.
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export const parseDollarsToCents = (input: string) => {
  const n = Number(String(input).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
};
