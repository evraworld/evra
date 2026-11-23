// MVP simulation: 10 made-up brands and 10 made-up creators go through the whole MVP on Haiku:
// onboarding (AI kit + AI brand read), social verification by bio code, AI deal finding, offers, the creator's
// agent, agreement, work marked paid outside EVRA, approval, ratings and simulated feedback.
// Local only: embedded database, no chains, no X, no real people. Emails land in the outbox table.
// Run on a fresh database with the dev server stopped:  npx tsx --env-file=.env.local scripts/sim-mvp.mts
import { mkdirSync, writeFileSync } from "node:fs";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { findOrCreateUser } from "@/lib/users";
import { brandProfile, draftKit, draftOffer, findDeals } from "@/lib/ai/agents";
import { MODEL, structured, usageLog } from "@/lib/ai/claude";
import { checkVerification, verifyCode } from "@/lib/verify";
import { fit } from "@/lib/opportunities";
import { createDeal, defaultTerms } from "@/lib/deals/create";
import { approveMilestone, approveTerms, counter, currentTerms, rateDeal, requestChanges, startWork, submitWork } from "@/lib/deals/actions";
import { counterTerms, decideAgentProposal, runCreatorAgent } from "@/lib/deals/agent";
import { dealAccess } from "@/lib/deals/access";
import { termsTotal } from "@/lib/deals/terms";
import { sha256, token } from "@/lib/crypto";
import type { Stats } from "@/lib/social";

const db = await getDb();
const [{ n: existing }] = await db.select({ n: count() }).from(s.users);
if (existing > 0) throw new Error("Run this on a fresh database: move .data/pglite aside first.");
const t0 = Date.now();
const log: string[] = [];
const say = (line: string) => (console.log(line), log.push(line));
const usd = (c: number) => `$${(c / 100).toLocaleString("en-US")}`;

// ---------- fixtures ----------

