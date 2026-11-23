import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOnboarded } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { getPrefs } from "@/lib/i18n";
import { requestStrings } from "@/lib/i18n/requests";
import { requestsForCreator } from "@/lib/requests";
import { responseBadge } from "@/lib/requests/badges";
import { Badge, Empty, PageHeader, Sheet } from "@/components/ui";
import { Answer } from "@/components/requests/Answer";
import { RequestDetails } from "@/components/requests/RequestDetails";

export const metadata: Metadata = { title: "Requests | EVRA" };

export default async function RequestsPage() {
  const user = await requireOnboarded();
  if (user.role === "brand") redirect("/brand");
  const db = await getDb();
  const { locale, currency } = await getPrefs(user.locale);
  const t = requestStrings(locale);
  const [rows, badge] = await Promise.all([requestsForCreator(db, user.id), responseBadge(db, user.id)]);
  const open = rows.filter((x) => x.request.status === "open");
  const past = rows.filter((x) => x.request.status !== "open");
  const date = (d: Date) => d.toLocaleDateString(locale === "ar" ? "ar-AE" : locale === "hi" ? "hi-IN" : "en-GB", { day: "numeric", month: "short" });
  const label = (type: string) => t.types[type as keyof typeof t.types] ?? type;

  return (
    <main className="ev-page ev-page--narrow">
      <PageHeader title={t.inbox.title} lead={t.inbox.lead} action={badge === "quick" ? <Badge tone="ok">{t.inbox.quick}</Badge> : undefined} />
      <div className="ev-stack" style={{ ["--gap" as string]: "24px" }}>
        <section className="ev-stack" aria-labelledby="open-title">
          <h2 className="ev-h2" id="open-title">
            {t.inbox.open}
          </h2>
          {open.length === 0 ? (
            <Sheet>
              <Empty title={t.inbox.empty} />
            </Sheet>
          ) : (
            <ul className="ev-stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {open.map(({ request: q, brand, closesInDays }) => (
                <li key={q.id}>
                  <Sheet className="ev-stack" aria-label={`${label(q.type)}, ${t.inbox.from(brand ?? "")}`}>
                    <div className="ev-spread">
                      <strong className="ev-h2">{label(q.type)}</strong>
                      <Badge tone="warn">{t.inbox.closesIn(closesInDays)}</Badge>
                    </div>
                    <p className="ev-muted ev-small">
                      {t.inbox.from(brand ?? "")} · {date(q.createdAt)}
                    </p>
                    <p className="ev-prose" style={{ whiteSpace: "pre-wrap" }}>
                      {q.message}
                    </p>
                    <RequestDetails amountCents={q.amountCents} details={q.details} locale={locale} currency={currency} />
                    <Answer url={`/api/requests/${q.id}`} locale={locale} />
                  </Sheet>
                </li>
              ))}
            </ul>
          )}
        </section>
        {past.length > 0 && (
          <section className="ev-stack" aria-labelledby="past-title">
            <h2 className="ev-h2" id="past-title">
              {t.inbox.past}
            </h2>
            <ul className="ev-sheet ev-sheet--flush ev-list">
              {past.map(({ request: q, brand }) => (
                <li key={q.id} className="ev-spread">
                  <span className="ev-stack" style={{ ["--gap" as string]: "2px" }}>
                    <strong>{label(q.type)}</strong>
                    <span className="ev-small ev-muted">
                      {t.inbox.from(brand ?? "")} · {date(q.createdAt)}
                    </span>
                  </span>
                  {q.dealId ? (
                    <Link className="ev-link" href={`/deals/${q.dealId}`}>
                      {t.status.converted}
                    </Link>
                  ) : (
                    <Badge tone={q.status === "accepted" ? "ok" : undefined}>{t.status[q.status]}</Badge>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
