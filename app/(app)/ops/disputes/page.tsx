import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { getPrefs } from "@/lib/i18n";
import { opsStrings } from "@/lib/i18n/ops";
import { openDisputes } from "@/lib/ops/disputes";
import { LinkButton, Money } from "@/components/ui";
import { daysSince, OpsPage } from "../ui";
import { DisputeForm } from "./DisputeForm";

export const metadata: Metadata = { title: "Disputes | EVRA Ops" };

export default async function DisputesPage() {
  const staff = await requireStaff();
  const { locale, currency } = await getPrefs(staff.locale);
  const t = opsStrings(locale);
  const d = t.disputes;
  const rows = await openDisputes(await getDb());

  return (
    <OpsPage title={t.tools.disputes} lead={d.lead} back={t.back}>
      {rows.length === 0 ? (
        <p className="ev-sheet ev-muted">{d.none}</p>
      ) : (
        rows.map((r) => (
          <section key={r.d.id} className="ev-sheet ev-stack" aria-labelledby={`dispute-${r.d.id}`}>
            <div className="ev-spread">
              <h2 id={`dispute-${r.d.id}`} className="ev-h2">
                {r.deal.title}: {r.step.title}
              </h2>
              <Money cents={r.step.amountCents} currency={currency} locale={locale} size="md" />
            </div>
            <p className="ev-muted ev-small">
              {r.brand} · {r.creator?.name ?? `@${r.creator?.handle}`} · {d.opened(d[r.openedBy], t.age(daysSince(r.d.createdAt)))}
            </p>
            <blockquote className="ev-prose" style={{ margin: 0, paddingInlineStart: 14, borderInlineStart: "3px solid var(--line)" }}>
              {r.d.reason}
            </blockquote>
            <div>
              <LinkButton href={`/deals/${r.deal.id}`} variant="soft">
                {d.room}
              </LinkButton>
            </div>
            <DisputeForm disputeId={r.d.id} locale={locale} />
          </section>
        ))
      )}
    </OpsPage>
  );
}
