"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Terms, UsageRight } from "@/lib/db/schema";
import { useJson } from "@/components/ui/client";

const RIGHT_KINDS: { value: UsageRight["kind"]; label: string; paid: boolean }[] = [
  { value: "organic_repost", label: "Repost on the brand's own channels", paid: false },
  { value: "paid_brand_handle", label: "Paid ads from the brand's handle", paid: true },
  { value: "paid_creator_handle", label: "Ads through the creator's handle (Spark or Partnership Ads)", paid: true },
  { value: "dark_post", label: "Dark posts (ads shown only to targeted people)", paid: true },
  { value: "boosted_post", label: "Boosting the creator's post", paid: true },
  { value: "likeness", label: "Creator's face, voice or name in new ads", paid: true },
];
const PLATFORMS = ["instagram", "tiktok", "youtube", "x"] as const;
const dollars = (cents: number) => (cents / 100).toString();
const cents = (v: string) => Math.round(Number(v.replace(/[^0-9.]/g, "")) * 100) || 0;

function ErrorNote({ msg }: { msg: string | null }) {
  return msg ? (
    <p className="ev-notice ev-notice--bad" role="alert">
      {msg}
    </p>
  ) : null;
}

export function TermsEditor({ dealId, terms, label, saveLabel }: { dealId: string; terms: Terms; label: string; saveLabel: string }) {
  const router = useRouter();
  const { busy, error, post } = useJson();
  const [open, setOpen] = useState(false);
  const [t, setT] = useState<Terms>(terms);
  const set = (patch: Partial<Terms>) => setT({ ...t, ...patch });
  const setRight = (i: number, patch: Partial<UsageRight>) => set({ usageRights: t.usageRights.map((r, j) => (j === i ? { ...r, ...patch } : r)) });

  if (!open)
    return (
      <button type="button" className="ev-btn ev-btn--secondary" onClick={() => setOpen(true)}>
        {label}
      </button>
    );

  return (
    <form
      className="ev-sheet ev-stack"
      style={{ ["--gap" as string]: "20px" }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (await post(`/api/deals/${dealId}`, { action: "counter", terms: t })) {
          setOpen(false);
          router.refresh();
        }
      }}
    >
      <h3 className="ev-h2">{label}</h3>

      <fieldset className="ev-stack" style={{ border: 0, padding: 0 }}>
        <legend className="ev-label">Payments</legend>
        {t.milestones.map((m, i) => (
          <div key={i} className="ev-grid" style={{ gridTemplateColumns: "2fr 1fr auto", alignItems: "end" }}>
            <div className="ev-field">
              <label className="ev-hint" htmlFor={`m-title-${i}`}>
                Step {i + 1}
              </label>
              <input id={`m-title-${i}`} className="ev-input" value={m.title} onChange={(e) => set({ milestones: t.milestones.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
            </div>
            <div className="ev-field">
              <label className="ev-hint" htmlFor={`m-amt-${i}`}>
                Amount (USD)
              </label>
              <input id={`m-amt-${i}`} className="ev-input" inputMode="decimal" value={dollars(m.amountCents)} onChange={(e) => set({ milestones: t.milestones.map((x, j) => (j === i ? { ...x, amountCents: cents(e.target.value) } : x)) })} />
            </div>
            {t.milestones.length > 1 && (
              <button type="button" className="ev-btn ev-btn--soft ev-btn--small" onClick={() => set({ milestones: t.milestones.filter((_, j) => j !== i) })}>
                Remove
              </button>
            )}
          </div>
        ))}
        {t.milestones.length < 5 && (
          <button type="button" className="ev-btn ev-btn--soft ev-btn--small" onClick={() => set({ milestones: [...t.milestones, { title: "Next step", amountCents: 10_000 }] })}>
            Add a payment step
          </button>
        )}
      </fieldset>

      <fieldset className="ev-stack" style={{ border: 0, padding: 0 }}>
        <legend className="ev-label">Deliverables</legend>
        {t.deliverables.map((d, i) => (
          <div key={i} className="ev-grid" style={{ gridTemplateColumns: "1fr 2fr 2fr" }}>
            <input aria-label="How many" className="ev-input" inputMode="numeric" value={d.count} onChange={(e) => set({ deliverables: t.deliverables.map((x, j) => (j === i ? { ...x, count: Math.max(1, Number(e.target.value) || 1) } : x)) })} />
            <select aria-label="Type" className="ev-select" value={d.type} onChange={(e) => set({ deliverables: t.deliverables.map((x, j) => (j === i ? { ...x, type: e.target.value as typeof d.type } : x)) })}>
              {["reel", "story", "post", "short", "video", "tiktok", "ugc", "live", "event"].map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <select aria-label="Platform" className="ev-select" value={d.platform} onChange={(e) => set({ deliverables: t.deliverables.map((x, j) => (j === i ? { ...x, platform: e.target.value as typeof d.platform } : x)) })}>
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        ))}
      </fieldset>

      <fieldset className="ev-stack" style={{ border: 0, padding: 0 }}>
        <legend className="ev-label">Usage rights</legend>
        <p className="ev-hint">Choose each right the brand gets. Nothing is granted unless it&apos;s listed here.</p>
        {t.usageRights.map((r, i) => {
          const paid = RIGHT_KINDS.find((k) => k.value === r.kind)?.paid;
          return (
            <div key={i} className="ev-sheet ev-stack" style={{ background: "var(--mist)" }}>
              <select aria-label="Right" className="ev-select" value={r.kind} onChange={(e) => setRight(i, { kind: e.target.value as UsageRight["kind"] })}>
                {RIGHT_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
              <div className="ev-chips" role="group" aria-label="Platforms">
                {PLATFORMS.map((p) => (
                  <label className="ev-chip" key={p}>
                    <input type="checkbox" checked={r.platforms.includes(p)} onChange={() => setRight(i, { platforms: r.platforms.includes(p) ? r.platforms.filter((x) => x !== p) : [...r.platforms, p] })} />
                    <span>{p}</span>
                  </label>
                ))}
              </div>
              <div className="ev-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
                <label className="ev-field">
                  <span className="ev-hint">Where</span>
                  <select className="ev-select" value={r.territory} onChange={(e) => setRight(i, { territory: e.target.value as UsageRight["territory"] })}>
                    <option value="worldwide">Worldwide</option>
                    <option value="region">One region</option>
                    <option value="country">One country</option>
                  </select>
                </label>
                <label className="ev-field">
                  <span className="ev-hint">For how many months</span>
                  <input className="ev-input" inputMode="numeric" value={r.months} onChange={(e) => setRight(i, { months: Number(e.target.value) || 0 })} />
                </label>
                <label className="ev-field">
                  <span className="ev-hint">Price for this right (USD)</span>
                  <input className="ev-input" inputMode="decimal" value={dollars(r.priceCents)} onChange={(e) => setRight(i, { priceCents: cents(e.target.value) })} />
                </label>
                {paid && r.kind !== "likeness" && (
                  <label className="ev-field">
                    <span className="ev-hint">Ad spend cap (USD)</span>
                    <input className="ev-input" inputMode="decimal" value={r.spendCapCents != null ? dollars(r.spendCapCents) : ""} onChange={(e) => setRight(i, { spendCapCents: e.target.value ? cents(e.target.value) : undefined })} />
                  </label>
                )}
              </div>
              {t.usageRights.length > 1 && (
                <button type="button" className="ev-btn ev-btn--soft ev-btn--small" onClick={() => set({ usageRights: t.usageRights.filter((_, j) => j !== i) })}>
                  Remove this right
                </button>
              )}
            </div>
          );
        })}
        <button type="button" className="ev-btn ev-btn--soft ev-btn--small" onClick={() => set({ usageRights: [...t.usageRights, { kind: "paid_creator_handle", platforms: ["instagram"], territory: "country", months: 1, spendCapCents: 50_000, priceCents: 15_000 }] })}>
          Add a right
        </button>
      </fieldset>

      <div className="ev-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <label className="ev-field">
          <span className="ev-label">Post by</span>
          <input className="ev-input" type="date" value={t.postingWindow.end} onChange={(e) => set({ postingWindow: { ...t.postingWindow, end: e.target.value } })} />
        </label>
        <label className="ev-field">
          <span className="ev-label">Revisions</span>
          <input className="ev-input" inputMode="numeric" value={t.revisions} onChange={(e) => set({ revisions: Number(e.target.value) || 0 })} />
        </label>
        <label className="ev-field">
          <span className="ev-label">Kill fee (%)</span>
          <input className="ev-input" inputMode="numeric" value={t.killFeeBps / 100} onChange={(e) => set({ killFeeBps: Math.round((Number(e.target.value) || 0) * 100) })} />
        </label>
        <label className="ev-field">
          <span className="ev-label">Exclusivity (days)</span>
          <input className="ev-input" inputMode="numeric" value={t.exclusivityDays} onChange={(e) => set({ exclusivityDays: Number(e.target.value) || 0 })} />
        </label>
        <label className="ev-field">
          <span className="ev-label">Review time (days)</span>
          <input className="ev-input" inputMode="numeric" value={t.reviewDays} onChange={(e) => set({ reviewDays: Number(e.target.value) || 1 })} />
        </label>
      </div>
      <label className="ev-field">
        <span className="ev-label">Disclosure</span>
        <input className="ev-input" value={t.disclosure} onChange={(e) => set({ disclosure: e.target.value })} />
      </label>

      <ErrorNote msg={error} />
      <div className="ev-row">
        <button type="submit" className="ev-btn" disabled={busy}>
          {busy ? "Sending…" : saveLabel}
        </button>
        <button type="button" className="ev-btn ev-btn--secondary" onClick={() => { setT(terms); setOpen(false); }}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function SubmitWork({ dealId, idx, labels }: { dealId: string; idx: number; labels: { send: string; link: string; kind: string; draft: string; live: string } }) {
  const router = useRouter();
  const { busy, error, post } = useJson();
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState<"draft" | "live">("draft");
  return (
    <form
      className="ev-stack"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await post(`/api/deals/${dealId}`, { action: "submit", idx, url, kind })) {
          setUrl("");
          router.refresh();
        }
      }}
    >
      <label className="ev-field">
        <span className="ev-label">{labels.link}</span>
        <input className="ev-input" type="url" dir="ltr" required placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} />
      </label>
      <fieldset className="ev-row" style={{ border: 0, padding: 0 }}>
        <legend className="ev-hint">{labels.kind}</legend>
        {(["draft", "live"] as const).map((k) => (
          <label key={k} className="ev-chip">
            <input type="radio" name={`kind-${idx}`} checked={kind === k} onChange={() => setKind(k)} />
            <span>{labels[k]}</span>
          </label>
        ))}
      </fieldset>
      <ErrorNote msg={error} />
      <button className="ev-btn" type="submit" disabled={busy || !url}>
        {busy ? "Sending…" : labels.send}
      </button>
    </form>
  );
}

export function ReviewWork({ dealId, idx, isLast, changesLeft, labels }: { dealId: string; idx: number; isLast: boolean; changesLeft: number; labels: { approve: string; live: string; changes: string; left: string; what: string; dispute: string; why: string; disputeHint: string } }) {
  const router = useRouter();
  const { busy, error, post } = useJson();
  const [live, setLive] = useState(false);
  const [mode, setMode] = useState<"none" | "changes" | "dispute">("none");
  const [text, setText] = useState("");
  const go = async (body: Record<string, unknown>) => {
    if (await post(`/api/deals/${dealId}`, body)) {
      setMode("none");
      setText("");
      router.refresh();
    }
  };
  return (
    <div className="ev-stack">
      {isLast && (
        <label className="ev-toggle">
          <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
          <span className="ev-label">{labels.live}</span>
        </label>
      )}
      <div className="ev-row">
        <button type="button" className="ev-btn" disabled={busy || (isLast && !live)} onClick={() => go({ action: "approve_milestone", idx, liveConfirmed: live })}>
          {busy && mode === "none" ? "Paying…" : labels.approve}
        </button>
        {changesLeft > 0 && (
          <button type="button" className="ev-btn ev-btn--secondary" onClick={() => setMode(mode === "changes" ? "none" : "changes")}>
            {labels.changes} <span className="ev-muted">({labels.left})</span>
          </button>
        )}
        <button type="button" className="ev-btn ev-btn--danger" onClick={() => setMode(mode === "dispute" ? "none" : "dispute")}>
          {labels.dispute}
        </button>
      </div>
      {mode !== "none" && (
        <form
          className="ev-stack"
          onSubmit={(e) => {
            e.preventDefault();
            go(mode === "changes" ? { action: "request_changes", idx, comment: text } : { action: "dispute", idx, reason: text });
          }}
        >
          <label className="ev-field">
            <span className="ev-label">{mode === "changes" ? labels.what : labels.why}</span>
            {mode === "dispute" && <span className="ev-hint">{labels.disputeHint}</span>}
            <textarea className="ev-textarea" required value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          <button type="submit" className={mode === "dispute" ? "ev-btn ev-btn--danger" : "ev-btn"} disabled={busy}>
            {mode === "changes" ? labels.changes : labels.dispute}
          </button>
        </form>
      )}
      <ErrorNote msg={error} />
    </div>
  );
}

export function CreatorDispute({ dealId, idx, labels }: { dealId: string; idx: number; labels: { dispute: string; why: string; disputeHint: string } }) {
  const router = useRouter();
  const { busy, error, post } = useJson();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  if (!open)
    return (
      <button type="button" className="ev-btn ev-btn--soft ev-btn--small" onClick={() => setOpen(true)}>
        {labels.dispute}
      </button>
    );
  return (
    <form className="ev-stack" onSubmit={async (e) => { e.preventDefault(); if (await post(`/api/deals/${dealId}`, { action: "dispute", idx, reason: text })) router.refresh(); }}>
      <label className="ev-field">
        <span className="ev-label">{labels.why}</span>
        <span className="ev-hint">{labels.disputeHint}</span>
        <textarea className="ev-textarea" required value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <ErrorNote msg={error} />
      <button type="submit" className="ev-btn ev-btn--danger" disabled={busy}>
        {labels.dispute}
      </button>
    </form>
  );
}

export function CommentForm({ dealId, labels }: { dealId: string; labels: { message: string; send: string } }) {
  const router = useRouter();
  const { busy, error, post } = useJson();
  const [text, setText] = useState("");
  return (
    <form className="ev-stack" onSubmit={async (e) => { e.preventDefault(); if (await post(`/api/deals/${dealId}`, { action: "comment", body: text })) { setText(""); router.refresh(); } }}>
      <label className="ev-field">
        <span className="ev-sr">{labels.message}</span>
        <textarea className="ev-textarea" style={{ minHeight: 80 }} placeholder={labels.message} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <ErrorNote msg={error} />
      <button className="ev-btn ev-btn--secondary" type="submit" disabled={busy || !text.trim()}>
        {labels.send}
      </button>
    </form>
  );
}

export function Explain({ dealId, labels }: { dealId: string; labels: { explain: string; explaining: string; watch: string } }) {
  const { busy, error, post } = useJson();
  const [out, setOut] = useState<{ summary: string; watchOut: string[] } | null>(null);
  return (
    <div className="ev-stack" aria-live="polite">
      {!out && (
        <button type="button" className="ev-btn ev-btn--soft ev-btn--small" disabled={busy} onClick={async () => setOut(await post(`/api/deals/${dealId}`, { action: "summary" }))}>
          {busy ? labels.explaining : labels.explain}
        </button>
      )}
      {out && (
        <div className="ev-notice">
          <div className="ev-stack" style={{ ["--gap" as string]: "6px" }}>
            <p>{out.summary}</p>
            {out.watchOut.length > 0 && (
              <>
                <strong>{labels.watch}</strong>
                <ul style={{ paddingInlineStart: 20 }}>
                  {out.watchOut.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}
      <ErrorNote msg={error} />
    </div>
  );
}
