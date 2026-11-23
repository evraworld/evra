import { and, eq } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { brandMembers, brands, deals, users } from "@/lib/db/schema";
import { HttpError, isStaff } from "@/lib/auth/guards";
import type { User } from "@/lib/auth/session";
import { send } from "@/lib/messages";

export type Side = "brand" | "creator" | "staff";
export type Deal = typeof deals.$inferSelect;
export type DealCtx = { deal: Deal; side: Side; user: User };

// Someone outside the deal gets a 404, so deal ids can't be probed.
export async function dealAccess(db: DB, dealId: string, user: User): Promise<DealCtx> {
  const [deal] = await db.select().from(deals).where(eq(deals.id, dealId)).limit(1);
  if (!deal) throw new HttpError(404, "This deal doesn't exist.");
  if (deal.creatorId === user.id) return { deal, side: "creator", user };
  const [m] = await db.select().from(brandMembers).where(and(eq(brandMembers.brandId, deal.brandId), eq(brandMembers.userId, user.id))).limit(1);
  if (m) return { deal, side: "brand", user };
  if (isStaff(user)) return { deal, side: "staff", user };
  throw new HttpError(404, "This deal doesn't exist.");
}

export function requireSide(ctx: DealCtx, side: "brand" | "creator") {
  if (ctx.side !== side) throw new HttpError(403, side === "brand" ? "Only the brand can do this." : "Only the creator can do this.");
}

export async function partyEmails(db: DB, deal: Deal, side: "brand" | "creator") {
  if (side === "creator") return db.select({ email: users.email, locale: users.locale }).from(users).where(eq(users.id, deal.creatorId));
  return db.select({ email: users.email, locale: users.locale }).from(brandMembers).innerJoin(users, eq(users.id, brandMembers.userId)).where(eq(brandMembers.brandId, deal.brandId));
}

export async function notify(db: DB, deal: Deal, to: "brand" | "creator", what: string) {
  const origin = process.env.APP_ORIGIN ?? "http://localhost:3000";
  for (const p of await partyEmails(db, deal, to)) await send(db, { to: p.email, template: "deal_update", locale: p.locale, data: { title: deal.title, what, url: `${origin}/deals/${deal.id}` } });
}

export async function brandName(db: DB, brandId: string) {
  const [b] = await db.select({ name: brands.name }).from(brands).where(eq(brands.id, brandId)).limit(1);
  return b?.name ?? "The brand";
}
