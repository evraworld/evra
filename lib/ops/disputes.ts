import { and, asc, count, eq, inArray } from "drizzle-orm";
import type { DB } from "@/lib/db";
import * as s from "@/lib/db/schema";

// Open disputes, oldest first, with what staff need to decide: both parties, the disputed step and the reason.
export async function openDisputes(db: DB) {
  const rows = await db
    .select({
      d: s.disputes,
      deal: { id: s.deals.id, title: s.deals.title, creatorId: s.deals.creatorId },
      brand: s.brands.name,
      step: { title: s.milestones.title, amountCents: s.milestones.amountCents },
    })
    .from(s.disputes)
    .innerJoin(s.deals, eq(s.deals.id, s.disputes.dealId))
    .innerJoin(s.brands, eq(s.brands.id, s.deals.brandId))
    .innerJoin(s.milestones, and(eq(s.milestones.dealId, s.disputes.dealId), eq(s.milestones.idx, s.disputes.milestoneIdx)))
    .where(eq(s.disputes.status, "open"))
    .orderBy(asc(s.disputes.createdAt));
  const ids = [...new Set(rows.map((r) => r.deal.creatorId))];
  const creators = ids.length ? await db.select({ id: s.users.id, name: s.users.name, handle: s.users.handle }).from(s.users).where(inArray(s.users.id, ids)) : [];
  const byId = new Map(creators.map((c) => [c.id, c]));
  return rows.map((r) => ({ ...r, creator: byId.get(r.deal.creatorId) ?? null, openedBy: r.d.openedBy === r.deal.creatorId ? ("creator" as const) : ("brand" as const) }));
}

export async function openDisputeCount(db: DB) {
  const [{ n }] = await db.select({ n: count() }).from(s.disputes).where(eq(s.disputes.status, "open"));
  return n;
}
