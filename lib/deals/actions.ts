import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { DB } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { HttpError } from "@/lib/auth/guards";
import type { User } from "@/lib/auth/session";
import { feeCents, formatMoney } from "@/lib/money";
import { brandName, notify, requireSide, type DealCtx } from "./access";
import { diffTerms, termsHash, termsTotal, TermsSchema } from "./terms";
import { brandForUser } from "@/lib/brands";

async function event(db: DB, dealId: string, actor: { id: string | null; kind: "brand" | "creator" | "agent" | "system" | "staff" }, kind: string, data: Record<string, unknown> = {}) {
  await db.insert(s.dealEvents).values({ dealId, actorId: actor.id, actorKind: actor.kind, kind, data });
}

export async function currentTerms(db: DB, deal: { currentTermsId: string | null }) {
  if (!deal.currentTermsId) throw new HttpError(409, "This deal has no terms yet.");
  const [t] = await db.select().from(s.dealTerms).where(eq(s.dealTerms.id, deal.currentTermsId)).limit(1);
  return t;
}

const touch = (db: DB, dealId: string, set: Partial<typeof s.deals.$inferInsert>) => db.update(s.deals).set({ ...set, updatedAt: new Date() }).where(eq(s.deals.id, dealId));

export async function counter(db: DB, ctx: DealCtx, input: unknown, opts: { side?: "agent" } = {}) {
  if (ctx.side === "staff") throw new HttpError(403, "Staff can't change terms.");
  if (!["negotiating", "agreed"].includes(ctx.deal.status)) throw new HttpError(409, "Terms are locked once work starts.");
  const terms = TermsSchema.parse(input) as s.Terms;
  const prev = await currentTerms(db, ctx.deal);
  const [next] = await db
    .insert(s.dealTerms)
    .values({ dealId: ctx.deal.id, version: prev.version + 1, proposedBy: ctx.user.id, proposedBySide: opts.side ?? ctx.side, terms })
    .returning();
  await touch(db, ctx.deal.id, { currentTermsId: next.id, status: "negotiating", agreedHash: null });
  const changes = diffTerms(prev.terms, terms);
  await event(db, ctx.deal.id, { id: ctx.user.id, kind: opts.side ?? ctx.side }, "counter", { version: next.version, changes });
  await notify(db, ctx.deal, ctx.side === "brand" ? "creator" : "brand", `New terms to review: ${changes.join("; ") || "details updated"}.`);
  return next;
}

export async function slotsTaken(db: DB, opportunityId: string) {
  const rows = await db.select({ id: s.deals.id }).from(s.deals).where(and(eq(s.deals.opportunityId, opportunityId), inArray(s.deals.status, ["agreed", "active", "completed", "disputed"])));
  return rows.length;
}

export async function approveTerms(db: DB, ctx: DealCtx) {
  if (ctx.side === "staff") throw new HttpError(403, "Staff can't approve terms.");
  if (!["negotiating", "agreed"].includes(ctx.deal.status)) throw new HttpError(409, "These terms are already locked.");
  const t = await currentTerms(db, ctx.deal);
  const hash = termsHash(t.terms);
  await db.insert(s.dealApprovals).values({ termsId: t.id, side: ctx.side, userId: ctx.user.id, hash }).onConflictDoNothing();
  await event(db, ctx.deal.id, { id: ctx.user.id, kind: ctx.side }, "approved_terms", { version: t.version, hash });
  const approvals = await db.select().from(s.dealApprovals).where(eq(s.dealApprovals.termsId, t.id));
  if (approvals.length < 2 || !approvals.every((a) => a.hash === hash)) {
    await notify(db, ctx.deal, ctx.side === "brand" ? "creator" : "brand", "The other side approved these terms. Your yes locks them.");
    return { agreed: false };
  }
  // A brief takes only as many creators as it has slots; the last agreement closes it.
  let opp: typeof s.opportunities.$inferSelect | undefined;
  if (ctx.deal.opportunityId) {
    [opp] = await db.select().from(s.opportunities).where(eq(s.opportunities.id, ctx.deal.opportunityId)).limit(1);
    if (opp && (await slotsTaken(db, opp.id)) >= opp.slots) throw new HttpError(409, "This brief's creator slots are already filled.");
  }
  await touch(db, ctx.deal.id, { status: "agreed", agreedHash: hash });
  if (opp && (await slotsTaken(db, opp.id)) >= opp.slots) await db.update(s.opportunities).set({ status: "closed" }).where(eq(s.opportunities.id, opp.id));
  await db.delete(s.milestones).where(eq(s.milestones.dealId, ctx.deal.id));
  await db.insert(s.milestones).values(t.terms.milestones.map((m, idx) => ({ dealId: ctx.deal.id, idx, title: m.title, amountCents: m.amountCents })));
  await event(db, ctx.deal.id, { id: null, kind: "system" }, "agreed", { hash });
  await notify(db, ctx.deal, "brand", `Both sides agreed on ${formatMoney(termsTotal(t.terms))}. Start the work in the Deal Room.`);
  return { agreed: true };
}

