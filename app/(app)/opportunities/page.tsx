import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOnboarded } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { getPrefs } from "@/lib/i18n";
import { workStrings } from "@/lib/i18n/work";
import { opportunityFeed } from "@/lib/opportunities";
import { Badge, Empty, LinkButton, Money, PageHeader, Sheet } from "@/components/ui";
import { ActionButton } from "@/components/ui/client";
import { deliverablesText, FitBadges, platformsText, RecordLine } from "./parts";

export const metadata: Metadata = { title: "Find work | EVRA" };

export default async function OpportunitiesPage() {
  const user = await requireOnboarded();
  if (user.role === "brand") redirect("/brand");
  const db = await getDb();
  const { locale, currency } = await getPrefs(user.locale);
  const t = workStrings(locale);
  const feed = await opportunityFeed(db, user);

  return (
    <main className="ev-page">
      <PageHeader title={t.feed.title} lead={t.feed.lead} />
      <nav className="ev-row" aria-label={t.feed.title} style={{ marginBottom: 20 }}>
        <LinkButton href="/challenges" variant="soft" small>
          {t.links.challenges}
        </LinkButton>
        <LinkButton href="/requests" variant="soft" small>
          {t.links.requests}
        </LinkButton>
        <LinkButton href="/brands" variant="soft" small>
          {t.links.brands}
        </LinkButton>
        <LinkButton href="/collectives" variant="soft" small>
          {t.links.collectives}
        </LinkButton>
      </nav>
      {feed.length === 0 ? (
        <Sheet>
          <Empty title={t.feed.empty} />
        </Sheet>
      ) : (
        <ul className="ev-grid" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {feed.map(({ o, brand, fit, record }) => (
            <li key={o.id}>
              <Sheet className="ev-stack" style={{ height: "100%" }}>
                <div className="ev-stack" style={{ ["--gap" as string]: "4px" }}>
                  <div className="ev-spread">
                    <span className="ev-muted ev-small">{brand.name}</span>
                    {o.audience !== "public" && <Badge tone="ink">{t.audience[o.audience]}</Badge>}
                  </div>
                  <h2 className="ev-h2">
                    <Link href={`/opportunities/${o.id}`} prefetch={false}>
                      {o.title}
                    </Link>
                  </h2>
                </div>
                <div>
                  <Money cents={o.budgetCents} currency={currency} locale={locale} size="md" />
                  <p className="ev-small ev-muted">
                    {t.feed.budget}, {t.feed.locked}
                  </p>
                </div>
                <p className="ev-small">
                  {deliverablesText(o, t)} · {platformsText(o, t)} · {o.country ? t.countries[o.country] : t.anywhere} · {t.feed.creators(o.slots)}
                </p>
                <RecordLine record={record} t={t} />
                <FitBadges reasons={fit.reasons} t={t} />
                <div className="ev-row" style={{ marginTop: "auto" }}>
                  <ActionButton url={`/api/opportunities/${o.id}/interest`}>{t.feed.interested}</ActionButton>
                  <LinkButton href={`/opportunities/${o.id}`} prefetch={false} variant="secondary">
                    {t.feed.read}
                  </LinkButton>
                </div>
              </Sheet>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