type BrandFx = { key: string; name: string; domain: string; country: string; page: string; brief: { title: string; text: string; niches: string[]; platforms: s.Platform[]; deliverables: { type: s.Deliverable; count: number }[]; budget: number; slots: number } };
const BRANDS: BrandFx[] = [
  { key: "dewdrop", name: "Dewdrop Skin", domain: "dewdropskin.example", country: "US", page: "Dewdrop Skin makes fragrance-free skincare for sensitive skin. Our hero product is a barrier-repair moisturizer under $25. We sell online and in 400 drugstores across the US. Dermatologist-tested, vegan, no fluff.", brief: { title: "Sensitive-skin morning routine", text: "Show your real morning routine with our Barrier Cream. No filters, honest texture shots, mention it's fragrance-free.", niches: ["beauty"], platforms: ["instagram", "tiktok"], deliverables: [{ type: "reel", count: 1 }], budget: 900, slots: 3 } },
  { key: "northpeak", name: "Northpeak Gear", domain: "northpeakgear.example", country: "CA", page: "Northpeak Gear builds lightweight hiking and camping gear in Vancouver. Packs, shells and sleeping systems for people who hike on weekends, not just pros. Lifetime repairs.", brief: { title: "Weekend hike with the 28L pack", text: "Take our 28L daypack on a real weekend hike. One YouTube video segment (60-90s) plus a Short. Show how it carries, not just how it looks.", niches: ["travel", "fitness"], platforms: ["youtube"], deliverables: [{ type: "video", count: 1 }, { type: "short", count: 1 }], budget: 2500, slots: 2 } },
  { key: "kettle", name: "Kettle & Oat", domain: "kettleandoat.example", country: "GB", page: "Kettle & Oat makes ready-in-5-minutes porridge pots and oat bars in Manchester. High fibre, low sugar, sold in UK supermarkets and online worldwide.", brief: { title: "5-minute breakfast, three ways", text: "Make three quick breakfasts with our porridge pots. Fast cuts, real kitchen, mention the 5-minute claim.", niches: ["food"], platforms: ["instagram", "tiktok"], deliverables: [{ type: "tiktok", count: 1 }, { type: "reel", count: 1 }], budget: 700, slots: 4 } },
  { key: "pulse", name: "Pulse Athletics", domain: "pulseathletics.example", country: "US", page: "Pulse Athletics makes training shoes and gym wear for strength athletes. Flat soles, wide toe box, built for lifting and short runs. Based in Denver.", brief: { title: "Leg day in the Pulse Lifter", text: "Film a full leg-day session in the Pulse Lifter shoe. Talk about stability under load. One Reel and three Stories.", niches: ["fitness"], platforms: ["instagram"], deliverables: [{ type: "reel", count: 1 }, { type: "story", count: 3 }], budget: 1800, slots: 2 } },
  { key: "byteframe", name: "Byteframe", domain: "byteframe.example", country: "DE", page: "Byteframe designs aluminium laptop stands, USB-C docks and cable kits for home offices. Designed in Berlin, shipped worldwide, two-year warranty.", brief: { title: "Desk setup upgrade", text: "Feature our USB-C dock in a desk-setup video. Honest pros and cons. One dedicated YouTube segment and one Short.", niches: ["tech"], platforms: ["youtube"], deliverables: [{ type: "video", count: 1 }, { type: "short", count: 1 }], budget: 3000, slots: 2 } },
  { key: "wanderlite", name: "Wanderlite Luggage", domain: "wanderlite.example", country: "AU", page: "Wanderlite makes carry-on luggage that fits every major airline's size limit. Built-in compression, lifetime warranty, Sydney-designed.", brief: { title: "Two weeks, one carry-on", text: "Pack for a real trip in one Wanderlite carry-on and show what fits. Reel or TikTok, your call.", niches: ["travel"], platforms: ["instagram", "tiktok"], deliverables: [{ type: "reel", count: 1 }], budget: 1200, slots: 3 } },
  { key: "pawsome", name: "Pawsome Pantry", domain: "pawsomepantry.example", country: "US", page: "Pawsome Pantry makes air-dried dog treats with one ingredient each. No fillers. Sold by subscription across the US.", brief: { title: "Treat taste test", text: "Let your dog try three of our treats on camera. Funny and honest is perfect.", niches: ["lifestyle"], platforms: ["tiktok", "instagram"], deliverables: [{ type: "tiktok", count: 1 }], budget: 1500, slots: 3 } },
  { key: "levelup", name: "LevelUp Fuel", domain: "levelupfuel.example", country: "US", page: "LevelUp Fuel makes sugar-free energy drink mixes for gamers and streamers. Caffeine from green tea, 10 flavours.", brief: { title: "Late-night ranked session", text: "Drink LevelUp during a ranked session and show it on stream or in a Short. Keep it natural.", niches: ["gaming"], platforms: ["youtube", "tiktok"], deliverables: [{ type: "short", count: 2 }], budget: 1000, slots: 3 } },
  { key: "thread", name: "Thread & Loom", domain: "threadandloom.example", country: "GB", page: "Thread & Loom makes knitwear from recycled wool in Scotland. Timeless cuts, small batches, free repairs.", brief: { title: "Autumn capsule wardrobe", text: "Style one Thread & Loom jumper five ways. Carousel post or Reel.", niches: ["fashion"], platforms: ["instagram"], deliverables: [{ type: "post", count: 1 }], budget: 600, slots: 4 } },
  { key: "pennypath", name: "Pennypath", domain: "pennypath.example", country: "US", page: "Pennypath is a budgeting app that splits each paycheck into bills, savings and fun money automatically. Free plan, $4 a month for premium.", brief: { title: "My paycheck routine", text: "Walk through how you split a paycheck using Pennypath. Clear, practical, no get-rich promises.", niches: ["finance"], platforms: ["tiktok", "youtube"], deliverables: [{ type: "tiktok", count: 1 }], budget: 1100, slots: 3 } },
];

