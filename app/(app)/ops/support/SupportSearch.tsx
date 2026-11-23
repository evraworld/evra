"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/db/schema";
import type { Member } from "@/lib/ops/support";
import { opsStrings } from "@/lib/i18n/ops";
import { Badge, Field } from "@/components/ui";
import { useJson } from "@/components/ui/client";

export function SupportSearch({ locale, preset }: { locale: Locale; preset: Member[] }) {
  const t = opsStrings(locale);
  const [q, setQ] = useState("");
  const [members, setMembers] = useState(preset);
  const [searched, setSearched] = useState(false);
  const { busy, error, post } = useJson();
  return (
    <div className="ev-stack">
      <form
        className="ev-sheet ev-stack"
        role="search"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await post<{ members: Member[] }>("/api/ops/support", { action: "search", q });
          if (r) {
            setMembers(r.members);
            setSearched(true);
          }
        }}
      >
        <Field id="member-q" label={t.support.search}>
          <input id="member-q" className="ev-input" type="search" dir="ltr" autoComplete="off" minLength={2} maxLength={200} required value={q} onChange={(e) => setQ(e.target.value)} />
        </Field>
        <div>
          <button type="submit" className="ev-btn" disabled={busy || q.trim().length < 2} aria-busy={busy}>
            {busy ? t.working : t.support.find}
          </button>
        </div>
        {error && (
          <p className="ev-error" role="alert">
            {error}
          </p>
        )}
      </form>
      <div className="ev-stack" aria-live="polite">
        {searched && members.length === 0 && <p className="ev-muted">{t.support.none}</p>}
        {members.map((m) => (
          <StartView key={m.id} m={m} locale={locale} />
        ))}
      </div>
    </div>
  );
}

function StartView({ m, locale }: { m: Member; locale: Locale }) {
  const t = opsStrings(locale);
  const router = useRouter();
  const [reason, setReason] = useState("");
  const { busy, error, post } = useJson();
  const id = `reason-${m.id}`;
  return (
    <form
      className="ev-sheet ev-stack"
      aria-label={m.name ?? m.email}
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await post<{ next: string }>("/api/ops/support", { action: "start", memberId: m.id, reason });
        if (r) router.push(r.next);
      }}
    >
      <div className="ev-spread">
        <strong>{m.name ?? m.email}</strong>
        <span className="ev-row" style={{ ["--gap" as string]: "8px" }}>
          {m.role && <Badge>{m.role}</Badge>}
          <Badge tone={m.status === "active" ? "ok" : "warn"}>{m.status}</Badge>
        </span>
      </div>
      <p className="ev-muted ev-small">
        <span dir="ltr">{m.email}</span>
        {m.handle && (
          <>
            {" · "}
            <span dir="ltr">@{m.handle}</span>
          </>
        )}
      </p>
      <Field id={id} label={t.support.reason} hint={t.support.reasonHint}>
        <textarea id={id} className="ev-textarea" style={{ minHeight: 88 }} required minLength={5} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} aria-describedby={`${id}-hint`} />
      </Field>
      <div>
        <button type="submit" className="ev-btn" disabled={busy || reason.trim().length < 5} aria-busy={busy}>
          {busy ? t.working : t.support.start}
        </button>
      </div>
      {error && (
        <p className="ev-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
