import { and, eq, gte, sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { reviewOffer, type OfferReview } from "@/lib/ai/agents";
import { MODEL, type StructuredFn, structured } from "@/lib/ai/claude";
import { rateRange } from "@/lib/rates";
import { counter, currentTerms } from "./actions";
import { termsTotal } from "./terms";
import { notify } from "./access";

export type Plan = { act: "send_counter"; totalCents: number } | { act: "decline"; reason: string } | { act: "wait" };

// Code, not the model, decides what Delegate may do: counter inside the creator's range, decline clear
// mismatches, and never say yes on the creator's behalf.
export function delegatePlan(review: Pick<OfferReview, "verdict" | "counter">, offerCents: number, rules: { minRateCents: number; counterRangePct: number; blockedBrand: boolean }): Plan {
  if (rules.blockedBrand) return { act: "decline", reason: "blocked_brand" };
  if (offerCents < rules.minRateCents * 0.5) return { act: "decline", reason: "far_below_floor" };
  if (review.verdict === "counter" || offerCents < rules.minRateCents) {
    const ceiling = Math.floor(offerCents * (1 + rules.counterRangePct / 100));
    const wanted = review.counter?.totalCents ?? rules.minRateCents;
    const total = Math.min(Math.max(wanted, rules.minRateCents, offerCents), Math.max(ceiling, rules.minRateCents));
    if (total > offerCents) return { act: "send_counter", totalCents: total };
  }
  return { act: "wait" };
}

export function counterTerms(terms: s.Terms, c: NonNullable<OfferReview["counter"]> | { totalCents: number }): s.Terms {
  const oldTotal = termsTotal(terms);
  const scale = c.totalCents / Math.max(1, oldTotal);
  const milestones = terms.milestones.map((m) => ({ ...m, amountCents: Math.max(100, Math.round((m.amountCents * scale) / 100) * 100) }));
  const drift = c.totalCents - milestones.reduce((a, m) => a + m.amountCents, 0);
  milestones[milestones.length - 1].amountCents += drift;
  const out: s.Terms = { ...terms, milestones };
  if ("usageMonths" in c && c.usageMonths) out.usageRights = terms.usageRights.map((r) => ({ ...r, months: Math.min(r.months, c.usageMonths!) }));
  if ("revisions" in c && c.revisions != null) out.revisions = Math.max(0, Math.min(5, c.revisions));
  if ("killFeeBps" in c && c.killFeeBps != null) out.killFeeBps = Math.max(0, Math.min(10_000, c.killFeeBps));
  return out;
}

export async function runCreatorAgent(db: DB, dealId: string, llm: StructuredFn = structured) {
  const [deal] = await db.select().from(s.deals).where(eq(s.deals.id, dealId)).limit(1);
  if (!deal || deal.status !== "negotiating") return null;
  const t = await currentTerms(db, deal);
  if (t.proposedBySide !== "brand") return null;
  const [[creator], [profile], accounts, [brand], [{ done }], [{ month }]] = await Promise.all([
    db.select().from(s.users).where(eq(s.users.id, deal.creatorId)).limit(1),
    db.select().from(s.creatorProfiles).where(eq(s.creatorProfiles.userId, deal.creatorId)).limit(1),
    db.select().from(s.socialAccounts).where(eq(s.socialAccounts.userId, deal.creatorId)),
    db.select().from(s.brands).where(eq(s.brands.id, deal.brandId)).limit(1),
    db.select({ done: sql<number>`count(*)::int` }).from(s.deals).where(and(eq(s.deals.brandId, deal.brandId), eq(s.deals.status, "completed"))),
    db.select({ month: sql<number>`count(*)::int` }).from(s.deals).where(and(eq(s.deals.creatorId, deal.creatorId), gte(s.deals.createdAt, new Date(Date.now() - 30 * 86_400_000)))),
  ]);
  if (!profile || !creator) return null;
  const main = [...accounts].sort((a, b) => b.followers - a.followers)[0];
  const country = creator.country === "IN" ? "IN" : "AE";
  const range = main ? await rateRange(db, { niche: profile.niches[0] ?? "lifestyle", country, deliverable: t.terms.deliverables[0]?.type ?? "reel", followers: main.followers }) : null;
  const blockedBrand = profile.blockedBrands.some((b) => b && brand?.name.toLowerCase().includes(b.toLowerCase()));
  const offer = termsTotal(t.terms);

  const review = await reviewOffer(
    {
      terms: t.terms,
      brandName: brand?.name ?? "Brand",
      brandRecord: { paidOnTimePct: null, deals: done },
      rules: { minRateCents: profile.minRateCents, blockedBrands: profile.blockedBrands, niches: profile.niches, maxMonthlyDeals: profile.maxMonthlyDeals, dealsThisMonth: month, counterRangePct: profile.counterRangePct },
      stats: { followers: main?.followers ?? 0, avgViews: main?.avgViews ?? 0, engagementBps: main?.engagementBps ?? 0 },
      // Illustrative seed rates never steer a real negotiation.
      rateRange: range && !range.illustrative ? { lowCents: range.lowCents, highCents: range.highCents, sample: range.sample } : null,
      locale: creator.locale,
    },
    llm,
  );
  const level = profile.agentLevel;
  await db.insert(s.agentActions).values({ agent: "creator", userId: creator.id, dealId, level, action: "review", status: "executed", input: { termsId: t.id, offerCents: offer }, output: review, model: MODEL });

  if (level === "copilot" && review.verdict === "counter" && review.counter) {
    const proposal = counterTerms(t.terms, review.counter);
    await db.insert(s.agentActions).values({ agent: "creator", userId: creator.id, dealId, level, action: "counter", status: "proposed", input: { termsId: t.id }, output: { terms: proposal, message: review.counter.message, totalCents: termsTotal(proposal) }, model: MODEL });
    await notify(db, deal, "creator", "Your agent drafted a counter. It waits for your tap.");
  }

  if (level === "delegate") {
    const plan = delegatePlan(review, offer, { minRateCents: profile.minRateCents, counterRangePct: profile.counterRangePct, blockedBrand });
    if (plan.act === "send_counter") {
      const proposal = counterTerms(t.terms, { ...(review.counter ?? {}), totalCents: plan.totalCents });
      await counter(db, { deal, side: "creator", user: creator }, proposal, { side: "agent" });
      if (review.counter?.message) await db.insert(s.dealComments).values({ dealId, userId: creator.id, body: `${review.counter.message}\n\n(Sent by ${creator.name ?? "the creator"}'s agent, inside their written rules.)` });
      await db.insert(s.agentActions).values({ agent: "creator", userId: creator.id, dealId, level, action: "counter", status: "executed", input: { termsId: t.id }, output: { totalCents: plan.totalCents }, model: MODEL });
    } else if (plan.act === "decline") {
      await db.update(s.deals).set({ status: "cancelled", updatedAt: new Date() }).where(eq(s.deals.id, dealId));
      await db.insert(s.dealEvents).values({ dealId, actorId: creator.id, actorKind: "agent", kind: "declined", data: { reason: plan.reason } });
      if (review.declineMessage) await db.insert(s.dealComments).values({ dealId, userId: creator.id, body: review.declineMessage });
      await db.insert(s.agentActions).values({ agent: "creator", userId: creator.id, dealId, level, action: "decline", status: "executed", input: { termsId: t.id }, output: { reason: plan.reason }, model: MODEL });
      await notify(db, deal, "brand", "The creator's agent declined this offer within the creator's rules.");
    }
  }
  return review;
}

// Copilot proposals become real counters only on the creator's tap.
export async function decideAgentProposal(db: DB, ctx: { deal: typeof s.deals.$inferSelect; user: typeof s.users.$inferSelect }, actionId: string, approve: boolean) {
  const [a] = await db.select().from(s.agentActions).where(and(eq(s.agentActions.id, actionId), eq(s.agentActions.dealId, ctx.deal.id), eq(s.agentActions.status, "proposed"))).limit(1);
  if (!a) return false;
  if (approve) {
    const out = a.output as { terms: s.Terms; message?: string };
    await counter(db, { deal: ctx.deal, side: "creator", user: ctx.user }, out.terms);
    if (out.message) await db.insert(s.dealComments).values({ dealId: ctx.deal.id, userId: ctx.user.id, body: out.message });
  }
  await db.update(s.agentActions).set({ status: approve ? "approved" : "rejected", decidedBy: ctx.user.id, decidedAt: new Date() }).where(eq(s.agentActions.id, a.id));
  return true;
}