type CreatorFx = { name: string; handle: string; city: string; country: string; main: s.Platform; accounts: [s.Platform, number, number, number][]; captions: string[]; reel: number; min: number; level: s.AgentLevel; publicFollowers?: number; codeInBio?: boolean };
const CREATORS: CreatorFx[] = [
  { name: "Maya Chen", handle: "maya.glows", city: "Los Angeles", country: "US", main: "instagram", accounts: [["instagram", 48_000, 36_000, 520], ["tiktok", 22_000, 41_000, 610]], captions: ["My sensitive-skin routine that finally stopped the redness", "Drugstore vs luxury moisturizer, blind test", "SPF I actually reapply"], reel: 750, min: 500, level: "copilot" },
  { name: "Leo Hart", handle: "leo.outdoors", city: "Vancouver", country: "CA", main: "youtube", accounts: [["youtube", 120_000, 54_000, 380], ["instagram", 31_000, 12_000, 300]], captions: ["3 days on the Sunshine Coast Trail", "Ultralight pack list under 5 kg", "Why I stopped buying cheap rain shells"], reel: 900, min: 1500, level: "delegate" },
  { name: "Priya Nair", handle: "priya.cooks", city: "London", country: "GB", main: "tiktok", accounts: [["tiktok", 61_000, 70_000, 690], ["instagram", 22_000, 15_000, 450]], captions: ["15-minute dal for busy weeknights", "Breakfast for under a pound", "My overnight oats ratio"], reel: 450, min: 300, level: "manual" },
  { name: "Jordan Brooks", handle: "jbrooks.fit", city: "Austin", country: "US", main: "instagram", accounts: [["instagram", 85_000, 52_000, 410]], captions: ["Leg day: 5 moves for strong knees", "Squat shoes, do you need them?", "My 4-day strength split"], reel: 1100, min: 800, level: "delegate" },
  { name: "Tomas Weber", handle: "tomas.tech", city: "Berlin", country: "DE", main: "youtube", accounts: [["youtube", 210_000, 88_000, 290]], captions: ["The best USB-C dock for MacBook in 2026", "My minimal desk setup", "Cheap vs expensive monitor arms"], reel: 1600, min: 2000, level: "copilot" },
  { name: "Aisha Bello", handle: "aisha.abroad", city: "Lagos", country: "NG", main: "instagram", accounts: [["instagram", 35_000, 28_000, 560]], captions: ["Two weeks in Portugal with one bag", "How I find cheap flights", "Packing cubes: worth it?"], reel: 500, min: 350, level: "copilot" },
  { name: "Sam Rivera", handle: "sam.and.biscuit", city: "Chicago", country: "US", main: "tiktok", accounts: [["tiktok", 140_000, 210_000, 820]], captions: ["Biscuit rates treats, part 12", "My dog judges my cooking", "Rescue dog first week home"], reel: 1300, min: 900, level: "manual" },
  { name: "Kenji Mori", handle: "kenji.plays", city: "Tokyo", country: "JP", main: "youtube", accounts: [["youtube", 95_000, 40_000, 350]], captions: ["Ranked grind to Diamond", "Budget streaming setup", "Late-night VOD review"], reel: 800, min: 600, level: "copilot", publicFollowers: 31_000 },
  { name: "Chloe Dubois", handle: "chloe.wears", city: "Paris", country: "FR", main: "instagram", accounts: [["instagram", 18_000, 9_000, 480]], captions: ["One jumper, five outfits", "Capsule wardrobe for autumn", "Thrift haul"], reel: 400, min: 250, level: "manual", codeInBio: false },
  { name: "Ryan Park", handle: "ryan.saves", city: "Seattle", country: "US", main: "tiktok", accounts: [["tiktok", 64_000, 58_000, 640]], captions: ["How I split my paycheck", "Saving $10k on a normal salary", "Budget apps ranked"], reel: 600, min: 400, level: "delegate" },
];

// Stand-in for publicInstagram(): what the public profile would show. Same shape, so the real fetch drops in.
function publicProfile(c: CreatorFx, code: string): Stats {
  const [, followers, avgViews, eng] = c.accounts.find((a) => a[0] === c.main)!;
  return { followers: c.publicFollowers ?? Math.round(followers * 0.98), avgViews, engagementBps: eng, reach90d: [], captions: c.captions, displayName: c.name, bio: `${c.captions[0]}. ${c.codeInBio === false ? "" : code}` };
}

// ---------- illustrative rate samples (the creator's agent compares offers against these) ----------
{
  const rows: (typeof s.rateSamples.$inferInsert)[] = [];
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const niche of ["beauty", "fashion", "food", "fitness", "tech", "travel", "gaming", "lifestyle", "finance"])
    for (const country of ["AE", "IN"]) // shortcut: the agent's rate lookup only knows these two markets; add global rate data before launch.
      for (const deliverable of ["reel", "story", "post", "tiktok", "short", "video"] as s.Deliverable[])
        for (let i = 0; i < 12; i++) {
          const followers = Math.round(5_000 + rand() * 250_000);
          const m = { reel: 1, story: 0.3, post: 0.7, tiktok: 0.9, short: 0.6, video: 2 }[deliverable as "reel"] ?? 1;
          rows.push({ niche, country, platform: deliverable === "tiktok" ? "tiktok" : ["short", "video"].includes(deliverable) ? "youtube" : "instagram", deliverable, followers, amountCents: Math.round((followers / 50) * m * (0.7 + rand() * 0.6)) * 100, source: "seed" });
        }
  await db.insert(s.rateSamples).values(rows);
}

