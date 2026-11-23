import { z } from "zod";
import type { Locale, Terms } from "@/lib/db/schema";
import { structured, type StructuredFn } from "./claude";
import { NICHES } from "@/lib/onboarding";

const LANG: Record<Locale, string> = { en: "English", ar: "Arabic (Gulf-friendly Modern Standard Arabic)", hi: "Hindi (simple, everyday Hindi)" };

const VOICE =
  "You work inside EVRA, where creators get verified, find brand deals and agree clear written terms with brands. " +
  "Brands pay creators directly, outside EVRA, as written in the terms; never say EVRA locks, holds or protects payment. " +
  "Write like a calm, experienced talent manager: short sentences, plain words, no hype, no emoji. " +
  "Never use crypto words (crypto, blockchain, wallet, token, web3). Money is in US dollars.";

// ---------- kit drafting (onboarding and the Ops kit launcher) ----------

export const KitDraft = z.object({
  headline: z.string().describe("Max 80 characters. What the creator makes and for whom."),
  bio: z.string().describe("2-3 sentences, max 280 characters, first person."),
  // Only EVRA's own niches: matching compares these exactly, so free-form words like "skincare" never match a brief.
  niches: z.array(z.enum(NICHES)).describe("1 to 4 niches from the list. Pets, home and family content go under lifestyle or parenting."),
});

export function draftKit(
  input: { name: string; handle: string; platform: string; followers: number; avgViews: number; city?: string | null; captions: string[]; locale: Locale },
  llm: StructuredFn = structured,
) {
  return llm({
    schema: KitDraft,
    effort: "low",
    system: `${VOICE} You draft a creator's media kit from their public profile. Only state what the data supports; never invent brands, awards or numbers.`,
    prompt:
      `Write the headline, bio and niches in ${LANG[input.locale]} (niches always in English lowercase).\n\n` +
      JSON.stringify({ name: input.name, handle: input.handle, platform: input.platform, followers: input.followers, averageViews: input.avgViews, city: input.city, recentCaptions: input.captions.slice(0, 8) }),
  });
}

// ---------- Creator Agent: reviews an offer inside the creator's written rules ----------

export const OfferReview = z.object({
  summary: z.string().describe("Plain-language summary of the offer for the creator, max 3 sentences."),
  redFlags: z.array(z.object({ code: z.enum(["below_floor", "vague_rights", "broad_rights", "no_kill_fee", "long_exclusivity", "too_many_revisions", "tight_deadline", "blocked_brand", "other"]), text: z.string() })),
  verdict: z.enum(["fair", "counter", "decline"]).describe("fair = the creator could accept as is; counter = worth negotiating; decline = clear mismatch with the creator's rules."),
  counter: z
    .object({
      totalCents: z.number().int().describe("Proposed new total fee in US cents."),
      usageMonths: z.number().int().nullable().describe("Proposed usage-rights duration in months, or null to keep."),
      revisions: z.number().int().nullable(),
      killFeeBps: z.number().int().nullable(),
      message: z.string().describe("Short, polite counter message to the brand, in the creator's language."),
    })
    .nullable(),
  evidence: z.array(z.string()).describe("Facts behind the verdict, e.g. recent average views or the rate range for similar creators."),
  declineMessage: z.string().nullable().describe("Polite decline message if verdict is decline, else null."),
});
export type OfferReview = z.infer<typeof OfferReview>;

export function reviewOffer(
  input: {
    terms: Terms;
    brandName: string;
    brandRecord: { paidOnTimePct: number | null; deals: number };
    rules: { minRateCents: number; blockedBrands: string[]; niches: string[]; maxMonthlyDeals: number; dealsThisMonth: number; counterRangePct: number };
    stats: { followers: number; avgViews: number; engagementBps: number };
    rateRange: { lowCents: number; highCents: number; sample: number } | null;
    locale: Locale;
  },
  llm: StructuredFn = structured,
) {
  return llm({
    schema: OfferReview,
    effort: "high",
    system:
      `${VOICE} You are the creator's agent. You review brand offers against the creator's written rules and market data, flag problems and suggest a counter. ` +
      "You never accept an offer for the creator; a person always says yes. Counters must stay realistic: at or above the creator's minimum, and no more than the creator's counter range above the offer unless the data clearly supports it. " +
      "Usage rights matter: paid ads, dark posts and likeness are worth extra money and should be time-limited.",
    prompt: `Write summary, messages and evidence in ${LANG[input.locale]}.\n\n${JSON.stringify(input)}`,
  });
}

// ---------- Brand Agent: drafts an offer from a brief ----------

export const OfferDraft = z.object({
  title: z.string(),
  deliverables: z.array(z.object({ type: z.enum(["reel", "story", "post", "short", "video", "tiktok", "ugc", "live", "event"]), count: z.number().int().min(1), platform: z.enum(["instagram", "tiktok", "youtube", "x"]) })),
  totalCents: z.number().int(),
  usageMonths: z.number().int(),
  paidAdsRights: z.boolean(),
  revisions: z.number().int(),
  postingDays: z.number().int().describe("Days from funding to the posting deadline."),
  rationale: z.string().describe("2 sentences on why this offer is fair to both sides."),
});

