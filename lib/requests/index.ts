import { and, asc, desc, eq, gt, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { HttpError } from "@/lib/auth/guards";
import { sha256, token } from "@/lib/crypto";
import { createDeal, defaultTerms } from "@/lib/deals/create";
import { send } from "@/lib/messages";
import { requestStrings } from "@/lib/i18n/requests";
import { DECLINE_REASONS, REQUEST_DELIVERABLES, REQUEST_TYPES, isFunded } from "./types";

export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type Plan = (typeof s.brands.$inferSelect)["plan"];
export type RequestRow = typeof s.requests.$inferSelect;

export const MONTHLY_CREDITS: Record<Plan, number> = { pay_per_deal: 5, growth: 50, scale: 200, agency: 1000 };
export const REPLY_LINK_DAYS = 14;
export const DECLINE_K = 3;
const DAY = 86_400_000;

const monthStart = (d: Date, add = 0) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + add, 1));

// Allowance resets on the 1st (UTC). Spends are -1 ledger rows; a top-up pack would be a positive row.
export async function creditBalance(db: DB | Tx, brand: { id: string; plan: Plan }, now = new Date()) {
  const [row] = await db
    .select({ net: sql<number>`coalesce(sum(${s.creditLedger.delta}), 0)`.mapWith(Number) })
    .from(s.creditLedger)
    .where(and(eq(s.creditLedger.brandId, brand.id), gte(s.creditLedger.createdAt, monthStart(now))));
  const allowance = MONTHLY_CREDITS[brand.plan];
  return { allowance, left: Math.max(0, allowance + row.net), renewsOn: monthStart(now, 1) };
}

export const RequestInput = z.object({
  creatorId: z.uuid(),
  type: z.enum(REQUEST_TYPES),
  message: z.string().trim().min(10, "Write at least a sentence.").max(1000),
  amountCents: z.number().int().min(0).max(100_000_000).optional(),
  details: z
    .object({
      deliverable: z.enum(REQUEST_DELIVERABLES).optional(),
      product: z.string().trim().max(120).optional(),
      date: z.string().trim().max(40).optional(),
      place: z.string().trim().max(120).optional(),
      minutes: z.number().int().min(5).max(240).optional(),
      postUrl: z.url().max(300).optional(),
      months: z.number().int().min(1).max(36).optional(),
    })
    .default({}),
});
export type RequestInput = z.infer<typeof RequestInput>;

export async function createReplyLink(db: DB, requestId: string, userId: string, now = new Date()) {
  const raw = token(24);
  // Only the hash is stored; the link opens this one request and carries no personal data.
  await db.insert(s.replyLinks).values({ tokenHash: sha256(raw), requestId, userId, expiresAt: new Date(now.getTime() + REPLY_LINK_DAYS * DAY) });
  return raw;
}

export async function sendRequest(db: DB, o: { userId: string; brand: { id: string; name: string; plan: Plan }; input: RequestInput; origin: string; now?: Date }) {
  const now = o.now ?? new Date();
  const { input } = o;
  const [creator] = await db
    .select({ name: s.creatorProfiles.displayName, openTo: s.creatorProfiles.openTo, email: s.users.email, locale: s.users.locale })
    .from(s.creatorProfiles)
    .innerJoin(s.users, eq(s.users.id, s.creatorProfiles.userId))
    .where(and(eq(s.creatorProfiles.userId, input.creatorId), eq(s.users.role, "creator")))
    .limit(1);
  if (!creator) throw new HttpError(404, "We couldn't find that creator.");
  if (!creator.openTo.includes(input.type)) throw new HttpError(400, `${creator.name} isn't taking ${requestStrings("en").nouns[input.type]} requests.`);
  const funded = isFunded(input.type, input.amountCents);

  const request = await db.transaction(async (tx) => {
    // Lock the brand row so two sends can't both spend the last credit or both pass the duplicate check.
    await tx.select({ id: s.brands.id }).from(s.brands).where(eq(s.brands.id, o.brand.id)).for("update");
    const [dupe] = await tx
      .select({ id: s.requests.id })
      .from(s.requests)
      .where(and(eq(s.requests.fromBrandId, o.brand.id), eq(s.requests.toCreatorId, input.creatorId), eq(s.requests.type, input.type), eq(s.requests.status, "open")))
      .limit(1);
    if (dupe) throw new HttpError(409, `You already have an open ${requestStrings("en").nouns[input.type]} request with ${creator.name}.`);
    if (!funded) {
      const { left, allowance, renewsOn } = await creditBalance(tx, o.brand, now);
      if (left < 1)
        throw new HttpError(
          402,
          `You've used all ${allowance} request credits this month. They renew on ${renewsOn.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" })}. Funded offers never use credits: add an amount to a paid collab.`,
        );
    }
    const [r] = await tx
      .insert(s.requests)
      .values({ type: input.type, fromUserId: o.userId, fromBrandId: o.brand.id, toCreatorId: input.creatorId, message: input.message, amountCents: input.amountCents || null, details: input.details, funded, creditsSpent: funded ? 0 : 1, createdAt: now })
      .returning();
    if (!funded) await tx.insert(s.creditLedger).values({ brandId: o.brand.id, delta: -1, reason: `request:${input.type}`, requestId: r.id, createdAt: now });
    return r;
  });

  // The creator, plus any active manager whose copy rules include this type, each get their own single-use link.
  const managers = await db
    .select({ userId: s.users.id, email: s.managerLinks.managerEmail, copyTypes: s.managerLinks.copyTypes, locale: s.users.locale })
    .from(s.managerLinks)
    .innerJoin(s.users, eq(s.users.id, s.managerLinks.managerUserId))
    .where(and(eq(s.managerLinks.creatorId, input.creatorId), eq(s.managerLinks.status, "active")));
  const recipients = [{ userId: input.creatorId, email: creator.email, locale: creator.locale }, ...managers.filter((m) => m.copyTypes.includes(input.type))];
  for (const p of recipients) {
    const raw = await createReplyLink(db, request.id, p.userId, now);
    await send(db, { to: p.email, template: "request_new", locale: p.locale, data: { from: o.brand.name, type: requestStrings(p.locale).nouns[input.type], url: `${o.origin}/reply/${raw}` } });
  }
  return request;
}

