import type { DB } from "@/lib/db";
import { dealEvents, dealTerms, deals, type Deliverable, type Platform, type Terms } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

// The default term sheet from the PRD: flat fee, 3 months of organic usage rights, one revision, a kill fee and disclosure.
export function defaultTerms(o: { totalCents: number; deliverables?: { type: Deliverable; count: number; platform?: Platform }[]; postingDays?: number; milestones?: 1 | 2 }): Terms {
  const start = new Date();
  const end = new Date(Date.now() + (o.postingDays ?? 21) * 86_400_000);
  const half = Math.round(o.totalCents / 2);
  return {
    deliverables: (o.deliverables ?? [{ type: "reel", count: 1 }]).map((d) => ({ type: d.type, count: d.count, platform: d.platform ?? (d.type === "tiktok" ? "tiktok" : d.type === "video" || d.type === "short" ? "youtube" : "instagram") })),
    postingWindow: { start: isoDay(start), end: isoDay(end) },
    usageRights: [{ kind: "organic_repost", platforms: ["instagram"], territory: "worldwide", months: 3, priceCents: 0 }],
    exclusivityDays: 0,
    revisions: 1,
    killFeeBps: 2500,
    milestones: o.milestones === 2 ? [{ title: "Draft approved", amountCents: half }, { title: "Post live", amountCents: o.totalCents - half }] : [{ title: "Post live with disclosure", amountCents: o.totalCents }],
    disclosure: "#ad in the first line of the caption and the platform's paid-partnership label",
    reviewDays: 5,
  };
}

// Opens a Deal Room with a first term sheet. Opportunities, requests and offers all start here.
export async function createDeal(
  db: DB,
  o: { brandId: string; creatorId: string; title: string; terms: Terms; proposedBy: string | null; side: "brand" | "creator" | "agent"; opportunityId?: string | null; requestId?: string | null },
) {
  const [deal] = await db.insert(deals).values({ brandId: o.brandId, creatorId: o.creatorId, title: o.title, opportunityId: o.opportunityId ?? null, requestId: o.requestId ?? null }).returning();
  const [terms] = await db.insert(dealTerms).values({ dealId: deal.id, version: 1, proposedBy: o.proposedBy, proposedBySide: o.side, terms: o.terms }).returning();
  await db.update(deals).set({ currentTermsId: terms.id }).where(eq(deals.id, deal.id));
  await db.insert(dealEvents).values({ dealId: deal.id, actorId: o.proposedBy, actorKind: o.side, kind: "offer_sent", data: { version: 1 } });
  return { ...deal, currentTermsId: terms.id };
}
