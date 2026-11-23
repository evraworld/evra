import { asc, desc, eq, inArray } from "drizzle-orm";
import type { DB } from "@/lib/db";
import * as s from "@/lib/db/schema";
import type { DealCtx } from "./access";
import { termsHash } from "./terms";

export async function dealView(db: DB, ctx: DealCtx) {
  const { deal } = ctx;
  const [[brand], [creator], versions, milestones, submissions, comments, events, disputes, agent] = await Promise.all([
    db.select().from(s.brands).where(eq(s.brands.id, deal.brandId)).limit(1),
    db.select({ id: s.users.id, name: s.users.name, handle: s.users.handle }).from(s.users).where(eq(s.users.id, deal.creatorId)).limit(1),
    db.select().from(s.dealTerms).where(eq(s.dealTerms.dealId, deal.id)).orderBy(asc(s.dealTerms.version)),
    db.select().from(s.milestones).where(eq(s.milestones.dealId, deal.id)).orderBy(asc(s.milestones.idx)),
    db.select().from(s.submissions).where(eq(s.submissions.dealId, deal.id)).orderBy(desc(s.submissions.createdAt)),
    db.select().from(s.dealComments).where(eq(s.dealComments.dealId, deal.id)).orderBy(asc(s.dealComments.createdAt)),
    db.select().from(s.dealEvents).where(eq(s.dealEvents.dealId, deal.id)).orderBy(desc(s.dealEvents.createdAt)),
    db.select().from(s.disputes).where(eq(s.disputes.dealId, deal.id)),
    ctx.side === "creator" ? db.select().from(s.agentActions).where(eq(s.agentActions.dealId, deal.id)).orderBy(desc(s.agentActions.createdAt)) : Promise.resolve([]),
  ]);
  const current = versions.find((v) => v.id === deal.currentTermsId) ?? versions[versions.length - 1];
  const previous = versions.find((v) => v.version === current.version - 1) ?? null;
  const approvals = await db.select().from(s.dealApprovals).where(eq(s.dealApprovals.termsId, current.id));
  const hash = termsHash(current.terms);
  const authorIds = [...new Set(comments.map((c) => c.userId))];
  const authors = new Map((authorIds.length ? await db.select({ id: s.users.id, name: s.users.name }).from(s.users).where(inArray(s.users.id, authorIds)) : []).map((u) => [u.id, u.name ?? "Someone"]));
  return {
    deal,
    side: ctx.side,
    brand,
    creator,
    current,
    previous,
    versions,
    hash,
    approvedBy: { brand: approvals.some((a) => a.side === "brand" && a.hash === hash), creator: approvals.some((a) => a.side === "creator" && a.hash === hash) },
    milestones,
    submissions,
    comments: comments.map((c) => ({ ...c, author: authors.get(c.userId) ?? "Someone" })),
    events,
    disputes,
    agent,
  };
}

export type DealView = Awaited<ReturnType<typeof dealView>>;

// Where the deal sits on the deal rail: Offer, Agreed, Working, Delivered, Approved.
export function railStep(v: Pick<DealView, "deal" | "milestones">) {
  const st = v.deal.status;
  if (st === "negotiating") return 0;
  if (st === "agreed") return 1;
  if (st === "completed") return 5;
  if (v.milestones.length && v.milestones.every((m) => m.status !== "pending")) return 3;
  return 2;
}