// The brand starts the work and pays the creator directly, outside EVRA. EVRA keeps the record.
export async function startWork(db: DB, ctx: DealCtx) {
  requireSide(ctx, "brand");
  if (ctx.deal.status !== "agreed") throw new HttpError(409, "Both sides must agree the terms before work starts.");
  const total = termsTotal((await currentTerms(db, ctx.deal)).terms);
  await touch(db, ctx.deal.id, { status: "active", fundedAt: new Date() });
  await event(db, ctx.deal.id, { id: ctx.user.id, kind: "brand" }, "work_started", { payment: "outside_evra", totalCents: total });
  await notify(db, ctx.deal, "creator", `${await brandName(db, ctx.deal.brandId)} started the work. They pay you ${formatMoney(total)} directly, as written in the terms.`);
}

async function milestone(db: DB, dealId: string, idx: number) {
  const [m] = await db.select().from(s.milestones).where(and(eq(s.milestones.dealId, dealId), eq(s.milestones.idx, idx))).limit(1);
  if (!m) throw new HttpError(404, "That payment step doesn't exist.");
  return m;
}

const isUrl = (u: string) => {
  try {
    return ["http:", "https:"].includes(new URL(u).protocol);
  } catch {
    return false;
  }
};

export async function submitWork(db: DB, ctx: DealCtx, p: { idx: number; url: string; note?: string; kind: "draft" | "live" }) {
  requireSide(ctx, "creator");
  if (ctx.deal.status !== "active") throw new HttpError(409, "Work can be sent once the brand starts the work.");
  if (!isUrl(p.url)) throw new HttpError(400, "Paste a full link that starts with https://");
  const m = await milestone(db, ctx.deal.id, p.idx);
  if (!["pending", "submitted"].includes(m.status)) throw new HttpError(409, "This step is already closed.");
  const t = await currentTerms(db, ctx.deal);
  await db.insert(s.submissions).values({ dealId: ctx.deal.id, milestoneIdx: p.idx, kind: p.kind, url: p.url, note: p.note ?? null, createdBy: ctx.user.id });
  const now = new Date();
  await db
    .update(s.milestones)
    .set({ status: "submitted", submittedAt: m.submittedAt ?? now, reviewDueAt: new Date(now.getTime() + t.terms.reviewDays * 86_400_000), liveUrl: p.kind === "live" ? p.url : m.liveUrl })
    .where(eq(s.milestones.id, m.id));
  await touch(db, ctx.deal.id, {});
  await event(db, ctx.deal.id, { id: ctx.user.id, kind: "creator" }, p.kind === "live" ? "posted_live" : "submitted_draft", { idx: p.idx, url: p.url });
  await notify(db, ctx.deal, "brand", `${p.kind === "live" ? "The post is live" : "A draft is ready"} for "${m.title}". Approve within ${t.terms.reviewDays} days or it's approved automatically.`);
}

