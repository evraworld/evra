import { createHash } from "node:crypto";
import { z } from "zod";
import type { Terms, UsageRight } from "@/lib/db/schema";
import { formatMoney } from "@/lib/money";

const PLATFORMS = ["instagram", "tiktok", "youtube", "x"] as const;
const PAID = new Set(["paid_brand_handle", "paid_creator_handle", "dark_post", "boosted_post", "likeness"]);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-12-01.");

export const RIGHT_LABEL: Record<UsageRight["kind"], string> = {
  organic_repost: "Repost on the brand's own channels",
  paid_brand_handle: "Paid ads from the brand's handle",
  paid_creator_handle: "Ads through the creator's handle (Spark or Partnership Ads)",
  dark_post: "Dark posts (ads only shown to targeted people)",
  boosted_post: "Boosting the creator's post",
  likeness: "Creator's face, voice or name in new ads",
};

const Right = z
  .object({
    kind: z.enum(["organic_repost", "paid_brand_handle", "paid_creator_handle", "dark_post", "boosted_post", "likeness"]),
    platforms: z.array(z.enum(PLATFORMS)).min(1, "Pick at least one platform for every right."),
    territory: z.enum(["worldwide", "region", "country"]),
    months: z.number().int().min(1, "Every right needs an end date.").max(60),
    spendCapCents: z.number().int().min(0).optional(),
    exclusions: z.array(z.string().trim().max(60)).max(10).optional(),
    priceCents: z.number().int().min(0),
  })
  .refine((r) => !PAID.has(r.kind) || r.kind === "likeness" || r.spendCapCents !== undefined, { message: "Paid ad rights need a spend cap." });

// A blank usage-rights answer is refused: it would grant everything.
export const TermsSchema = z
  .object({
    deliverables: z.array(z.object({ type: z.enum(["reel", "story", "post", "short", "video", "tiktok", "ugc", "live", "event"]), count: z.number().int().min(1).max(20), platform: z.enum(PLATFORMS), notes: z.string().max(300).optional() })).min(1).max(10),
    postingWindow: z.object({ start: date, end: date }).refine((w) => w.end >= w.start, { message: "The posting window ends before it starts." }),
    usageRights: z.array(Right).min(1, "Choose the usage rights. A blank answer would grant everything, so it isn't allowed.").max(6),
    exclusivityDays: z.number().int().min(0).max(365),
    exclusivityCategory: z.string().max(80).optional(),
    revisions: z.number().int().min(0).max(5),
    killFeeBps: z.number().int().min(0).max(10_000),
    milestones: z.array(z.object({ title: z.string().trim().min(2).max(80), amountCents: z.number().int().min(100, "Each payment must be at least $1.") })).min(1).max(5),
    disclosure: z.string().trim().min(3).max(300),
    reviewDays: z.number().int().min(1).max(14),
    ownership: z.object({ instrument: z.enum(["restricted", "options"]), shares: z.number().int().min(1), vestingMonths: z.number().int().min(1).max(60), cliffMonths: z.number().int().min(0).max(24) }).optional(),
    notes: z.string().max(1000).optional(),
  })
  .refine((t) => t.usageRights.reduce((a, r) => a + r.priceCents, 0) <= t.milestones.reduce((a, m) => a + m.amountCents, 0) * 10, { message: "Usage rights are priced unusually high; check the numbers." });

const stable = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(stable) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, stable(x)])) : v;

// The fingerprint both sides approve; any later edit changes it, so approvals can't be carried over by mistake.
export const termsHash = (t: Terms) => createHash("sha256").update(JSON.stringify(stable(t))).digest("hex");

export const termsTotal = (t: Terms) => t.milestones.reduce((a, m) => a + m.amountCents, 0);

const rightText = (r: UsageRight) => `${RIGHT_LABEL[r.kind]}, ${r.months} months${r.priceCents ? ` (+${formatMoney(r.priceCents)})` : ""}`;

export function diffTerms(before: Terms, after: Terms): string[] {
  const out: string[] = [];
  const bt = termsTotal(before);
  const at = termsTotal(after);
  if (bt !== at) out.push(`Total: ${formatMoney(bt)} to ${formatMoney(at)}`);
  const br = before.usageRights.map(rightText).join("; ");
  const ar = after.usageRights.map(rightText).join("; ");
  if (br !== ar) out.push(`Usage rights: ${ar}`);
  if (before.revisions !== after.revisions) out.push(`Revisions: ${before.revisions} to ${after.revisions}`);
  if (before.killFeeBps !== after.killFeeBps) out.push(`Kill fee: ${before.killFeeBps / 100}% to ${after.killFeeBps / 100}%`);
  if (before.exclusivityDays !== after.exclusivityDays) out.push(`Exclusivity: ${before.exclusivityDays} to ${after.exclusivityDays} days`);
  if (before.postingWindow.end !== after.postingWindow.end) out.push(`Post by: ${before.postingWindow.end} to ${after.postingWindow.end}`);
  if (before.reviewDays !== after.reviewDays) out.push(`Review time: ${before.reviewDays} to ${after.reviewDays} days`);
  const bd = before.deliverables.map((d) => `${d.count} ${d.type} on ${d.platform}`).join(", ");
  const ad = after.deliverables.map((d) => `${d.count} ${d.type} on ${d.platform}`).join(", ");
  if (bd !== ad) out.push(`Deliverables: ${ad}`);
  if (before.milestones.length !== after.milestones.length) out.push(`Payments: ${after.milestones.length} ${after.milestones.length === 1 ? "payment" : "payments"}`);
  return out;
}
