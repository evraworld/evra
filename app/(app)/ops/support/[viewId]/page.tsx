import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { z } from "zod";
import { requireStaff } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { getPrefs } from "@/lib/i18n";
import { LOCALE_NAMES } from "@/lib/i18n/strings";
import { opsStrings } from "@/lib/i18n/ops";
import { supportSummary } from "@/lib/ops/support";
import { Badge, Empty, KeyValues, LinkButton, Notice, Sheet } from "@/components/ui";
import { fmtDate, fmtNumber, fmtTime, OpsPage } from "../../ui";

export const metadata: Metadata = { title: "Support view | EVRA Ops", robots: { index: false } };

export default async function SupportViewPage({ params }: { params: Promise<{ viewId: string }> }) {
  const staff = await requireStaff();
  const { locale } = await getPrefs(staff.locale);
  const t = opsStrings(locale);
  const s = t.support;
  const { viewId } = await params;
  const v = z.uuid().safeParse(viewId).success ? await supportSummary(await getDb(), staff.id, viewId) : ({ state: "missing" } as const);

  if (v.state !== "open")
    return (
      <OpsPage title={v.state === "ended" ? s.ended : t.tools.support} back={t.back}>
        <Sheet>
          <Empty title={v.state === "ended" ? s.endedLead : s.missing} action={<LinkButton href={v.state === "ended" ? `/ops/support?member=${v.memberId}` : "/ops/support"}>{s.startNew}</LinkButton>} />
        </Sheet>
      </OpsPage>
    );

  const m = v.member;
  const date = (d: Date | null) => (d ? fmtDate(d, locale) : s.notYet);
  const facts: [ReactNode, ReactNode][] = [
    [
      s.email,
      <span key="email" dir="ltr">
        {m.email}
      </span>,
    ],
    [s.role, m.role ?? s.notYet],
    [
      s.status,
      <Badge key="status" tone={m.status === "active" ? "ok" : "warn"}>
        {m.status}
      </Badge>,
    ],
    [s.language, LOCALE_NAMES[m.locale]],
    [s.location, [m.city, m.country].filter(Boolean).join(", ") || s.notYet],
    [s.joined, date(m.createdAt)],
    [s.onboarded, date(m.onboardedAt)],
  ];
  if (m.foundingNumber) facts.push([s.founding, `#${m.foundingNumber}`]);
  if (v.profile) facts.push([s.headline, v.profile.headline], [s.bio, v.profile.bio], [s.niches, v.profile.niches.join(", ")], [s.openTo, v.profile.openTo.join(", ")]);
  if (v.kitPath)
    facts.push([
      s.kit,
      v.profile?.kitPublic === false ? (
        s.kitHidden
      ) : (
        <Link className="ev-link" href={v.kitPath} dir="ltr">
          evra.world{v.kitPath}
        </Link>
      ),
    ]);
  return (
    <OpsPage title={s.viewTitle(m.name ?? m.email)} lead={s.viewLead(fmtTime(v.endsAt, locale), v.reason)} back={t.back}>
      {/* Reloads when the 30 minutes are up, so a tab left open refuses too. */}
      <meta httpEquiv="refresh" content={String(v.secondsLeft)} />
      <Notice>{s.fenced}</Notice>

      <Sheet className="ev-stack" aria-labelledby="profile-h">
        <h2 id="profile-h" className="ev-h2">
          {s.profile}
        </h2>
        <KeyValues items={facts} />
        {v.claimedKit?.invitedAt && <p className="ev-muted ev-small">{s.claimed(fmtDate(v.claimedKit.invitedAt, locale))}</p>}
      </Sheet>

      {v.accounts.length > 0 && (
        <Sheet className="ev-stack" aria-labelledby="accounts-h">
          <h2 id="accounts-h" className="ev-h2">
            {s.accounts}
          </h2>
          <ul className="ev-list">
            {v.accounts.map((a) => (
              <li key={a.platform} className="ev-spread" style={{ paddingInline: 0 }}>
                <span>
                  {a.platform} <span dir="ltr">@{a.handle}</span>
                </span>
                <span className="ev-row" style={{ ["--gap" as string]: "8px" }}>
                  <span>{fmtNumber(a.followers, locale)}</span>
                  <Badge tone={a.verified ? "ok" : undefined}>{a.verified ? "verified" : a.source}</Badge>
                </span>
              </li>
            ))}
          </ul>
        </Sheet>
      )}

      {v.brands.length > 0 && (
        <Sheet className="ev-stack" aria-labelledby="brands-h">
          <h2 id="brands-h" className="ev-h2">
            {s.brands}
          </h2>
          <KeyValues items={v.brands.map((b) => [b.name, b.role])} />
        </Sheet>
      )}

      <Sheet className="ev-stack" aria-labelledby="deals-h">
        <h2 id="deals-h" className="ev-h2">
          {s.deals} ({v.deals.length})
        </h2>
        {v.deals.length === 0 ? (
          <p className="ev-muted">{s.noDeals}</p>
        ) : (
          <ul className="ev-list">
            {v.deals.map((d) => (
              <li key={d.id} className="ev-spread" style={{ paddingInline: 0 }}>
                <span>{d.title}</span>
                <Badge tone={d.status === "disputed" ? "bad" : d.status === "completed" ? "ok" : undefined}>{d.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Sheet>

      <Sheet className="ev-stack" aria-labelledby="requests-h">
        <h2 id="requests-h" className="ev-h2">
          {s.requests}
        </h2>
        <KeyValues items={[...Object.entries(v.requests.received).map(([status, n]) => [s.received(status), n] as [string, number]), [s.sent, v.requests.sent]]} />
      </Sheet>
    </OpsPage>
  );
}