export async function requestChanges(db: DB, ctx: DealCtx, p: { idx: number; comment: string }) {
  requireSide(ctx, "brand");
  const m = await milestone(db, ctx.deal.id, p.idx);
  if (m.status !== "submitted") throw new HttpError(409, "There's nothing to review on this step yet.");
  const t = await currentTerms(db, ctx.deal);
  if (m.revisionsUsed >= t.terms.revisions) throw new HttpError(409, `You've used all ${t.terms.revisions} revisions in the terms. Approve the work, or open a dispute.`);
  if (p.comment.trim().length < 3) throw new HttpError(400, "Say what should change.");
  await db.update(s.milestones).set({ status: "pending", revisionsUsed: m.revisionsUsed + 1, reviewDueAt: null }).where(eq(s.milestones.id, m.id));
  await db.insert(s.dealComments).values({ dealId: ctx.deal.id, userId: ctx.user.id, body: p.comment.trim() });
  await event(db, ctx.deal.id, { id: ctx.user.id, kind: "brand" }, "changes_requested", { idx: p.idx, revision: m.revisionsUsed + 1, of: t.terms.revisions });
  await notify(db, ctx.deal, "creator", `Changes requested on "${m.title}" (revision ${m.revisionsUsed + 1} of ${t.terms.revisions}): ${p.comment.trim()}`);
}

async function releaseInternal(db: DB, deal: typeof s.deals.$inferSelect, idx: number, actor: { id: string | null; kind: "brand" | "system" }) {
  const m = await milestone(db, deal.id, idx);
  if (!["pending", "submitted"].includes(m.status)) throw new HttpError(409, "This step is already approved or closed.");
  await db.update(s.milestones).set({ status: "released", releasedAt: new Date() }).where(eq(s.milestones.id, m.id));
  await event(db, deal.id, actor, actor.kind === "system" ? "auto_released" : "released", { idx, amountCents: m.amountCents });
  await notify(db, deal, "creator", `Approved: "${m.title}". The brand pays you ${formatMoney(m.amountCents)} directly, as agreed.`);
  await maybeComplete(db, deal);
}

export async function approveMilestone(db: DB, ctx: DealCtx, p: { idx: number; liveConfirmed?: boolean }) {
  requireSide(ctx, "brand");
  if (!["active", "disputed"].includes(ctx.deal.status)) throw new HttpError(409, "This deal has no work in progress to approve.");
  const all = await db.select().from(s.milestones).where(eq(s.milestones.dealId, ctx.deal.id));
  const isLast = p.idx === Math.max(...all.map((m) => m.idx));
  if (isLast && !p.liveConfirmed) throw new HttpError(400, "Confirm the post is live and carries the disclosure before the final payment.");
  return releaseInternal(db, ctx.deal, p.idx, { id: ctx.user.id, kind: "brand" });
}

// Job: a brand that stays silent past the review window approves by default.
export async function autoReleaseDue(db: DB, now = new Date()) {
  const due = await db.select().from(s.milestones).where(eq(s.milestones.status, "submitted"));
  const out: string[] = [];
  for (const m of due) {
    if (!m.reviewDueAt || m.reviewDueAt > now) continue;
    const [deal] = await db.select().from(s.deals).where(eq(s.deals.id, m.dealId)).limit(1);
    if (!deal || deal.status !== "active") continue;
    await releaseInternal(db, deal, m.idx, { id: null, kind: "system" });
    out.push(`${deal.id}:${m.idx}`);
  }
  return out;
}

async function maybeComplete(db: DB, deal: typeof s.deals.$inferSelect) {
  const ms = await db.select().from(s.milestones).where(eq(s.milestones.dealId, deal.id));
  if (!ms.every((m) => ["released", "resolved", "refunded"].includes(m.status))) return;
  const anyPaid = ms.some((m) => m.status !== "refunded");
  await touch(db, deal.id, { status: anyPaid ? "completed" : "cancelled" });
  await event(db, deal.id, { id: null, kind: "system" }, anyPaid ? "completed" : "cancelled", {});
  if (anyPaid) await issueInvoices(db, deal, ms);
}

