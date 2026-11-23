import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboarded } from "@/lib/auth/guards";
import { recordView } from "@/lib/analytics";
import { getDb } from "@/lib/db";
import { getPrefs } from "@/lib/i18n";
import { workStrings } from "@/lib/i18n/work";
import { getOpportunity } from "@/lib/opportunities";
import { KeyValues, LinkButton, Money, PageHeader, Sheet } from "@/components/ui";
import { ActionButton } from "@/components/ui/client";
import { deliverablesText, platformsText, RecordLine, safeHref } from "../parts";

export const metadata: Metadata = { title: "Brief | EVRA" };

export default async function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireOnboarded();
  const { id } = await params;
  const db = await getDb();
  const found = await getOpportunity(db, id, user);
  if (!found) notFound();
  const { o, brand, record, collective, dealId } = found;
  // Brief analytics: brands see who opened their brief (names from Growth up).
  if (user.role === "creator") await recordView(db, { subjectKind: "brief", subjectId: o.id, viewerUserId: user.id });
  const { locale, currency } = await getPrefs(user.locale);
  const t = workStrings(locale);
  const site = safeHref(brand.website);

  return (
    <main className="ev-page ev-page--narrow">
      <div className="ev-stack">
        <Link href="/opportunities" className="ev-link">
          {t.detail.back}
        </Link>
        <PageHeader title={o.title} lead={brand.name} />
        <Sheet tone="ink" className="ev-stack" style={{ ["--gap" as string]: "6px" }}>
          <span className="ev-muted">{t.feed.budget}</span>
          <Money cents={o.budgetCents} currency={currency} locale={locale} size="hero" />
          <span className="ev-muted">{t.feed.locked}</span>
        </Sheet>
        <Sheet className="ev-stack">
          <h2 className="ev-h2">{t.detail.brief}</h2>
          <p className="ev-prose" style={{ whiteSpace: "pre-wrap" }}>
            {o.brief}
          </p>
          <KeyValues
            items={[
              [t.detail.deliverables, deliverablesText(o, t)],
              [t.detail.platforms, platformsText(o, t)],
              [t.detail.where, o.country ? t.countries[o.country] : t.anywhere],
              [t.detail.slots, o.slots],
              [t.detail.audience, collective ? `${t.audience[o.audience]}: ${collective}` : t.audience[o.audience]],
            ]}
          />
        </Sheet>
        <Sheet className="ev-stack">
          <h2 className="ev-h2">{t.detail.about}</h2>
          {brand.description && <p className="ev-prose">{brand.description}</p>}
          {site && (
            <a className="ev-link" href={site} target="_blank" rel="noopener noreferrer" dir="ltr" style={{ overflowWrap: "anywhere" }}>
              {brand.website}
            </a>
          )}
          <RecordLine record={record} t={t} />
        </Sheet>
        {user.role === "creator" &&
          o.status === "open" &&
          (dealId ? (
            <LinkButton href={`/deals/${dealId}`} block>
              {t.feed.openDeal}
            </LinkButton>
          ) : (
            <div className="ev-stack" style={{ ["--gap" as string]: "8px" }}>
              <ActionButton url={`/api/opportunities/${o.id}/interest`} block>
                {t.feed.interested}
              </ActionButton>
              <p className="ev-hint">{t.detail.interestedHint}</p>
            </div>
          ))}
      </div>
    </main>
  );
}
