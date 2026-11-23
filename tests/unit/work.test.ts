import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, type DB } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { findOrCreateUser } from "@/lib/users";
import { brandRecords, canSee, createOpportunity, expressInterest, fit, opportunityFeed, type OpportunityInput, type Viewer } from "@/lib/opportunities";
import { pitchBrand, searchCreators, CreatorSearch } from "@/lib/discovery";

const ORIGIN = "http://test.local";
const DAY = 86_400_000;
let n = 0;

async function creator(db: DB, o: { niches?: string[]; country?: string; minRateCents?: number; founding?: boolean; name?: string; engagementBps?: number; followers?: number; hidden?: string[] } = {}) {
  const i = ++n;
  const { user } = await findOrCreateUser(db, `creator${i}@work.test`);
  await db.update(s.users).set({ role: "creator", handle: `work_creator_${i}`, country: o.country ?? "AE", onboardedAt: new Date(), foundingNumber: o.founding ? 1000 + i : null }).where(eq(s.users.id, user.id));
  await db.insert(s.creatorProfiles).values({ userId: user.id, displayName: o.name ?? `Creator ${i}`, headline: "Honest reviews", niches: o.niches ?? ["beauty"], minRateCents: o.minRateCents ?? 0, hiddenStats: o.hidden ?? [] });
  await db.insert(s.socialAccounts).values({ userId: user.id, platform: "instagram", handle: `ig${i}`, followers: o.followers ?? 20_000, engagementBps: o.engagementBps ?? 150, source: "demo" });
  return (await db.select().from(s.users).where(eq(s.users.id, user.id)))[0];
}

async function brand(db: DB, o: { category?: string; country?: string } = {}) {
  const i = ++n;
  const { user } = await findOrCreateUser(db, `brand${i}@work.test`);
  await db.update(s.users).set({ role: "brand", onboardedAt: new Date() }).where(eq(s.users.id, user.id));
  const [b] = await db.insert(s.brands).values({ name: `Brand ${i}`, plan: "growth", category: o.category ?? "beauty", country: o.country ?? "AE" }).returning();
  await db.insert(s.brandMembers).values({ brandId: b.id, userId: user.id, role: "owner" });
  return { user, brand: b };
}

const brief = (over: Partial<OpportunityInput> = {}): OpportunityInput => ({
  title: "Summer glow",
  brief: "Show our serum in your evening routine, calm and honest.",
  niches: ["beauty"],
  platforms: ["instagram"],
  deliverables: [{ type: "reel", count: 1 }],
  budgetCents: 50_000,
  slots: 3,
  country: "AE",
  audience: "public",
  invite: [],
  publicTeaser: true,
  ...over,
});

describe("audience rules", () => {
  const now = new Date();
  const base = { id: "o1", brandId: "b1", collectiveId: null, foundingUntil: null } as const;
  const viewer = (v: Partial<Viewer> = {}): Viewer => ({ foundingNumber: null, collectiveIds: new Set(), invitedTo: new Set(), brandId: null, ...v });

  it("shows public briefs to everyone", () => expect(canSee({ ...base, audience: "public" }, viewer(), now)).toBe(true));

  it("gives Founding Creators a first look, then opens it to everyone", () => {
    const o = { ...base, audience: "founding" as const, foundingUntil: new Date(now.getTime() + DAY) };
    expect(canSee(o, viewer({ foundingNumber: 7 }), now)).toBe(true);
    expect(canSee(o, viewer(), now)).toBe(false);
    expect(canSee(o, viewer(), new Date(now.getTime() + DAY + 1))).toBe(true);
  });

  it("keeps collective-only and invite-only briefs private", () => {
    const c = { ...base, audience: "collective" as const, collectiveId: "c1" };
    expect(canSee(c, viewer({ collectiveIds: new Set(["c1"]) }), now)).toBe(true);
    expect(canSee(c, viewer({ collectiveIds: new Set(["c2"]) }), now)).toBe(false);
    const i = { ...base, audience: "invite" as const };
    expect(canSee(i, viewer({ invitedTo: new Set(["o1"]) }), now)).toBe(true);
    expect(canSee(i, viewer(), now)).toBe(false);
    expect(canSee(i, viewer({ brandId: "b1" }), now)).toBe(true);
  });
});

