import type { Metadata } from "next";
import type { ReactNode } from "react";
import { requireStaff } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { getPrefs } from "@/lib/i18n";
import { opsStrings } from "@/lib/i18n/ops";
import { needsAHuman } from "@/lib/ops/attention";
import { LinkButton } from "@/components/ui";
import { daysSince, OpsPage } from "../ui";

export const metadata: Metadata = { title: "Needs a human | EVRA Ops" };

type Row = { key: string; title: string; meta: string; links: [label: string, memberId: string | null][] };

export default async function AttentionPage() {
  const staff = await requireStaff();
  const { locale } = await getPrefs(staff.locale);
  const t = opsStrings(locale);
  const a = t.attention;
  const r = await needsAHuman(await getDb());
  const sections: { title: string; rows: Row[] }[] = [
    { title: a.waiting, rows: r.waiting.map((w) => ({ key: w.id, title: `${w.dealTitle}: ${w.title}`, meta: a.submitted(t.age(daysSince(w.submittedAt!))), links: [[a.creator, w.creatorId], [a.brand, w.brandOwnerId]] })) },
    { title: a.quiet, rows: r.quiet.map((d) => ({ key: d.id, title: d.title, meta: a.since(t.age(daysSince(d.fundedAt ?? d.createdAt))), links: [[a.creator, d.creatorId], [a.brand, d.brandOwnerId]] })) },
    { title: a.founding, rows: r.founding.map((u) => ({ key: u.id, title: `#${u.foundingNumber} ${u.name ?? u.email}`, meta: a.joined(t.age(daysSince(u.createdAt))), links: [[a.member, u.id]] })) },
  ];
  const link = (row: Row, [label, id]: Row["links"][number]): ReactNode =>
    id && (
      <LinkButton key={label} href={`/ops/support?member=${id}`} variant="soft" aria-label={`${label}: ${row.title}`}>
        {label}
      </LinkButton>
    );
  return (
    <OpsPage title={t.tools.attention} lead={a.lead} back={t.back}>
      {sections.map((sec, i) => (
        <section key={sec.title} className="ev-stack" aria-labelledby={`attention-${i}`}>
          <h2 id={`attention-${i}`} className="ev-h2">
            {sec.title} ({sec.rows.length})
          </h2>
          <ul className="ev-sheet ev-sheet--flush ev-list">
            {sec.rows.length === 0 && <li className="ev-muted">{a.none}</li>}
            {sec.rows.map((row) => (
              <li key={row.key} className="ev-spread">
                <span className="ev-stack" style={{ ["--gap" as string]: "2px" }}>
                  <strong>{row.title}</strong>
                  <span className="ev-muted ev-small">{row.meta}</span>
                </span>
                <span className="ev-row">{row.links.map((l) => link(row, l))}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </OpsPage>
  );
}
