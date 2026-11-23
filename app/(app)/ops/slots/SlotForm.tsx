"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/db/schema";
import { LOCALE_NAMES, LOCALES } from "@/lib/i18n/strings";
import { opsStrings } from "@/lib/i18n/ops";
import { Field } from "@/components/ui";
import { useJson } from "@/components/ui/client";

const KINDS = ["announcement", "opportunity", "tip"] as const;
const SEGMENTS = ["all", "creator", "brand"] as const;
const two = { gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))" };

export function SlotForm({ locale, today }: { locale: Locale; today: string }) {
  const t = opsStrings(locale);
  const sl = t.slots;
  const router = useRouter();
  const { busy, error, post } = useJson();
  const [done, setDone] = useState("");
  return (
    <form
      className="ev-sheet ev-stack"
      aria-labelledby="slot-h"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        setDone("");
        if (await post("/api/ops/slots", { action: "create", ...Object.fromEntries(new FormData(form)) })) {
          form.reset();
          setDone(sl.created);
          router.refresh();
        }
      }}
    >
      <h2 id="slot-h" className="ev-h2">
        {sl.add}
      </h2>
      <div className="ev-grid" style={two}>
        <Field id="slot-kind" label={sl.kind}>
          <select id="slot-kind" name="kind" className="ev-select">
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {sl.kinds[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field id="slot-segment" label={sl.segment}>
          <select id="slot-segment" name="segment" className="ev-select">
            {SEGMENTS.map((k) => (
              <option key={k} value={k}>
                {sl.segments[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field id="slot-locale" label={sl.locale}>
          <select id="slot-locale" name="locale" className="ev-select">
            <option value="all">{sl.allLocales}</option>
            {LOCALES.map((l) => (
              <option key={l} value={l}>
                {LOCALE_NAMES[l]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field id="slot-title" label={sl.title}>
        <input id="slot-title" name="title" className="ev-input" dir="auto" required minLength={2} maxLength={80} />
      </Field>
      <Field id="slot-body" label={sl.body}>
        <textarea id="slot-body" name="body" className="ev-textarea" dir="auto" required minLength={2} maxLength={280} />
      </Field>
      <Field id="slot-href" label={sl.href} hint={sl.hrefHint}>
        <input id="slot-href" name="href" className="ev-input" dir="ltr" maxLength={300} aria-describedby="slot-href-hint" />
      </Field>
      <div className="ev-grid" style={two}>
        <Field id="slot-starts" label={sl.starts}>
          <input id="slot-starts" name="startsOn" type="date" className="ev-input" required defaultValue={today} />
        </Field>
        <Field id="slot-ends" label={sl.ends} hint={sl.endsHint}>
          <input id="slot-ends" name="endsOn" type="date" className="ev-input" aria-describedby="slot-ends-hint" />
        </Field>
      </div>
      <div>
        <button type="submit" className="ev-btn" disabled={busy} aria-busy={busy}>
          {busy ? t.working : sl.create}
        </button>
      </div>
      <p aria-live="polite" className="ev-muted">
        {done}
      </p>
      {error && (
        <p className="ev-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