// A link works for the creator, or for a manager only while the creator still has them as an active manager.
async function mayAnswer(db: DB | Tx, creatorId: string, userId: string) {
  if (userId === creatorId) return true;
  const [m] = await db
    .select({ id: s.managerLinks.id })
    .from(s.managerLinks)
    .where(and(eq(s.managerLinks.creatorId, creatorId), eq(s.managerLinks.managerUserId, userId), eq(s.managerLinks.status, "active")))
    .limit(1);
  return !!m;
}

export async function readReplyLink(db: DB, raw: string, now = new Date()) {
  const [row] = await db
    .select({ link: s.replyLinks, request: s.requests, brand: s.brands.name })
    .from(s.replyLinks)
    .innerJoin(s.requests, eq(s.requests.id, s.replyLinks.requestId))
    .leftJoin(s.brands, eq(s.brands.id, s.requests.fromBrandId))
    .where(eq(s.replyLinks.tokenHash, sha256(raw)))
    .limit(1);
  if (!row) return { state: "invalid" as const };
  if (row.link.usedAt || row.request.status !== "open") return { state: "answered" as const };
  if (row.link.expiresAt <= now || !(await mayAnswer(db, row.request.toCreatorId, row.link.userId))) return { state: "expired" as const };
  return { state: "open" as const, request: row.request, brandName: row.brand ?? "A brand" };
}

export const AnswerInput = z.discriminatedUnion("decision", [z.object({ decision: z.literal("accept") }), z.object({ decision: z.literal("decline"), reason: z.enum(DECLINE_REASONS) })]);
export type AnswerInput = z.infer<typeof AnswerInput>;

