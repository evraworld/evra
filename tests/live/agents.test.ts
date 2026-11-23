// Live tests against the real Claude API (ANTHROPIC_API_KEY from .env.local). Run: npm run test:live
import { describe, expect, it } from "vitest";
import { checkOffer, draftKit, reviewOffer, summarizeTerms, triageMessage } from "@/lib/ai/agents";
import { delegatePlan } from "@/lib/deals/agent";
import { defaultTerms } from "@/lib/deals/create";

const terms = defaultTerms({ totalCents: 30_000 });

describe.skipIf(!process.env.ANTHROPIC_API_KEY)("Claude agents (live)", () => {
  it("drafts a kit grounded in the profile", async () => {
    const k = await draftKit({ name: "Layla Haddad", handle: "layla.glow", platform: "instagram", followers: 62_000, avgViews: 58_000, city: "Dubai", captions: ["Night routine for humid Dubai summers", "Testing 3 SPFs on Jumeirah beach"], locale: "en" });
    expect(k.headline.length).toBeGreaterThan(10);
    expect(k.headline.length).toBeLessThanOrEqual(100);
    expect(k.niches.map((n) => n.toLowerCase())).toContain("beauty");
  });

  it("flags an offer below the creator's floor and the Delegate policy counters without accepting", async () => {
    const r = await reviewOffer({
      terms,
      brandName: "Glow Co.",
      brandRecord: { paidOnTimePct: null, deals: 0 },
      rules: { minRateCents: 60_000, blockedBrands: [], niches: ["beauty"], maxMonthlyDeals: 8, dealsThisMonth: 1, counterRangePct: 20 },
      stats: { followers: 28_400, avgViews: 41_000, engagementBps: 420 },
      rateRange: { lowCents: 50_000, highCents: 80_000, sample: 41 },
      locale: "en",
    });
    expect(r.verdict).not.toBe("fair");
    expect(r.redFlags.some((f) => f.code === "below_floor")).toBe(true);
    const plan = delegatePlan(r, 30_000, { minRateCents: 60_000, counterRangePct: 20, blockedBrand: false });
    expect(plan.act).toBe("send_counter");
  });

  it("reads a scammy DM as risky", async () => {
    const r = await checkOffer({ locale: "en", text: "Hey! Collab? Pay a $50 registration fee first, then we send $500 after you post. Send bank details here." });
    expect(r.safetyScore).toBeLessThan(40);
    expect(r.redFlags.length).toBeGreaterThan(0);
  });

  it("triages a brand offer in Arabic", async () => {
    const r = await triageMessage({ locale: "ar", creatorName: "Sara", text: "Hi Sara, we're Glow Co. and would like to pay you $600 for one Reel about our SPF this month. Interested?" });
    expect(r.isBrandOffer).toBe(true);
    expect(r.type).toBe("paid_collab");
    expect(/[؀-ۿ]/.test(r.suggestedReply)).toBe(true);
  });

  it("explains terms in Hindi", async () => {
    const r = await summarizeTerms({ terms, brandName: "Chai Point", creatorName: "Arjun", locale: "hi" });
    expect(/[ऀ-ॿ]/.test(r.summary)).toBe(true);
  });
});
