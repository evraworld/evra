"use client";

import { useId, useState, type FormEvent } from "react";
import type { Locale, RequestType } from "@/lib/db/schema";
import { requestStrings } from "@/lib/i18n/requests";
import { FORM_FIELDS, REQUEST_DELIVERABLES, REQUEST_TYPES, isFunded, type FormField, type P1RequestType } from "@/lib/requests/types";
import { postJson } from "./postJson";

type Values = Partial<Record<FormField | "message", string>>;

const INPUT: Partial<Record<FormField, { type: string; inputMode?: "decimal" | "numeric" | "url"; min?: number; max?: number; maxLength?: number }>> = {
  amount: { type: "text", inputMode: "decimal" },
  product: { type: "text", maxLength: 120 },
  date: { type: "date" },
  place: { type: "text", maxLength: 120 },
  minutes: { type: "number", inputMode: "numeric", min: 5, max: 240 },
  postUrl: { type: "url", inputMode: "url", maxLength: 300 },
  months: { type: "number", inputMode: "numeric", min: 1, max: 36 },
};

// The request menu on a creator's kit and discovery card: a signed-in brand picks a type the creator is open to and sends a short form.
export function RequestMenu({ creatorId, creatorName, openTo, locale }: { creatorId: string; creatorName: string; openTo: RequestType[]; locale: Locale }) {
  const t = requestStrings(locale);
  const id = useId();
  const types = REQUEST_TYPES.filter((x) => openTo.includes(x));
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<P1RequestType | null>(null);
  const [values, setValues] = useState<Values>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string; signIn?: boolean } | null>(null);

  if (!types.length) return <p className="ev-muted">{t.menu.none}</p>;
  const fields = type ? FORM_FIELDS[type] : [];
  const amountCents = Math.round(Number((values.amount ?? "").replace(/[^0-9.]/g, "")) * 100) || 0;
  const set = (k: keyof Values) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!type) return;
    setBusy(true);
    setResult(null);
    const details = Object.fromEntries(
      fields.filter((f) => f !== "amount" && values[f]?.trim()).map((f) => [f, f === "minutes" || f === "months" ? Number(values[f]) : values[f]!.trim()]),
    );
    try {
      await postJson("/api/requests", { creatorId, type, message: values.message ?? "", amountCents: fields.includes("amount") && amountCents ? amountCents : undefined, details });
      setResult({ ok: true, text: t.menu.sent(creatorName) });
      setValues({});
      setType(null);
      setOpen(false);
    } catch (err) {
      const status = (err as { status?: number }).status;
      setResult({ ok: false, text: status === 401 ? t.menu.signIn : (err as Error).message, signIn: status === 401 });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ev-stack" style={{ ["--gap" as string]: "12px" }}>
      <button type="button" className="ev-btn" aria-expanded={open} aria-controls={`${id}-form`} onClick={() => setOpen(!open)}>
        {t.menu.title}
      </button>
      {open && (
        <form id={`${id}-form`} className="ev-sheet ev-stack" onSubmit={submit} aria-busy={busy}>
          <fieldset className="ev-stack" style={{ border: 0, padding: 0, margin: 0, ["--gap" as string]: "10px" }}>
            <legend className="ev-label" style={{ marginBottom: 10 }}>
              {t.menu.pick}
            </legend>
            <div className="ev-chips">
              {types.map((x) => (
                <label className="ev-chip" key={x}>
                  <input type="radio" name={`${id}-type`} value={x} checked={type === x} onChange={() => setType(x)} />
                  <span>{t.types[x]}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {type && (
            <>
              {fields.map((f) =>
                f === "deliverable" ? (
                  <div className="ev-field" key={f}>
                    <label className="ev-label" htmlFor={`${id}-${f}`}>
                      {t.fields.deliverable}
                    </label>
                    <select id={`${id}-${f}`} className="ev-select" value={values.deliverable ?? "reel"} onChange={set("deliverable")}>
                      {REQUEST_DELIVERABLES.map((d) => (
                        <option key={d} value={d}>
                          {t.deliverables[d]}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="ev-field" key={f}>
                    <label className="ev-label" htmlFor={`${id}-${f}`}>
                      {t.fields[f]}
                    </label>
                    {f === "amount" && (
                      <span className="ev-hint" id={`${id}-amount-hint`}>
                        {type === "paid_collab" ? t.menu.amountFunded : t.menu.amountOptional}
                      </span>
                    )}
                    <input id={`${id}-${f}`} className="ev-input" dir={f === "postUrl" ? "ltr" : undefined} {...INPUT[f]} aria-describedby={f === "amount" ? `${id}-amount-hint` : undefined} value={values[f] ?? ""} onChange={set(f)} />
                  </div>
                ),
              )}
              <div className="ev-field">
                <label className="ev-label" htmlFor={`${id}-message`}>
                  {t.fields.message}
                </label>
                <span className="ev-hint" id={`${id}-message-hint`}>
                  {type === "seeding" ? `${t.menu.messageHint} ${t.menu.seedingNote}` : t.menu.messageHint}
                </span>
                <textarea id={`${id}-message`} className="ev-textarea" required minLength={10} maxLength={1000} aria-describedby={`${id}-message-hint`} value={values.message ?? ""} onChange={set("message")} />
              </div>
              <p className="ev-hint">{isFunded(type, amountCents) ? t.menu.funded : t.menu.usesCredit}</p>
              <button type="submit" className="ev-btn" disabled={busy} aria-busy={busy}>
                {busy ? t.menu.sending : t.menu.send}
              </button>
            </>
          )}
        </form>
      )}
      <div aria-live="polite">
        {result && (
          <p className={result.ok ? "ev-notice ev-notice--ok" : "ev-notice ev-notice--bad"}>
            <span>
              {result.text}{" "}
              {result.signIn && (
                <a className="ev-link" href="/signin">
                  Sign in
                </a>
              )}
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
