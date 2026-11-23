"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/db/schema";
import { opsStrings } from "@/lib/i18n/ops";
import { Badge, Empty, Field, Sheet } from "@/components/ui";
import { ActionButton } from "@/components/ui/client";

export type ReviewItem = {
  id: string;
  who: string;
  detail: string;
  source: "auto" | "report" | "founding_application";
  reason: string;
  age: string;
  decision: "approved" | "declined" | null;
  decisionReason: string | null;
};
type Decide = (ids: string[], decision: "approved" | "declined", reason: string) => Promise<string | null>;

export function ReviewQueue({ locale, open, untold }: { locale: Locale; open: ReviewItem[]; untold: ReviewItem[] }) {
  const t = opsStrings(locale);
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>([]);
  const [bulkReason, setBulkReason] = useState("");
  const [status, setStatus] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  // Every decision goes through here; returns an error message or null.
  const decide: Decide = async (ids, decision, reason) => {
    const res = await fetch("/api/ops/review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "decide", ids, decision, reason }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return data.error ?? "That didn't work. Try again.";
    setStatus(t.review.decided(data.decided));
    setPicked((p) => p.filter((id) => !ids.includes(id)));
    router.refresh();
    return null;
  };

  return (
    <div className="ev-stack" style={{ ["--gap" as string]: "28px" }}>
      <p aria-live="polite" className="ev-muted">
        {status}
      </p>

      <section className="ev-stack" aria-labelledby="waiting-h">
        <h2 id="waiting-h" className="ev-h2">
          {t.review.waiting} ({open.length})
        </h2>
        {open.length === 0 ? (
          <Sheet>
            <Empty title={t.review.none} />
          </Sheet>
        ) : (
          <>
            {picked.length > 0 && (
              <Sheet className="ev-stack">
                <Field id="bulk-reason" label={t.review.bulkReason}>
                  <input id="bulk-reason" className="ev-input" maxLength={500} value={bulkReason} onChange={(e) => setBulkReason(e.target.value)} />
                </Field>
                <button
                  type="button"
                  className="ev-btn"
                  disabled={bulkBusy}
                  onClick={async () => {
                    setBulkBusy(true);
                    const err = await decide(picked, "approved", bulkReason);
                    setBulkError(err);
                    if (!err) setBulkReason("");
                    setBulkBusy(false);
                  }}
                >
                  {bulkBusy ? t.working : t.review.approveSelected(picked.length)}
                </button>
                {bulkError && (
                  <p className="ev-error" role="alert">
                    {bulkError}
                  </p>
                )}
              </Sheet>
            )}
            <ul className="ev-sheet ev-sheet--flush ev-list">
              {open.map((f) => (
                <OpenRow key={f.id} f={f} locale={locale} picked={picked.includes(f.id)} onPick={() => setPicked((p) => (p.includes(f.id) ? p.filter((x) => x !== f.id) : [...p, f.id]))} decide={decide} />
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="ev-stack" aria-labelledby="untold-h">
        <h2 id="untold-h" className="ev-h2">
          {t.review.untold} ({untold.length})
        </h2>
        {untold.length === 0 ? (
          <Sheet>
            <Empty title={t.review.noneUntold} />
          </Sheet>
        ) : (
          <ul className="ev-sheet ev-sheet--flush ev-list">
            {untold.map((f) => (
              <li key={f.id} className="ev-stack" style={{ ["--gap" as string]: "8px" }}>
                <div className="ev-spread">
                  <strong>{f.who}</strong>
                  <Badge tone={f.decision === "approved" ? "ok" : "bad"}>{f.decision && t.review.decisions[f.decision]}</Badge>
                </div>
                <span className="ev-muted ev-small">{f.detail}</span>
                {f.decisionReason && <p>{f.decisionReason}</p>}
                <div>
                  <ActionButton url="/api/ops/review" body={{ action: "tell", id: f.id }} variant="violet">
                    {t.review.tell}
                  </ActionButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function OpenRow({ f, locale, picked, onPick, decide }: { f: ReviewItem; locale: Locale; picked: boolean; onPick: () => void; decide: Decide }) {
  const t = opsStrings(locale);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const act = async (decision: "approved" | "declined") => {
    setBusy(true);
    setError(await decide([f.id], decision, reason));
    setBusy(false);
  };
  const id = `reason-${f.id}`;
  return (
    <li className="ev-stack" style={{ ["--gap" as string]: "10px" }}>
      <label className="ev-toggle">
        <input type="checkbox" checked={picked} onChange={onPick} aria-label={t.review.select(f.who)} />
        <span className="ev-stack" style={{ ["--gap" as string]: "2px" }}>
          <strong>{f.who}</strong>
          <span className="ev-muted ev-small">{f.detail}</span>
        </span>
      </label>
      <span className="ev-row" style={{ ["--gap" as string]: "8px" }}>
        <Badge tone={f.source === "founding_application" ? "ink" : "warn"}>{t.review.sources[f.source]}</Badge>
        <span className="ev-muted ev-small">{f.age}</span>
      </span>
      <p>{f.reason}</p>
      <Field id={id} label={t.review.reason} hint={t.review.reasonHint}>
        <input id={id} className="ev-input" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} aria-describedby={`${id}-hint`} />
      </Field>
      <div className="ev-row">
        <button type="button" className="ev-btn ev-btn--secondary" disabled={busy} aria-busy={busy} onClick={() => act("approved")}>
          {t.review.approve}
        </button>
        <button type="button" className="ev-btn ev-btn--danger" disabled={busy} onClick={() => act("declined")}>
          {t.review.decline}
        </button>
      </div>
      {error && (
        <p className="ev-error" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}
