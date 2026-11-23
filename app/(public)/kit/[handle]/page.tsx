import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { getKit } from "@/lib/creators";
import { currentUser } from "@/lib/auth/session";
import { brandForUser } from "@/lib/brands";
import { getPrefs } from "@/lib/i18n";
import { kitStrings } from "@/lib/i18n/kit";
import { onboardingStrings } from "@/lib/i18n/onboarding";
import { recordView } from "@/lib/analytics";
import { DELIVERABLE_LABEL } from "@/lib/rates";
import { Avatar, Badge, LinkButton, Money, Sheet } from "@/components/ui";
import { ActionButton } from "@/components/ui/client";
import { RequestMenu } from "@/components/requests/RequestMenu";
import { responseBadge } from "@/lib/requests/badges";
import { requestStrings } from "@/lib/i18n/requests";

type Props = { params: Promise<{ handle: string }> };

const compact = (n: number) => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
const PLATFORM = { instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube", x: "X" } as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  const kit = await getKit(await getDb(), { handle: decodeURIComponent(handle) });
  if (!kit) return { title: "Not found | EVRA" };
  return { title: `${kit.user.name} (@${kit.user.handle}) | EVRA`, description: kit.profile.headline ?? undefined, openGraph: { title: kit.user.name, description: kit.profile.headline ?? undefined } };
}