// ---------- 1. brands sign up; Haiku reads each brand's site ----------
say(`## 1. Brands sign up (Haiku reads each site)`);
const brands = await Promise.all(
  BRANDS.map(async (b) => {
    const { user } = await findOrCreateUser(db, `team@${b.domain}`);
    const prof = await brandProfile({ url: `https://${b.domain}`, pageText: b.page });
    await db.update(s.users).set({ name: `${b.name} team`, role: "brand", country: b.country, adult: true, onboardedAt: new Date() }).where(eq(s.users.id, user.id));
    const [brand] = await db.insert(s.brands).values({ name: b.name, website: `https://${b.domain}`, domain: b.domain, category: b.brief.niches[0], country: b.country, description: prof.description, plan: "growth" }).returning();
    await db.insert(s.brandMembers).values({ brandId: brand.id, userId: user.id, role: "owner" });
    const [opp] = await db.insert(s.opportunities).values({ brandId: brand.id, createdBy: user.id, title: b.brief.title, brief: b.brief.text, niches: b.brief.niches, platforms: b.brief.platforms, deliverables: b.brief.deliverables, budgetCents: b.brief.budget * 100, slots: b.brief.slots, country: null, audience: "public" }).returning();
    return { fx: b, user, brand, opp, prof };
  }),
);
for (const b of brands) say(`- **${b.brand.name}** (${b.fx.country}): ${b.prof.description} Brief: "${b.opp.title}", ${usd(b.opp.budgetCents)} per creator, ${b.opp.slots} slots.`);

// ---------- 2. creators sign up; Haiku drafts each media kit ----------
say(`\n## 2. Creators sign up (Haiku drafts each media kit)`);
const creators = await Promise.all(
  CREATORS.map(async (c) => {
    const { user } = await findOrCreateUser(db, `${c.handle}@sim.evra.test`);
    const [, followers, avgViews] = c.accounts.find((a) => a[0] === c.main)!;
    const kit = await draftKit({ name: c.name, handle: c.handle, platform: c.main, followers, avgViews, city: c.city, captions: c.captions, locale: "en" });
    await db.update(s.users).set({ name: c.name, role: "creator", handle: c.handle, city: c.city, country: c.country, adult: true, onboardedAt: new Date() }).where(eq(s.users.id, user.id));
    await db.insert(s.creatorProfiles).values({ userId: user.id, displayName: c.name, headline: kit.headline, bio: kit.bio, niches: kit.niches, languages: ["en"], minRateCents: c.min * 100, agentLevel: c.level });
    for (const [platform, f, v, e] of c.accounts) await db.insert(s.socialAccounts).values({ userId: user.id, platform, handle: c.handle, followers: f, avgViews: v, engagementBps: e, source: "self", verified: false, topPosts: [] });
    await db.insert(s.rateCardItems).values({ userId: user.id, deliverable: "reel", label: "Reel or short video", priceCents: c.reel * 100, position: 0 });
    return { fx: c, user, kit, verification: null as null | ReturnType<typeof checkVerification> & { code: string } };
  }),
);
for (const c of creators) say(`- **@${c.fx.handle}** (${c.fx.city}, ${c.fx.level}): "${c.kit.headline}" niches: ${c.kit.niches.join(", ")}`);

// ---------- 3. social verification by bio code ----------
say(`\n## 3. Social verification (code in bio, read from the public profile)`);
for (const c of creators) {
  const code = verifyCode(c.user.id, c.fx.main);
  const claimed = c.fx.accounts.find((a) => a[0] === c.fx.main)![1];
  const v = checkVerification(code, claimed, publicProfile(c.fx, code));
  c.verification = { ...v, code };
  // Same update verifyAccount() makes; done here because the real reader covers Instagram only so far.
  if (v.status !== "failed")
    await db.update(s.socialAccounts).set(v.status === "verified" ? { verified: true, source: "public", followers: v.stats!.followers, syncedAt: new Date() } : { source: "review", syncedAt: new Date() }).where(and(eq(s.socialAccounts.userId, c.user.id), eq(s.socialAccounts.platform, c.fx.main)));
  say(`- @${c.fx.handle} on ${c.fx.main}, code ${code}: **${v.status}**. ${v.reason}`);
}
const verified = creators.filter((c) => c.verification?.status === "verified");

