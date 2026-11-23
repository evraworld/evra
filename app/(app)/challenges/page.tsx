import type { Metadata } from "next";
import Link from "next/link";
import { requireOnboarded } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { getPrefs } from "@/lib/i18n";
import { challengeStrings } from "@/lib/i18n/challenges";
import { brandForUser } from "@/lib/brands";
import { listChallenges } from "@/lib/challenges";
import { Badge, Empty, LinkButton, Money, PageHeader, Sheet } from "@/components/ui";
import { ChallengeForm } from "./ChallengeForms";

export const metadata: Metadata = { title: "Challenges | EVRA" };

export default async function ChallengesPage() {
  const user = await requireOnboarded();
  const db = await getDb();
  const { locale, currency } = await getPrefs(user.locale);
  const t = challengeStrings(locale);
  const brand = user.role === "brand" ? await brandForUser(db, user.id) : null;
  const all = await listChallenges(db);
  const shown = brand ? all.filter((c) => c.brandId === brand.id) : all.filter((c) => c.status === "open");

  return (
    <main className="ev-page">
      <PageHeader title={t.title} lead={brand ? t.brandLead : t.lead} />
      {brand && (
        <>
          <Sheet style={{ marginBottom: 28 }}>
            <ChallengeForm locale={locale} />
          </Sheet>
          <h2 className="ev-h2" style={{ marginBottom: 12 }}>
            {t.yours}
          </h2>
        </>
      )}
      {shown.length === 0 ? (
        <Sheet>
          <Empty title={brand ? t.noneYours : t.empty} />
        </Sheet>
      ) : (
        <ul className="ev-grid" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {shown.map((c) => (
            <li key={c.id}>
              <Sheet className="ev-stack" style={{ height: "100%" }}>
                <div className="ev-spread">
                  <span className="ev-muted ev-small">{c.brand}</span>
                  {c.status === "closed" ? <Badge>{t.closed}</Badge> : <Badge tone="ok">{t.left(c.left)}</Badge>}
                </div>
                <h2 className="ev-h2">
                  <Link href={`/challenges/${c.id}`} prefetch={false}>
                    {c.title}
                  </Link>
                </h2>
                <div>
                  <Money cents={c.pricePerEntryCents} currency={currency} locale={locale} size="md" />
                  <p className="ev-small ev-muted">{t.perEntry}</p>
                </div>
                <div className="ev-row" style={{ marginTop: "auto" }}>
                  <LinkButton href={`/challenges/${c.id}`} prefetch={false} variant={brand ? "secondary" : undefined}>
                    {t.view}
                  </LinkButton>
                </div>
              </Sheet>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
