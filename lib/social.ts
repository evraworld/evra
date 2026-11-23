import { createHash } from "node:crypto";
import type { Platform } from "@/lib/db/schema";

export type Stats = { followers: number; avgViews: number; engagementBps: number; reach90d: number[]; captions: string[]; displayName?: string; bio?: string };

// Official platform connections need app review with Meta, TikTok and Google. Until those keys are set,
// stats are either self-reported, read from the public profile, or (locally) demo numbers, and the kit says which.
export const officialConnectionConfigured = (p: Platform) =>
  ({ instagram: !!process.env.META_APP_ID, tiktok: !!process.env.TIKTOK_CLIENT_KEY, youtube: !!process.env.GOOGLE_CLIENT_ID, x: !!process.env.X_CLIENT_ID })[p];

export function demoStats(handle: string, platform: Platform): Stats {
  const h = createHash("sha256").update(`${platform}:${handle}`).digest();
  const followers = 3_000 + (h.readUInt32BE(0) % 120_000);
  const avgViews = Math.round(followers * (0.6 + (h[4] % 90) / 100));
  const engagementBps = 180 + (h[5] % 520);
  const reach90d = Array.from({ length: 13 }, (_, i) => Math.round(followers * (0.85 + i * 0.012 + (h[6 + i] % 5) / 100)));
  return { followers, avgViews, engagementBps, reach90d, captions: [] };
}

export function selfReported(followers: number): Stats {
  return { followers, avgViews: Math.round(followers * 0.8), engagementBps: 0, reach90d: [], captions: [] };
}

type ApifyIgProfile = { fullName?: string; biography?: string; followersCount?: number; latestPosts?: { caption?: string; videoViewCount?: number; likesCount?: number; commentsCount?: number }[] };

// Public Instagram profile via Apify (public data only, never behind a login). Returns null when not configured or not found.
export async function publicInstagram(handle: string): Promise<Stats | null> {
  const token = process.env.APIFY_TOKEN;
  if (!token) return null;
  const res = await fetch("https://api.apify.com/v2/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items?timeout=90", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ usernames: [handle] }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) return null;
  const [p] = (await res.json()) as ApifyIgProfile[];
  if (!p?.followersCount) return null;
  const posts = p.latestPosts ?? [];
  const views = posts.map((x) => x.videoViewCount ?? 0).filter((v) => v > 0);
  const engagements = posts.map((x) => (x.likesCount ?? 0) + (x.commentsCount ?? 0));
  const avgEng = engagements.length ? engagements.reduce((a, b) => a + b, 0) / engagements.length : 0;
  return {
    followers: p.followersCount,
    avgViews: views.length ? Math.round(views.reduce((a, b) => a + b, 0) / views.length) : 0,
    engagementBps: Math.round((avgEng / p.followersCount) * 10_000),
    reach90d: [],
    captions: posts.map((x) => x.caption ?? "").filter(Boolean).slice(0, 8),
    displayName: p.fullName,
    bio: p.biography,
  };
}
