import { count, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { sha256, token } from "@/lib/crypto";
import { send } from "@/lib/messages";
import { HANDLE_RE, handleAvailable, normalizeHandle } from "@/lib/users";
import { demoStats, publicInstagram, selfReported, type Stats } from "@/lib/social";
import { rateRange } from "@/lib/rates";
import { HttpError } from "@/lib/auth/guards";

export const NICHES = ["beauty", "fashion", "food", "fitness", "tech", "travel", "gaming", "parenting", "lifestyle", "finance"] as const;
export const REQUEST_TYPES = ["paid_collab", "seeding", "event", "feedback_call", "licence", "ownership"] as const;
export const HELP_TAGS = ["content", "reach", "events", "product_feedback", "community"] as const;
export const COUNTRIES = ["AE", "IN", "SA", "OTHER"] as const;
export const FOUNDING_SEATS = 1000;

const Account = z.object({ platform: z.enum(["instagram", "tiktok", "youtube"]), handle: z.string().trim().min(1).max(60), followers: z.number().int().min(0).max(500_000_000), source: z.enum(["self", "demo", "public"]) });

export const CreatorInput = z.object({
  role: z.literal("creator"),
  name: z.string().trim().min(2).max(80),
  handle: z.string().transform(normalizeHandle).pipe(z.string().regex(HANDLE_RE)),
  city: z.string().trim().max(60).optional(),
  country: z.enum(COUNTRIES),
  adult: z.literal(true),
  accounts: z.array(Account).min(1).max(3),
  niches: z.array(z.enum(NICHES)).min(1).max(4),
  openTo: z.array(z.enum(REQUEST_TYPES)).min(1),
  howIHelp: z.array(z.enum(HELP_TAGS)).default([]),
  minRateCents: z.number().int().min(0).max(100_000_000),
  blockedBrands: z.array(z.string().trim().max(80)).max(30).default([]),
  manager: z.object({ email: z.string().email(), copyTypes: z.array(z.enum(REQUEST_TYPES)) }).optional(),
  headline: z.string().trim().max(120),
  bio: z.string().trim().max(400),
});

export const BrandInput = z.object({
  role: z.literal("brand"),
  name: z.string().trim().min(2).max(80),
  brandName: z.string().trim().min(2).max(80),
  website: z.string().trim().max(200).optional(),
  category: z.string().trim().max(60).optional(),
  description: z.string().trim().max(500).optional(),
  country: z.enum(COUNTRIES),
  adult: z.literal(true),
});

export const ManagerInput = z.object({ role: z.literal("manager"), name: z.string().trim().min(2).max(80), company: z.string().trim().max(80).optional(), country: z.enum(COUNTRIES), adult: z.literal(true) });

export const OnboardingInput = z.discriminatedUnion("role", [CreatorInput, BrandInput, ManagerInput]);

const domainOf = (url?: string) => {
  if (!url) return null;
  try {
    return new URL(/^https?:\/\//.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
};

async function statsFor(a: z.infer<typeof Account>, allowDemo: boolean): Promise<{ stats: Stats; source: string }> {
  if (a.source === "demo" && allowDemo) return { stats: demoStats(a.handle, a.platform), source: "demo" };
  if (a.source === "public" && a.platform === "instagram") {
    const p = await publicInstagram(a.handle).catch(() => null);
    if (p) return { stats: p, source: "public" };
  }
  return { stats: selfReported(a.followers), source: "self" };
}

export async function completeCreator(db: DB, user: typeof s.users.$inferSelect, input: z.infer<typeof CreatorInput>, opts: { allowDemo: boolean; origin: string }) {
  if (!(await handleAvailable(db, input.handle, user.id))) throw new HttpError(409, "That link is taken. Try another.");
  const [{ seats }] = await db.select({ seats: count() }).from(s.users).where(isNotNull(s.users.foundingNumber));
  await db
    .update(s.users)
    .set({ name: input.name, role: "creator", handle: input.handle, city: input.city ?? null, country: input.country, adult: true, onboardedAt: new Date(), foundingNumber: user.foundingNumber ?? (seats < FOUNDING_SEATS ? seats + 1 : null) })
    .where(eq(s.users.id, user.id));

  const profile = { displayName: input.name, headline: input.headline, bio: input.bio, niches: input.niches, openTo: input.openTo, howIHelp: input.howIHelp, minRateCents: input.minRateCents, blockedBrands: input.blockedBrands };
  await db.insert(s.creatorProfiles).values({ userId: user.id, ...profile }).onConflictDoUpdate({ target: s.creatorProfiles.userId, set: profile });

  let biggest = 0;
  for (const a of input.accounts) {
    const { stats, source } = await statsFor(a, opts.allowDemo);
    biggest = Math.max(biggest, stats.followers);
    const row = { userId: user.id, platform: a.platform, handle: normalizeHandle(a.handle), followers: stats.followers, avgViews: stats.avgViews, engagementBps: stats.engagementBps, reach90d: stats.reach90d, source: source as "demo", verified: false, syncedAt: new Date() };
    await db.insert(s.socialAccounts).values(row).onConflictDoUpdate({ target: [s.socialAccounts.userId, s.socialAccounts.platform], set: row });
    if (source === "self" && stats.followers > 500_000)
      await db.insert(s.flags).values({ userId: user.id, reason: `Large self-reported audience on ${a.platform} (${stats.followers.toLocaleString("en")})`, source: "auto" });
  }

  const [{ cards }] = await db.select({ cards: count() }).from(s.rateCardItems).where(eq(s.rateCardItems.userId, user.id));
  if (cards === 0) {
    const country = input.country === "OTHER" ? "AE" : input.country === "SA" ? "AE" : input.country;
    const guide = await rateRange(db, { niche: input.niches[0], country, deliverable: "reel", followers: biggest });
    const reel = Math.max(input.minRateCents, guide?.medianCents ?? input.minRateCents);
    await db.insert(s.rateCardItems).values(defaultRateCard(user.id, reel));
  }

  if (input.manager) {
    const raw = token(24);
    await db.insert(s.managerLinks).values({ creatorId: user.id, managerEmail: input.manager.email.toLowerCase(), copyTypes: input.manager.copyTypes, tokenHash: sha256(raw) });
    await send(db, { to: input.manager.email, template: "manager_invite", locale: user.locale, data: { creator: input.name, url: `${opts.origin}/manager/${raw}` } });
  }
}

export async function completeBrand(db: DB, user: typeof s.users.$inferSelect, input: z.infer<typeof BrandInput>) {
  const domain = domainOf(input.website);
  const emailDomain = user.email.split("@")[1]?.toLowerCase();
  await db.update(s.users).set({ name: input.name, role: "brand", country: input.country, adult: true, onboardedAt: new Date() }).where(eq(s.users.id, user.id));
  const [brand] = await db
    .insert(s.brands)
    .values({ name: input.brandName, website: input.website ?? null, domain, domainVerified: !!domain && domain === emailDomain, category: input.category ?? null, country: input.country, description: input.description ?? null })
    .returning();
  await db.insert(s.brandMembers).values({ brandId: brand.id, userId: user.id, role: "owner" });
  return brand;
}

export async function completeManager(db: DB, user: typeof s.users.$inferSelect, input: z.infer<typeof ManagerInput>) {
  await db.update(s.users).set({ name: input.name, role: "manager", country: input.country, adult: true, onboardedAt: new Date() }).where(eq(s.users.id, user.id));
  await db.update(s.managerLinks).set({ managerUserId: user.id }).where(eq(s.managerLinks.managerEmail, user.email));
}

// The starter rate card every new creator gets, priced from their Reel rate.
export const defaultRateCard = (userId: string, reel: number): (typeof s.rateCardItems.$inferInsert)[] => [
  { userId, deliverable: "reel", label: "Instagram Reel", priceCents: reel, position: 0 },
  { userId, deliverable: "story", label: "3 Instagram Stories", priceCents: Math.round((reel * 0.35) / 100) * 100, position: 1 },
  { userId, deliverable: "ugc", label: "UGC video, no posting", priceCents: Math.round((reel * 0.5) / 100) * 100, position: 2 },
];