// ---------- 4. deal finding: code shortlists by fit, Haiku ranks and drafts pitches ----------
say(`\n## 4. Deal finding (fit score shortlists, Haiku ranks and writes the pitch)`);
const finds = await Promise.all(
  verified.map(async (c) => {
    const [profile] = await db.select().from(s.creatorProfiles).where(eq(s.creatorProfiles.userId, c.user.id));
    const [main] = await db.select().from(s.socialAccounts).where(and(eq(s.socialAccounts.userId, c.user.id), eq(s.socialAccounts.platform, c.fx.main)));
    const shortlist = brands
      .map((b) => ({ b, f: fit({ niches: profile.niches, country: c.fx.country, rateCents: c.fx.reel * 100, engagementBps: main.engagementBps }, { niches: b.opp.niches, country: null, budgetCents: b.opp.budgetCents }) }))
      .sort((x, y) => y.f.score - x.f.score)
      .slice(0, 5);
    const res = await findDeals({
      creator: { name: c.fx.name, headline: profile.headline, niches: profile.niches, country: c.fx.country, followers: main.followers, avgViews: main.avgViews, engagementBps: main.engagementBps, reelCents: c.fx.reel * 100, verified: true },
      briefs: shortlist.map(({ b }) => ({ id: b.opp.id, brand: b.brand.name, title: b.opp.title, brief: b.opp.brief, niches: b.opp.niches, budgetCents: b.opp.budgetCents, deliverables: b.opp.deliverables })),
      locale: "en",
    });
    return { c, profile, main, shortlist, matches: res.matches.filter((m) => brands.some((b) => b.opp.id === m.briefId)) };
  }),
);
for (const f of finds) {
  say(`- **@${f.c.fx.handle}** shortlist: ${f.shortlist.map(({ b, f: s2 }) => `${b.brand.name} (${s2.score})`).join(", ")}`);
  f.matches.forEach((m, i) => say(`  ${i + 1}. ${brands.find((b) => b.opp.id === m.briefId)!.brand.name}: ${m.why}`));
  if (!f.matches.length) say(`  No match Haiku would stand behind.`);
}

// ---------- 5. the creator sends the top pitch; the brand's agent drafts an offer; the creator's agent reviews ----------
say(`\n## 5. Pitch, offer, the creator's agent, agreement`);
type DealRun = { handle: string; brand: string; dealId: string; offerCents: number; finalCents: number; steps: string[] };
const deals: DealRun[] = [];
for (const f of finds) {
  const top = f.matches[0];
  if (!top) continue;
  const b = brands.find((x) => x.opp.id === top.briefId)!;
  const steps: string[] = [`pitch sent by the creator: "${top.pitch}"`];
  const offer = await draftOffer({ brief: b.opp.brief, deliverables: b.opp.deliverables, budgetCents: b.opp.budgetCents, brandName: b.brand.name, creator: { name: f.c.fx.name, followers: f.main.followers, avgViews: f.main.avgViews, niches: f.profile.niches, rateCard: [{ label: "Reel or short video", priceCents: f.c.fx.reel * 100 }] }, rateRange: null, locale: "en" });
  const terms = defaultTerms({ totalCents: offer.totalCents, deliverables: offer.deliverables, postingDays: offer.postingDays });
  terms.usageRights[0].months = Math.max(1, Math.min(12, offer.usageMonths));
  terms.revisions = Math.max(0, Math.min(3, offer.revisions));
  const deal = await createDeal(db, { brandId: b.brand.id, creatorId: f.c.user.id, title: offer.title, terms, proposedBy: b.user.id, side: "brand", opportunityId: b.opp.id });
  await db.insert(s.dealComments).values({ dealId: deal.id, userId: f.c.user.id, body: top.pitch });
  steps.push(`brand agent offer: ${usd(offer.totalCents)} for ${offer.deliverables.map((d) => `${d.count} ${d.type}`).join(" + ")}, ${offer.usageMonths} months usage. ${offer.rationale}`);

  const review = await runCreatorAgent(db, deal.id);
  if (review) steps.push(`creator's agent (${f.c.fx.level}) verdict **${review.verdict}**: ${review.summary}${review.redFlags.length ? ` Flags: ${review.redFlags.map((r) => r.code).join(", ")}.` : ""}`);
  if (f.c.fx.level === "copilot") {
    const [proposal] = await db.select().from(s.agentActions).where(and(eq(s.agentActions.dealId, deal.id), eq(s.agentActions.status, "proposed")));
    if (proposal) {
      const [d] = await db.select().from(s.deals).where(eq(s.deals.id, deal.id));
      await decideAgentProposal(db, { deal: d, user: f.c.user }, proposal.id, true);
      steps.push(`creator tapped yes on the agent's counter (${usd((proposal.output as { totalCents: number }).totalCents)})`);
    }
  }
  let [d] = await db.select().from(s.deals).where(eq(s.deals.id, deal.id));
  if (d.status === "cancelled") {
    steps.push("the creator's agent declined inside the creator's rules");
    deals.push({ handle: f.c.fx.handle, brand: b.brand.name, dealId: deal.id, offerCents: offer.totalCents, finalCents: 0, steps });
    continue;
  }
  // The brand takes any counter within 10% over budget; otherwise it counters at budget and the creator accepts.
  let t = await currentTerms(db, d);
  if (t.proposedBySide !== "brand" && termsTotal(t.terms) > b.opp.budgetCents * 1.1) {
    await counter(db, await dealAccess(db, d.id, b.user), counterTerms(t.terms, { totalCents: b.opp.budgetCents }));
    steps.push(`brand countered at its budget, ${usd(b.opp.budgetCents)}`);
    [d] = await db.select().from(s.deals).where(eq(s.deals.id, deal.id));
    t = await currentTerms(db, d);
  }
  await approveTerms(db, await dealAccess(db, d.id, b.user));
  await approveTerms(db, await dealAccess(db, d.id, f.c.user));
  steps.push(`both sides approved version ${t.version}: ${usd(termsTotal(t.terms))}`);
  deals.push({ handle: f.c.fx.handle, brand: b.brand.name, dealId: deal.id, offerCents: offer.totalCents, finalCents: termsTotal(t.terms), steps });
}

