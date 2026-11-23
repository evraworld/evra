import type { Metadata } from "next";
import { and, desc, eq, inArray } from "drizzle-orm";
import { currentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { opportunities } from "@/lib/db/schema";
import { getPrefs } from "@/lib/i18n";
import { workStrings } from "@/lib/i18n/work";
import { Badge, Empty, LinkButton, Money, PageHeader, Sheet } from "@/components/ui";

export const metadata: Metadata = { title: "Open work | EVRA", description: "Real budgets from brands, agreed before work starts." };
export const dynamic = "force-dynamic";

// Locked tiles for visitors: niche, platform and budget only. The brand, title and brief never leave the server here.
export default async function WorkTeasers() {
  const [db, user] = await Promise.all([getDb(), currentUser()]);
  const { locale, currency } = await getPrefs(user?.locale);
  const t = workStrings(locale);
  const now = new Date();
  const tiles = await db
    .select({ id: opportunities.id, niches: opportunities.niches, platforms: opportunities.platforms, budgetCents: opportunities.budgetCents, audience: opportunities.audience, foundingUntil: opportunities.foundingUntil })
    .from(opportunities)
    // Invite-only and collective-only briefs are private, so they never get a public tile.
    .where(and(eq(opportunities.status, "open"), eq(opportunities.publicTeaser, true), inArray(opportunities.audience, ["public", "founding"])))
    .orderBy(desc(opportunities.createdAt))
    .limit(60);
  const signedIn = !!user?.onboardedAt;

  return (
    <main className="ev-page">
      <PageHeader display title={t.tiles.title} lead={t.tiles.lead} />
      {tiles.length === 0 ? (
        <Sheet>
          <Empty title={t.tiles.empty} />
        </Sheet>
      ) : (
        <ul className="ev-grid" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {tiles.map((o) => (
            <li key={o.id}>
              <Sheet className="ev-stack" style={{ height: "100%" }}>
                <div className="ev-row" style={{ ["--gap" as string]: "6px" }}>
                  <Badge tone="ink">{t.tiles.locked}</Badge>
                  {o.audience === "founding" && o.foundingUntil && o.foundingUntil > now && <Badge tone="warn">{t.tiles.firstLook}</Badge>}
                </div>
                <p className="ev-h2">{o.niches.map((n) => t.niches[n] ?? n).join(", ")}</p>
                <p className="ev-muted">{o.platforms.map((p) => t.platforms[p]).join(", ")}</p>
                <div>
                  <Money cents={o.budgetCents} currency={currency} locale={locale} size="md" />
                  <p className="ev-small ev-muted">{t.tiles.budget}</p>
                </div>
                <LinkButton href={signedIn ? "/opportunities" : "/signin"} variant="secondary" style={{ marginTop: "auto" }}>
                  {signedIn ? t.links.findWork : t.tiles.signIn}
                </LinkButton>
              </Sheet>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
