import { and, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import * as s from "@/lib/db/schema";

const DAY = 86_400_000;

export async function homeSlots(db: DB, segment: "creator" | "brand", locale: s.Locale) {
  const now = new Date();
  return db
    .select()
    .from(s.homeSlots)
    .where(and(inArray(s.homeSlots.segment, [segment, "all"]), inArray(s.homeSlots.locale, [locale, "all"]), lte(s.homeSlots.startsAt, now), or(isNull(s.homeSlots.endsAt), gte(s.homeSlots.endsAt, now))))
    .orderBy(desc(s.homeSlots.startsAt))
    .limit(3);
}

export async function creatorHome(db: DB, userId: string) {
  const deals = await db.select().from(s.deals).where(eq(s.deals.creatorId, userId)).orderBy(desc(s.deals.updatedAt)).limit(50);
  const ids = deals.map((d) => d.id);
  const [ms, terms, openRequests, agentDay] = await Promise.all([
    ids.length ? db.select().from(s.milestones).where(inArray(s.milestones.dealId, ids)) : Promise.resolve([]),
    ids.length ? db.select().from(s.dealTerms).where(inArray(s.dealTerms.id, deals.map((d) => d.currentTermsId).filter(Boolean) as string[])) : Promise.resolve([]),
    db.select({ n: sql<number>`count(*)::int` }).from(s.requests).where(and(eq(s.requests.toCreatorId, userId), eq(s.requests.status, "open"))),
    db.select({ n: sql<number>`count(*)::int` }).from(s.agentActions).where(and(eq(s.agentActions.userId, userId), gte(s.agentActions.createdAt, new Date(Date.now() - DAY)))),
  ]);
  const termsBy = new Map(terms.map((t) => [t.dealId, t]));
  const needsYou = deals.filter((d) => d.status === "negotiating" && termsBy.get(d.id)?.proposedBySide !== "creator");
  const locked = ms.filter((m) => m.status === "pending" || m.status === "submitted").reduce((a, m) => a + m.amountCents, 0);
  const nextPayout = ms
    .filter((m) => m.status === "submitted" && m.reviewDueAt)
    .sort((a, b) => a.reviewDueAt!.getTime() - b.reviewDueAt!.getTime())[0];
  return {
    deals,
    needsYou,
    lockedCents: locked,
    nextPayout: nextPayout ? { cents: nextPayout.amountCents, by: nextPayout.reviewDueAt! } : null,
    openRequests: openRequests[0]?.n ?? 0,
    agentActionsToday: agentDay[0]?.n ?? 0,
    paidThisWeekCents: ms.filter((m) => m.status === "released" && m.releasedAt && Date.now() - m.releasedAt.getTime() < 7 * DAY).reduce((a, m) => a + m.amountCents, 0),
    newOffers: deals.filter((d) => d.status === "negotiating" && Date.now() - d.createdAt.getTime() < 3 * DAY).length,
  };
}

export async function brandHome(db: DB, brandId: string) {
  const deals = await db.select().from(s.deals).where(eq(s.deals.brandId, brandId)).orderBy(desc(s.deals.updatedAt)).limit(50);
  const ids = deals.map((d) => d.id);
  const [ms, terms, sentOpen, opps] = await Promise.all([
    ids.length ? db.select().from(s.milestones).where(inArray(s.milestones.dealId, ids)) : Promise.resolve([]),
    ids.length ? db.select().from(s.dealTerms).where(inArray(s.dealTerms.id, deals.map((d) => d.currentTermsId).filter(Boolean) as string[])) : Promise.resolve([]),
    db.select({ n: sql<number>`count(*)::int` }).from(s.requests).where(and(eq(s.requests.fromBrandId, brandId), eq(s.requests.status, "open"))),
    db.select().from(s.opportunities).where(and(eq(s.opportunities.brandId, brandId), eq(s.opportunities.status, "open"))),
  ]);
  const termsBy = new Map(terms.map((t) => [t.dealId, t]));
  return {
    deals,
    approvalsWaiting: ms.filter((m) => m.status === "submitted"),
    needsYou: deals.filter((d) => (d.status === "negotiating" && termsBy.get(d.id)?.proposedBySide !== "brand") || (d.status === "agreed")),
    lockedCents: ms.filter((m) => m.status === "pending" || m.status === "submitted").reduce((a, m) => a + m.amountCents, 0),
    releasedCents: ms.filter((m) => m.status === "released" || m.status === "resolved").reduce((a, m) => a + m.amountCents, 0),
    sentOpen: sentOpen[0]?.n ?? 0,
    opportunities: opps,
  };
}