describe("fit", () => {
  it("scores niche, country, budget against rate, and engagement, with reasons", () => {
    const me = { niches: ["beauty", "fashion"], country: "AE", rateCents: 40_000, engagementBps: 450 };
    expect(fit(me, { niches: ["fashion"], country: "AE", budgetCents: 40_000 })).toEqual({
      score: 100,
      reasons: [{ key: "niche", niche: "fashion" }, { key: "country", country: "AE" }, { key: "budget", rateCents: 40_000 }, { key: "engagement", bps: 450 }],
    });
    expect(fit({ ...me, engagementBps: 100 }, { niches: ["food"], country: "IN", budgetCents: 39_999 })).toEqual({ score: 0, reasons: [] });
  });
});

describe("the creator feed", () => {
  it("ranks visible briefs by fit and hides the ones the creator can't see", async () => {
    const db = await getDb();
    const b = await brand(db);
    const me = await creator(db, { niches: ["beauty"], country: "AE", minRateCents: 40_000 });
    const make = async (title: string, over: Partial<OpportunityInput>) => (await createOpportunity(db, { brandId: b.brand.id, userId: b.user.id, input: brief({ title, ...over }) })).id;
    await make("Low budget beauty", { budgetCents: 30_000 });
    await make("Food in India", { niches: ["food"], country: "IN" });
    await make("Great beauty match", { budgetCents: 60_000 });
    await make("Founders only", { audience: "founding" });
    const feed = await opportunityFeed(db, me);
    expect(feed.map((f) => f.o.title)).toEqual(["Great beauty match", "Low budget beauty", "Food in India"]);
    expect(feed[0].fit.reasons.map((r) => r.key)).toEqual(["niche", "country", "budget"]);
    expect(feed[0].record).toMatchObject({ completed: 0 });

    const founder = await creator(db, { founding: true });
    expect((await opportunityFeed(db, founder)).map((f) => f.o.title)).toContain("Founders only");
  });

  it("checks invite handles and sets a 24-hour first look", async () => {
    const db = await getDb();
    const b = await brand(db);
    const guest = await creator(db);
    await expect(createOpportunity(db, { brandId: b.brand.id, userId: b.user.id, input: brief({ audience: "invite", invite: ["@missing_person"] }) })).rejects.toMatchObject({ status: 400, message: expect.stringContaining("@missing_person") });
    await expect(createOpportunity(db, { brandId: b.brand.id, userId: b.user.id, input: brief({ audience: "collective", collectiveSlug: "no-such-group" }) })).rejects.toMatchObject({ status: 400 });
    const inv = await createOpportunity(db, { brandId: b.brand.id, userId: b.user.id, input: brief({ title: "Private", audience: "invite", invite: [`@${guest.handle}`] }) });
    expect((await opportunityFeed(db, guest)).map((f) => f.o.id)).toContain(inv.id);
    const now = new Date();
    const first = await createOpportunity(db, { brandId: b.brand.id, userId: b.user.id, input: brief({ audience: "founding" }), now });
    expect(first.foundingUntil!.getTime() - now.getTime()).toBe(DAY);
  });
});

describe("interest and pitches", () => {
  it("opens one Deal Room per brief, never below the creator's minimum, and tells the brand", async () => {
    const db = await getDb();
    const b = await brand(db);
    const me = await creator(db, { minRateCents: 65_000 });
    const opp = await createOpportunity(db, { brandId: b.brand.id, userId: b.user.id, input: brief({ budgetCents: 50_000 }) });
    const first = await expressInterest(db, { opportunityId: opp.id, user: me, origin: ORIGIN });
    expect(await expressInterest(db, { opportunityId: opp.id, user: me, origin: ORIGIN })).toBe(first);
    const [terms] = await db.select().from(s.dealTerms).where(eq(s.dealTerms.dealId, first));
    expect(terms).toMatchObject({ proposedBySide: "creator", proposedBy: me.id });
    expect(terms.terms.milestones[0].amountCents).toBe(65_000);
    expect((await db.select().from(s.outbox).where(eq(s.outbox.to, b.user.email))).filter((m) => m.template === "deal_update")).toHaveLength(1);
  });

  it("refuses interest in briefs the creator can't see", async () => {
    const db = await getDb();
    const b = await brand(db);
    const me = await creator(db);
    const opp = await createOpportunity(db, { brandId: b.brand.id, userId: b.user.id, input: brief({ audience: "founding" }) });
    await expect(expressInterest(db, { opportunityId: opp.id, user: me, origin: ORIGIN })).rejects.toMatchObject({ status: 404 });
  });

  it("pitches a brand at the creator's Reel price, once while it is open", async () => {
    const db = await getDb();
    const b = await brand(db);
    const me = await creator(db, { minRateCents: 20_000 });
    await db.insert(s.rateCardItems).values({ userId: me.id, deliverable: "reel", label: "Reel", priceCents: 45_000 });
    const id = await pitchBrand(db, { user: me, brandId: b.brand.id, origin: ORIGIN });
    expect(await pitchBrand(db, { user: me, brandId: b.brand.id, origin: ORIGIN })).toBe(id);
    const [terms] = await db.select().from(s.dealTerms).where(eq(s.dealTerms.dealId, id));
    expect(terms.terms.milestones[0].amountCents).toBe(45_000);
  });
});

