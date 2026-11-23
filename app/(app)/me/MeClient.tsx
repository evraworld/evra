"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { startRegistration } from "@simplewebauthn/browser";
import { useJson } from "@/components/ui/client";

type Profile = { displayName: string; headline: string; bio: string; kitPublic: boolean; hiddenStats: string[]; links: { label: string; url: string }[]; agentLevel: "manual" | "copilot" | "delegate"; minRateCents: number; counterRangePct: number; maxMonthlyDeals: number; blockedBrands: string[]; openTo: string[] };

const STATS = [["followers", "Followers and reach"], ["views", "Average views"], ["engagement", "Engagement"], ["audience", "Audience"], ["rates", "Rates"]] as const;
const TYPES = [["paid_collab", "Paid collabs"], ["seeding", "Product seeding"], ["event", "Events"], ["feedback_call", "Paid feedback calls"], ["licence", "Licensing my content"]] as const;
const LEVELS = [
  ["manual", "Manual", "Your agent reads every offer and flags problems. You do everything else."],
  ["copilot", "Copilot", "Your agent also drafts counters with evidence. Nothing is sent until you tap."],
  ["delegate", "Delegate", "Your agent may counter inside your range and politely decline clear mismatches. Saying yes always takes your tap."],
] as const;

function Saved({ show }: { show: boolean }) {
  return show ? (
    <span className="ev-badge ev-badge--ok" role="status">
      Saved
    </span>
  ) : null;
}

