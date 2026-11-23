import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { requireOnboarded } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { getKit } from "@/lib/creators";
import { verifyCode } from "@/lib/verify";
import { Badge, LinkButton, Money, Notice, PageHeader, Sheet } from "@/components/ui";
import { ActionButton, CopyButton } from "@/components/ui/client";
import { AgentForm, PasskeyButton, ProfileForm, RateRow, ShowcaseForm } from "./MeClient";
import { getPrefs } from "@/lib/i18n";

export const metadata: Metadata = { title: "Me | EVRA" };

const origin = () => process.env.APP_ORIGIN ?? "http://localhost:3000";
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000);
const SOURCE = { oauth: "Verified", demo: "Demo numbers", public: "Public profile", self: "Self-reported", review: "Being checked" } as const;
// Staff decisions a member can see on their own account (support views are listed separately).
const STAFF_ACTION: Record<string, string> = { review_approved: "EVRA reviewed your account and approved it", review_declined: "EVRA reviewed your account and declined it", resolve_dispute: "EVRA decided a dispute on one of your deals" };

export default async function MePage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const user = await requireOnboarded();
  const { welcome } = await searchParams;
  const db = await getDb();
  const { locale, currency } = await getPrefs(user.locale);
  const [passkeys, supportViews, staffActs] = await Promise.all([
    db.select({ id: s.passkeys.id, deviceName: s.passkeys.deviceName, createdAt: s.passkeys.createdAt }).from(s.passkeys).where(eq(s.passkeys.userId, user.id)),
    db.select().from(s.supportViews).where(eq(s.supportViews.memberId, user.id)).orderBy(desc(s.supportViews.startedAt)).limit(10),
    db
      .select({ id: s.staffActions.id, action: s.staffActions.action, createdAt: s.staffActions.createdAt })
      .from(s.staffActions)
      .where(and(eq(s.staffActions.targetUserId, user.id), inArray(s.staffActions.action, Object.keys(STAFF_ACTION))))
      .orderBy(desc(s.staffActions.createdAt))
      .limit(10),
  ]);

  const security = (
    <Sheet>
      <div className="ev-stack">
        <h2 className="ev-h2">Sign-in and privacy</h2>
        <p className="ev-muted">{passkeys.length ? `Face ID is on for ${passkeys.length} ${passkeys.length === 1 ? "device" : "devices"}.` : "Sign in with one tap instead of email codes."}</p>
        <PasskeyButton />
        <div className="ev-stack" style={{ ["--gap" as string]: "6px" }}>
          <strong>EVRA support access</strong>
          {supportViews.length === 0 ? (
            <p className="ev-muted">EVRA support has never opened your account.</p>
          ) : (
            <ul style={{ paddingInlineStart: 20 }}>
              {supportViews.map((v) => (
                <li key={v.id}>
                  {v.startedAt.toLocaleString()}: {v.reason}
                </li>
              ))}
            </ul>
          )}
          {staffActs.length > 0 && (
            <ul style={{ paddingInlineStart: 20 }}>
              {staffActs.map((a) => (
                <li key={a.id}>
                  {a.createdAt.toLocaleString()}: {STAFF_ACTION[a.action]}
                </li>
              ))}
            </ul>
          )}
          <p className="ev-hint">Support can see your profile and deal statuses for 30 minutes at a time. They can never see your money details, messages or sign-in codes.</p>
        </div>
        <a className="ev-btn ev-btn--secondary" href="/api/me" download>
          Download all my data
        </a>
      </div>
    </Sheet>
  );

  if (user.role !== "creator")
    return (
      <main className="ev-page ev-page--narrow">
        <PageHeader title="Me" />
        {security}
      </main>
    );

  const kit = (await getKit(db, { userId: user.id }))!;
  const [managers, views] = await Promise.all([
    db.select().from(s.managerLinks).where(eq(s.managerLinks.creatorId, user.id)),
    db.select({ n: sql<number>`count(*)::int`, brands: sql<number>`count(distinct ${s.viewEvents.viewerBrandId})::int` }).from(s.viewEvents).where(and(eq(s.viewEvents.subjectKind, "kit"), eq(s.viewEvents.subjectId, user.id), gte(s.viewEvents.createdAt, daysAgo(30)))),
  ]);
  const kitUrl = `${origin()}/@${user.handle}`;
  const p = kit.profile;

  return (
    <main className="ev-page">
      <PageHeader title="Me" lead="Your kit, your rates, your agent's rules and your account." />
      <div className="ev-stack" style={{ ["--gap" as string]: "20px" }}>
        {welcome && (
          <Notice tone="ok" title="Your kit is live">
            Put this link in your bio. Brands can send you an offer from it.
          </Notice>
        )}
        <Sheet tone="ink">
          <div className="ev-stack">
            <span className="ev-muted">Your link</span>
            <span className="ev-amount ev-amount--md" dir="ltr">
              evra.world/@{user.handle}
            </span>
            <div className="ev-row">
              <CopyButton text={kitUrl} label="Copy link" />
              <LinkButton href={`/@${user.handle}`} variant="soft" small>
                View my kit
              </LinkButton>
              {user.foundingNumber && <Badge>Founding Creator #{user.foundingNumber}</Badge>}
            </div>
            <span className="ev-muted ev-small">
              {views[0]?.n ?? 0} kit views in 30 days, from {views[0]?.brands ?? 0} {views[0]?.brands === 1 ? "brand" : "brands"}. Brand names come with Pro.
            </span>
          </div>
        </Sheet>

        <Sheet>
          <div className="ev-stack">
            <h2 className="ev-h2">Get verified</h2>
            <p className="ev-muted">Brands see a Verified badge and numbers read from your public profile, not typed in. Verified creators come first in brand search.</p>
            {kit.accounts.map((a) => (
              <div key={a.id} className="ev-stack" style={{ ["--gap" as string]: "8px", borderTop: "1px solid var(--ev-line, #0001)", paddingTop: 12 }}>
                <div className="ev-spread">
                  <strong>
                    {a.platform[0].toUpperCase() + a.platform.slice(1)} @{a.handle}
                  </strong>
                  {a.verified ? <Badge tone="ok">Verified</Badge> : a.source === "review" ? <Badge tone="warn">Being checked</Badge> : <Badge>Not verified</Badge>}
                </div>
                {a.source === "review" && <p className="ev-small">The numbers you entered and your public profile don&apos;t match. A person from EVRA checks this within 2 working days. Until then your kit hides these numbers.</p>}
                {!a.verified && a.source !== "review" && a.platform === "instagram" && (
                  <>
                    <ol className="ev-small" style={{ paddingInlineStart: 20 }}>
                      <li>
                        Add <strong dir="ltr">{verifyCode(user.id, "instagram")}</strong> anywhere in your Instagram bio and save it. Your account must be public.
                      </li>
                      <li>Tap Check my bio. It takes up to a minute.</li>
                      <li>Once you&apos;re verified, you can take the code out of your bio.</li>
                    </ol>
                    <ActionButton url="/api/me" body={{ action: "verify", platform: "instagram" }}>
                      Check my bio
                    </ActionButton>
                  </>
                )}
                {!a.verified && a.source !== "review" && a.platform !== "instagram" && <p className="ev-muted ev-small">Verification works for Instagram first. TikTok and YouTube are next.</p>}
              </div>
            ))}
          </div>
        </Sheet>

        <div className="ev-grid" style={{ alignItems: "start" }}>
          <ProfileForm p={{ displayName: p.displayName, headline: p.headline ?? "", bio: p.bio ?? "", kitPublic: p.kitPublic, hiddenStats: p.hiddenStats, links: p.links, agentLevel: p.agentLevel, minRateCents: p.minRateCents, counterRangePct: p.counterRangePct, maxMonthlyDeals: p.maxMonthlyDeals, blockedBrands: p.blockedBrands, openTo: p.openTo }} />
          <AgentForm p={{ displayName: p.displayName, headline: p.headline ?? "", bio: p.bio ?? "", kitPublic: p.kitPublic, hiddenStats: p.hiddenStats, links: p.links, agentLevel: p.agentLevel, minRateCents: p.minRateCents, counterRangePct: p.counterRangePct, maxMonthlyDeals: p.maxMonthlyDeals, blockedBrands: p.blockedBrands, openTo: p.openTo }} />
        </div>

        <Sheet>
          <div className="ev-stack">
            <h2 className="ev-h2">Rates</h2>
            <p className="ev-muted">Starting prices on your kit. Your agent uses them when it drafts counters.</p>
            {kit.rateCard.map((r) => (
              <RateRow key={r.id} id={r.id} label={r.label} deliverable={r.deliverable} priceCents={r.priceCents} />
            ))}
            <RateRow label="" deliverable="reel" priceCents={0} />
            {kit.rateCard.length > 0 && (
              <p className="ev-hint">
                Lowest listed: <Money cents={Math.min(...kit.rateCard.map((r) => r.priceCents))} currency={currency} locale={locale} />
              </p>
            )}
          </div>
        </Sheet>

        <Sheet>
          <div className="ev-stack">
            <h2 className="ev-h2">Accounts</h2>
            <ul className="ev-list">
              {kit.accounts.map((a) => (
                <li key={a.id} className="ev-spread" style={{ paddingInline: 0 }}>
                  <span>
                    {a.platform} <span className="ev-muted" dir="ltr">@{a.handle}</span>
                  </span>
                  <Badge tone={a.source === "oauth" ? "ok" : undefined}>{SOURCE[a.source]}</Badge>
                </li>
              ))}
            </ul>
            <p className="ev-hint">Official connections need EVRA&apos;s app approval with Instagram, TikTok and YouTube. Until then your numbers are labelled so brands know where they came from.</p>
          </div>
        </Sheet>

        <Sheet>
          <div className="ev-stack">
            <h2 className="ev-h2">Past work and press</h2>
            <ul className="ev-list">
              {kit.showcase.map((item) => (
                <li key={item.id} className="ev-spread" style={{ paddingInline: 0 }}>
                  <span>
                    {item.title} {item.brandName && <span className="ev-muted">({item.brandName})</span>}
                  </span>
                  <ActionButton url="/api/me" body={{ action: "showcase_remove", id: item.id }} variant="secondary" small>
                    Remove
                  </ActionButton>
                </li>
              ))}
            </ul>
            <ShowcaseForm />
          </div>
        </Sheet>

        <Sheet>
          <div className="ev-stack">
            <h2 className="ev-h2">Your manager</h2>
            {managers.filter((m) => m.status !== "revoked").length === 0 ? (
              <p className="ev-muted">No manager. You can add one any time; they&apos;re copied on the requests you choose and never receive your money.</p>
            ) : (
              managers
                .filter((m) => m.status !== "revoked")
                .map((m) => (
                  <div key={m.id} className="ev-spread">
                    <span>
                      {m.managerEmail} <Badge>{m.status === "active" ? "Active" : "Invited"}</Badge>
                    </span>
                    <ActionButton url="/api/me" body={{ action: "manager_revoke", id: m.id }} variant="secondary" small confirm="Remove this manager?">
                      Remove
                    </ActionButton>
                  </div>
                ))
            )}
          </div>
        </Sheet>

        {security}
        <p className="ev-muted ev-small">
          See every request in <Link className="ev-link" href="/requests">Requests</Link>.
        </p>
      </div>
    </main>
  );
}
