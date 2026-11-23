import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { getPrefs } from "@/lib/i18n";
import { LOCALE_NAMES } from "@/lib/i18n/strings";
import { opsStrings } from "@/lib/i18n/ops";
import { listSlots } from "@/lib/ops/slots";
import { Badge, Empty, Sheet } from "@/components/ui";
import { ActionButton } from "@/components/ui/client";
import { fmtDate, OpsPage } from "../ui";
import { SlotForm } from "./SlotForm";

export const metadata: Metadata = { title: "Home slots | EVRA Ops" };

export default async function SlotsPage() {
  const staff = await requireStaff();
  const { locale } = await getPrefs(staff.locale);
  const t = opsStrings(locale);
  const sl = t.slots;
  const slots = await listSlots(await getDb());
  return (
    <OpsPage title={t.tools.slots} lead={sl.lead} back={t.back}>
      <SlotForm locale={locale} today={new Date().toISOString().slice(0, 10)} />
      {slots.length === 0 ? (
        <Sheet>
          <Empty title={sl.none} />
        </Sheet>
      ) : (
        <ul className="ev-sheet ev-sheet--flush ev-list">
          {slots.map(({ state, ...s }) => (
            <li key={s.id} className="ev-stack" style={{ ["--gap" as string]: "6px" }}>
              <div className="ev-spread">
                <strong dir="auto">{s.title}</strong>
                <Badge tone={state === "live" ? "ok" : undefined}>{sl.state[state]}</Badge>
              </div>
              <p dir="auto">{s.body}</p>
              <p className="ev-muted ev-small">
                {[sl.kinds[s.kind], sl.segments[s.segment], s.locale === "all" ? sl.allLocales : LOCALE_NAMES[s.locale], sl.dates(fmtDate(s.startsAt, locale), s.endsAt ? fmtDate(s.endsAt, locale) : null)].join(" · ")}
                {s.href && (
                  <>
                    {" · "}
                    <span dir="ltr">{s.href}</span>
                  </>
                )}
              </p>
              {state !== "ended" && (
                <div>
                  <ActionButton url="/api/ops/slots" body={{ action: "end", id: s.id }} variant="danger" confirm={sl.endConfirm}>
                    {sl.end}
                  </ActionButton>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </OpsPage>
  );
}
