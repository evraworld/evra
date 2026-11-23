"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/db/schema";
import { requestStrings } from "@/lib/i18n/requests";
import { DECLINE_REASONS } from "@/lib/requests/types";
import { postJson } from "./postJson";

// Accept, or decline with a reason. In the app an accepted paid collab goes straight to its Deal Room;
// from a reply link (token set) the creator may not be signed in, so we show a link instead.
export function Answer({ url, token, locale }: { url: string; token?: string; locale: Locale }) {
  const t = requestStrings(locale);
  const id = useId();
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ text: string; dealId: string | null } | null>(null);

  async function answer(decision: "accept" | "decline") {
    if (decision === "decline" && !reason) return setError(t.answer.pickReason);
    setBusy(true);
    setError(null);
    try {
      const out = await postJson<{ dealId: string | null }>(url, { token, decision, reason: decision === "decline" ? reason : undefined });
      if (out.dealId && !token) return router.push(`/deals/${out.dealId}`);
      setDone({ text: decision === "accept" ? t.answer.accepted : t.answer.declined, dealId: out.dealId });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (done)
    return (
      <div className="ev-notice ev-notice--ok" role="status" aria-live="polite">
        <div className="ev-stack" style={{ ["--gap" as string]: "6px" }}>
          <span>{done.text}</span>
          {done.dealId && (
            <a className="ev-link" href={`/deals/${done.dealId}`}>
              {token ? t.answer.signInDeal : t.answer.openDeal}
            </a>
          )}
        </div>
      </div>
    );

  return (
    <div className="ev-stack" aria-busy={busy}>
      <button type="button" className="ev-btn" disabled={busy} onClick={() => answer("accept")}>
        {t.answer.accept}
      </button>
      <div className="ev-field">
        <label className="ev-label" htmlFor={`${id}-reason`}>
          {t.answer.reason}
        </label>
        <span className="ev-hint" id={`${id}-hint`}>
          {t.answer.reasonHint}
        </span>
        <div className="ev-row">
          <select id={`${id}-reason`} className="ev-select" style={{ flex: "1 1 200px", width: "auto" }} value={reason} aria-describedby={`${id}-hint`} onChange={(e) => setReason(e.target.value)}>
            <option value="">{t.answer.pickReason}</option>
            {DECLINE_REASONS.map((r) => (
              <option key={r} value={r}>
                {t.reasons[r]}
              </option>
            ))}
          </select>
          <button type="button" className="ev-btn ev-btn--secondary" disabled={busy} onClick={() => answer("decline")}>
            {t.answer.decline}
          </button>
        </div>
      </div>
      <p className="ev-error" role="alert" aria-live="assertive">
        {error}
      </p>
    </div>
  );
}
