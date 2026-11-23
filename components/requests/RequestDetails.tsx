import type { ReactNode } from "react";
import type { Locale } from "@/lib/db/schema";
import type { DisplayCurrency } from "@/lib/money";
import { requestStrings } from "@/lib/i18n/requests";
import { KeyValues, Money } from "@/components/ui";

type Details = { deliverable?: string; product?: string; date?: string; place?: string; minutes?: number; postUrl?: string; months?: number };

// The short-form answers a brand gave, as label and value pairs. Works in server and client components.
export function RequestDetails({ amountCents, details, locale, currency }: { amountCents: number | null; details: Record<string, unknown>; locale: Locale; currency: DisplayCurrency }) {
  const t = requestStrings(locale);
  const d = details as Details;
  const items: [ReactNode, ReactNode][] = [];
  if (amountCents) items.push([t.fields.amountLabel, <Money key="a" cents={amountCents} currency={currency} locale={locale} />]);
  if (d.deliverable) items.push([t.fields.deliverable, t.deliverables[d.deliverable as keyof typeof t.deliverables] ?? d.deliverable]);
  if (d.product) items.push([t.fields.product, d.product]);
  if (d.date) items.push([t.fields.date, d.date]);
  if (d.place) items.push([t.fields.place, d.place]);
  if (d.minutes) items.push([t.fields.minutes, d.minutes]);
  if (d.postUrl && /^https?:\/\//i.test(d.postUrl))
    items.push([
      t.fields.postUrl,
      <a key="u" className="ev-link" href={d.postUrl} target="_blank" rel="noopener noreferrer" dir="ltr" style={{ overflowWrap: "anywhere" }}>
        {d.postUrl}
      </a>,
    ]);
  if (d.months) items.push([t.fields.months, d.months]);
  return items.length ? <KeyValues items={items} /> : null;
}