export function draftOffer(
  input: { brief: string; deliverables: { type: string; count: number }[]; budgetCents: number; brandName: string; creator: { name: string; followers: number; avgViews: number; niches: string[]; rateCard: { label: string; priceCents: number }[] }; rateRange: { lowCents: number; highCents: number } | null; locale: Locale },
  llm: StructuredFn = structured,
) {
  return llm({
    schema: OfferDraft,
    effort: "medium",
    system: `${VOICE} You are a brand's agent. You turn a brief into a fair first offer a creator is likely to accept, inside the brand's budget. Offer exactly the deliverables the brief asks for, no more and no fewer. Respect the creator's rate card when one exists.`,
    prompt: `Write title and rationale in ${LANG[input.locale]}.\n\n${JSON.stringify(input)}`,
  });
}

// ---------- plain-language term summaries (both sides read the same terms) ----------

export const TermsSummary = z.object({ summary: z.string().describe("Max 4 short sentences."), watchOut: z.array(z.string()).describe("0-3 things each side should double-check.") });

export function summarizeTerms(input: { terms: Terms; brandName: string; creatorName: string; locale: Locale }, llm: StructuredFn = structured) {
  return llm({
    schema: TermsSummary,
    effort: "low",
    system: `${VOICE} You explain a deal's terms so anyone, at any age, understands what they're agreeing to.`,
    prompt: `Summarise in ${LANG[input.locale]}.\n\n${JSON.stringify(input)}`,
  });
}

// ---------- request and DM triage ----------

export const Triage = z.object({
  type: z.enum(["paid_collab", "seeding", "event", "feedback_call", "licence", "ownership", "fan_message", "spam"]),
  isBrandOffer: z.boolean(),
  priority: z.enum(["high", "normal", "low"]),
  scamRisk: z.enum(["low", "medium", "high"]),
  scamSignals: z.array(z.string()),
  suggestedReply: z.string(),
});

export function triageMessage(input: { text: string; creatorName: string; locale: Locale }, llm: StructuredFn = structured) {
  return llm({
    schema: Triage,
    effort: "low",
    system: `${VOICE} You sort a creator's incoming messages. Brand offers that ask for money up front or move to unknown apps are scam signals.`,
    prompt: `Reply text in ${LANG[input.locale]}.\n\n${JSON.stringify(input)}`,
  });
}

// ---------- free tool: offer and contract checker ----------

export const OfferCheck = z.object({
  safetyScore: z.number().int().min(0).max(100).describe("100 = clear, fair offer from a real brand."),
  verdict: z.string().describe("One sentence."),
  redFlags: z.array(z.string()),
  missingTerms: z.array(z.string()).describe("Terms a fair deal should state but this one doesn't, e.g. payment date, usage rights, revisions, kill fee."),
  suggestedReply: z.string(),
});

export function checkOffer(input: { text: string; locale: Locale }, llm: StructuredFn = structured) {
  return llm({
    schema: OfferCheck,
    effort: "low",
    system: `${VOICE} You check a brand offer a creator pasted in, the way a careful manager would before saying yes.`,
    prompt: `Answer in ${LANG[input.locale]}. The offer:\n"""${input.text.slice(0, 6000)}"""`,
  });
}

// ---------- brand profile from the brand's own website ----------

export const BrandProfile = z.object({ name: z.string(), category: z.string(), description: z.string().describe("2 sentences."), audience: z.string(), tone: z.string() });

export function brandProfile(input: { url: string; pageText: string }, llm: StructuredFn = structured) {
  return llm({
    schema: BrandProfile,
    effort: "low",
    system: `${VOICE} You read a brand's homepage and describe the brand for creators. Only use what the page says.`,
    prompt: `${input.url}\n"""${input.pageText.slice(0, 12000)}"""`,
  });
}

// ---------- ownership offers (P3, behind counsel) ----------

export const OwnershipExplain = z.object({ plain: z.string(), redFlags: z.array(z.string()), questions: z.array(z.string()).describe("Questions the creator should ask the company.") });

export function explainOwnership(input: { offer: Record<string, unknown>; locale: Locale }, llm: StructuredFn = structured) {
  return llm({
    schema: OwnershipExplain,
    effort: "medium",
    system: `${VOICE} You explain an equity-for-content offer to a creator in plain words. You are not a lawyer and never say whether to sign; you explain and list questions to ask.`,
    prompt: `Answer in ${LANG[input.locale]}.\n\n${JSON.stringify(input.offer)}`,
  });
}

// ---------- Deal finder: ranks open briefs for a creator and drafts the pitch (the creator sends it) ----------

export const DealMatches = z.object({
  matches: z
    .array(
      z.object({
        briefId: z.string(),
        why: z.string().describe("One sentence on why this brief fits this creator, citing their numbers or content."),
        pitch: z.string().describe("The creator's first message to the brand, first person, max 500 characters, no greeting fluff."),
      }),
    )
    .describe("Best fits first, at most 3. Leave out briefs that don't fit."),
});

export function findDeals(
  input: {
    creator: { name: string; headline: string | null; niches: string[]; country: string | null; followers: number; avgViews: number; engagementBps: number; reelCents: number | null; verified: boolean };
    briefs: { id: string; brand: string; title: string; brief: string; niches: string[]; budgetCents: number; deliverables: { type: string; count: number }[] }[];
    locale: Locale;
  },
  llm: StructuredFn = structured,
) {
  return llm({
    schema: DealMatches,
    effort: "low",
    system: `${VOICE} You find brand deals for a creator. Rank only the briefs given, using real fit (niche, audience, budget against their price). Never invent numbers or past work.`,
    prompt: `Write why and pitch in ${LANG[input.locale]}.\n\n${JSON.stringify(input)}`,
  });
}
