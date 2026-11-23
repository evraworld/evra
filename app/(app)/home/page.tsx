import type { Metadata } from "next";
import Link from "next/link";
import { inArray } from "drizzle-orm";
import { requireOnboarded } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { brands, users } from "@/lib/db/schema";
import { getPrefs } from "@/lib/i18n";
import { homeStrings } from "@/lib/i18n/home";
import { brandForUser } from "@/lib/brands";
import { brandHome, creatorHome, homeSlots } from "@/lib/home";
import { formatMoney } from "@/lib/money";
import { Badge, Empty, LinkButton, Money, Sheet } from "@/components/ui";
import { CopyButton } from "@/components/ui/client";

export const metadata: Metadata = { title: "Home | EVRA" };

const origin = () => process.env.APP_ORIGIN ?? "http://localhost:3000";

export default async function HomePage() {
  const user = await requireOnboarded();
  const { locale, currency } = await getPrefs(user.locale);
  const t = homeStrings(locale);
  const db = await getDb();
  const first = (user.name ?? "").split(" ")[0] || user.email.split("@")[0];
  const fmt = (c: number) => formatMoney(c, currency, locale);
  const day = (d: Date) => d.toLocaleDateString(locale === "ar" ? "ar-AE" : locale === "hi" ? "hi-IN" : "en-GB", { weekday: "long" });

  if (user.role === "brand") {
    const brand = await brandForUser(db, user.id);
    if (!brand) return <main className="ev-page"><Empty title="Your brand isn't set up yet." /></main>;
    const h = await brandHome(db, brand.id);
    const slots = await homeSlots(db, "brand", locale);
    const creatorIds = [...new Set([...h.needsYou, ...h.deals].map((d) => d.creatorId))];
    const names = new Map((creatorIds.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, creatorIds)) : []).map((r) => [r.id, r.name ?? ""]));
    const dealTitle = new Map(h.deals.map((d) => [d.id, d]));
    return (
      <main className="ev-page">
        <header className="ev-head">
          <h1 className="ev-display">{t.hello(first)}</h1>
          <p className="ev-muted">{brand.name}</p>
        </header>
        <div className="ev-grid">
          <Sheet tone="ink">
            <div className="ev-stack" style={{ ["--gap" as string]: "8px" }}>
              <span className="ev-muted">{t.lockedProtection}</span>
              <Money cents={h.lockedCents} currency={currency} locale={locale} size="hero" />
              <span className="ev-muted">{t.released(fmt(h.releasedCents))}</span>
            </div>
          </Sheet>
          <Sheet>
            <div className="ev-stack">
              <h2 className="ev-h2">{t.approvals}</h2>
              <p className="ev-muted ev-small">{t.approvalsHint}</p>
              {h.approvalsWaiting.length === 0 ? (
                <p className="ev-muted">{t.noApprovals}</p>
              ) : (
                <ul className="ev-list">
                  {h.approvalsWaiting.map((m) => (
                    <li key={m.id} style={{ paddingInline: 0 }}>
                      <Link className="ev-rowlink" href={`/deals/${m.dealId}`}>
                        <span>
                          {dealTitle.get(m.dealId)?.title}: {m.title}
                        </span>
                        <Money cents={m.amountCents} currency={currency} locale={locale} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Sheet>
        </div>
        <section className="ev-stack" style={{ marginTop: 24 }} aria-labelledby="needs">
          <h2 id="needs" className="ev-h2">
            {t.needsYou}
          </h2>
          <Sheet flush>
            {h.needsYou.length === 0 ? (
              <p className="ev-muted" style={{ padding: 20 }}>
                {t.nothingNeedsYou}
              </p>
            ) : (
              <ul className="ev-list">
                {h.needsYou.map((d) => (
                  <li key={d.id}>
                    <Link className="ev-rowlink" href={`/deals/${d.id}`}>
                      <span className="ev-stack" style={{ ["--gap" as string]: "2px" }}>
                        <strong>{d.title}</strong>
                        <span className="ev-muted ev-small">{names.get(d.creatorId)}</span>
                      </span>
                      <Badge>{t.status[d.status]}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Sheet>
        </section>
        <div className="ev-row" style={{ marginTop: 24 }}>
          <LinkButton href="/brand">{t.postOpportunity}</LinkButton>
          <LinkButton href="/creators" variant="secondary">
            {t.findCreators}
          </LinkButton>
          <span className="ev-muted">{t.sentOpen(h.sentOpen)}</span>
        </div>
        <Slots slots={slots} />
      </main>
    );
  }

  const h = await creatorHome(db, user.id);
  const slots = await homeSlots(db, "creator", locale);
  const brandIds = [...new Set(h.needsYou.map((d) => d.brandId))];
  const brandNames = new Map((brandIds.length ? await db.select({ id: brands.id, name: brands.name }).from(brands).where(inArray(brands.id, brandIds)) : []).map((b) => [b.id, b.name]));
  const brief = [t.briefOffers(h.newOffers, h.needsYou.length), h.nextPayout ? t.nextPayout(fmt(h.nextPayout.cents), day(h.nextPayout.by)) : "", t.briefRequests(h.openRequests), t.briefAgent(h.agentActionsToday)].filter(Boolean);
  const kitUrl = `${origin()}/@${user.handle}`;

  return (
    <main className="ev-page">
      <header className="ev-head">
        <h1 className="ev-display">{t.hello(first)}</h1>
      </header>
      <div className="ev-grid">
        <Sheet tone="ink">
          <div className="ev-stack" style={{ ["--gap" as string]: "8px" }}>
            <span className="ev-muted">{t.lockedForYou}</span>
            <Money cents={h.lockedCents} currency={currency} locale={locale} size="hero" />
            <span className="ev-muted">{t.lockedHint}</span>
            {h.paidThisWeekCents > 0 && <span>{t.paidWeek(fmt(h.paidThisWeekCents))}</span>}
          </div>
        </Sheet>
        <Sheet>
          <div className="ev-stack" style={{ ["--gap" as string]: "10px" }}>
            <h2 className="ev-h2">{t.briefing}</h2>
            {brief.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </Sheet>
      </div>

      <section className="ev-stack" style={{ marginTop: 24 }} aria-labelledby="needs">
        <div className="ev-spread">
          <h2 id="needs" className="ev-h2">
            {t.needsYou}
          </h2>
          <Link className="ev-link" href="/requests">
            {t.requests}: {t.requestsWaiting(h.openRequests)}
          </Link>
        </div>
        <Sheet flush>
          {h.needsYou.length === 0 ? (
            <div style={{ padding: 20 }} className="ev-spread">
              <span className="ev-muted">{t.nothingNeedsYou}</span>
              <LinkButton href="/opportunities" small>
                {t.findWork}
              </LinkButton>
            </div>
          ) : (
            <ul className="ev-list">
              {h.needsYou.map((d) => (
                <li key={d.id}>
                  <Link className="ev-rowlink" href={`/deals/${d.id}`}>
                    <span className="ev-stack" style={{ ["--gap" as string]: "2px" }}>
                      <strong>{d.title}</strong>
                      <span className="ev-muted ev-small">{brandNames.get(d.brandId)}</span>
                    </span>
                    <Badge tone="warn">{t.status[d.status]}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Sheet>
      </section>

      <Sheet style={{ marginTop: 24 }}>
        <div className="ev-stack">
          <h2 className="ev-h2">{t.yourKit}</h2>
          <p className="ev-muted">{t.kitHint}</p>
          <div className="ev-row">
            <code className="ev-code" dir="ltr">
              {kitUrl.replace(/^https?:\/\//, "")}
            </code>
            <CopyButton text={kitUrl} />
            <LinkButton href={`/@${user.handle}`} variant="soft" small>
              {t.viewKit}
            </LinkButton>
          </div>
        </div>
      </Sheet>
      <Slots slots={slots} />
    </main>
  );
}

function Slots({ slots }: { slots: { id: string; title: string; body: string; href: string | null; kind: string }[] }) {
  if (!slots.length) return null;
  return (
    <section className="ev-grid" style={{ marginTop: 24 }} aria-label="From the EVRA team">
      {slots.map((s) => (
        <Sheet key={s.id}>
          <div className="ev-stack" style={{ ["--gap" as string]: "6px" }}>
            <strong>{s.title}</strong>
            <p className="ev-muted">{s.body}</p>
            {s.href && (
              <Link className="ev-link" href={s.href}>
                Open
              </Link>
            )}
          </div>
        </Sheet>
      ))}
    </section>
  );
}
