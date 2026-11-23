import { and, eq, gte, lte } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { rateSamples, type Deliverable } from "@/lib/db/schema";

export const MIN_SAMPLE = 5;

export const BANDS = [
  { key: "1k-10k", min: 1_000, max: 9_999 },
  { key: "10k-50k", min: 10_000, max: 49_999 },
  { key: "50k-250k", min: 50_000, max: 249_999 },
  { key: "250k+", min: 250_000, max: 1_000_000_000 },
] as const;

export const bandFor = (followers: number) => BANDS.find((b) => followers >= b.min && followers <= b.max) ?? BANDS[0];

const pct = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))];

export type RateRange = { lowCents: number; medianCents: number; highCents: number; sample: number; illustrative: boolean; band: string };

// Rate guidance is always a range with its sample size, and stays hidden below MIN_SAMPLE.
export async function rateRange(db: DB, q: { niche: string; country: string; deliverable: Deliverable; followers: number }): Promise<RateRange | null> {
  const band = bandFor(q.followers);
  const rows = await db
    .select({ amount: rateSamples.amountCents, source: rateSamples.source })
    .from(rateSamples)
    .where(
      and(
        eq(rateSamples.niche, q.niche),
        eq(rateSamples.country, q.country),
        eq(rateSamples.deliverable, q.deliverable),
        gte(rateSamples.followers, band.min),
        lte(rateSamples.followers, band.max),
        gte(rateSamples.createdAt, new Date(Date.now() - 90 * 86_400_000)),
      ),
    );
  if (rows.length < MIN_SAMPLE) return null;
  const sorted = rows.map((r) => r.amount).sort((a, b) => a - b);
  return {
    lowCents: pct(sorted, 0.25),
    medianCents: pct(sorted, 0.5),
    highCents: pct(sorted, 0.75),
    sample: rows.length,
    illustrative: rows.every((r) => r.source === "seed"),
    band: band.key,
  };
}

export const DELIVERABLE_LABEL: Record<Deliverable, string> = {
  reel: "Reel",
  story: "Story",
  post: "Feed post",
  short: "Short",
  video: "YouTube video",
  tiktok: "TikTok",
  ugc: "UGC video (content only)",
  live: "Live stream",
  event: "Event appearance",
};