// ---------- 6. work, approval, paid outside EVRA, ratings ----------
say(`\n## 6. Work, approval and ratings (payment marked as made outside EVRA)`);
let i = 0;
for (const r of deals) {
  if (!r.finalCents) continue;
  const c = creators.find((x) => x.fx.handle === r.handle)!;
  const b = brands.find((x) => x.brand.name === r.brand)!;
  await startWork(db, await dealAccess(db, r.dealId, b.user));
  const ms = await db.select().from(s.milestones).where(eq(s.milestones.dealId, r.dealId));
  for (const m of ms.sort((x, y) => x.idx - y.idx)) {
    const url = `https://www.${c.fx.main}.com/p/sim-${r.handle}-${m.idx}`;
    await submitWork(db, await dealAccess(db, r.dealId, c.user), { idx: m.idx, url, kind: "live" });
    const t = await currentTerms(db, (await db.select().from(s.deals).where(eq(s.deals.id, r.dealId)))[0]);
    if (i++ === 1 && t.terms.revisions > 0) {
      await requestChanges(db, await dealAccess(db, r.dealId, b.user), { idx: m.idx, comment: "Please show the product label in the first 3 seconds." });
      await submitWork(db, await dealAccess(db, r.dealId, c.user), { idx: m.idx, url: url + "-v2", kind: "live" });
      r.steps.push("brand asked for one change (label in the first 3 seconds); creator resubmitted");
    }
    await approveMilestone(db, await dealAccess(db, r.dealId, b.user), { idx: m.idx, liveConfirmed: true });
  }
  r.steps.push(`brand approved; paid ${usd(r.finalCents)} outside EVRA`);
  const [d] = await db.select().from(s.deals).where(eq(s.deals.id, r.dealId));
  if (d.status === "completed") {
    await rateDeal(db, await dealAccess(db, r.dealId, b.user), { score: 5, onTime: true, comment: "Clear, on time, easy to work with." });
    await rateDeal(db, await dealAccess(db, r.dealId, c.user), { score: 4, onTime: true, comment: "Fair brief, quick approval." });
    r.steps.push("both sides rated the deal");
  } else r.steps.push(`deal ended in status ${d.status}`);
}
for (const r of deals) {
  say(`\n**@${r.handle} × ${r.brand}**: offer ${usd(r.offerCents)} → final ${r.finalCents ? usd(r.finalCents) : "declined"}`);
  r.steps.forEach((x) => say(`- ${x}`));
}

