"use client";

import { useState, type ReactNode } from "react";
import type { Locale } from "@/lib/db/schema";
import { claimStrings } from "@/lib/i18n/ops";
import { core } from "@/lib/i18n/core";
import { onboardingStrings } from "@/lib/i18n/onboarding";
import { Empty } from "@/components/ui";

const COUNTRIES = ["AE", "IN", "SA", "OTHER"] as const;

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "That didn't work. Try again.");
  return data;
}

// Claim with an email code (the same /api/auth calls as the sign-in screen), or delete with no sign-in at all.
export function ClaimKit({ token, locale, handle: suggested, email: invited, dev, children }: { token: string; locale: Locale; handle: string; email: string; dev: boolean; children: ReactNode }) {
  const t = claimStrings(locale);
  const si = core(locale).signin;
  const ob = onboardingStrings(locale);
  const url = `/api/claim/${token}`;
  const [step, setStep] = useState<"details" | "code" | "deleted">("details");
  const [handle, setHandle] = useState(suggested);
  const [handleError, setHandleError] = useState("");
  const [country, setCountry] = useState<(typeof COUNTRIES)[number]>("AE");
  const [adult, setAdult] = useState(false);
  const [email, setEmail] = useState(invited);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function run(fn: () => Promise<void>, onError = setError) {
    setBusy(true);
    setError(null);
    setDeleteError(null);
    try {
      await fn();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function claim() {
    try {
      const { next } = await post(url, { action: "claim", handle, country, adult: true });
      window.location.href = next;
    } catch (e) {
      setStep("details");
      throw e;
    }
  }

  const sendCode = () => post("/api/auth/code", { email, locale });

  const submitDetails = () =>
    run(async () => {
      const h = await post(url, { action: "check", handle });
      setHandle(h.handle);
      if (!h.valid || !h.available) return setHandleError(h.valid ? ob.basics.taken : t.invalid);
      setHandleError("");
      await sendCode();
      setCode("");
      setStep("code");
    });

  const verify = () =>
    run(async () => {
      await post("/api/auth/verify", { email, code, locale });
      await claim();
    });

  const remove = () => {
    if (window.confirm(t.deleteConfirm))
      run(async () => {
        await post(url, { action: "delete" });
        setStep("deleted");
      }, setDeleteError);
  };

  if (step === "deleted")
    return (
      <div className="ev-sheet" role="status">
        <Empty title={t.deleted} />
      </div>
    );

  return (
    <div className="ev-stack" style={{ ["--gap" as string]: "24px" }}>
      {children}

      {step === "details" ? (
        <form
          className="ev-sheet ev-stack"
          aria-labelledby="claim-h"
          onSubmit={(e) => {
            e.preventDefault();
            submitDetails();
          }}
        >
          <h2 id="claim-h" className="ev-h2">
            {t.claimTitle}
          </h2>
          <p className="ev-muted">{t.claimLead}</p>
          <div className="ev-field">
            <label className="ev-label" htmlFor="handle">
              {ob.basics.handle}
            </label>
            <span className="ev-hint" id="handle-hint">
              {ob.basics.handleHint}
            </span>
            <div className="ev-row" style={{ ["--gap" as string]: "0" }}>
              <span className="ev-muted" style={{ paddingInlineEnd: 6 }} dir="ltr">
                evra.world/@
              </span>
              <input
                id="handle"
                dir="ltr"
                className="ev-input"
                style={{ flex: 1, minWidth: 140 }}
                autoCapitalize="none"
                autoComplete="username"
                required
                maxLength={40}
                value={handle}
                onChange={(e) => {
                  setHandle(e.target.value);
                  setHandleError("");
                }}
                aria-describedby="handle-hint handle-error"
                aria-invalid={!!handleError || undefined}
              />
            </div>
            <span id="handle-error" className="ev-error" aria-live="polite">
              {handleError}
            </span>
          </div>
          <div className="ev-field">
            <label className="ev-label" htmlFor="country">
              {ob.basics.country}
            </label>
            <select id="country" className="ev-select" value={country} onChange={(e) => setCountry(e.target.value as typeof country)}>
              {COUNTRIES.map((k) => (
                <option key={k} value={k}>
                  {ob.countries[k]}
                </option>
              ))}
            </select>
          </div>
          <label className="ev-toggle">
            <input type="checkbox" required checked={adult} onChange={(e) => setAdult(e.target.checked)} />
            <span className="ev-stack" style={{ ["--gap" as string]: "2px" }}>
              <span className="ev-label">{ob.basics.adult}</span>
              <span className="ev-hint">{ob.basics.adultHint}</span>
            </span>
          </label>
          <div className="ev-field">
            <label className="ev-label" htmlFor="email">
              {si.email}
            </label>
            <span className="ev-hint" id="email-hint">
              {si.emailHint}
            </span>
            <input id="email" className="ev-input" type="email" inputMode="email" autoComplete="email" dir="ltr" required value={email} onChange={(e) => setEmail(e.target.value)} aria-describedby="email-hint" />
          </div>
          {error && (
            <p className="ev-error" role="alert">
              {error}
            </p>
          )}
          <button className="ev-btn ev-btn--block" type="submit" disabled={busy || !adult || !handle.trim() || !email} aria-busy={busy}>
            {busy ? t.checking : si.sendCode}
          </button>
        </form>
      ) : (
        <form
          className="ev-sheet ev-stack"
          aria-labelledby="code-h"
          onSubmit={(e) => {
            e.preventDefault();
            verify();
          }}
        >
          <h2 id="code-h" className="ev-h2">
            {si.codeTitle}
          </h2>
          <p className="ev-muted">{si.codeLead(email)}</p>
          <div className="ev-field">
            <label className="ev-label" htmlFor="code">
              {si.code}
            </label>
            <input
              id="code"
              className="ev-input ev-code-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              aria-invalid={!!error || undefined}
            />
          </div>
          {error && (
            <p className="ev-error" role="alert">
              {error}
            </p>
          )}
          <button className="ev-btn ev-btn--block" type="submit" disabled={busy || code.length !== 6} aria-busy={busy}>
            {busy ? t.claiming : t.claim}
          </button>
          <div className="ev-spread">
            <button type="button" className="ev-btn ev-btn--soft ev-btn--small" disabled={busy} onClick={() => run(sendCode)}>
              {si.resend}
            </button>
            <button type="button" className="ev-btn ev-btn--soft ev-btn--small" disabled={busy} onClick={() => setStep("details")}>
              {si.otherEmail}
            </button>
          </div>
          {dev && (
            <p className="ev-hint">
              {si.devHint}{" "}
              <a className="ev-link" href="/dev/outbox" target="_blank" rel="noreferrer">
                /dev/outbox
              </a>
            </p>
          )}
        </form>
      )}

      <section className="ev-sheet ev-stack" aria-labelledby="delete-h">
        <h2 id="delete-h" className="ev-h2">
          {t.deleteTitle}
        </h2>
        <p className="ev-muted">{t.deleteLead}</p>
        <div>
          <button type="button" className="ev-btn ev-btn--danger" disabled={busy} onClick={remove}>
            {t.delete}
          </button>
        </div>
        {deleteError && (
          <p className="ev-error" role="alert">
            {deleteError}
          </p>
        )}
      </section>
    </div>
  );
}
