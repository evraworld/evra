"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/db/schema";
import { opsStrings } from "@/lib/i18n/ops";
import { postJson } from "@/components/requests/postJson";
import { Field, Input } from "@/components/ui";

export function DisputeForm({ disputeId, locale }: { disputeId: string; locale: Locale }) {
  const t = opsStrings(locale);
  const d = t.disputes;
  const id = useId();
  const router = useRouter();
  const [pct, setPct] = useState("50");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const n = Number(pct);
    if (!window.confirm(d.confirm(n))) return;
    setBusy(true);
    setError(null);
    try {
      await postJson("/api/ops/disputes", { disputeId, creatorBps: Math.round(n * 100) });
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="ev-stack">
      <Field id={id} label={d.share} hint={d.shareHint}>
        <Input id={id} aria-describedby={`${id}-hint`} type="number" inputMode="numeric" min={0} max={100} step={1} value={pct} onChange={(e) => setPct(e.target.value)} required />
      </Field>
      {error && (
        <p className="ev-error" role="alert">
          {error}
        </p>
      )}
      <div>
        <button className="ev-btn ev-btn--danger" disabled={busy} aria-busy={busy}>
          {busy ? t.working : d.resolve}
        </button>
      </div>
    </form>
  );
}
