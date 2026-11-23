import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { currentUser } from "@/lib/auth/session";
import { sha256 } from "@/lib/crypto";
import { getDb } from "@/lib/db";
import { creatorProfiles, managerLinks } from "@/lib/db/schema";
import { getPrefs } from "@/lib/i18n";
import { requestStrings } from "@/lib/i18n/requests";
import { LinkButton, Notice, PageHeader, Sheet } from "@/components/ui";
import { ActionButton } from "@/components/ui/client";

export const metadata: Metadata = { title: "Manager invite | EVRA", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function ManagerInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [db, user] = await Promise.all([getDb(), currentUser()]);
  const { locale } = await getPrefs(user?.locale);
  const t = requestStrings(locale);
  const [row] = await db
    .select({ link: managerLinks, creator: creatorProfiles.displayName })
    .from(managerLinks)
    .leftJoin(creatorProfiles, eq(creatorProfiles.userId, managerLinks.creatorId))
    .where(eq(managerLinks.tokenHash, sha256(token)))
    .limit(1);

  if (!row || row.link.status === "revoked")
    return (
      <main className="ev-page ev-page--narrow">
        <Notice tone="bad" title={t.manager.invalid} />
      </main>
    );

  const creator = row.creator ?? "A creator";
  const types = row.link.copyTypes.map((x) => t.nouns[x as keyof typeof t.nouns] ?? x).join(", ");
  const sameEmail = user?.email.toLowerCase() === row.link.managerEmail.toLowerCase();
  return (
    <main className="ev-page ev-page--narrow">
      <PageHeader title={t.manager.title(creator)} lead={t.manager.lead(types)} />
      <Sheet className="ev-stack">
        {!user ? (
          <>
            <p>{t.manager.signIn(row.link.managerEmail)}</p>
            <LinkButton href="/signin">{t.manager.signInButton}</LinkButton>
          </>
        ) : !sameEmail ? (
          <Notice tone="warn" title={t.manager.wrongEmail(row.link.managerEmail)} />
        ) : row.link.status === "active" ? (
          <Notice tone="ok" title={t.manager.active(creator)} />
        ) : (
          <ActionButton url="/api/manager/accept" body={{ token }} block>
            {t.manager.accept}
          </ActionButton>
        )}
      </Sheet>
    </main>
  );
}