async function issueInvoices(db: DB, deal: typeof s.deals.$inferSelect, ms: (typeof s.milestones.$inferSelect)[]) {
  const [creator] = await db.select({ name: s.users.name }).from(s.users).where(eq(s.users.id, deal.creatorId)).limit(1);
  const [brand] = await db.select().from(s.brands).where(eq(s.brands.id, deal.brandId)).limit(1);
  const paid = ms.filter((m) => m.status !== "refunded");
  const total = paid.reduce((a, m) => a + m.amountCents, 0);
  const taxLabel = brand?.country === "AE" ? "VAT" : brand?.country === "IN" ? "GST" : "none";
  const number = (k: string) => `EV-${new Date().getFullYear()}-${k}-${deal.id.slice(0, 6).toUpperCase()}`;
  await db.insert(s.invoices).values([
    { number: number("D"), dealId: deal.id, kind: "deal", sellerName: creator?.name ?? "Creator", buyerName: brand?.name ?? "Brand", buyerCountry: brand?.country ?? null, amountCents: total, taxLabel, lines: paid.map((m) => ({ label: m.title, amountCents: m.amountCents })) },
    { number: number("F"), dealId: deal.id, kind: "fee", sellerName: "EVRA", buyerName: brand?.name ?? "Brand", buyerCountry: brand?.country ?? null, amountCents: feeCents(total), taxLabel, lines: [{ label: "EVRA fee: 5% of released value", amountCents: feeCents(total) }] },
  ]);
}

export async function openDispute(db: DB, ctx: DealCtx, p: { idx: number; reason: string }) {
  if (ctx.side === "staff") throw new HttpError(403, "Staff resolve disputes from Ops.");
  const m = await milestone(db, ctx.deal.id, p.idx);
  if (!["pending", "submitted"].includes(m.status)) throw new HttpError(409, "This step can't be disputed now.");
  if (p.reason.trim().length < 10) throw new HttpError(400, "Explain what went wrong in a sentence or two.");
  await db.update(s.milestones).set({ status: "disputed" }).where(eq(s.milestones.id, m.id));
  await db.insert(s.disputes).values({ dealId: ctx.deal.id, milestoneIdx: p.idx, openedBy: ctx.user.id, reason: p.reason.trim() });
  await touch(db, ctx.deal.id, { status: "disputed" });
  await event(db, ctx.deal.id, { id: ctx.user.id, kind: ctx.side }, "disputed", { idx: p.idx });
  await notify(db, ctx.deal, ctx.side === "brand" ? "creator" : "brand", `A dispute was opened on "${m.title}". EVRA mediates within 5 business days.`);
}

export async function resolveDispute(db: DB, staff: User, disputeId: string, creatorBps: number) {
  if (!Number.isInteger(creatorBps) || creatorBps < 0 || creatorBps > 10_000) throw new HttpError(400, "Choose a split between 0% and 100%.");
  const [d] = await db.select().from(s.disputes).where(eq(s.disputes.id, disputeId)).limit(1);
  if (!d || d.status !== "open") throw new HttpError(404, "Open dispute not found.");
  const [deal] = await db.select().from(s.deals).where(eq(s.deals.id, d.dealId)).limit(1);
  const m = await milestone(db, deal.id, d.milestoneIdx);
  await db.update(s.milestones).set({ status: "resolved", releasedAt: new Date() }).where(eq(s.milestones.id, m.id));
  await db.update(s.disputes).set({ status: "resolved", creatorBps, resolvedBy: staff.id, resolvedAt: new Date() }).where(eq(s.disputes.id, d.id));
  await db.insert(s.staffActions).values({ staffId: staff.id, action: "resolve_dispute", targetUserId: deal.creatorId, data: { disputeId, creatorBps } });
  const stillOpen = await db.select().from(s.disputes).where(and(eq(s.disputes.dealId, deal.id), eq(s.disputes.status, "open")));
  await touch(db, deal.id, { status: stillOpen.length ? "disputed" : "active" });
  await event(db, deal.id, { id: staff.id, kind: "staff" }, "resolved", { idx: d.milestoneIdx, creatorBps });
  const what = `The dispute on "${m.title}" was resolved: ${creatorBps / 100}% to the creator.`;
  await notify(db, deal, "creator", what);
  await notify(db, deal, "brand", what);
  await maybeComplete(db, { ...deal, status: "active" });
}