describe("brand records", () => {
  it("counts completed deals, median days to release, the creators' rating and disputes", async () => {
    const db = await getDb();
    const b = await brand(db);
    const c = await creator(db);
    const funded = new Date(Date.now() - 10 * DAY);
    const deal = async (status: "completed" | "active", releaseAfterDays: number[]) => {
      const [d] = await db.insert(s.deals).values({ brandId: b.brand.id, creatorId: c.id, title: "x", status, fundedAt: funded }).returning();
      await db.insert(s.milestones).values(releaseAfterDays.map((days, idx) => ({ dealId: d.id, idx, title: "m", amountCents: 100, status: "released" as const, releasedAt: new Date(funded.getTime() + days * DAY) })));
      return d;
    };
    const d1 = await deal("completed", [1]);
    await deal("completed", [2, 5]);
    const d3 = await deal("active", [3]);
    await db.insert(s.ratings).values([
      { dealId: d1.id, fromUserId: c.id, toUserId: b.user.id, score: 5, onTime: true },
      { dealId: d3.id, fromUserId: c.id, toUserId: b.user.id, score: 4, onTime: true },
      { dealId: d1.id, fromUserId: b.user.id, toUserId: c.id, score: 1, onTime: false }, // the brand rating the creator doesn't count
    ]);
    await db.insert(s.disputes).values({ dealId: d3.id, milestoneIdx: 0, openedBy: b.user.id, reason: "late" });
    expect((await brandRecords(db, [b.brand.id])).get(b.brand.id)).toEqual({ completed: 2, medianDaysToRelease: 2.5, rating: 4.5, ratings: 2, disputes: 1 });
  });
});

describe("creator discovery", () => {
  it("searches by text and filters, scores fit for the brand, and respects hidden stats", async () => {
    const db = await getDb();
    const b = await brand(db, { category: "Beauty", country: "AE" });
    const star = await creator(db, { name: "Zainab Glow", niches: ["beauty"], country: "AE", engagementBps: 500, followers: 30_000 });
    await db.insert(s.rateCardItems).values({ userId: star.id, deliverable: "reel", label: "Reel", priceCents: 50_000 });
    await creator(db, { name: "Zainab Eats", niches: ["food"], country: "IN", followers: 5_000 });
    const shy = await creator(db, { name: "Zainab Quiet", niches: ["beauty"], hidden: ["followers", "rates"] });

    const all = await searchCreators(db, b.brand, CreatorSearch.parse({ q: "zainab", budget: "600" }));
    expect(all.results.map((r) => r.name)).toEqual(["Zainab Glow", "Zainab Quiet", "Zainab Eats"]);
    expect(all.results[0].fit.reasons.map((r) => r.key)).toEqual(["niche", "country", "budget", "engagement"]);
    expect(all.results[0].accounts[0]).toMatchObject({ platform: "instagram", followers: 30_000, source: "demo" });
    const quiet = all.results.find((r) => r.id === shy.id)!;
    expect(quiet.accounts[0].followers).toBeNull();
    expect(quiet.reelCents).toBeNull();

    expect((await searchCreators(db, b.brand, CreatorSearch.parse({ q: "zainab", niche: "food" }))).results.map((r) => r.name)).toEqual(["Zainab Eats"]);
    expect((await searchCreators(db, b.brand, CreatorSearch.parse({ q: "zainab", band: "10k-50k" }))).results.map((r) => r.name)).toEqual(["Zainab Glow"]);
    expect((await searchCreators(db, b.brand, CreatorSearch.parse({ q: "zainab", platform: "tiktok" }))).results).toEqual([]);
    // Junk params are ignored rather than failing the page; wildcards are matched literally.
    expect(CreatorSearch.parse({ niche: "nope", budget: "abc", band: "" })).toEqual({});
    expect((await searchCreators(db, b.brand, CreatorSearch.parse({ q: "%" }))).results).toEqual([]);
  });
});
