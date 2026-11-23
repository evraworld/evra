"use client";

import { useState } from "react";
import type { Locale } from "@/lib/db/schema";
import type { TemplateKey } from "@/lib/messages/templates";
import { opsStrings } from "@/lib/i18n/ops";
import { useJson } from "@/components/ui/client";

export function TestSend({ template, locale, uiLocale }: { template: TemplateKey; locale: Locale; uiLocale: Locale }) {
  const t = opsStrings(uiLocale);
  const { busy, error, post } = useJson();
  const [sent, setSent] = useState("");
  return (
    <div className="ev-stack" style={{ ["--gap" as string]: "6px" }}>
      <div>
        <button
          type="button"
          className="ev-btn ev-btn--secondary"
          disabled={busy}
          aria-busy={busy}
          aria-label={`${t.messages.sendTest}: ${template}, ${t.messages.languages[locale]}`}
          onClick={async () => {
            const r = await post<{ to: string }>("/api/ops/messages", { template, locale });
            if (r) setSent(t.messages.sent(r.to));
          }}
        >
          {busy ? t.working : t.messages.sendTest}
        </button>
      </div>
      <span className="ev-hint" aria-live="polite">
        {sent}
      </span>
      {error && (
        <span className="ev-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
