// Seeds illustrative rate data and demo accounts into the local database. Safe to run twice.
// Run with: npm run db:seed (the dev server must be stopped: the embedded database allows one process at a time).
import { count, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { findOrCreateUser, isStaffEmail } from "@/lib/users";

const db = await getDb();

// ---------- illustrative rate samples (labelled as such wherever they are shown) ----------
const [{ n }] = await db.select({ n: count() }).from(s.rateSamples);
if (n === 0) {
  const niches = { beauty: 1.1, fashion: 1, food: 0.9, fitness: 1, tech: 1.2, travel: 1.1 } as const;
  const countries = { AE: 1.3, IN: 0.6 } as const;
  const reelBase: [number, number, number][] = [
    [1_000, 9_999, 120],
    [10_000, 49_999, 420],
    [50_000, 249_999, 1_300],
    [250_000, 900_000, 4_800],
  ];
  const mult: Partial<Record<s.Deliverable, number>> = { reel: 1, story: 0.3, post: 0.7, tiktok: 0.9, short: 0.6, video: 2, ugc: 0 };
  const platform: Record<string, s.Platform> = { reel: "instagram", story: "instagram", post: "instagram", tiktok: "tiktok", short: "youtube", video: "youtube", ugc: "instagram" };
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const rows: (typeof s.rateSamples.$inferInsert)[] = [];
  for (const [niche, nm] of Object.entries(niches))
    for (const [country, cm] of Object.entries(countries))
      for (const [deliverable, dm] of Object.entries(mult))
        for (const [min, max, base] of reelBase)
          for (let i = 0; i < 8; i++) {
            const followers = Math.round(min + rand() * (max - min));
            const usd = deliverable === "ugc" ? 100 + rand() * 300 : base * dm! * nm * cm * (0.7 + rand() * 0.6);
            rows.push({ niche, country, platform: platform[deliverable], deliverable: deliverable as s.Deliverable, followers, amountCents: Math.round(usd) * 100, source: "seed" });
          }
  for (let i = 0; i < rows.length; i += 500) await db.insert(s.rateSamples).values(rows.slice(i, i + 500));
  console.log(`rate samples: ${rows.length}`);
}

// ---------- demo accounts ----------
async function creator(email: string, handle: string, p: { name: string; city: string; country: string; niches: string[]; ig: [number, number, number]; tt?: [number, number, number]; yt?: [number, number, number]; headline: string; bio: string; rates: [s.Deliverable, string, number][]; showcase: [string, string, string][] }) {
  const { user } = await findOrCreateUser(db, email);
  await db.update(s.users).set({ name: p.name, role: "creator", handle, city: p.city, country: p.country, adult: true, onboardedAt: user.onboardedAt ?? new Date() }).where(eq(s.users.id, user.id));
  await db
    .insert(s.creatorProfiles)
    .values({ userId: user.id, displayName: p.name, headline: p.headline, bio: p.bio, niches: p.niches, languages: ["en", "ar"], openTo: ["paid_collab", "seeding", "event", "licence"], howIHelp: ["content", "reach"], minRateCents: p.rates[0][2] * 70 })
    .onConflictDoNothing();
  const accounts: [s.Platform, [number, number, number] | undefined][] = [["instagram", p.ig], ["tiktok", p.tt], ["youtube", p.yt]];
  for (const [platform, st] of accounts) {
    if (!st) continue;
    const reach = Array.from({ length: 13 }, (_, i) => Math.round(st[0] * (0.82 + i * 0.015)));
    await db
      .insert(s.socialAccounts)
      .values({ userId: user.id, platform, handle, followers: st[0], avgViews: st[1], engagementBps: st[2], source: "demo", verified: false, reach90d: reach, audience: { countries: { [p.country]: 58, other: 42 }, ages: { "18-24": 41, "25-34": 44, "35+": 15 }, genders: { women: 71, men: 29 } }, topPosts: [] })
      .onConflictDoNothing();
  }
  const [{ rc }] = await db.select({ rc: count() }).from(s.rateCardItems).where(eq(s.rateCardItems.userId, user.id));
  if (rc === 0) await db.insert(s.rateCardItems).values(p.rates.map(([deliverable, label, usd], position) => ({ userId: user.id, deliverable, label, priceCents: usd * 100, position })));
  const [{ sc }] = await db.select({ sc: count() }).from(s.showcaseItems).where(eq(s.showcaseItems.userId, user.id));
  if (sc === 0) await db.insert(s.showcaseItems).values(p.showcase.map(([kind, title, brandName]) => ({ userId: user.id, kind: kind as "collab" | "press", title, brandName, verification: "self_reported" as const })));
  return user;
}

const sara = await creator("sara.creates@demo.evra.world", "sara.creates", {
  name: "Sara Al Mansoori",
  city: "Dubai",
  country: "AE",
  niches: ["beauty", "fashion"],
  ig: [28_400, 41_000, 420],
  tt: [51_200, 63_000, 610],
  headline: "Skincare and modest fashion for busy women in Dubai",
  bio: "I test skincare in Dubai heat so you don't have to. Honest reviews, weekly Reels, bilingual captions.",
  rates: [["reel", "Instagram Reel", 650], ["story", "3 Instagram Stories", 220], ["tiktok", "TikTok video", 600], ["ugc", "UGC video, no posting", 300]],
  showcase: [["collab", "Ramadan skincare edit", "Hydra Lab"], ["press", "Featured in Dubai creator round-up", "Gulf News"]],
});
const arjun = await creator("arjun.eats@demo.evra.world", "arjun.eats", {
  name: "Arjun Mehta",
  city: "Mumbai",
  country: "IN",
  niches: ["food", "travel"],
  ig: [12_100, 15_500, 380],
  yt: [22_000, 18_000, 290],
  headline: "Street food and cafe finds across Mumbai",
  bio: "Mumbai street food, small cafes and honest taste tests. Hindi and English.",
  rates: [["reel", "Instagram Reel", 180], ["short", "YouTube Short", 120], ["video", "YouTube review", 400]],
  showcase: [["collab", "Monsoon menu launch", "Chai Point"]],
});

const { user: brandOwner } = await findOrCreateUser(db, "team@glowco.demo.evra.world");
await db.update(s.users).set({ name: "Maya (Glow Co.)", role: "brand", country: "AE", adult: true, onboardedAt: brandOwner.onboardedAt ?? new Date() }).where(eq(s.users.id, brandOwner.id));
let [glow] = await db.select().from(s.brands).where(eq(s.brands.name, "Glow Co.")).limit(1);
if (!glow) {
  [glow] = await db.insert(s.brands).values({ name: "Glow Co.", website: "https://glowco.example", domain: "glowco.example", category: "beauty", country: "AE", description: "Clean skincare made for Gulf weather.", plan: "growth" }).returning();
  await db.insert(s.brandMembers).values({ brandId: glow.id, userId: brandOwner.id, role: "owner" });
  await db.insert(s.opportunities).values([
    { brandId: glow.id, createdBy: brandOwner.id, title: "Ramadan glow routine", brief: "Show your evening skincare routine during Ramadan with our Hydra Serum. Calm, honest, bilingual if you can.", niches: ["beauty"], platforms: ["instagram"], deliverables: [{ type: "reel", count: 1 }], budgetCents: 70_000, slots: 5, country: "AE", audience: "public" },
    { brandId: glow.id, createdBy: brandOwner.id, title: "Founding Creators first look: SPF launch", brief: "A short UGC video showing our new SPF 50 in real Dubai sun. Content only, we post it.", niches: ["beauty", "fashion"], platforms: ["instagram", "tiktok"], deliverables: [{ type: "ugc", count: 1 }], budgetCents: 30_000, slots: 10, country: "AE", audience: "founding", foundingUntil: new Date(Date.now() + 86_400_000) },
  ]);
}

let [founding] = await db.select().from(s.collectives).where(eq(s.collectives.slug, "founding-creators")).limit(1);
if (!founding) {
  [founding] = await db.insert(s.collectives).values({ slug: "founding-creators", name: "Founding Creators", kind: "founding", description: "The first 1,000 creators on EVRA.", rules: "Be kind. No spam. Share real rates.", ownerId: sara.id }).returning();
  await db.insert(s.collectiveMembers).values([
    { collectiveId: founding.id, userId: sara.id, role: "owner", status: "active" },
    { collectiveId: founding.id, userId: arjun.id, role: "member", status: "active" },
  ]);
  await db.update(s.users).set({ foundingNumber: 1 }).where(eq(s.users.id, sara.id));
  await db.update(s.users).set({ foundingNumber: 2 }).where(eq(s.users.id, arjun.id));
}

for (const email of (process.env.STAFF_EMAILS ?? "").split(",").map((e) => e.trim()).filter(Boolean)) {
  const { user } = await findOrCreateUser(db, email);
  if (isStaffEmail(email)) await db.update(s.users).set({ staff: true, name: user.name ?? "EVRA team" }).where(eq(s.users.id, user.id));
}

console.log(`demo: creators ${sara.handle ?? "sara.creates"}, ${arjun.handle ?? "arjun.eats"}; brand Glow Co.; founding collective ${founding.slug}`);
process.exit(0);