// One answer per request: from the inbox (signed in) or a reply link (single use). Accepting a paid collab opens a Deal Room.
export async function answerRequest(db: DB, o: { by: { userId: string; requestId: string } | { token: string }; answer: AnswerInput; origin: string; now?: Date }) {
  const now = o.now ?? new Date();
  const accepted = o.answer.decision === "accept";
  const out = await db.transaction(async (tx) => {
    let requestId: string;
    let creatorCheck = sql`true`;
    if ("token" in o.by) {
      const [link] = await tx
        .update(s.replyLinks)
        .set({ usedAt: now })
        .where(and(eq(s.replyLinks.tokenHash, sha256(o.by.token)), isNull(s.replyLinks.usedAt), gt(s.replyLinks.expiresAt, now)))
        .returning();
      if (!link) throw new HttpError(410, "This link was already used or has expired.");
      requestId = link.requestId;
      const [target] = await tx.select({ creatorId: s.requests.toCreatorId }).from(s.requests).where(eq(s.requests.id, requestId));
      if (!target || !(await mayAnswer(tx, target.creatorId, link.userId))) throw new HttpError(410, "This link no longer works.");
    } else {
      requestId = o.by.requestId;
      creatorCheck = sql`${s.requests.toCreatorId} = ${o.by.userId}`;
    }
    const [r] = await tx
      .update(s.requests)
      .set({ status: accepted ? "accepted" : "declined", declineReason: o.answer.decision === "decline" ? o.answer.reason : null, respondedAt: now })
      .where(and(eq(s.requests.id, requestId), eq(s.requests.status, "open"), creatorCheck))
      .returning();
    if (!r) throw new HttpError(409, "This request was already answered.");
    const [names] = await tx.select({ creator: s.creatorProfiles.displayName, minRate: s.creatorProfiles.minRateCents }).from(s.creatorProfiles).where(eq(s.creatorProfiles.userId, r.toCreatorId));
    if (!accepted || r.type !== "paid_collab" || !r.fromBrandId) return { request: r, creatorName: names.creator, dealId: null };
    const [brand] = await tx.select({ name: s.brands.name }).from(s.brands).where(eq(s.brands.id, r.fromBrandId));

    // No amount means the brand asked for a quote: the creator's Reel price (or minimum) becomes the first offer.
    const [reel] = await tx
      .select({ price: s.rateCardItems.priceCents })
      .from(s.rateCardItems)
      .where(and(eq(s.rateCardItems.userId, r.toCreatorId), eq(s.rateCardItems.deliverable, "reel")))
      .orderBy(asc(s.rateCardItems.position))
      .limit(1);
    const deliverable = (r.details.deliverable as (typeof REQUEST_DELIVERABLES)[number] | undefined) ?? "reel";
    // createDeal only inserts and updates, which a transaction supports; the cast keeps it inside this transaction.
    const deal = await createDeal(tx as unknown as DB, {
      brandId: r.fromBrandId,
      creatorId: r.toCreatorId,
      title: `${brand?.name ?? "Brand"} × ${names.creator}`,
      terms: defaultTerms({ totalCents: r.amountCents || reel?.price || names.minRate, deliverables: [{ type: deliverable, count: 1 }] }),
      proposedBy: r.amountCents ? r.fromUserId : r.toCreatorId,
      side: r.amountCents ? "brand" : "creator",
      requestId: r.id,
    });
    const [converted] = await tx.update(s.requests).set({ status: "converted", dealId: deal.id }).where(eq(s.requests.id, r.id)).returning();
    return { request: converted, creatorName: names.creator, dealId: deal.id as string | null };
  });

  if (accepted) {
    const [sender] = await db.select({ email: s.users.email, locale: s.users.locale }).from(s.users).where(eq(s.users.id, out.request.fromUserId));
    if (sender) {
      const t = requestStrings(sender.locale);
      await send(db, {
        to: sender.email,
        template: "deal_update",
        locale: sender.locale,
        data: out.dealId
          ? { title: t.notify.acceptedTitle(out.creatorName), what: t.notify.dealOpen(out.creatorName), url: `${o.origin}/deals/${out.dealId}` }
          : { title: t.notify.acceptedTitle(out.creatorName), what: t.notify.accepted(out.creatorName, t.nouns[out.request.type as keyof typeof t.nouns] ?? out.request.type), url: `${o.origin}/brand` },
      });
    }
  }
  return out;
}

// "Why creators said no": a reason shows only once DECLINE_K different creators gave it in 90 days, and never with names.
export async function declineReasons(db: DB, brandId: string, now = new Date()) {
  const rows = await db
    .select({ reason: s.requests.declineReason, creators: sql<number>`count(distinct ${s.requests.toCreatorId})`.mapWith(Number) })
    .from(s.requests)
    .where(and(eq(s.requests.fromBrandId, brandId), eq(s.requests.status, "declined"), isNotNull(s.requests.declineReason), gte(s.requests.respondedAt, new Date(now.getTime() - 90 * DAY))))
    .groupBy(s.requests.declineReason);
  return rows
    .filter((r) => r.creators >= DECLINE_K)
    .map((r) => ({ reason: r.reason!, creators: r.creators }))
    .sort((a, b) => b.creators - a.creators);
}

export async function requestsForCreator(db: DB, creatorId: string, now = new Date()) {
  const rows = await db
    .select({ request: s.requests, brand: s.brands.name })
    .from(s.requests)
    .leftJoin(s.brands, eq(s.brands.id, s.requests.fromBrandId))
    .where(eq(s.requests.toCreatorId, creatorId))
    .orderBy(desc(s.requests.createdAt))
    .limit(100);
  // Open requests close on day 7 (see lib/jobs/requests.ts).
  return rows.map((r) => ({ ...r, closesInDays: Math.max(1, Math.ceil((r.request.createdAt.getTime() + 7 * DAY - now.getTime()) / DAY)) }));
}

export async function requestsFromBrand(db: DB, brandId: string) {
  return db
    .select({ request: s.requests, creator: s.creatorProfiles.displayName, handle: s.users.handle })
    .from(s.requests)
    .innerJoin(s.users, eq(s.users.id, s.requests.toCreatorId))
    .leftJoin(s.creatorProfiles, eq(s.creatorProfiles.userId, s.requests.toCreatorId))
    .where(eq(s.requests.fromBrandId, brandId))
    .orderBy(desc(s.requests.createdAt))
    .limit(100);
}

export async function emailsFor(db: DB, userIds: string[]) {
  if (!userIds.length) return new Map<string, { email: string; locale: s.Locale }>();
  const rows = await db.select({ id: s.users.id, email: s.users.email, locale: s.users.locale }).from(s.users).where(inArray(s.users.id, userIds));
  return new Map(rows.map((r) => [r.id, r]));
}
