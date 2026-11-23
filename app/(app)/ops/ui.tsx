import type { ReactNode } from "react";
import { LinkButton, PageHeader } from "@/components/ui";
import type { Locale } from "@/lib/db/schema";

const TAG: Record<Locale, string> = { en: "en-GB", ar: "ar-AE", hi: "hi-IN" };
export const fmtDate = (d: Date, l: Locale) => d.toLocaleDateString(TAG[l], { day: "numeric", month: "short", year: "numeric" });
export const fmtTime = (d: Date, l: Locale) => d.toLocaleTimeString(TAG[l], { hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
export const fmtNumber = (n: number, l: Locale) => n.toLocaleString(TAG[l]);
export const daysSince = (d: Date) => Math.floor((Date.now() - d.getTime()) / 86_400_000);

export function OpsPage({ title, lead, back, children }: { title: ReactNode; lead?: ReactNode; back: string; children: ReactNode }) {
  return (
    <main className="ev-page">
      <div className="ev-stack" style={{ ["--gap" as string]: "20px" }}>
        <div>
          <LinkButton href="/ops" variant="soft">
            {back}
          </LinkButton>
        </div>
        <PageHeader title={title} lead={lead} />
        {children}
      </div>
    </main>
  );
}
