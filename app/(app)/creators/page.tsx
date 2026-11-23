import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireOnboarded } from "@/lib/auth/guards";
import { brandForUser } from "@/lib/brands";
import { getDb } from "@/lib/db";
import { CreatorSearch, searchCreators } from "@/lib/discovery";
import { getPrefs } from "@/lib/i18n";
import { requestStrings } from "@/lib/i18n/requests";
import { workStrings } from "@/lib/i18n/work";
import { formatMoney } from "@/lib/money";
import { NICHES } from "@/lib/onboarding";
import { OPP_COUNTRIES } from "@/lib/opportunities";
import { BANDS } from "@/lib/rates";
import { Avatar, Badge, Empty, LinkButton, Money, PageHeader, Sheet } from "@/components/ui";
import { RequestMenu } from "@/components/requests/RequestMenu";
import { FitBadges } from "../opportunities/parts";

export const metadata: Metadata = { title: "Find creators | EVRA" };

const PLATFORM_FILTERS = ["instagram", "tiktok", "youtube"] as const;

export default async function CreatorsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireOnboarded();
  const db = await getDb();
  const brand = await brandForUser(db, user.id);
  if (!brand) redirect("/opportunities");
  const sp = await searchParams;
  const q = CreatorSearch.parse(Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])));
  const { budgetCents, results } = await searchCreators(db, brand, q);
  const { locale, currency } = await getPrefs(user.locale);
  const t = workStrings(locale);
  const r = requestStrings(locale);
  const compact = new Intl.NumberFormat(locale === "ar" ? "ar-AE" : locale === "hi" ? "hi-IN" : "en-US", { notation: "compact", maximumFractionDigits: 1 });
  const select = (name: string, label: string, value: string | undefined, options: [string, string][]) => (
    <div className="ev-field" style={{ flex: "1 1 150px" }}>
      <label className="ev-label" htmlFor={`f-${name}`}>
        {label}
      </label>
      <select id={`f-${name}`} name={name} className="ev-select" defaultValue={value ?? ""}>
        <option value="">{t.discovery.any}</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <main className="ev-page">
      <PageHeader title={t.discovery.title} lead={t.discovery.lead} />
      <div className="ev-stack" style={{ ["--gap" as string]: "20px" }}>
        <form method="get" role="search" className="ev-sheet ev-stack">
          <div className="ev-field">
            <label className="ev-label" htmlFor="f-q">
              {t.discovery.search}
            </label>
            <span className="ev-hint" id="f-q-hint">
              {t.discovery.searchHint}
            </span>
            <input id="f-q" name="q" type="search" className="ev-input" defaultValue={q.q ?? ""} aria-describedby="f-q-hint" />
          </div>
          <div className="ev-row" style={{ alignItems: "flex-end" }}>
            {select("niche", t.discovery.niche, q.niche, NICHES.map((n) => [n, t.niches[n] ?? n]))}
            {select("country", t.discovery.country, q.country, OPP_COUNTRIES.map((c) => [c, t.countries[c]]))}
            {select("band", t.discovery.band, q.band, BANDS.map((b) => [b.key, b.key]))}
            {select("platform", t.discovery.platform, q.platform, PLATFORM_FILTERS.map((p) => [p, t.platforms[p]]))}
            <div className="ev-field" style={{ flex: "1 1 150px" }}>
              <label className="ev-label" htmlFor="f-budget">
                {t.discovery.budget}
              </label>
              <input id="f-budget" name="budget" className="ev-input" inputMode="decimal" defaultValue={q.budget ?? ""} />
            </div>
          </div>
          <button type="submit" className="ev-btn">
            {t.discovery.submit}
          </button>
        </form>

        <p aria-live="polite" className="ev-muted">
          {t.discovery.results(results.length)}
          {budgetCents ? `. ${t.discovery.budgetNote(formatMoney(budgetCents, currency, locale))}` : ""}
        </p>

        {results.length === 0 ? (
          <Sheet>
            <Empty title={t.discovery.empty} />
          </Sheet>
        ) : (
          <ul className="ev-grid" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {results.map((c) => (
              <li key={c.id}>
                <Sheet className="ev-stack" style={{ height: "100%" }}>
                  <div className="ev-row">
                    <Avatar name={c.name} />
                    <span className="ev-stack" style={{ ["--gap" as string]: "2px", minWidth: 0 }}>
                      <strong className="ev-h2">{c.name}</strong>
                      <span className="ev-small ev-muted" dir="ltr" style={{ textAlign: "start" }}>
                        @{c.handle}
                      </span>
                    </span>
                  </div>
                  {c.headline && <p>{c.headline}</p>}
                  <p className="ev-small ev-muted">
                    {[c.city, c.country ? t.countries[c.country] : null].filter(Boolean).join(", ")}
                    {c.niches.length ? ` · ${c.niches.map((n) => t.niches[n] ?? n).join(", ")}` : ""}
                  </p>
                  <ul className="ev-stack" style={{ listStyle: "none", padding: 0, margin: 0, ["--gap" as string]: "4px" }}>
                    {c.accounts.map((a) => (
                      <li key={a.platform} className="ev-row" style={{ ["--gap" as string]: "8px" }}>
                        <span>
                          {t.platforms[a.platform]}: {a.followers == null ? t.discovery.hidden : t.discovery.followers(compact.format(a.followers))}
                        </span>
                        <Badge tone={a.source === "oauth" ? "ok" : a.source === "demo" ? "warn" : undefined}>{t.discovery.sources[a.source]}</Badge>
                      </li>
                    ))}
                  </ul>
                  {c.reelCents != null && (
                    <p>
                      {t.discovery.reel}: <Money cents={c.reelCents} currency={currency} locale={locale} />
                    </p>
                  )}
                  <div className="ev-row" style={{ ["--gap" as string]: "6px" }}>
                    <Badge tone="ink">{t.fit.score(c.fit.score)}</Badge>
                    {c.badge === "quick" && <Badge tone="ok">{r.inbox.quick}</Badge>}
                  </div>
                  <FitBadges reasons={c.fit.reasons} t={t} />
                  <div className="ev-stack" style={{ marginTop: "auto", ["--gap" as string]: "10px" }}>
                    <RequestMenu creatorId={c.id} creatorName={c.name} openTo={c.openTo} locale={locale} />
                    <LinkButton href={`/@${c.handle}`} variant="secondary">
                      {t.links.kit}
                    </LinkButton>
                  </div>
                </Sheet>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
