import type { Metadata } from "next";
import { getDb } from "@/lib/db";
import type { Locale } from "@/lib/db/schema";
import { getPrefs } from "@/lib/i18n";
import { claimStrings } from "@/lib/i18n/ops";
import { draftForToken, kitData } from "@/lib/ops/kits";
import { HANDLE_RE } from "@/lib/users";
import { Avatar, Empty, Sheet } from "@/components/ui";
import { ClaimKit } from "./ClaimKit";

// The token in the path is the only key to this private draft: keep it out of search engines and referrers.
export const metadata: Metadata = { title: "Your EVRA kit", robots: { index: false, follow: false }, referrer: "no-referrer" };

const PLATFORM: Record<string, string> = { instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube", x: "X" };
const TAG: Record<Locale, string> = { en: "en-GB", ar: "ar-AE", hi: "hi-IN" };

export default async function ClaimPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { locale } = await getPrefs();
  const t = claimStrings(locale);
  const d = await draftForToken(await getDb(), token);
  if (!d)
    return (
      <main className="ev-page ev-page--narrow">
        <Sheet>
          <Empty title={t.goneTitle}>{t.gone}</Empty>
        </Sheet>
      </main>
    );

  const data = kitData(d);
  const name = d.displayName ?? d.handle;
  const date = (v: string | Date) => new Date(v).toLocaleDateString(TAG[locale], { day: "numeric", month: "long", year: "numeric" });
  const source = (field: "followers" | "headline" | "synopsis") => {
    const src = data.sources?.[field];
    return src && <p className="ev-hint">{t.note(t.from[src.from], date(src.at))}</p>;
  };

  return (
    <main className="ev-page ev-page--narrow">
      <ClaimKit token={token} locale={locale} handle={HANDLE_RE.test(d.handle) ? d.handle : ""} email={d.email ?? ""} dev={process.env.NODE_ENV !== "production"}>
        <header className="ev-head">
          <h1 className="ev-display">{t.title}</h1>
          <p className="ev-muted ev-prose">{t.lead}</p>
        </header>
        <Sheet className="ev-stack" aria-label={name}>
          <div className="ev-row">
            <Avatar name={name} large />
            <div className="ev-stack" style={{ ["--gap" as string]: "2px" }}>
              <strong className="ev-h2">{name}</strong>
              <span className="ev-muted">
                <span dir="ltr">@{d.handle}</span> {t.on(PLATFORM[d.platform])}
              </span>
            </div>
          </div>
          {data.followers != null && (
            <div>
              <span className="ev-amount ev-amount--md">{data.followers.toLocaleString(TAG[locale])}</span> <span>{t.followers}</span>
              {source("followers")}
            </div>
          )}
          {d.headline && (
            <div>
              <p className="ev-h2" dir="auto">
                {d.headline}
              </p>
              {source("headline")}
            </div>
          )}
          {d.synopsis && (
            <div>
              <p dir="auto">{d.synopsis}</p>
              {source("synopsis")}
            </div>
          )}
          <p className="ev-muted ev-small">{t.expires(date(d.deleteAfter))}</p>
        </Sheet>
      </ClaimKit>
    </main>
  );
}