export default async function KitPage({ params }: Props) {
  const { handle } = await params;
  const db = await getDb();
  const kit = await getKit(db, { handle: decodeURIComponent(handle) });
  const viewer = await currentUser();
  if (!kit || (!kit.profile.kitPublic && viewer?.id !== kit.user.id)) notFound();
  const { locale, currency } = await getPrefs(viewer?.locale);
  const t = kitStrings(locale);
  const types = onboardingStrings(locale).types;
  const brand = viewer?.role === "brand" ? await brandForUser(db, viewer.id) : null;
  if (viewer?.id !== kit.user.id) await recordView(db, { subjectKind: "kit", subjectId: kit.user.id, viewerUserId: viewer?.id, viewerBrandId: brand?.id });
  const reel = kit.rateCard.find((r) => r.deliverable === "reel") ?? kit.rateCard[0];
  const quick = await responseBadge(db, kit.user.id);

  return (
    <main className="ev-page" style={{ maxWidth: 820 }}>
      <div className="ev-stack" style={{ ["--gap" as string]: "20px" }}>
        <header className="ev-row" style={{ ["--gap" as string]: "18px", alignItems: "flex-start" }}>
          <Avatar name={kit.user.name} large />
          <div className="ev-stack" style={{ ["--gap" as string]: "8px", flex: 1, minWidth: 240 }}>
            <h1 className="ev-display">{kit.user.name}</h1>
            {kit.profile.headline && <p className="ev-h2" style={{ fontWeight: 500 }}>{kit.profile.headline}</p>}
            <div className="ev-row">
              <span className="ev-muted" dir="ltr">
                @{kit.user.handle}
              </span>
              {kit.user.city && <span className="ev-muted">{kit.user.city}</span>}
              {kit.user.foundingNumber && <Badge tone="ink">{t.founding(kit.user.foundingNumber)}</Badge>}
              {quick && <Badge tone="ok">{requestStrings(locale).inbox.quick}</Badge>}
            </div>
          </div>
        </header>

        {kit.profile.bio && <p className="ev-prose">{kit.profile.bio}</p>}

        {kit.totalReach != null && (
          <Sheet tone="ink">
            <div className="ev-stack" style={{ ["--gap" as string]: "16px" }}>
              <div className="ev-spread">
                <div className="ev-stack" style={{ ["--gap" as string]: "4px" }}>
                  <span className="ev-muted">{t.reach}</span>
                  <span className="ev-amount">{kit.totalReach > 0 ? compact(kit.totalReach) : "—"}</span>
                </div>
                {kit.reachTrendPct != null && <span>{t.trend(kit.reachTrendPct)}</span>}
              </div>
              <div className="ev-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
                {kit.accounts.map((a) => (
                  <div key={a.id} className="ev-stack" style={{ ["--gap" as string]: "2px" }}>
                    <span className="ev-row">
                      <strong>{PLATFORM[a.platform]}</strong>
                      {a.verified && <Badge tone="ok">{t.verified}</Badge>}
                    </span>
                    {a.source === "review" && <span className="ev-muted">{t.underReview}</span>}
                    {a.followers != null && (
                      <span>
                        {compact(a.followers)} {t.followers.toLowerCase()}
                      </span>
                    )}
                    {a.avgViews != null && a.avgViews > 0 && (
                      <span className="ev-muted">
                        {compact(a.avgViews)} {t.avgViews.toLowerCase()}
                      </span>
                    )}
                    {a.engagementBps != null && a.engagementBps > 0 && (
                      <span className="ev-muted">
                        {(a.engagementBps / 100).toFixed(1)}% {t.engagement.toLowerCase()}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <p className="ev-muted ev-small">{t.stats[kit.statsSource as "verified" | "self" | "demo"]}</p>
            </div>
          </Sheet>
        )}

        {kit.rateCard.length > 0 && (
          <Sheet>
            <div className="ev-stack">
              <div className="ev-stack" style={{ ["--gap" as string]: "4px" }}>
                <h2 className="ev-h2">{t.rates}</h2>
                <p className="ev-muted ev-small">{t.ratesHint}</p>
              </div>
              <ul className="ev-list">
                {kit.rateCard.map((r) => (
                  <li key={r.id} className="ev-spread" style={{ paddingInline: 0 }}>
                    <span>{r.label || DELIVERABLE_LABEL[r.deliverable]}</span>
                    <strong>
                      <Money cents={r.priceCents} currency={currency} locale={locale} />
                    </strong>
                  </li>
                ))}
              </ul>
            </div>
          </Sheet>
        )}

        <Sheet>
          <div className="ev-stack">
            <h2 className="ev-h2">{t.workWithMe}</h2>
            <p className="ev-muted">{t.sendOfferHint}</p>
            <div className="ev-row">
              {kit.profile.openTo.map((o) => (
                <Badge key={o}>{types[o]}</Badge>
              ))}
            </div>
            {brand ? (
              <>
                <ActionButton url="/api/deals" body={{ action: "create_from_kit", creatorId: kit.user.id, totalCents: reel?.priceCents ?? kit.profile.minRateCents, deliverable: reel?.deliverable ?? "reel" }}>
                  {t.sendOffer}
                </ActionButton>
                <RequestMenu creatorId={kit.user.id} creatorName={kit.user.name} openTo={kit.profile.openTo} locale={locale} />
              </>
            ) : viewer?.id === kit.user.id ? null : (
              <LinkButton href="/signin">{t.signInAsBrand}</LinkButton>
            )}
          </div>
        </Sheet>

        {kit.showcase.length > 0 && (
          <Sheet>
            <div className="ev-stack">
              <h2 className="ev-h2">{t.showcase}</h2>
              <ul className="ev-list">
                {kit.showcase.map((sItem) => (
                  <li key={sItem.id} className="ev-spread" style={{ paddingInline: 0 }}>
                    <span className="ev-stack" style={{ ["--gap" as string]: "2px" }}>
                      <strong>{sItem.title}</strong>
                      {sItem.brandName && <span className="ev-muted ev-small">{sItem.brandName}</span>}
                    </span>
                    <Badge tone={sItem.verification === "verified" ? "ok" : undefined}>{sItem.verification === "verified" ? t.verified : sItem.verification === "found_public" ? t.foundPublic : t.selfReported}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          </Sheet>
        )}

        {kit.rating && <p>{t.rating(kit.rating.score.toFixed(1), kit.rating.onTimePct, kit.rating.count)}</p>}

        {kit.profile.links.length > 0 && (
          <nav aria-label={t.links} className="ev-stack" style={{ ["--gap" as string]: "10px" }}>
            {kit.profile.links.map((l) => (
              <a key={l.url} href={l.url} rel="noopener noreferrer nofollow" target="_blank" className="ev-btn ev-btn--secondary ev-btn--block">
                {l.label}
              </a>
            ))}
          </nav>
        )}

        <p className="ev-muted ev-small" style={{ textAlign: "center" }}>
          <Link href="/" className="ev-link">
            {t.madeWith}
          </Link>
        </p>
      </div>
    </main>
  );
}
