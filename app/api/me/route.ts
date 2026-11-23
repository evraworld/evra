import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { apiUser, HttpError } from "@/lib/auth/guards";
import { body, route } from "@/lib/http";
import { REQUEST_TYPES } from "@/lib/onboarding";
import { verifyAccount } from "@/lib/verify";

const url = z.string().trim().url().max(300).refine((u) => /^https?:/.test(u), "Links must start with http");
const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("profile"), displayName: z.string().trim().min(2).max(80), headline: z.string().trim().max(120), bio: z.string().trim().max(400), kitPublic: z.boolean(), hiddenStats: z.array(z.enum(["followers", "views", "engagement", "audience", "rates"])) }),
  z.object({ action: z.literal("links"), links: z.array(z.object({ label: z.string().trim().min(1).max(40), url })).max(10) }),
  z.object({ action: z.literal("agent"), agentLevel: z.enum(["manual", "copilot", "delegate"]), minRateCents: z.number().int().min(0).max(100_000_000), counterRangePct: z.number().int().min(0).max(50), maxMonthlyDeals: z.number().int().min(1).max(100), blockedBrands: z.array(z.string().trim().max(80)).max(30), openTo: z.array(z.enum(REQUEST_TYPES)).min(1) }),
  z.object({ action: z.literal("rate_save"), id: z.string().uuid().optional(), label: z.string().trim().min(2).max(60), deliverable: z.enum(["reel", "story", "post", "short", "video", "tiktok", "ugc", "live", "event"]), priceCents: z.number().int().min(100).max(100_000_000) }),
  z.object({ action: z.literal("rate_remove"), id: z.string().uuid() }),
  z.object({ action: z.literal("showcase_add"), kind: z.enum(["collab", "press"]), title: z.string().trim().min(2).max(100), brandName: z.string().trim().max(80).optional(), url: url.optional() }),
  z.object({ action: z.literal("showcase_remove"), id: z.string().uuid() }),
  z.object({ action: z.literal("manager_revoke"), id: z.string().uuid() }),
  z.object({ action: z.literal("verify"), platform: z.enum(["instagram", "tiktok", "youtube"]) }),
]);

export const POST = route(async (req) => {
  const user = await apiUser();
  const db = await getDb();
  const a = Action.parse(await body(req));
  const creatorOnly = () => {
    if (user.role !== "creator") throw new HttpError(403, "This is for creator accounts.");
  };
  switch (a.action) {
    case "profile":
      creatorOnly();
      await db.update(s.creatorProfiles).set({ displayName: a.displayName, headline: a.headline, bio: a.bio, kitPublic: a.kitPublic, hiddenStats: a.hiddenStats, updatedAt: new Date() }).where(eq(s.creatorProfiles.userId, user.id));
      await db.update(s.users).set({ name: a.displayName }).where(eq(s.users.id, user.id));
      return { ok: true };
    case "links":
      creatorOnly();
      await db.update(s.creatorProfiles).set({ links: a.links }).where(eq(s.creatorProfiles.userId, user.id));
      return { ok: true };
    case "agent":
      creatorOnly();
      await db.update(s.creatorProfiles).set({ agentLevel: a.agentLevel, minRateCents: a.minRateCents, counterRangePct: a.counterRangePct, maxMonthlyDeals: a.maxMonthlyDeals, blockedBrands: a.blockedBrands, openTo: a.openTo }).where(eq(s.creatorProfiles.userId, user.id));
      return { ok: true };
    case "rate_save":
      creatorOnly();
      if (a.id) await db.update(s.rateCardItems).set({ label: a.label, deliverable: a.deliverable, priceCents: a.priceCents }).where(and(eq(s.rateCardItems.id, a.id), eq(s.rateCardItems.userId, user.id)));
      else await db.insert(s.rateCardItems).values({ userId: user.id, label: a.label, deliverable: a.deliverable, priceCents: a.priceCents, position: 99 });
      return { ok: true };
    case "rate_remove":
      await db.delete(s.rateCardItems).where(and(eq(s.rateCardItems.id, a.id), eq(s.rateCardItems.userId, user.id)));
      return { ok: true };
    case "showcase_add":
      creatorOnly();
      await db.insert(s.showcaseItems).values({ userId: user.id, kind: a.kind, title: a.title, brandName: a.brandName ?? null, url: a.url ?? null, verification: "self_reported" });
      return { ok: true };
    case "showcase_remove":
      await db.delete(s.showcaseItems).where(and(eq(s.showcaseItems.id, a.id), eq(s.showcaseItems.userId, user.id)));
      return { ok: true };
    case "verify":
      creatorOnly();
      return verifyAccount(db, user.id, a.platform);
    case "manager_revoke":
      await db.update(s.managerLinks).set({ status: "revoked" }).where(and(eq(s.managerLinks.id, a.id), eq(s.managerLinks.creatorId, user.id)));
      return { ok: true };
  }
});

// Your data travels with you: everything EVRA holds about you, as JSON.
export const GET = route(async () => {
  const user = await apiUser();
  const db = await getDb();
  const [profile, accounts, rateCard, showcase, deals, requests, agent] = await Promise.all([
    db.select().from(s.creatorProfiles).where(eq(s.creatorProfiles.userId, user.id)),
    db.select().from(s.socialAccounts).where(eq(s.socialAccounts.userId, user.id)),
    db.select().from(s.rateCardItems).where(eq(s.rateCardItems.userId, user.id)),
    db.select().from(s.showcaseItems).where(eq(s.showcaseItems.userId, user.id)),
    db.select().from(s.deals).where(eq(s.deals.creatorId, user.id)),
    db.select().from(s.requests).where(eq(s.requests.toCreatorId, user.id)),
    db.select().from(s.agentActions).where(eq(s.agentActions.userId, user.id)),
  ]);
  const me = { ...user, staff: undefined };
  return new Response(JSON.stringify({ exportedAt: new Date().toISOString(), user: me, profile, accounts, rateCard, showcase, deals, requests, agentActions: agent }, null, 2), {
    headers: { "content-type": "application/json", "content-disposition": `attachment; filename="evra-${user.handle ?? user.id}.json"` },
  });
});
