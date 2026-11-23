import { and, count, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { HttpError } from "@/lib/auth/guards";
import type { User } from "@/lib/auth/session";
import { brandForUser } from "@/lib/brands";
import { formatMoney } from "@/lib/money";
import { defaultTerms } from "@/lib/deals/create";
import { send } from "@/lib/messages";

export const ChallengeInput = z.object({
  title: z.string().trim().min(3).max(80),
  brief: z.string().trim().min(20).max(2000),
  pricePerEntryCents: z.number().int().min(1_000).max(500_000),
  slots: z.number().int().min(1).max(200),
  perCreatorCap: z.number().int().min(1).max(10).default(1),
});

export async function createChallenge(db: DB, user: User, input: z.infer<typeof ChallengeInput>) {
  const brand = await brandForUser(db, user.id);
  if (!brand) throw new HttpError(403, "Only brands can open challenges.");
  const [c] = await db.insert(s.challenges).values({ brandId: brand.id, ...input }).returning();
  return c;
}

export async function listChallenges(db: DB) {
  const rows = await db.select({ c: s.challenges, brand: s.brands.name }).from(s.challenges).innerJoin(s.brands, eq(s.brands.id, s.challenges.brandId)).orderBy(desc(s.challenges.createdAt)).limit(50);
  const ids = rows.map((r) => r.c.id);
  const paid = ids.length ? await db.select({ id: s.challengeEntries.challengeId, n: count() }).from(s.challengeEntries).where(and(inArray(s.challengeEntries.challengeId, ids), eq(s.challengeEntries.status, "paid"))).groupBy(s.challengeEntries.challengeId) : [];
  const paidBy = new Map(paid.map((p) => [p.id, p.n]));
  return rows.map((r) => ({ ...r.c, brand: r.brand, paid: paidBy.get(r.c.id) ?? 0, left: r.c.slots - (paidBy.get(r.c.id) ?? 0) }));
}

export async function challengeView(db: DB, user: User, id: string) {
  const [row] = await db.select({ c: s.challenges, brand: s.brands.name }).from(s.challenges).innerJoin(s.brands, eq(s.brands.id, s.challenges.brandId)).where(eq(s.challenges.id, id)).limit(1);
  if (!row) return null;
  const mine = (await brandForUser(db, user.id))?.id === row.c.brandId;
  // The brand sees every entry; a creator sees only their own.
  const entries = await db
    .select({ e: s.challengeEntries, name: s.users.name, handle: s.users.handle })
    .from(s.challengeEntries)
    .innerJoin(s.users, eq(s.users.id, s.challengeEntries.creatorId))
    .where(and(eq(s.challengeEntries.challengeId, id), mine ? undefined : eq(s.challengeEntries.creatorId, user.id)))
    .orderBy(desc(s.challengeEntries.createdAt));
  const [{ paid }] = await db.select({ paid: count() }).from(s.challengeEntries).where(and(eq(s.challengeEntries.challengeId, id), eq(s.challengeEntries.status, "paid")));
  return { ...row.c, brand: row.brand, mine, left: row.c.slots - paid, entries };
}

export async function submitEntry(db: DB, user: User, challengeId: string, url: string) {
  if (user.role !== "creator") throw new HttpError(403, "Only creators can enter.");
  if (!/^https?:\/\//.test(url)) throw new HttpError(400, "Paste a full link that starts with https://");
  const [c] = await db.select().from(s.challenges).where(eq(s.challenges.id, challengeId)).limit(1);
  if (!c || c.status !== "open") throw new HttpError(409, "This challenge is closed.");
  const [{ mine }] = await db.select({ mine: count() }).from(s.challengeEntries).where(and(eq(s.challengeEntries.challengeId, c.id), eq(s.challengeEntries.creatorId, user.id), inArray(s.challengeEntries.status, ["submitted", "approved", "paid"])));
  if (mine >= c.perCreatorCap) throw new HttpError(409, `You can enter this challenge ${c.perCreatorCap === 1 ? "once" : `${c.perCreatorCap} times`}.`);
  const [e] = await db.insert(s.challengeEntries).values({ challengeId: c.id, creatorId: user.id, url }).returning();
  return e;
}

// Approving an entry records a completed one-step deal for it; the brand pays the creator directly.
export async function approveEntry(db: DB, user: User, entryId: string) {
  const [e] = await db.select().from(s.challengeEntries).where(eq(s.challengeEntries.id, entryId)).limit(1);
  if (!e || e.status !== "submitted") throw new HttpError(409, "This entry was already reviewed.");
  const [c] = await db.select().from(s.challenges).where(eq(s.challenges.id, e.challengeId)).limit(1);
  const brand = await brandForUser(db, user.id);
  if (!brand || brand.id !== c.brandId) throw new HttpError(404, "Challenge not found.");
  const [{ paid }] = await db.select({ paid: count() }).from(s.challengeEntries).where(and(eq(s.challengeEntries.challengeId, c.id), eq(s.challengeEntries.status, "paid")));
  if (paid >= c.slots) throw new HttpError(409, "All paid slots are used. Add slots to approve more.");

  // The work already exists when it's approved, so there's nothing to cancel and no kill fee.
  const terms = { ...defaultTerms({ totalCents: c.pricePerEntryCents, deliverables: [{ type: "ugc", count: 1 }] }), killFeeBps: 0 };
  const now = new Date();
  const [deal] = await db.insert(s.deals).values({ brandId: c.brandId, creatorId: e.creatorId, title: `${c.title}: challenge entry`, status: "completed", agreedHash: "challenge", fundedAt: now }).returning();
  const [t] = await db.insert(s.dealTerms).values({ dealId: deal.id, version: 1, proposedBy: user.id, proposedBySide: "brand", terms }).returning();
  await db.update(s.deals).set({ currentTermsId: t.id }).where(eq(s.deals.id, deal.id));
  await db.insert(s.milestones).values({ dealId: deal.id, idx: 0, title: "Approved challenge entry", amountCents: c.pricePerEntryCents, status: "released", submittedAt: e.createdAt, releasedAt: now });
  await db.insert(s.dealEvents).values({ dealId: deal.id, actorId: user.id, actorKind: "brand", kind: "released", data: { idx: 0, amountCents: c.pricePerEntryCents } });
  await db.update(s.challengeEntries).set({ status: "paid", dealId: deal.id }).where(eq(s.challengeEntries.id, e.id));
  if (paid + 1 >= c.slots) await db.update(s.challenges).set({ status: "closed" }).where(eq(s.challenges.id, c.id));
  const [creator] = await db.select({ email: s.users.email, locale: s.users.locale }).from(s.users).where(eq(s.users.id, e.creatorId)).limit(1);
  await send(db, { to: creator.email, template: "deal_update", locale: creator.locale, data: { title: c.title, what: `Your entry was approved. The brand pays you ${formatMoney(c.pricePerEntryCents)} directly.`, url: `${process.env.APP_ORIGIN ?? "http://localhost:3000"}/deals/${deal.id}` } });
  return { dealId: deal.id };
}

export async function rejectEntry(db: DB, user: User, entryId: string) {
  const [e] = await db.select().from(s.challengeEntries).where(eq(s.challengeEntries.id, entryId)).limit(1);
  if (!e || e.status !== "submitted") throw new HttpError(409, "This entry was already reviewed.");
  const [c] = await db.select().from(s.challenges).where(eq(s.challenges.id, e.challengeId)).limit(1);
  const brand = await brandForUser(db, user.id);
  if (!brand || brand.id !== c.brandId) throw new HttpError(404, "Challenge not found.");
  await db.update(s.challengeEntries).set({ status: "rejected" }).where(eq(s.challengeEntries.id, e.id));
}
