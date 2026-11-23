import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { requireStaff } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { getPrefs } from "@/lib/i18n";
import { opsStrings } from "@/lib/i18n/ops";
import { memberById, openViews } from "@/lib/ops/support";
import { Sheet } from "@/components/ui";
import { fmtTime, OpsPage } from "../ui";
import { SupportSearch } from "./SupportSearch";

export const metadata: Metadata = { title: "Support view | EVRA Ops" };

// ?member=<id> comes from the Needs-a-human links; it is an internal id, never an email.
export default async function SupportPage({ searchParams }: { searchParams: Promise<{ member?: string }> }) {
  const staff = await requireStaff();
  const { locale } = await getPrefs(staff.locale);
  const t = opsStrings(locale);
  const db = await getDb();
  const { member } = await searchParams;
  const preset = z.uuid().safeParse(member).success ? await memberById(db, member!) : null;
  const views = await openViews(db, staff.id);
  return (
    <OpsPage title={t.tools.support} lead={t.support.lead} back={t.back}>
      {views.length > 0 && (
        <Sheet className="ev-stack" aria-labelledby="open-views-h">
          <h2 id="open-views-h" className="ev-h2">
            {t.support.open}
          </h2>
          <ul className="ev-list">
            {views.map((v) => (
              <li key={v.id} style={{ paddingInline: 0 }}>
                <Link className="ev-rowlink" href={`/ops/support/${v.id}`}>
                  <span dir="ltr">{v.handle ? `@${v.handle}` : v.email}</span>
                  <span className="ev-muted">{t.support.endsAt(fmtTime(v.endsAt, locale))}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Sheet>
      )}
      <SupportSearch locale={locale} preset={preset ? [preset] : []} />
    </OpsPage>
  );
}
