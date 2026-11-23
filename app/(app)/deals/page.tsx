import type { Metadata } from "next";
import Link from "next/link";
import { inArray } from "drizzle-orm";
import { requireOnboarded } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { brands, dealTerms, users } from "@/lib/db/schema";
import { getPrefs } from "@/lib/i18n";
import { dealStrings } from "@/lib/i18n/deals";
import { dealListFor } from "@/lib/deals/actions";
import { termsTotal } from "@/lib/deals/terms";
import { Badge, Empty, LinkButton, Money, PageHeader, Sheet } from "@/components/ui";

export const metadata: Metadata = { title: "Deals | EVRA" };

export default async function DealsPage() {
  const user = await requireOnboarded();
  const { locale, currency } = await getPrefs(user.locale);
  const t = dealStrings(locale);
  const db = await getDb();
  const list = await dealListFor(db, user);
  const termIds = list.map((d) => d.currentTermsId).filter(Boolean) as string[];
  const [terms, brandRows, creatorRows] = await Promise.all([
    termIds.length ? db.select().from(dealTerms).where(inArray(dealTerms.id, termIds)) : Promise.resolve([]),
    list.length ? db.select({ id: brands.id, name: brands.name }).from(brands).where(inArray(brands.id, [...new Set(list.map((d) => d.brandId))])) : Promise.resolve([]),
    list.length ? db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, [...new Set(list.map((d) => d.creatorId))])) : Promise.resolve([]),
  ]);
  const totals = new Map(terms.map((x) => [x.dealId, termsTotal(x.terms)]));
  const other = new Map([...brandRows.map((b) => [b.id, b.name] as const), ...creatorRows.map((c) => [c.id, c.name ?? ""] as const)]);
  const isBrand = user.role === "brand";
  return (
    <main className="ev-page">
      <PageHeader title={t.title} lead={t.lead} action={<LinkButton href="/requests" variant="secondary" small>Requests</LinkButton>} />
      {list.length === 0 ? (
        <Sheet>
          <Empty title={t.empty} action={<LinkButton href={isBrand ? "/creators" : "/opportunities"}>{isBrand ? "Find creators" : "Find work"}</LinkButton>}>
            {isBrand ? t.emptyBrand : t.emptyCreator}
          </Empty>
        </Sheet>
      ) : (
        <Sheet flush>
          <ul className="ev-list">
            {list.map((d) => (
              <li key={d.id}>
                <Link className="ev-rowlink" href={`/deals/${d.id}`}>
                  <span className="ev-stack" style={{ ["--gap" as string]: "2px" }}>
                    <strong>{d.title}</strong>
                    <span className="ev-muted ev-small">{t.with(other.get(isBrand ? d.creatorId : d.brandId) ?? "")}</span>
                  </span>
                  <span className="ev-row">
                    {totals.has(d.id) && <Money cents={totals.get(d.id)!} currency={currency} locale={locale} />}
                    <Badge tone={d.status === "completed" ? "ok" : d.status === "disputed" ? "bad" : d.status === "active" ? "ink" : undefined}>{t.state[d.status].replace(/\..*$/, "")}</Badge>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Sheet>
      )}
    </main>
  );
}