export async function cancelDeal(db: DB, ctx: DealCtx) {
  requireSide(ctx, "brand");
  if (["negotiating", "agreed"].includes(ctx.deal.status)) {
    await touch(db, ctx.deal.id, { status: "cancelled" });
    await event(db, ctx.deal.id, { id: ctx.user.id, kind: "brand" }, "cancelled", { funded: false });
    await notify(db, ctx.deal, "creator", `${await brandName(db, ctx.deal.brandId)} withdrew this offer.`);
    return;
  }
  if (ctx.deal.status !== "active") throw new HttpError(409, "This deal can't be cancelled now.");
  const t = await currentTerms(db, ctx.deal);
  const pending = await db.select().from(s.milestones).where(and(eq(s.milestones.dealId, ctx.deal.id), eq(s.milestones.status, "pending")));
  if (!pending.length) throw new HttpError(409, "Work was already delivered on every step. Approve it or open a dispute.");
  const killFee = pending.reduce((a, m) => a + Math.floor((m.amountCents * t.terms.killFeeBps) / 10_000), 0);
  await db.update(s.milestones).set({ status: "refunded" }).where(inArray(s.milestones.id, pending.map((m) => m.id)));
  await event(db, ctx.deal.id, { id: ctx.user.id, kind: "brand" }, "cancelled", { funded: true, killFeeCents: killFee });
  await notify(db, ctx.deal, "creator", `${await brandName(db, ctx.deal.brandId)} cancelled the remaining work.${killFee > 0 ? ` They owe you the agreed kill fee of ${formatMoney(killFee)}.` : ""}`);
  await maybeComplete(db, ctx.deal);
}

export async function addComment(db: DB, ctx: DealCtx, body: string) {
  const text = body.trim();
  if (!text || text.length > 2000) throw new HttpError(400, "Write a message up to 2,000 characters.");
  await db.insert(s.dealComments).values({ dealId: ctx.deal.id, userId: ctx.user.id, body: text });
  await notify(db, ctx.deal, ctx.side === "brand" ? "creator" : "brand", `New message: ${text.slice(0, 140)}`);
}

export async function rateDeal(db: DB, ctx: DealCtx, p: { score: number; onTime: boolean; comment?: string }) {
  if (ctx.deal.status !== "completed") throw new HttpError(409, "You can rate once the deal is complete.");
  if (ctx.side === "staff") throw new HttpError(403, "Only the two sides rate a deal.");
  const toUserId = ctx.side === "brand" ? ctx.deal.creatorId : (await db.select({ userId: s.brandMembers.userId }).from(s.brandMembers).where(eq(s.brandMembers.brandId, ctx.deal.brandId)).limit(1))[0]?.userId;
  const existing = await db.select().from(s.ratings).where(and(eq(s.ratings.dealId, ctx.deal.id), eq(s.ratings.fromUserId, ctx.user.id)));
  if (existing.length) throw new HttpError(409, "You already rated this deal.");
  await db.insert(s.ratings).values({ dealId: ctx.deal.id, fromUserId: ctx.user.id, toUserId, score: Math.max(1, Math.min(5, Math.round(p.score))), onTime: p.onTime, comment: p.comment?.slice(0, 500) ?? null });
}

export async function dealListFor(db: DB, user: User) {
  if (user.role === "brand") {
    const brand = await brandForUser(db, user.id);
    if (!brand) return [];
    return db.select().from(s.deals).where(eq(s.deals.brandId, brand.id)).orderBy(desc(s.deals.updatedAt));
  }
  return db.select().from(s.deals).where(eq(s.deals.creatorId, user.id)).orderBy(desc(s.deals.updatedAt));
}

export async function dealTimeline(db: DB, dealId: string) {
  return db.select().from(s.dealEvents).where(eq(s.dealEvents.dealId, dealId)).orderBy(asc(s.dealEvents.createdAt));
}
