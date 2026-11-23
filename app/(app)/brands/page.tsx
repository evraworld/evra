import type { Metadata } from "next";
import Link from "next/link";
import { requireOnboarded } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { brandDirectory, pitchPrice } from "@/lib/discovery";
import { getPrefs } from "@/lib/i18n";
import { workStrings } from "@/lib/i18n/work";
import { formatMoney } from "@/lib/money";
import { Empty, PageHeader, Sheet } from "@/components/ui";
import { ActionButton } from "@/components/ui/client";
import { RecordLine, safeHref } from "../opportunities/parts";

export const metadata: Metadata = { title: "Brands | EVRA" };

export default async function BrandsPage() {
  const user = await requireOnboarded();
  const db = await getDb();
  const { locale, currency } = await getPrefs(user.locale);
  const t = workStrings(locale);
  const [list, price] = await Promise.all([brandDirectory(db, user), user.role === "creator" ? pitchPrice(db, user.id) : null]);

  return (
    <main className="ev-page">
      <PageHeader title={t.directory.title} lead={t.directory.lead} />
      {list.length === 0 ? (
        <Sheet>
          <Empty title={t.directory.empty} />
        </Sheet>
      ) : (
        <ul className="ev-grid" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {list.map(({ brand, record, open }) => {
            const site = safeHref(brand.website);
            return (
              <li key={brand.id}>
                <Sheet className="ev-stack" style={{ height: "100%" }} aria-labelledby={`b-${brand.id}`}>
                  <div className="ev-stack" style={{ ["--gap" as string]: "2px" }}>
                    <h2 className="ev-h2" id={`b-${brand.id}`}>
                      {brand.name}
                    </h2>
                    <span className="ev-small ev-muted">{[brand.category, brand.country ? t.countries[brand.country] : null].filter(Boolean).join(" · ")}</span>
                  </div>
                  {brand.description && <p className="ev-small">{brand.description}</p>}
                  {site && (
                    <a className="ev-link ev-small" href={site} target="_blank" rel="noopener noreferrer" dir="ltr" style={{ overflowWrap: "anywhere" }}>
                      {brand.domain ?? brand.website}
                    </a>
                  )}
                  <RecordLine record={record} t={t} />
                  {open.length > 0 && (
                    <div className="ev-stack" style={{ ["--gap" as string]: "4px" }}>
                      <strong className="ev-small">{t.directory.open(open.length)}</strong>
                      <ul style={{ margin: 0, paddingInlineStart: 18 }}>
                        {open.slice(0, 3).map((o) => (
                          <li key={o.id}>
                            <Link className="ev-link" href={`/opportunities/${o.id}`} prefetch={false}>
                              {o.title}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {price && (
                    <div className="ev-stack" style={{ marginTop: "auto", ["--gap" as string]: "6px" }}>
                      {price.cents > 0 ? (
                        <>
                          <ActionButton url="/api/brand/pitch" body={{ brandId: brand.id }} variant="secondary">
                            {t.directory.pitch}
                          </ActionButton>
                          <span className="ev-hint">{t.directory.pitchHint(formatMoney(price.cents, currency, locale))}</span>
                        </>
                      ) : (
                        <span className="ev-hint">{t.directory.noRate}</span>
                      )}
                    </div>
                  )}
                </Sheet>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
