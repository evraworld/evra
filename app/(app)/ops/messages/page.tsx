import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth/guards";
import { getPrefs } from "@/lib/i18n";
import { opsStrings } from "@/lib/i18n/ops";
import { MESSAGE_LOCALES, preview, TEMPLATE_KEYS } from "@/lib/ops/messages";
import { Sheet } from "@/components/ui";
import { OpsPage } from "../ui";
import { TestSend } from "./TestSend";

export const metadata: Metadata = { title: "Message centre | EVRA Ops" };

export default async function MessagesPage() {
  const staff = await requireStaff();
  const { locale } = await getPrefs(staff.locale);
  const t = opsStrings(locale);
  return (
    <OpsPage title={t.tools.messages} lead={t.messages.lead} back={t.back}>
      {TEMPLATE_KEYS.map((key) => (
        <Sheet key={key} className="ev-stack" aria-labelledby={`tpl-${key}`}>
          <h2 id={`tpl-${key}`} className="ev-h2 ev-code">
            {key}
          </h2>
          <div className="ev-grid">
            {MESSAGE_LOCALES.map((l) => {
              const m = preview(key, l);
              return (
                <div key={l} className="ev-stack" style={{ ["--gap" as string]: "8px", background: "var(--mist)", borderRadius: 16, padding: 16 }}>
                  <span className="ev-muted ev-small">{t.messages.languages[l]}</span>
                  <div className="ev-stack" style={{ ["--gap" as string]: "8px" }} lang={l} dir={l === "ar" ? "rtl" : "ltr"}>
                    <strong>{m.subject}</strong>
                    <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{m.body}</p>
                  </div>
                  <TestSend template={key} locale={l} uiLocale={locale} />
                </div>
              );
            })}
          </div>
        </Sheet>
      ))}
    </OpsPage>
  );
}
