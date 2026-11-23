import type { Metadata } from "next";
import { currentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getPrefs } from "@/lib/i18n";
import { requestStrings } from "@/lib/i18n/requests";
import { readReplyLink } from "@/lib/requests";
import { LinkButton, PageHeader, Sheet } from "@/components/ui";
import { Answer } from "@/components/requests/Answer";
import { RequestDetails } from "@/components/requests/RequestDetails";

// The token is the only key: keep it out of search engines and out of Referer headers.
export const metadata: Metadata = { title: "Reply to a request | EVRA", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function ReplyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [db, user] = await Promise.all([getDb(), currentUser()]);
  const { locale, currency } = await getPrefs(user?.locale);
  const t = requestStrings(locale);
  const link = await readReplyLink(db, token);

  if (link.state !== "open")
    return (
      <main className="ev-page ev-page--narrow">
        <Sheet className="ev-stack">
          <h1 className="ev-title">{link.state === "invalid" ? t.reply.invalid : link.state === "expired" ? t.reply.expired : t.reply.answered}</h1>
          <LinkButton href="/requests" variant="secondary">
            {t.reply.signIn}
          </LinkButton>
        </Sheet>
      </main>
    );

  const q = link.request;
  return (
    <main className="ev-page ev-page--narrow">
      <PageHeader title={t.reply.title(link.brandName)} lead={t.types[q.type as keyof typeof t.types] ?? q.type} />
      <Sheet className="ev-stack">
        <p className="ev-prose" style={{ whiteSpace: "pre-wrap" }}>
          {q.message}
        </p>
        <RequestDetails amountCents={q.amountCents} details={q.details} locale={locale} currency={currency} />
        <Answer url="/api/requests/reply" token={token} locale={locale} />
      </Sheet>
    </main>
  );
}
