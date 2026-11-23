import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboarded } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { getPrefs } from "@/lib/i18n";
import { challengeStrings } from "@/lib/i18n/challenges";
import { challengeView } from "@/lib/challenges";
import { Badge, Money, PageHeader, Sheet } from "@/components/ui";
import { ActionButton } from "@/components/ui/client";
import { EntryForm } from "../ChallengeForms";

export const metadata: Metadata = { title: "Challenge | EVRA" };

export default async function ChallengePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireOnboarded();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await getDb();
  const { locale, currency } = await getPrefs(user.locale);
  const t = challengeStrings(locale);
  const c = await challengeView(db, user, id);
  // Brands only see their own challenges; creators see any.
  if (!c || (user.role === "brand" && !c.mine)) notFound();

  return (
    <main className="ev-page ev-page--narrow">
      <p style={{ marginBottom: 12 }}>
        <Link href="/challenges">{t.back}</Link>
      </p>
      <PageHeader title={c.title} lead={c.brand} />
      <div className="ev-stack">
        <Sheet className="ev-stack">
          <div>
            <Money cents={c.pricePerEntryCents} currency={currency} locale={locale} size="md" />
            <p className="ev-small ev-muted">
              {t.perEntry} · {c.status === "closed" ? t.closed : t.left(c.left)}
            </p>
          </div>
          <p style={{ whiteSpace: "pre-wrap" }}>{c.brief}</p>
        </Sheet>

        {user.role === "creator" && c.status === "open" && (
          <Sheet>
            <EntryForm challengeId={c.id} locale={locale} />
          </Sheet>
        )}

        <Sheet className="ev-stack">
          <h2 className="ev-h2">{c.mine ? t.entries : t.yourEntries}</h2>
          {c.entries.length === 0 ? (
            <p className="ev-muted">{t.noEntries}</p>
          ) : (
            <ul className="ev-stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {c.entries.map(({ e, name, handle }) => (
                <li key={e.id} className="ev-stack" style={{ ["--gap" as string]: "8px", borderTop: "1px solid var(--line)", paddingTop: 14 }}>
                  <div className="ev-spread">
                    <strong>{c.mine ? (name ?? `@${handle}`) : new Date(e.createdAt).toLocaleDateString(locale)}</strong>
                    <Badge tone={e.status === "paid" ? "ok" : e.status === "rejected" ? "bad" : undefined}>{t.status[e.status]}</Badge>
                  </div>
                  {/* Entry links are checked to start with http(s) when they're sent. */}
                  <a href={e.url} target="_blank" rel="noopener noreferrer nofollow" className="ev-small" style={{ overflowWrap: "anywhere" }}>
                    {e.url}
                  </a>
                  {c.mine && e.status === "submitted" && (
                    <div className="ev-row">
                      <ActionButton url="/api/challenges" body={{ action: "approve", entryId: e.id }}>
                        {t.approve}
                      </ActionButton>
                      <ActionButton url="/api/challenges" body={{ action: "reject", entryId: e.id }} variant="secondary" confirm={t.rejectConfirm}>
                        {t.reject}
                      </ActionButton>
                    </div>
                  )}
                  {e.dealId && (
                    <Link href={`/deals/${e.dealId}`} className="ev-small">
                      {t.receipt}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Sheet>
      </div>
    </main>
  );
}