// ---------- 7. simulated feedback (Haiku plays each person; never published, never a real review) ----------
say(`\n## 7. Simulated feedback (Haiku role-plays each user; NOT real reviews)`);
const Feedback = z.object({ stars: z.number().int().min(1).max(5), review: z.string().describe("One honest sentence, max 160 characters."), wouldPay1: z.enum(["yes", "maybe", "no"]), why: z.string().describe("Why or why not pay $1/month, one sentence."), confusing: z.string().nullable().describe("The one thing that confused or annoyed you, or null.") });
const journeys = [
  ...creators.map((c) => ({ who: `@${c.fx.handle}, a ${c.fx.main} creator in ${c.fx.city} with ${c.fx.accounts[0][1].toLocaleString("en-US")} followers`, journey: [`verification: ${c.verification!.status} (${c.verification!.reason})`, ...(deals.find((d) => d.handle === c.fx.handle)?.steps ?? ["no deal yet"])].join("\n") })),
  ...brands.map((b) => ({ who: `${b.brand.name}, a ${b.fx.country} brand (${b.prof.category})`, journey: deals.filter((d) => d.brand === b.brand.name).flatMap((d) => [`deal with @${d.handle}:`, ...d.steps]).join("\n") || "posted a brief; no creator pitched yet" })),
];
const feedback = await Promise.all(
  journeys.map(async (j) => ({
    who: j.who,
    ...(await structured({ schema: Feedback, effort: "low", system: "You role-play a realistic, slightly skeptical early user of EVRA, a new app where creators get verified and find brand deals. React only to what happened to you. Be honest, not polite.", prompt: `You are ${j.who}. What happened to you:\n${j.journey}` })),
  })),
);
for (const f of feedback) say(`- ${f.who}: ${"★".repeat(f.stars)}${"☆".repeat(5 - f.stars)} "${f.review}" Pay $1/mo: **${f.wouldPay1}**. ${f.why}${f.confusing ? ` Confusing: ${f.confusing}` : ""}`);

// ---------- sessions for screenshots (local only) ----------
const sessions: Record<string, string> = {};
for (const [label, uid] of [["creator_verified", creators[0].user.id], ["creator_failed", creators.find((c) => c.verification?.status === "failed")!.user.id], ["creator_review", creators.find((c) => c.verification?.status === "review")!.user.id], ["brand", brands[0].user.id]] as const) {
  const raw = token(32);
  await db.insert(s.sessions).values({ id: sha256(raw), userId: uid, expiresAt: new Date(Date.now() + 7 * 86_400_000), userAgent: "sim" });
  sessions[label] = raw;
}
mkdirSync(".data/sim", { recursive: true });
writeFileSync(".data/sim/sessions.json", JSON.stringify(sessions, null, 2));

// ---------- totals ----------
const calls = usageLog.length, inT = usageLog.reduce((a, u) => a + u.inputTokens, 0), outT = usageLog.reduce((a, u) => a + u.outputTokens, 0);
const ms = usageLog.map((u) => u.ms).sort((a, b) => a - b);
const summary = { model: MODEL, calls, inputTokens: inT, outputTokens: outT, medianMs: ms[Math.floor(ms.length / 2)], maxMs: ms.at(-1), wallSeconds: Math.round((Date.now() - t0) / 1000), verified: verified.length, deals: deals.length, completed: deals.filter((d) => d.finalCents).length, gmvCents: deals.reduce((a, d) => a + d.finalCents, 0), wouldPay: Object.fromEntries(["yes", "maybe", "no"].map((k) => [k, feedback.filter((f) => f.wouldPay1 === k).length])), avgStars: +(feedback.reduce((a, f) => a + f.stars, 0) / feedback.length).toFixed(2) };
say(`\n## Totals\n\`\`\`json\n${JSON.stringify(summary, null, 2)}\n\`\`\``);
writeFileSync(".data/sim/run.json", JSON.stringify({ summary, creators: creators.map((c) => ({ handle: c.fx.handle, kit: c.kit, verification: c.verification })), finds: finds.map((f) => ({ handle: f.c.fx.handle, matches: f.matches })), deals, feedback, usage: usageLog }, null, 2));
writeFileSync(".data/sim/run.md", log.join("\n"));
console.log("\nWrote .data/sim/run.md, run.json, sessions.json");
process.exit(0);
