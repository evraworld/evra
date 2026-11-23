import { describe, expect, it } from "vitest";
import { counterTerms, delegatePlan } from "@/lib/deals/agent";
import { defaultTerms } from "@/lib/deals/create";
import { diffTerms, termsHash, termsTotal, TermsSchema } from "@/lib/deals/terms";

const rules = { minRateCents: 50_000, counterRangePct: 15, blockedBrand: false };

describe("Delegate policy", () => {
  it("never accepts, even when the model calls an offer fair", () => {
    expect(delegatePlan({ verdict: "fair", counter: null }, 80_000, rules)).toEqual({ act: "wait" });
  });
  it("declines blocked brands and offers far below the floor", () => {
    expect(delegatePlan({ verdict: "fair", counter: null }, 80_000, { ...rules, blockedBrand: true })).toMatchObject({ act: "decline" });
    expect(delegatePlan({ verdict: "counter", counter: null }, 20_000, rules)).toMatchObject({ act: "decline", reason: "far_below_floor" });
  });
  it("caps a counter at the creator's range above the offer", () => {
    const plan = delegatePlan({ verdict: "counter", counter: { totalCents: 200_000, usageMonths: null, revisions: null, killFeeBps: null, message: "" } }, 60_000, rules);
    expect(plan).toEqual({ act: "send_counter", totalCents: 69_000 });
  });
  it("counters up to the minimum when the offer is below it", () => {
    expect(delegatePlan({ verdict: "fair", counter: null }, 40_000, rules)).toEqual({ act: "send_counter", totalCents: 50_000 });
  });
});

describe("term sheets", () => {
  const base = defaultTerms({ totalCents: 65_000, milestones: 2 });
  it("default terms are valid and include usage rights", () => {
    expect(() => TermsSchema.parse(base)).not.toThrow();
    expect(termsTotal(base)).toBe(65_000);
    expect(base.usageRights[0]).toMatchObject({ kind: "organic_repost", months: 3 });
  });
  it("refuses a blank usage-rights answer and paid rights without a spend cap", () => {
    expect(() => TermsSchema.parse({ ...base, usageRights: [] })).toThrow(/blank answer would grant everything/);
    expect(() => TermsSchema.parse({ ...base, usageRights: [{ kind: "dark_post", platforms: ["instagram"], territory: "country", months: 1, priceCents: 20_000 }] })).toThrow(/spend cap/);
  });
  it("fingerprints change with any edit and ignore key order", () => {
    const reordered = Object.fromEntries(Object.entries(base).reverse()) as typeof base;
    expect(termsHash(reordered)).toBe(termsHash(base));
    expect(termsHash({ ...base, revisions: 2 })).not.toBe(termsHash(base));
  });
  it("counter terms keep the total exact and describe the change in plain words", () => {
    const c = counterTerms(base, { totalCents: 75_050 });
    expect(termsTotal(c)).toBe(75_050);
    expect(diffTerms(base, c)[0]).toBe("Total: $650 to $750.50");
  });
});
