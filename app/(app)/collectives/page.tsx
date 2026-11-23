import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { requireOnboarded } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { KINDS, listCollectives, type Collective } from "@/lib/collectives";
import { getPrefs } from "@/lib/i18n";
import { collectiveStrings } from "@/lib/i18n/collectives";
import { Badge, Empty, Notice, PageHeader, Sheet } from "@/components/ui";
import { CreateCollective } from "./CollectiveForms";

export const metadata: Metadata = { title: "Collectives | EVRA" };

export default async function CollectivesPage() {
  const user = await requireOnboarded();
  const db = await getDb();
  const { locale } = await getPrefs(user.locale);
  const t = collectiveStrings(locale);
  const { mine, others } = await listCollectives(db, user.id);
  const isBrand = user.role === "brand";

  const card = (c: Collective, members: number, extra?: ReactNode) => (
    <Sheet className="ev-stack" style={{ height: "100%", ["--gap" as string]: "8px" }}>
      <div className="ev-spread">
        <h3 className="ev-h2">
          <Link href={`/collectives/${c.slug}`}>{c.name}</Link>
        </h3>
        <Badge>{t.kinds[c.kind]}</Badge>
      </div>
      <p className="ev-small ev-muted">{t.members(members)}</p>
      {c.description && <p className="ev-small">{c.description}</p>}
      {extra}
    </Sheet>
  );

  return (
    <main className="ev-page">
      <PageHeader title={t.title} lead={t.lead} />
      <div className="ev-stack" style={{ ["--gap" as string]: "28px" }}>
        {isBrand && <Notice title={t.page.brandsReadOnly} />}
        {!isBrand && (
          <section className="ev-stack" aria-labelledby="mine-title">
            <h2 className="ev-h2" id="mine-title">
              {t.mine}
            </h2>
            {mine.length === 0 ? (
              <Sheet>
                <Empty title={t.noneMine} />
              </Sheet>
            ) : (
              <ul className="ev-grid" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {mine.map(({ c, members, me }) => (
                  <li key={c.id}>{card(c, members, <Badge tone={me.status === "active" ? "ok" : "warn"}>{me.status === "active" ? t.roles[me.role] : t.requested}</Badge>)}</li>
                ))}
              </ul>
            )}
          </section>
        )}
        <section className="ev-stack" aria-labelledby="discover-title">
          <h2 className="ev-h2" id="discover-title">
            {t.discover}
          </h2>
          {others.length === 0 ? (
            <Sheet>
              <Empty title={t.noneOther} />
            </Sheet>
          ) : (
            <ul className="ev-grid" style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {others.map(({ c, members }) => (
                <li key={c.id}>{card(c, members)}</li>
              ))}
            </ul>
          )}
        </section>
        {!isBrand && (
          <details className="ev-sheet">
            <summary className="ev-h2" style={{ cursor: "pointer", paddingBlock: 13 }}>
              {t.create.title}
            </summary>
            <div style={{ marginTop: 16 }}>
              <CreateCollective locale={locale} kinds={[...KINDS]} />
            </div>
          </details>
        )}
      </div>
    </main>
  );
}