export function ProfileForm({ p }: { p: Profile }) {
  const router = useRouter();
  const { busy, error, post } = useJson();
  const [f, setF] = useState(p);
  const [saved, setSaved] = useState(false);
  return (
    <form className="ev-sheet ev-stack" onSubmit={async (e) => { e.preventDefault(); setSaved(false); if (await post("/api/me", { action: "profile", displayName: f.displayName, headline: f.headline, bio: f.bio, kitPublic: f.kitPublic, hiddenStats: f.hiddenStats })) { setSaved(true); router.refresh(); } }}>
      <div className="ev-spread">
        <h2 className="ev-h2">Your kit</h2>
        <Saved show={saved} />
      </div>
      <label className="ev-field">
        <span className="ev-label">Name on your kit</span>
        <input className="ev-input" value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} />
      </label>
      <label className="ev-field">
        <span className="ev-label">Headline</span>
        <input className="ev-input" maxLength={120} value={f.headline} onChange={(e) => setF({ ...f, headline: e.target.value })} />
      </label>
      <label className="ev-field">
        <span className="ev-label">Bio</span>
        <textarea className="ev-textarea" maxLength={400} value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} />
      </label>
      <label className="ev-toggle">
        <input type="checkbox" checked={f.kitPublic} onChange={(e) => setF({ ...f, kitPublic: e.target.checked })} />
        <span className="ev-stack" style={{ ["--gap" as string]: "2px" }}>
          <span className="ev-label">Anyone with the link can see my kit</span>
          <span className="ev-hint">Turn off to keep it private while you set it up.</span>
        </span>
      </label>
      <fieldset style={{ border: 0, padding: 0 }} className="ev-stack">
        <legend className="ev-label">Hide from my kit</legend>
        <div className="ev-chips">
          {STATS.map(([k, label]) => (
            <label key={k} className="ev-chip">
              <input type="checkbox" checked={f.hiddenStats.includes(k)} onChange={() => setF({ ...f, hiddenStats: f.hiddenStats.includes(k) ? f.hiddenStats.filter((x) => x !== k) : [...f.hiddenStats, k] })} />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {error && <p className="ev-error" role="alert">{error}</p>}
      <button className="ev-btn" type="submit" disabled={busy}>
        {busy ? "Saving…" : "Save kit"}
      </button>
    </form>
  );
}

export function AgentForm({ p }: { p: Profile }) {
  const router = useRouter();
  const { busy, error, post } = useJson();
  const [f, setF] = useState({ ...p, minRate: String(p.minRateCents / 100), blocked: p.blockedBrands.join(", ") });
  const [saved, setSaved] = useState(false);
  return (
    <form
      className="ev-sheet ev-stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaved(false);
        if (await post("/api/me", { action: "agent", agentLevel: f.agentLevel, minRateCents: Math.round(Number(f.minRate) * 100) || 0, counterRangePct: f.counterRangePct, maxMonthlyDeals: f.maxMonthlyDeals, blockedBrands: f.blocked.split(",").map((x) => x.trim()).filter(Boolean), openTo: f.openTo })) {
          setSaved(true);
          router.refresh();
        }
      }}
    >
      <div className="ev-spread">
        <h2 className="ev-h2">Your agent&apos;s rules</h2>
        <Saved show={saved} />
      </div>
      <p className="ev-muted">Your agent works inside these rules and logs everything it does. It never agrees to a deal or moves money for you.</p>
      <fieldset style={{ border: 0, padding: 0 }} className="ev-stack">
        <legend className="ev-label">How much your agent does</legend>
        {LEVELS.map(([k, name, hint]) => (
          <label key={k} className="ev-choice">
            <input type="radio" name="level" checked={f.agentLevel === k} onChange={() => setF({ ...f, agentLevel: k })} />
            <span className="ev-stack" style={{ ["--gap" as string]: "2px" }}>
              <strong>{name}</strong>
              <span className="ev-muted">{hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="ev-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <label className="ev-field">
          <span className="ev-label">Minimum per Reel (USD)</span>
          <input className="ev-input" inputMode="decimal" value={f.minRate} onChange={(e) => setF({ ...f, minRate: e.target.value })} />
        </label>
        <label className="ev-field">
          <span className="ev-label">Counter up to (% above an offer)</span>
          <input className="ev-input" inputMode="numeric" value={f.counterRangePct} onChange={(e) => setF({ ...f, counterRangePct: Number(e.target.value) || 0 })} />
        </label>
        <label className="ev-field">
          <span className="ev-label">Most deals a month</span>
          <input className="ev-input" inputMode="numeric" value={f.maxMonthlyDeals} onChange={(e) => setF({ ...f, maxMonthlyDeals: Number(e.target.value) || 1 })} />
        </label>
      </div>
      <fieldset style={{ border: 0, padding: 0 }} className="ev-stack">
        <legend className="ev-label">Requests you want</legend>
        <div className="ev-chips">
          {TYPES.map(([k, label]) => (
            <label key={k} className="ev-chip">
              <input type="checkbox" checked={f.openTo.includes(k)} onChange={() => setF({ ...f, openTo: f.openTo.includes(k) ? f.openTo.filter((x) => x !== k) : [...f.openTo, k] })} />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="ev-field">
        <span className="ev-label">Brands you won&apos;t work with</span>
        <span className="ev-hint">Separate with commas.</span>
        <input className="ev-input" value={f.blocked} onChange={(e) => setF({ ...f, blocked: e.target.value })} />
      </label>
      {error && <p className="ev-error" role="alert">{error}</p>}
      <button className="ev-btn" type="submit" disabled={busy}>
        {busy ? "Saving…" : "Save rules"}
      </button>
    </form>
  );
}

export function RateRow({ id, label, deliverable, priceCents }: { id?: string; label: string; deliverable: string; priceCents: number }) {
  const router = useRouter();
  const { busy, error, post } = useJson();
  const [f, setF] = useState({ label, deliverable, price: priceCents ? String(priceCents / 100) : "" });
  return (
    <form className="ev-stack" onSubmit={async (e) => { e.preventDefault(); if (await post("/api/me", { action: "rate_save", id, label: f.label, deliverable: f.deliverable, priceCents: Math.round(Number(f.price) * 100) || 0 })) { if (!id) setF({ label: "", deliverable: "reel", price: "" }); router.refresh(); } }}>
      <div className="ev-grid" style={{ gridTemplateColumns: "2fr 1.4fr 1fr auto", alignItems: "end" }}>
        <input aria-label="What brands get" className="ev-input" placeholder="e.g. Instagram Reel" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} />
        <select aria-label="Type" className="ev-select" value={f.deliverable} onChange={(e) => setF({ ...f, deliverable: e.target.value })}>
          {["reel", "story", "post", "short", "video", "tiktok", "ugc", "live", "event"].map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <input aria-label="Price in USD" className="ev-input" inputMode="decimal" placeholder="USD" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />
        <div className="ev-row" style={{ ["--gap" as string]: "6px" }}>
          <button className="ev-btn ev-btn--small" type="submit" disabled={busy}>
            {id ? "Save" : "Add"}
          </button>
          {id && (
            <button className="ev-btn ev-btn--secondary ev-btn--small" type="button" onClick={async () => { if (await post("/api/me", { action: "rate_remove", id })) router.refresh(); }}>
              Remove
            </button>
          )}
        </div>
      </div>
      {error && <p className="ev-error" role="alert">{error}</p>}
    </form>
  );
}

export function ShowcaseForm() {
  const router = useRouter();
  const { busy, error, post } = useJson();
  const [f, setF] = useState({ kind: "collab", title: "", brandName: "", url: "" });
  return (
    <form className="ev-stack" onSubmit={async (e) => { e.preventDefault(); if (await post("/api/me", { action: "showcase_add", kind: f.kind, title: f.title, brandName: f.brandName || undefined, url: f.url || undefined })) { setF({ kind: "collab", title: "", brandName: "", url: "" }); router.refresh(); } }}>
      <div className="ev-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <select aria-label="Kind" className="ev-select" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
          <option value="collab">Brand collab</option>
          <option value="press">Press</option>
        </select>
        <input aria-label="Title" className="ev-input" placeholder="What it was" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <input aria-label="Brand or outlet" className="ev-input" placeholder="Brand or outlet" value={f.brandName} onChange={(e) => setF({ ...f, brandName: e.target.value })} />
        <input aria-label="Link" className="ev-input" type="url" placeholder="https://" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} />
      </div>
      <p className="ev-hint">Work from outside EVRA shows as self-reported. Deals paid through EVRA show as verified.</p>
      {error && <p className="ev-error" role="alert">{error}</p>}
      <button className="ev-btn ev-btn--secondary" type="submit" disabled={busy}>
        Add to my kit
      </button>
    </form>
  );
}

export function PasskeyButton() {
  const { busy, error, setError, post } = useJson();
  const [done, setDone] = useState(false);
  return (
    <div className="ev-stack">
      <button
        type="button"
        className="ev-btn ev-btn--secondary"
        disabled={busy}
        onClick={async () => {
          setError(null);
          try {
            const options = await post("/api/auth/passkey/register-options");
            if (!options) return;
            const response = await startRegistration({ optionsJSON: options as never });
            if (await post("/api/auth/passkey/register", { response, deviceName: navigator.platform })) setDone(true);
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        Turn on Face ID or fingerprint
      </button>
      {done && <p className="ev-notice ev-notice--ok" role="status">Face ID is on. Next time, sign in with one tap.</p>}
      {error && <p className="ev-error" role="alert">{error}</p>}
    </div>
  );
}
