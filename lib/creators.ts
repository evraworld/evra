import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { DB } from "@/lib/db";
import * as s from "@/lib/db/schema";

export type Kit = Awaited<ReturnType<typeof getKit>>;

// Everything a public media kit shows, in one read. Hidden stats are removed here, not in the page.
export async function getKit(db: DB, by: { handle?: string; userId?: string }) {
  const where = by.userId ? eq(s.users.id, by.userId) : eq(s.users.handle, (by.handle ?? "").toLowerCase());
  const [row] = await db.select({ user: s.users, profile: s.creatorProfiles }).from(s.users).innerJoin(s.creatorProfiles, eq(s.creatorProfiles.userId, s.users.id)).where(and(where, eq(s.users.role, "creator"))).limit(1);
  if (!row) return null;
  const [accounts, rateCard, showcase, ratings] = await Promise.all([
    db.select().from(s.socialAccounts).where(eq(s.socialAccounts.userId, row.user.id)).orderBy(desc(s.socialAccounts.followers)),
    db.select().from(s.rateCardItems).where(eq(s.rateCardItems.userId, row.user.id)).orderBy(asc(s.rateCardItems.position)),
    db.select().from(s.showcaseItems).where(eq(s.showcaseItems.userId, row.user.id)).orderBy(desc(s.showcaseItems.createdAt)),
    db.select().from(s.ratings).where(eq(s.ratings.toUserId, row.user.id)),
  ]);
  const hidden = new Set(row.profile.hiddenStats);
  // Numbers under review are not shown or counted until a person confirms them.
  const totalReach = accounts.filter((x) => x.source !== "review").reduce((a, x) => a + x.followers, 0);
  const trend = (() => {
    const series = accounts.find((a) => (a.reach90d?.length ?? 0) > 1)?.reach90d;
    if (!series) return null;
    return Math.round(((series[series.length - 1] - series[0]) / Math.max(1, series[0])) * 1000) / 10;
  })();
  return {
    user: { id: row.user.id, name: row.profile.displayName, handle: row.user.handle!, city: row.user.city, country: row.user.country, foundingNumber: row.user.foundingNumber },
    profile: row.profile,
    accounts: accounts.map((a) => ({ ...a, followers: hidden.has("followers") || a.source === "review" ? null : a.followers, avgViews: hidden.has("views") || a.source === "review" ? null : a.avgViews, engagementBps: hidden.has("engagement") || a.source === "review" ? null : a.engagementBps, audience: hidden.has("audience") ? null : a.audience })),
    totalReach: hidden.has("followers") ? null : totalReach,
    reachTrendPct: hidden.has("followers") ? null : trend,
    rateCard: hidden.has("rates") ? [] : rateCard,
    showcase,
    rating: ratings.length ? { score: ratings.reduce((a, r) => a + r.score, 0) / ratings.length, onTimePct: Math.round((ratings.filter((r) => r.onTime).length / ratings.length) * 100), count: ratings.length } : null,
    statsSource: accounts.some((a) => a.source === "demo") ? "demo" : accounts.every((a) => a.verified) ? "verified" : "self",
  };
}

export async function creatorNames(db: DB, ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const rows = await db.select({ id: s.creatorProfiles.userId, name: s.creatorProfiles.displayName }).from(s.creatorProfiles).where(inArray(s.creatorProfiles.userId, ids));
  return new Map(rows.map((r) => [r.id, r.name]));
}
