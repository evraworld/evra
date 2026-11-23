import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { requireOnboarded } from "@/lib/auth/guards";
import { brandForUser } from "@/lib/brands";
import { getDb } from "@/lib/db";
import { collectives } from "@/lib/db/schema";
import { getPrefs } from "@/lib/i18n";
import { requestStrings } from "@/lib/i18n/requests";
import { workStrings } from "@/lib/i18n/work";
import { COUNTRIES, NICHES } from "@/lib/onboarding";
import { AUDIENCES, brandOpportunities, DELIVERABLES, OPP_COUNTRIES, PLATFORMS, seesViewerNames } from "@/lib/opportunities";
import { creditBalance, declineReasons, requestsFromBrand } from "@/lib/requests";
import { Badge, Empty, LinkButton, Money, PageHeader, Sheet } from "@/components/ui";
import { deliverablesText } from "../opportunities/parts";
import { OpportunityForm, ProfileForm } from "./BrandForms";

export const metadata: Metadata = { title: "Your brand | EVRA" };

const STATUS_TONE = { open: "warn", accepted: "ok", converted: "ok", declined: "bad", closed_no_response: undefined } as const;

export default async function BrandPage() {
  const user = await requireOnboarded();
  const db = await getDb();
  const brand = await brandForUser(db, user.id);
  if (!brand) redirect(user.role === "creator" ? "/brands" : "/home");
  const { locale, currency } = await getPrefs(user.locale);
  const t = workStrings(locale);
  const r = requestStrings(locale);
  const [credits, opps, sent, reasons, groups] = await Promise.all([
    creditBalance(db, brand),
    brandOpportunities(db, brand.id),
    requestsFromBrand(db, brand.id),
    declineReasons(db, brand.id),
    db.select({ slug: collectives.slug, name: collectives.name }).from(collectives).orderBy(asc(collectives.name)).limit(200),
  ]);
  const names = seesViewerNames(brand.plan);
  const date = (d: Date) => d.toLocaleDateString(locale === "ar" ? "ar-AE" : locale === "hi" ? "hi-IN" : "en-GB", { day: "numeric", month: "short" });

  return (
    <main className="ev-page">
      <PageHeader
        title={brand.name}
        lead={t.brand.lead}
        action={
          <div className="ev-row">
            <LinkButton href="/creators" variant="secondary" small>
              {t.links.findCreators}
            </LinkButton>
            <LinkButton href="/challenges" variant="soft" small>
              {t.links.challenges}
            </LinkButton>
          </div>
        }
      />
      <div className="ev-stack" style={{ ["--gap" as string]: "24px" }}>
        <Sheet className="ev-stack" aria-labelledby="credits-title" style={{ ["--gap" as string]: "8px" }}>
          <div className="ev-spread">
            <h2 className="ev-h2" id="credits-title">
              {r.credits.title}
            </h2>
            <Badge tone="ink">{t.brand.plan(r.credits.plan[brand.plan])}</Badge>
          </div>
          <p className="ev-amount ev-amount--md">{r.credits.left(credits.left, credits.allowance)}</p>
          <p className="ev-hint">{r.credits.hint}</p>
        </Sheet>

        <details className="ev-sheet">
          <summary className="ev-h2" style={{ cursor: "pointer", paddingBlock: 13 }}>
            {t.brand.post}
          </summary>
          <div style={{ marginTop: 16 }}>
            <OpportunityForm
              locale={locale}
              collectives={groups}
              options={{ niches: [...NICHES], platforms: [...PLATFORMS], deliverables: [...DELIVERABLES], audiences: [...AUDIENCES], countries: [...OPP_COUNTRIES] }}
            />
          </div>
        </details>

        <section className="ev-stack" aria-labelledby="briefs-title">
          <h2 className="ev-h2" id="briefs-title">
            {t.brand.briefs}
          </h2>
          {opps.length === 0 ? (
            <Sheet>
              <Empty title={t.brand.noBriefs} />
            </Sheet>
          ) : (
            <ul className="ev-sheet ev-sheet--flush ev-list">
              {opps.map((o) => (
                <li key={o.id} className="ev-stack" style={{ ["--gap" as string]: "6px" }}>
                  <div className="ev-spread">
                    <Link href={`/opportunities/${o.id}`} prefetch={false} className="ev-h2">
                      {o.title}
                    </Link>
                    <Money cents={o.budgetCents} currency={currency} locale={locale} />
                  </div>
                  <div className="ev-row" style={{ ["--gap" as string]: "6px" }}>
                    <Badge tone={o.audience === "public" ? undefined : "ink"}>{t.audience[o.audience]}</Badge>
                    {o.status === "closed" && <Badge tone="bad">{t.brand.closed}</Badge>}
                    {o.publicTeaser && (o.audience === "public" || o.audience === "founding") && <Badge>{t.brand.teaser}</Badge>}
                    <span className="ev-small ev-muted">
                      {deliverablesText(o, t)} · {t.feed.creators(o.slots)} · {date(o.createdAt)}
                    </span>
                  </div>
                  <p className="ev-small">{names && o.viewers.length ? t.brand.viewedBy(o.viewers.join(", ")) : t.brand.viewers(o.viewers.length)}</p>
                  {!names && o.viewers.length > 0 && <p className="ev-hint">{t.brand.namesOnGrowth}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="ev-stack" aria-labelledby="sent-title">
          <h2 className="ev-h2" id="sent-title">
            {t.brand.sent}
          </h2>
          {sent.length === 0 ? (
            <Sheet>
              <Empty title={t.brand.noSent} />
            </Sheet>
          ) : (
            <ul className="ev-sheet ev-sheet--flush ev-list">
              {sent.map(({ request: q, creator, handle }) => (
                <li key={q.id} className="ev-spread">
                  <span className="ev-stack" style={{ ["--gap" as string]: "2px" }}>
                    <strong>{handle ? <Link href={`/@${handle}`}>{creator ?? handle}</Link> : creator}</strong>
                    <span className="ev-small ev-muted">
                      {r.types[q.type as keyof typeof r.types] ?? q.type} · {date(q.createdAt)}
                      {q.amountCents ? (
                        <>
                          {" · "}
                          <Money cents={q.amountCents} currency={currency} locale={locale} />
                        </>
                      ) : null}
                    </span>
                  </span>
                  {q.dealId ? (
                    <LinkButton href={`/deals/${q.dealId}`} small variant="soft">
                      {r.status.converted}
                    </LinkButton>
                  ) : (
                    <Badge tone={STATUS_TONE[q.status]}>{r.status[q.status]}</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <Sheet className="ev-stack" aria-labelledby="no-title">
          <h2 className="ev-h2" id="no-title">
            {t.brand.saidNo}
          </h2>
          <p className="ev-hint">{t.brand.saidNoHint}</p>
          {reasons.length === 0 ? (
            <p className="ev-muted">{t.brand.saidNoEmpty}</p>
          ) : (
            <ul className="ev-stack" style={{ listStyle: "none", padding: 0, margin: 0, ["--gap" as string]: "8px" }}>
              {reasons.map((x) => (
                <li key={x.reason} className="ev-spread">
                  <span>{r.reasons[x.reason]}</span>
                  <Badge>{t.brand.creators(x.creators)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Sheet>

        <details className="ev-sheet">
          <summary className="ev-h2" style={{ cursor: "pointer", paddingBlock: 13 }}>
            {t.brand.profile}
          </summary>
          <div style={{ marginTop: 16 }}>
            <ProfileForm locale={locale} brand={brand} countries={[...COUNTRIES]} />
          </div>
        </details>
      </div>
    </main>
  );
}
