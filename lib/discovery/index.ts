import { and, asc, desc, eq, inArray, isNotNull, isNull, or, sql, ilike, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/lib/db";
import * as s from "@/lib/db/schema";
import type { User } from "@/lib/auth/session";
import type { Brand } from "@/lib/brands";
import { HttpError } from "@/lib/auth/guards";
import { createDeal, defaultTerms } from "@/lib/deals/create";
import { send } from "@/lib/messages";
import { NICHES } from "@/lib/onboarding";
import { BANDS, bandFor } from "@/lib/rates";
import { brandContacts, brandRecords, canSee, fit, OPP_COUNTRIES, viewerFor } from "@/lib/opportunities";
import { responseBadge } from "@/lib/requests/badges";

const optional = <T extends z.ZodType>(t: T) => t.optional().catch(undefined);

// Search params arrive as loose strings; anything unexpected is simply ignored.
export const CreatorSearch = z.object({
  q: optional(z.string().trim().min(1).max(80)),
  niche: optional(z.enum(NICHES)),
  country: optional(z.enum(OPP_COUNTRIES)),
  band: optional(z.enum(BANDS.map((b) => b.key) as [string, ...string[]])),
  platform: optional(z.enum(["instagram", "tiktok", "youtube"])),
  budget: optional(z.coerce.number().positive().max(1_000_000)),
});
export type CreatorSearch = z.infer<typeof CreatorSearch>;

const escapeLike = (v: string) => v.replace(/[\\%_]/g, "\\$&");

// Brand-side discovery over EVRA creators with a public kit. Hidden stats stay hidden here too.
export async function searchCreators(db: DB, brand: Pick<Brand, "id" | "category" | "country">, q: CreatorSearch) {
  const where: SQL[] = [eq(s.users.role, "creator"), eq(s.users.status, "active"), isNotNull(s.users.onboardedAt), eq(s.creatorProfiles.kitPublic, true)];
  if (q.q) {
    const like = `%${escapeLike(q.q)}%`;
    where.push(or(ilike(s.creatorProfiles.displayName, like), ilike(s.creatorProfiles.headline, like), ilike(s.users.handle, like), sql`${s.creatorProfiles.niches}::text ilike ${like}`)!);
  }
  if (q.niche) where.push(sql`${s.creatorProfiles.niches} @> ${JSON.stringify([q.niche])}::jsonb`);
  if (q.country) where.push(eq(s.users.country, q.country));
  // shortcut: the first 200 matches are scored in memory; page in SQL once the creator base outgrows it.
  const rows = await db
    .select({ id: s.users.id, handle: s.users.handle, country: s.users.country, city: s.users.city, profile: s.creatorProfiles })
    .from(s.users)
    .innerJoin(s.creatorProfiles, eq(s.creatorProfiles.userId, s.users.id))
    .where(and(...where))
    .limit(200);
  const ids = rows.map((r) => r.id);
  const [accounts, reels, [latest]] = await Promise.all([
    ids.length ? db.select().from(s.socialAccounts).where(inArray(s.socialAccounts.userId, ids)).orderBy(desc(s.socialAccounts.followers)) : [],
    ids.length ? db.select({ userId: s.rateCardItems.userId, price: s.rateCardItems.priceCents }).from(s.rateCardItems).where(and(inArray(s.rateCardItems.userId, ids), eq(s.rateCardItems.deliverable, "reel"))).orderBy(asc(s.rateCardItems.position)) : [],
    db.select({ budget: s.opportunities.budgetCents }).from(s.opportunities).where(and(eq(s.opportunities.brandId, brand.id), eq(s.opportunities.status, "open"))).orderBy(desc(s.opportunities.createdAt)).limit(1),
  ]);
  const budgetCents = q.budget ? Math.round(q.budget * 100) : (latest?.budget ?? null);
  const category = brand.category?.toLowerCase() ?? "";
  const want = { niches: q.niche ? [q.niche] : (NICHES as readonly string[]).includes(category) ? [category] : [], country: brand.country, budgetCents };

  const results = rows.flatMap((r) => {
    const hidden = new Set(r.profile.hiddenStats);
    const mine = accounts.filter((a) => a.userId === r.id);
    const biggest = mine[0]?.followers ?? 0;
    if (q.band && (hidden.has("followers") || bandFor(biggest).key !== q.band)) return [];
    if (q.platform && !mine.some((a) => a.platform === q.platform)) return [];
    const engagementBps = hidden.has("engagement") ? null : Math.max(0, ...mine.map((a) => a.engagementBps));
    const reel = hidden.has("rates") ? null : (reels.find((x) => x.userId === r.id)?.price ?? null);
    // Hidden rates never count for or against a creator.
    const score = fit({ niches: r.profile.niches, country: r.country, rateCents: reel ?? r.profile.minRateCents, engagementBps }, hidden.has("rates") ? { ...want, budgetCents: null } : want);
    return [
      {
        id: r.id,
        handle: r.handle,
        name: r.profile.displayName,
        headline: r.profile.headline,
        niches: r.profile.niches,
        city: r.city,
        country: r.country,
        openTo: r.profile.openTo,
        reelCents: reel,
        accounts: mine.map((a) => ({ platform: a.platform, followers: hidden.has("followers") || a.source === "review" ? null : a.followers, source: a.verified ? ("oauth" as const) : a.source })),
        fit: score,
      },
    ];
  });
  // Verified creators first, then best fit.
  const isVerified = (r: (typeof results)[number]) => (r.accounts.some((a) => a.source === "oauth") ? 1 : 0);
  results.sort((a, b) => isVerified(b) - isVerified(a) || b.fit.score - a.fit.score);
  const top = results.slice(0, 50);
  // shortcut: one badge query per result (50 max); batch with a window query if this page gets slow.
  const badges = await Promise.all(top.map((r) => responseBadge(db, r.id)));
  return { budgetCents, results: top.map((r, i) => ({ ...r, badge: badges[i] })) };
}

// ---------- brand directory for creators ----------

export async function brandDirectory(db: DB, user: User, now = new Date()) {
  const [list, viewer, open] = await Promise.all([
    db.select().from(s.brands).orderBy(asc(s.brands.name)).limit(200),
    viewerFor(db, user),
    db.select().from(s.opportunities).where(eq(s.opportunities.status, "open")).orderBy(desc(s.opportunities.createdAt)).limit(500),
  ]);
  const records = await brandRecords(db, list.map((b) => b.id));
  return list
    .map((b) => ({ brand: b, record: records.get(b.id)!, open: open.filter((o) => o.brandId === b.id && canSee(o, viewer, now)) }))
    .sort((a, b) => b.record.completed - a.record.completed || b.open.length - a.open.length);
}

// The creator's Reel price is the pitch; without a rate card, their minimum.
export async function pitchPrice(db: DB, creatorId: string) {
  const [[reel], [profile]] = await Promise.all([
    db.select({ price: s.rateCardItems.priceCents }).from(s.rateCardItems).where(and(eq(s.rateCardItems.userId, creatorId), eq(s.rateCardItems.deliverable, "reel"))).orderBy(asc(s.rateCardItems.position)).limit(1),
    db.select({ minRate: s.creatorProfiles.minRateCents, name: s.creatorProfiles.displayName }).from(s.creatorProfiles).where(eq(s.creatorProfiles.userId, creatorId)).limit(1),
  ]);
  return profile ? { cents: reel?.price ?? profile.minRate, name: profile.name } : null;
}

// "Pitch": the creator opens a Deal Room with a brand at their Reel price. One open pitch per brand.
export async function pitchBrand(db: DB, o: { user: User; brandId: string; origin: string }) {
  const [brand] = await db.select().from(s.brands).where(eq(s.brands.id, o.brandId)).limit(1);
  if (!brand) throw new HttpError(404, "We couldn't find that brand.");
  const price = await pitchPrice(db, o.user.id);
  if (!price) throw new HttpError(403, "Set up your creator kit first.");
  if (price.cents <= 0) throw new HttpError(400, "Add a Reel price to your rate card first.");
  const deal = await db.transaction(async (tx) => {
    await tx.select({ id: s.brands.id }).from(s.brands).where(eq(s.brands.id, brand.id)).for("update");
    const [open] = await tx
      .select({ id: s.deals.id })
      .from(s.deals)
      .where(and(eq(s.deals.brandId, brand.id), eq(s.deals.creatorId, o.user.id), eq(s.deals.status, "negotiating"), isNull(s.deals.opportunityId), isNull(s.deals.requestId)))
      .limit(1);
    if (open) return { id: open.id, created: false };
    const d = await createDeal(tx as unknown as DB, {
      brandId: brand.id,
      creatorId: o.user.id,
      title: `${brand.name} × ${price.name}`,
      terms: defaultTerms({ totalCents: price.cents, deliverables: [{ type: "reel", count: 1 }] }),
      proposedBy: o.user.id,
      side: "creator",
    });
    return { id: d.id, created: true };
  });
  if (deal.created)
    for (const c of await brandContacts(db, brand.id))
      await send(db, { to: c.email, template: "deal_update", locale: c.locale, data: { title: `${brand.name} × ${price.name}`, what: `${price.name} pitched you a Reel. Their kit and quote are in the Deal Room.`, url: `${o.origin}/deals/${deal.id}` } });
  return deal.id;
}
