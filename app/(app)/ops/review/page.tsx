import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { getPrefs } from "@/lib/i18n";
import { opsStrings } from "@/lib/i18n/ops";
import { reviewQueue } from "@/lib/ops/review";
import { daysSince, OpsPage } from "../ui";
import { ReviewQueue, type ReviewItem } from "./ReviewQueue";

export const metadata: Metadata = { title: "Review queue | EVRA Ops" };

export default async function ReviewPage() {
  const staff = await requireStaff();
  const { locale } = await getPrefs(staff.locale);
  const t = opsStrings(locale);
  const { open, untold } = await reviewQueue(await getDb());
  const item = (r: (typeof open)[number]): ReviewItem => ({
    id: r.flag.id,
    who: r.name ?? r.email ?? r.brandName ?? r.flag.id.slice(0, 8),
    detail: [r.email, r.handle && `@${r.handle}`, r.role, r.foundingNumber && t.review.founding(r.foundingNumber), r.brandName && t.review.brand(r.brandName), r.memberStatus && t.review.memberStatus(r.memberStatus)].filter(Boolean).join(" · "),
    source: r.flag.source,
    reason: r.flag.reason,
    age: t.age(daysSince(r.flag.createdAt)),
    decision: r.flag.status === "open" ? null : r.flag.status,
    decisionReason: r.flag.decisionReason,
  });
  return (
    <OpsPage title={t.tools.review} lead={t.review.lead} back={t.back}>
      <ReviewQueue locale={locale} open={open.map(item)} untold={untold.map(item)} />
    </OpsPage>
  );
}
