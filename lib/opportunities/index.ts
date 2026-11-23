import { and, count, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/lib/db";
import * as s from "@/lib/db/schema";
import type { User } from "@/lib/auth/session";
import { HttpError } from "@/lib/auth/guards";
import { createDeal, defaultTerms } from "@/lib/deals/create";
import { send } from "@/lib/messages";
import { NICHES } from "@/lib/onboarding";
import { normalizeHandle } from "@/lib/users";

export type Opportunity = typeof s.opportunities.$inferSelect;

export const AUDIENCES = ["public", "invite", "collective", "founding"] as const;
export const PLATFORMS = ["instagram", "tiktok", "youtube", "x"] as const;
export const DELIVERABLES = ["reel", "story", "post", "short", "video", "tiktok", "ugc", "live", "event"] as const;
export const OPP_COUNTRIES = ["AE", "IN", "SA"] as const;
export const FIRST_LOOK_HOURS = 24;
const DAY = 86_400_000;

export const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

// ---------- audience rules ----------

export type Viewer = { foundingNumber: number | null; collectiveIds: Set<string>; invitedTo: Set<string>; brandId: string | null };

// Founding first look: founders only until foundingUntil, then everyone. Collective and invite-only stay private.
export function canSee(o: Pick<Opportunity, "id" | "brandId" | "audience" | "collectiveId" | "foundingUntil">, v: Viewer, now = new Date()) {
  if (v.brandId && v.brandId === o.brandId) return true;
  switch (o.audience) {
    case "public":
      return true;
    case "founding":
      return v.foundingNumber != null || !o.foundingUntil || o.foundingUntil <= now;
    case "collective":
      return !!o.collectiveId && v.collectiveIds.has(o.collectiveId);
    case "invite":
      return v.invitedTo.has(o.id);
  }
}

export async function viewerFor(db: DB, user: Pick<User, "id" | "foundingNumber">): Promise<Viewer> {
  const [groups, invites, brand] = await Promise.all([
    db.select({ id: s.collectiveMembers.collectiveId }).from(s.collectiveMembers).where(and(eq(s.collectiveMembers.userId, user.id), eq(s.collectiveMembers.status, "active"))),
    db.select({ id: s.opportunityInvites.opportunityId }).from(s.opportunityInvites).where(eq(s.opportunityInvites.creatorId, user.id)),
    db.select({ id: s.brandMembers.brandId }).from(s.brandMembers).where(eq(s.brandMembers.userId, user.id)).limit(1),
  ]);
  return { foundingNumber: user.foundingNumber, collectiveIds: new Set(groups.map((g) => g.id)), invitedTo: new Set(invites.map((i) => i.id)), brandId: brand[0]?.id ?? null };
}

// ---------- fit ----------

export type FitReason = { key: "niche"; niche: string } | { key: "country"; country: string } | { key: "budget"; rateCents: number } | { key: "engagement"; bps: number };
const WEIGHTS = { niche: 40, country: 25, budget: 25, engagement: 10 } as const;
export const GOOD_ENGAGEMENT_BPS = 300;

// One score for both directions: a brief ranked for a creator, and a creator ranked for a brand's search.
export function fit(c: { niches: string[]; country: string | null; rateCents: number; engagementBps?: number | null }, want: { niches: string[]; country: string | null; budgetCents: number | null }) {
  const reasons: FitReason[] = [];
  const shared = want.niches.find((n) => c.niches.includes(n));
  if (shared) reasons.push({ key: "niche", niche: shared });
  if (want.country && want.country === c.country) reasons.push({ key: "country", country: want.country });
  if (want.budgetCents != null && want.budgetCents >= c.rateCents) reasons.push({ key: "budget", rateCents: c.rateCents });
  if ((c.engagementBps ?? 0) >= GOOD_ENGAGEMENT_BPS) reasons.push({ key: "engagement", bps: c.engagementBps! });
  return { score: reasons.reduce((a, r) => a + WEIGHTS[r.key], 0), reasons };
}

// ---------- brand records ----------

export type BrandRecord = { completed: number; medianDaysToRelease: number | null; rating: number | null; ratings: number; disputes: number };

const median = (xs: number[]) => {
  const v = [...xs].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

// A brand's payment record: completed deals, median days from funding to each release, creators' rating, disputes.
export async function brandRecords(db: DB, brandIds: string[]) {
  const out = new Map<string, BrandRecord>(brandIds.map((id) => [id, { completed: 0, medianDaysToRelease: null, rating: null, ratings: 0, disputes: 0 }]));
  if (!brandIds.length) return out;
  const [done, released, rated, disputed] = await Promise.all([
    db.select({ id: s.deals.brandId, n: count() }).from(s.deals).where(and(inArray(s.deals.brandId, brandIds), eq(s.deals.status, "completed"))).groupBy(s.deals.brandId),
    db
      .select({ id: s.deals.brandId, fundedAt: s.deals.fundedAt, releasedAt: s.milestones.releasedAt })
      .from(s.milestones)
      .innerJoin(s.deals, eq(s.deals.id, s.milestones.dealId))
      .where(and(inArray(s.deals.brandId, brandIds), isNotNull(s.deals.fundedAt), isNotNull(s.milestones.releasedAt))),
    db
      .select({ id: s.deals.brandId, avg: sql<number>`avg(${s.ratings.score})`.mapWith(Number), n: count() })
      .from(s.ratings)
      .innerJoin(s.deals, eq(s.deals.id, s.ratings.dealId))
      .where(and(inArray(s.deals.brandId, brandIds), eq(s.ratings.fromUserId, s.deals.creatorId)))
      .groupBy(s.deals.brandId),
    db.select({ id: s.deals.brandId, n: count() }).from(s.disputes).innerJoin(s.deals, eq(s.deals.id, s.disputes.dealId)).where(inArray(s.deals.brandId, brandIds)).groupBy(s.deals.brandId),
  ]);
  for (const r of done) out.get(r.id)!.completed = r.n;
  const days = new Map<string, number[]>();
  for (const r of released) days.set(r.id, [...(days.get(r.id) ?? []), Math.max(0, r.releasedAt!.getTime() - r.fundedAt!.getTime()) / DAY]);
  for (const [id, d] of days) out.get(id)!.medianDaysToRelease = Math.round(median(d) * 10) / 10;
  for (const r of rated) Object.assign(out.get(r.id)!, { rating: Math.round(r.avg * 10) / 10, ratings: r.n });
  for (const r of disputed) out.get(r.id)!.disputes = r.n;
  return out;
}

// ---------- the creator feed ----------

const brandCols = { id: s.brands.id, name: s.brands.name, category: s.brands.category, country: s.brands.country };

// Open briefs this creator may see, best fit first (ties: newest first).
export async function opportunityFeed(db: DB, user: User, now = new Date()) {
  const [[profile], viewer, rows] = await Promise.all([
    db.select().from(s.creatorProfiles).where(eq(s.creatorProfiles.userId, user.id)).limit(1),
    viewerFor(db, user),
    // shortcut: newest 300 open briefs are ranked in memory; move ranking into SQL when open briefs pass that.
    db.select({ o: s.opportunities, brand: brandCols }).from(s.opportunities).innerJoin(s.brands, eq(s.brands.id, s.opportunities.brandId)).where(eq(s.opportunities.status, "open")).orderBy(desc(s.opportunities.createdAt)).limit(300),
  ]);
  const me = { niches: profile?.niches ?? [], country: user.country, rateCents: profile?.minRateCents ?? 0 };
  const visible = rows.filter((r) => canSee(r.o, viewer, now) && r.o.brandId !== viewer.brandId);
  const records = await brandRecords(db, [...new Set(visible.map((r) => r.brand.id))]);
  return visible.map((r) => ({ ...r, fit: fit(me, r.o), record: records.get(r.brand.id)! })).sort((a, b) => b.fit.score - a.fit.score);
}

export async function getOpportunity(db: DB, id: string, user: User, now = new Date()) {
  if (!isUuid(id)) return null;
  const [row] = await db
    .select({ o: s.opportunities, brand: { ...brandCols, website: s.brands.website, description: s.brands.description }, collective: s.collectives.name })
    .from(s.opportunities)
    .innerJoin(s.brands, eq(s.brands.id, s.opportunities.brandId))
    .leftJoin(s.collectives, eq(s.collectives.id, s.opportunities.collectiveId))
    .where(eq(s.opportunities.id, id))
    .limit(1);
  if (!row || !canSee(row.o, await viewerFor(db, user), now)) return null;
  const [records, [deal]] = await Promise.all([
    brandRecords(db, [row.brand.id]),
    db.select({ id: s.deals.id }).from(s.deals).where(and(eq(s.deals.opportunityId, id), eq(s.deals.creatorId, user.id))).limit(1),
  ]);
  return { ...row, record: records.get(row.brand.id)!, dealId: deal?.id ?? null };
}

// ---------- brand side ----------

export const OpportunityInput = z.object({
  title: z.string().trim().min(3, "Give it a short title.").max(120),
  brief: z.string().trim().min(20, "Write at least a couple of sentences.").max(4000),
  niches: z.array(z.enum(NICHES)).min(1, "Pick at least one niche.").max(4),
  platforms: z.array(z.enum(PLATFORMS)).min(1, "Pick at least one platform.").max(4),
  deliverables: z.array(z.object({ type: z.enum(DELIVERABLES), count: z.number().int().min(1).max(20) })).min(1).max(6),
  budgetCents: z.number().int().min(1_000, "The budget must be at least USD 10.").max(100_000_000),
  slots: z.number().int().min(1).max(500),
  country: z.enum(OPP_COUNTRIES).nullable().default(null),
  audience: z.enum(AUDIENCES),
  collectiveSlug: z.string().trim().max(60).optional(),
  invite: z.array(z.string().trim().max(40)).max(50).default([]),
  publicTeaser: z.boolean().default(true),
});
export type OpportunityInput = z.infer<typeof OpportunityInput>;

export async function createOpportunity(db: DB, o: { brandId: string; userId: string; input: OpportunityInput; now?: Date }) {
  const { input } = o;
  const now = o.now ?? new Date();
  let collectiveId: string | null = null;
  let invitees: string[] = [];
  if (input.audience === "collective") {
    const [c] = await db.select({ id: s.collectives.id }).from(s.collectives).where(eq(s.collectives.slug, (input.collectiveSlug ?? "").toLowerCase())).limit(1);
    if (!c) throw new HttpError(400, "Pick the collective this brief is for.");
    collectiveId = c.id;
  }
  if (input.audience === "invite") {
    const handles = [...new Set(input.invite.map(normalizeHandle).filter(Boolean))];
    if (!handles.length) throw new HttpError(400, "Add at least one creator to invite.");
    const found = await db.select({ id: s.users.id, handle: s.users.handle }).from(s.users).where(and(inArray(s.users.handle, handles), eq(s.users.role, "creator")));
    const missing = handles.filter((h) => !found.some((f) => f.handle === h));
    if (missing.length) throw new HttpError(400, `We couldn't find ${missing.map((h) => `@${h}`).join(", ")} on EVRA.`);
    invitees = found.map((f) => f.id);
  }
  const [opp] = await db
    .insert(s.opportunities)
    .values({
      brandId: o.brandId,
      createdBy: o.userId,
      title: input.title,
      brief: input.brief,
      niches: input.niches,
      platforms: input.platforms,
      deliverables: input.deliverables,
      budgetCents: input.budgetCents,
      slots: input.slots,
      country: input.country,
      audience: input.audience,
      collectiveId,
      foundingUntil: input.audience === "founding" ? new Date(now.getTime() + FIRST_LOOK_HOURS * 3_600_000) : null,
      publicTeaser: input.publicTeaser,
      createdAt: now,
    })
    .returning();
  if (invitees.length) await db.insert(s.opportunityInvites).values(invitees.map((creatorId) => ({ opportunityId: opp.id, creatorId })));
  return opp;
}

export async function brandOpportunities(db: DB, brandId: string) {
  const opps = await db.select().from(s.opportunities).where(eq(s.opportunities.brandId, brandId)).orderBy(desc(s.opportunities.createdAt)).limit(100);
  const viewers = opps.length
    ? await db
        .selectDistinct({ opp: s.viewEvents.subjectId, name: s.creatorProfiles.displayName })
        .from(s.viewEvents)
        .innerJoin(s.creatorProfiles, eq(s.creatorProfiles.userId, s.viewEvents.viewerUserId))
        .where(and(eq(s.viewEvents.subjectKind, "brief"), inArray(s.viewEvents.subjectId, opps.map((o) => o.id))))
    : [];
  return opps.map((o) => ({ ...o, viewers: viewers.filter((v) => v.opp === o.id).map((v) => v.name) }));
}

// Brief analytics: names from Growth up, counts on every plan.
export const seesViewerNames = (plan: (typeof s.brands.$inferSelect)["plan"]) => plan !== "pay_per_deal";

export async function brandContacts(db: DB, brandId: string) {
  return db
    .select({ email: s.users.email, locale: s.users.locale })
    .from(s.brandMembers)
    .innerJoin(s.users, eq(s.users.id, s.brandMembers.userId))
    .where(and(eq(s.brandMembers.brandId, brandId), inArray(s.brandMembers.role, ["owner", "admin"])));
}

// "I'm interested": opens one Deal Room per creator and brief, with the budget (never below the creator's minimum) as the first offer.
export async function expressInterest(db: DB, o: { opportunityId: string; user: User; origin: string; now?: Date }) {
  const found = await getOpportunity(db, o.opportunityId, o.user, o.now);
  if (!found) throw new HttpError(404, "That brief isn't open to you.");
  if (found.o.status !== "open") throw new HttpError(409, "This brief has closed.");
  const [profile] = await db.select().from(s.creatorProfiles).where(eq(s.creatorProfiles.userId, o.user.id)).limit(1);
  if (!profile) throw new HttpError(403, "Set up your creator kit first.");
  const opp = found.o;
  const dealId = await db.transaction(async (tx) => {
    // Lock the brief so a double tap can't open two Deal Rooms.
    await tx.select({ id: s.opportunities.id }).from(s.opportunities).where(eq(s.opportunities.id, opp.id)).for("update");
    const [existing] = await tx.select({ id: s.deals.id }).from(s.deals).where(and(eq(s.deals.opportunityId, opp.id), eq(s.deals.creatorId, o.user.id))).limit(1);
    if (existing) return { id: existing.id, created: false };
    const deal = await createDeal(tx as unknown as DB, {
      brandId: opp.brandId,
      creatorId: o.user.id,
      title: opp.title,
      terms: defaultTerms({ totalCents: Math.max(opp.budgetCents, profile.minRateCents), deliverables: opp.deliverables }),
      proposedBy: o.user.id,
      side: "creator",
      opportunityId: opp.id,
    });
    return { id: deal.id, created: true };
  });
  if (dealId.created)
    for (const c of await brandContacts(db, opp.brandId))
      await send(db, { to: c.email, template: "deal_update", locale: c.locale, data: { title: opp.title, what: `${profile.displayName} is interested and sent a first offer.`, url: `${o.origin}/deals/${dealId.id}` } });
  return dealId.id;
}
