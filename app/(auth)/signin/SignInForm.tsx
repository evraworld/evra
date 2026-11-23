"use client";

import { useState } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import type { Locale } from "@/lib/db/schema";
import { core } from "@/lib/i18n/core";

async function post(url: string, body?: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "That didn't work. Try again.");
  return data;
}

export function SignInForm({ locale, dev }: { locale: Locale; dev: boolean }) {
  const t = core(locale).signin;
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const sendCode = () =>
    run(async () => {
      await post("/api/auth/code", { email, locale });
      setStep("code");
      setCode("");
    });

  const verify = () =>
    run(async () => {
      const { next } = await post("/api/auth/verify", { email, code, locale });
      window.location.href = next;
    });

  const passkey = () =>
    run(async () => {
      const options = await post("/api/auth/passkey/login-options");
      const response = await startAuthentication({ optionsJSON: options });
      const { next } = await post("/api/auth/passkey/login", { response });
      window.location.href = next;
    });

  if (step === "email")
    return (
      <div className="ev-stack" style={{ ["--gap" as string]: "24px" }}>
        <header className="ev-head">
          <h1 className="ev-display">{t.title}</h1>
          <p className="ev-muted ev-prose">{t.lead}</p>
        </header>
        <form
          className="ev-sheet ev-stack"
          onSubmit={(e) => {
            e.preventDefault();
            sendCode();
          }}
        >
          <div className="ev-field">
            <label className="ev-label" htmlFor="email">
              {t.email}
            </label>
            <span className="ev-hint" id="email-hint">
              {t.emailHint}
            </span>
            <input id="email" className="ev-input" type="email" inputMode="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} aria-describedby="email-hint" aria-invalid={!!error || undefined} />
          </div>
          {error && (
            <p className="ev-error" role="alert">
              {error}
            </p>
          )}
          <button className="ev-btn ev-btn--block" type="submit" disabled={busy || !email}>
            {busy ? t.sending : t.sendCode}
          </button>
          <p className="ev-muted ev-small" style={{ textAlign: "center" }}>
            {t.or}
          </p>
          <button className="ev-btn ev-btn--secondary ev-btn--block" type="button" onClick={passkey} disabled={busy}>
            {t.passkey}
          </button>
          <p className="ev-hint" style={{ textAlign: "center" }}>
            {t.passkeyHint}
          </p>
        </form>
      </div>
    );

  return (
    <div className="ev-stack" style={{ ["--gap" as string]: "24px" }}>
      <header className="ev-head">
        <h1 className="ev-display">{t.codeTitle}</h1>
        <p className="ev-muted ev-prose">{t.codeLead(email)}</p>
      </header>
      <form
        className="ev-sheet ev-stack"
        onSubmit={(e) => {
          e.preventDefault();
          verify();
        }}
      >
        <div className="ev-field">
          <label className="ev-label" htmlFor="code">
            {t.code}
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
        <button className="ev-btn ev-btn--block" type="submit" disabled={busy || code.length !== 6}>
          {busy ? t.verifying : t.verify}
        </button>
        <div className="ev-spread">
          <button type="button" className="ev-btn ev-btn--soft ev-btn--small" onClick={sendCode} disabled={busy}>
            {t.resend}
          </button>
          <button type="button" className="ev-btn ev-btn--soft ev-btn--small" onClick={() => setStep("email")}>
            {t.otherEmail}
          </button>
        </div>
        {dev && (
          <p className="ev-hint">
            {t.devHint}{" "}
            <a className="ev-link" href={`/dev/outbox?to=${encodeURIComponent(email)}`} target="_blank" rel="noreferrer">
              /dev/outbox
            </a>
          </p>
        )}
      </form>
    </div>
  );
}
