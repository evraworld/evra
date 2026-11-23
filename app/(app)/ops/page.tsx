import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { getPrefs } from "@/lib/i18n";
import { opsStrings } from "@/lib/i18n/ops";
import { opsCounts } from "@/lib/ops/attention";
import { openDisputeCount } from "@/lib/ops/disputes";
import { Badge, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Ops | EVRA" };

const KIT_STATUSES = ["draft", "approved", "invited", "claimed", "deleted"] as const;

export default async function OpsHome() {
  const staff = await requireStaff();
  const { locale } = await getPrefs(staff.locale);
  const t = opsStrings(locale);
  const db = await getDb();
  const [c, disputes] = await Promise.all([opsCounts(db), openDisputeCount(db)]);
  const tools: { key: keyof typeof t.tools; counts: [label: string, n: number, urgent: boolean][] }[] = [
    { key: "review", counts: [[t.counts.waiting, c.open, true], [t.counts.toTell, c.untold, true]] },
    { key: "disputes", counts: [[t.counts.open, disputes, true]] },
    { key: "kits", counts: KIT_STATUSES.map((st) => [t.kitStatus[st], c.kits[st] ?? 0, false]) },
    { key: "attention", counts: [[t.counts.open, c.attention, true]] },
    { key: "support", counts: [] },
    { key: "messages", counts: [] },
    { key: "slots", counts: [] },
  ];
  return (
    <main className="ev-page">
      <PageHeader title={t.title} lead={t.lead} display />
      <div className="ev-grid">
        {tools.map(({ key, counts }) => (
          <Link key={key} href={`/ops/${key}`} className="ev-sheet ev-stack" style={{ textDecoration: "none", ["--gap" as string]: "8px" }}>
            <h2 className="ev-h2">{t.tools[key]}</h2>
            <p className="ev-muted">{t.hints[key]}</p>
            {counts.length > 0 && (
              <span className="ev-row" style={{ ["--gap" as string]: "8px" }}>
                {counts.map(([label, n, urgent]) => (
                  <Badge key={label} tone={urgent && n > 0 ? "warn" : undefined}>
                    {label}: {n}
                  </Badge>
                ))}
              </span>
            )}
          </Link>
        ))}
      </div>
    </main>
  );
}
