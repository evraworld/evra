import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb, type DB } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { findOrCreateUser } from "@/lib/users";
import { sha256 } from "@/lib/crypto";
import { answerRequest, creditBalance, declineReasons, readReplyLink, sendRequest, type Plan, type RequestInput } from "@/lib/requests";
import { responseBadge } from "@/lib/requests/badges";
import type { P1RequestType } from "@/lib/requests/types";
import { runRequestJobs } from "@/lib/jobs/requests";

const ORIGIN = "http://test.local";
const DAY = 86_400_000;
let n = 0;

async function creator(db: DB, o: { openTo?: s.RequestType[]; name?: string } = {}) {
  const i = ++n;
  const { user } = await findOrCreateUser(db, `creator${i}@req.test`);
  await db.update(s.users).set({ role: "creator", handle: `req_creator_${i}`, country: "AE", onboardedAt: new Date() }).where(eq(s.users.id, user.id));
  await db.insert(s.creatorProfiles).values({ userId: user.id, displayName: o.name ?? `Creator ${i}`, niches: ["beauty"], openTo: o.openTo ?? ["paid_collab", "seeding", "event", "feedback_call", "licence"], minRateCents: 40_000 });
  await db.insert(s.rateCardItems).values({ userId: user.id, deliverable: "reel", label: "Reel", priceCents: 55_000 });
  return user;
}

async function brand(db: DB, plan: Plan = "pay_per_deal") {
  const i = ++n;
  const { user } = await findOrCreateUser(db, `brand${i}@req.test`);
  await db.update(s.users).set({ role: "brand", onboardedAt: new Date() }).where(eq(s.users.id, user.id));
  const [b] = await db.insert(s.brands).values({ name: `Brand ${i}`, plan }).returning();
  await db.insert(s.brandMembers).values({ brandId: b.id, userId: user.id, role: "owner" });
  return { user, brand: b };
}

const ask = (creatorId: string, over: Partial<RequestInput> = {}): RequestInput => ({ creatorId, type: "seeding", message: "We'd love to send you our new serum.", details: {}, ...over });
const outboxFor = (db: DB, to: string) => db.select().from(s.outbox).where(eq(s.outbox.to, to));
const tokenFrom = (body: string) => body.match(/\/reply\/([A-Za-z0-9_-]+)/)![1];

describe("request credits", () => {
  it("spends one credit per unfunded request and says so plainly when they run out", async () => {
    const db = await getDb();
    const b = await brand(db, "pay_per_deal");
    const creators = await Promise.all(Array.from({ length: 6 }, () => creator(db)));
    expect(await creditBalance(db, b.brand)).toMatchObject({ allowance: 5, left: 5 });
    for (const c of creators.slice(0, 5)) await sendRequest(db, { userId: b.user.id, brand: b.brand, input: ask(c.id), origin: ORIGIN });
    expect((await creditBalance(db, b.brand)).left).toBe(0);
    const ledger = await db.select().from(s.creditLedger).where(eq(s.creditLedger.brandId, b.brand.id));
    expect(ledger).toHaveLength(5);
    expect(ledger.every((l) => l.delta === -1 && l.requestId)).toBe(true);
    await expect(sendRequest(db, { userId: b.user.id, brand: b.brand, input: ask(creators[5].id), origin: ORIGIN })).rejects.toMatchObject({ status: 402, message: expect.stringContaining("used all 5 request credits") });
    // A paid collab without an amount is still an unfunded ask.
    await expect(sendRequest(db, { userId: b.user.id, brand: b.brand, input: ask(creators[5].id, { type: "paid_collab" }), origin: ORIGIN })).rejects.toMatchObject({ status: 402 });
  });

  it("never charges funded offers, even with no credits left", async () => {
    const db = await getDb();
    const b = await brand(db, "pay_per_deal");
    await db.insert(s.creditLedger).values({ brandId: b.brand.id, delta: -5, reason: "test" });
    const c = await creator(db);
    const r = await sendRequest(db, { userId: b.user.id, brand: b.brand, input: ask(c.id, { type: "paid_collab", amountCents: 70_000 }), origin: ORIGIN });
    expect(r).toMatchObject({ funded: true, creditsSpent: 0 });
    expect(await db.select().from(s.creditLedger).where(eq(s.creditLedger.requestId, r.id))).toHaveLength(0);
  });

  it("gives each plan its monthly allowance, renewed on the 1st", async () => {
    const db = await getDb();
    for (const [plan, allowance] of [["growth", 50], ["scale", 200], ["agency", 1000]] as const) expect((await creditBalance(db, (await brand(db, plan)).brand)).allowance).toBe(allowance);
    const b = await brand(db, "pay_per_deal");
    await db.insert(s.creditLedger).values({ brandId: b.brand.id, delta: -5, reason: "test" });
    const now = new Date();
    expect((await creditBalance(db, b.brand, now)).left).toBe(0);
    expect((await creditBalance(db, b.brand, new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 2)))).left).toBe(5);
  });
});

describe("sending requests", () => {
  it("only offers types the creator is open to, and refuses a duplicate open ask", async () => {
    const db = await getDb();
    const b = await brand(db, "growth");
    const c = await creator(db, { openTo: ["paid_collab"] });
    await expect(sendRequest(db, { userId: b.user.id, brand: b.brand, input: ask(c.id, { type: "event" }), origin: ORIGIN })).rejects.toMatchObject({ status: 400 });
    await sendRequest(db, { userId: b.user.id, brand: b.brand, input: ask(c.id, { type: "paid_collab", amountCents: 50_000 }), origin: ORIGIN });
    await expect(sendRequest(db, { userId: b.user.id, brand: b.brand, input: ask(c.id, { type: "paid_collab", amountCents: 60_000 }), origin: ORIGIN })).rejects.toMatchObject({ status: 409 });
  });

  it("emails the creator a reply link and copies an active manager whose rules include the type", async () => {
    const db = await getDb();
    const b = await brand(db, "growth");
    const c = await creator(db);
    const { user: manager } = await findOrCreateUser(db, `manager${++n}@req.test`);
    await db.insert(s.managerLinks).values({ creatorId: c.id, managerEmail: manager.email, managerUserId: manager.id, copyTypes: ["seeding"], status: "active" });
    await sendRequest(db, { userId: b.user.id, brand: b.brand, input: ask(c.id), origin: ORIGIN });
    await sendRequest(db, { userId: b.user.id, brand: b.brand, input: ask(c.id, { type: "event" }), origin: ORIGIN });
    const toCreator = await outboxFor(db, c.email);
    expect(toCreator.map((m) => m.subject)).toEqual(expect.arrayContaining([`New product seeding request from ${b.brand.name}`, `New event request from ${b.brand.name}`]));
    expect(toCreator[0].body).toContain(`${ORIGIN}/reply/`);
    const toManager = await outboxFor(db, manager.email);
    expect(toManager).toHaveLength(1);
    expect(toManager[0].subject).toContain("product seeding");
    const links = await db.select().from(s.replyLinks).where(eq(s.replyLinks.userId, manager.id));
    expect(links).toHaveLength(1);
    // Only the hash is stored.
    expect(links[0].tokenHash).toBe(sha256(tokenFrom(toManager[0].body)));
  });

  it("stops a manager's link working once the creator revokes them", async () => {
    const db = await getDb();
    const b = await brand(db, "growth");
    const c = await creator(db);
    const { user: manager } = await findOrCreateUser(db, `manager${++n}@req.test`);
    const [link] = await db.insert(s.managerLinks).values({ creatorId: c.id, managerEmail: manager.email, managerUserId: manager.id, copyTypes: ["seeding"], status: "active" }).returning();
    await sendRequest(db, { userId: b.user.id, brand: b.brand, input: ask(c.id), origin: ORIGIN });
    const raw = tokenFrom((await outboxFor(db, manager.email))[0].body);
    expect((await readReplyLink(db, raw)).state).toBe("open");
    await db.update(s.managerLinks).set({ status: "revoked" }).where(eq(s.managerLinks.id, link.id));
    expect((await readReplyLink(db, raw)).state).toBe("expired");
    await expect(answerRequest(db, { by: { token: raw }, answer: { decision: "accept" }, origin: ORIGIN })).rejects.toMatchObject({ status: 410 });
    // The creator's own link still works.
    const own = tokenFrom((await outboxFor(db, c.email))[0].body);
    expect((await answerRequest(db, { by: { token: own }, answer: { decision: "accept" }, origin: ORIGIN })).request.status).toBe("accepted");
  });

  it("doesn't copy invited (not yet active) managers", async () => {
    const db = await getDb();
    const b = await brand(db, "growth");
    const c = await creator(db);
    const { user: manager } = await findOrCreateUser(db, `manager${++n}@req.test`);
    await db.insert(s.managerLinks).values({ creatorId: c.id, managerEmail: manager.email, managerUserId: manager.id, copyTypes: ["seeding"], status: "invited" });
    await sendRequest(db, { userId: b.user.id, brand: b.brand, input: ask(c.id), origin: ORIGIN });
    expect(await outboxFor(db, manager.email)).toHaveLength(0);
  });
});

describe("reply links and answers", () => {
  it("works once without signing in, then says the request was answered", async () => {
    const db = await getDb();
    const b = await brand(db, "growth");
    const c = await creator(db);
    const r = await sendRequest(db, { userId: b.user.id, brand: b.brand, input: ask(c.id), origin: ORIGIN });
    const raw = tokenFrom((await outboxFor(db, c.email))[0].body);
    expect(await readReplyLink(db, "not-a-real-token")).toEqual({ state: "invalid" });
    expect(await readReplyLink(db, raw)).toMatchObject({ state: "open", brandName: b.brand.name, request: { id: r.id } });
    const out = await answerRequest(db, { by: { token: raw }, answer: { decision: "accept" }, origin: ORIGIN });
    expect(out.request.status).toBe("accepted");
    expect(await readReplyLink(db, raw)).toEqual({ state: "answered" });
    await expect(answerRequest(db, { by: { token: raw }, answer: { decision: "decline", reason: "fit" }, origin: ORIGIN })).rejects.toMatchObject({ status: 410 });
    // The brand hears about the yes.
    expect((await outboxFor(db, b.user.email)).some((m) => m.subject.includes("said yes"))).toBe(true);
  });

  it("refuses expired links and answers from someone else's inbox", async () => {
    const db = await getDb();
    const b = await brand(db, "growth");
    const c = await creator(db);
    const other = await creator(db);
    const r = await sendRequest(db, { userId: b.user.id, brand: b.brand, input: ask(c.id), origin: ORIGIN });
    const raw = tokenFrom((await outboxFor(db, c.email))[0].body);
    const later = new Date(Date.now() + 15 * DAY);
    expect(await readReplyLink(db, raw, later)).toEqual({ state: "expired" });
    await expect(answerRequest(db, { by: { token: raw }, answer: { decision: "accept" }, origin: ORIGIN, now: later })).rejects.toMatchObject({ status: 410 });
    await expect(answerRequest(db, { by: { userId: other.id, requestId: r.id }, answer: { decision: "accept" }, origin: ORIGIN })).rejects.toMatchObject({ status: 409 });
    const ok = await answerRequest(db, { by: { userId: c.id, requestId: r.id }, answer: { decision: "decline", reason: "timing" }, origin: ORIGIN });
    expect(ok.request).toMatchObject({ status: "declined", declineReason: "timing" });
  });

  it("opens a Deal Room when a paid collab is accepted", async () => {
    const db = await getDb();
    const b = await brand(db, "growth");
    const c = await creator(db);
    const funded = await sendRequest(db, { userId: b.user.id, brand: b.brand, input: ask(c.id, { type: "paid_collab", amountCents: 80_000, details: { deliverable: "tiktok" } }), origin: ORIGIN });
    const out = await answerRequest(db, { by: { userId: c.id, requestId: funded.id }, answer: { decision: "accept" }, origin: ORIGIN });
    expect(out.request).toMatchObject({ status: "converted", dealId: out.dealId });
    const [deal] = await db.select().from(s.deals).where(eq(s.deals.id, out.dealId!));
    expect(deal).toMatchObject({ brandId: b.brand.id, creatorId: c.id, requestId: funded.id });
    const [terms] = await db.select().from(s.dealTerms).where(eq(s.dealTerms.dealId, deal.id));
    expect(terms.proposedBySide).toBe("brand");
    expect(terms.terms.milestones.reduce((a, m) => a + m.amountCents, 0)).toBe(80_000);
    expect(terms.terms.deliverables[0].type).toBe("tiktok");

    // No amount: the creator's Reel price becomes their first offer.
    const quote = await sendRequest(db, { userId: b.user.id, brand: b.brand, input: ask(c.id, { type: "paid_collab" }), origin: ORIGIN });
    const q = await answerRequest(db, { by: { userId: c.id, requestId: quote.id }, answer: { decision: "accept" }, origin: ORIGIN });
    const [t2] = await db.select().from(s.dealTerms).where(eq(s.dealTerms.dealId, q.dealId!));
    expect(t2.proposedBySide).toBe("creator");
    expect(t2.terms.milestones[0].amountCents).toBe(55_000);
  });
});

describe("why creators said no", () => {
  it("shows a reason only once 3 different creators gave it in the last 90 days", async () => {
    const db = await getDb();
    const b = await brand(db, "growth");
    const decline = async (reason: "rate" | "timing", respondedAt = new Date()) => {
      const c = await creator(db);
      const r = await sendRequest(db, { userId: b.user.id, brand: b.brand, input: ask(c.id), origin: ORIGIN });
      await answerRequest(db, { by: { userId: c.id, requestId: r.id }, answer: { decision: "decline", reason }, origin: ORIGIN, now: respondedAt });
    };
    await decline("rate");
    await decline("rate");
    await decline("timing");
    await decline("timing");
    await decline("timing", new Date(Date.now() - 100 * DAY));
    expect(await declineReasons(db, b.brand.id)).toEqual([]);
    await decline("rate");
    expect(await declineReasons(db, b.brand.id)).toEqual([{ reason: "rate", creators: 3 }]);
  });
});

describe("response jobs", () => {
  it("reminds on day 6, at most once every 3 days per person, and closes on day 7", async () => {
    const db = await getDb();
    const b = await brand(db, "growth");
    const busy = await creator(db, { name: "Busy Creator" });
    const now = new Date();
    const at = (days: number) => new Date(now.getTime() - days * DAY);
    const make = async (c: { id: string }, type: P1RequestType, createdAt: Date) => {
      const r = await sendRequest(db, { userId: b.user.id, brand: b.brand, input: ask(c.id, { type }), origin: ORIGIN, now: createdAt });
      return r.id;
    };
    const a = await make(busy, "seeding", at(6.5));
    const second = await make(busy, "event", at(6.2));
    const old = await make(busy, "licence", at(7.5));
    const fresh = await make(busy, "feedback_call", at(2));
    const before = (await outboxFor(db, busy.email)).length;

    expect(await runRequestJobs(db, now)).toEqual({ closed: 1, reminded: 1 });
    const get = async (id: string) => (await db.select().from(s.requests).where(eq(s.requests.id, id)))[0];
    expect((await get(old)).status).toBe("closed_no_response");
    expect((await get(a)).remindedAt).toEqual(now);
    expect((await get(second)).remindedAt).toBeNull();
    expect((await get(fresh)).remindedAt).toBeNull();
    const mail = await outboxFor(db, busy.email);
    expect(mail.length - before).toBe(1);
    expect(mail.find((m) => m.template === "request_reminder")!.body).toContain(`/reply/`);
    expect((await outboxFor(db, b.user.email)).filter((m) => m.template === "request_no_response").map((m) => m.subject)).toEqual(["Busy Creator didn't reply in time"]);

    // Running again the same day sends nothing new; a day later the second request closes without a second reminder.
    expect(await runRequestJobs(db, now)).toEqual({ closed: 0, reminded: 0 });
    expect(await runRequestJobs(db, new Date(now.getTime() + DAY))).toEqual({ closed: 2, reminded: 0 });
    expect((await get(second)).status).toBe("closed_no_response");
    // A later reminder to the same person waits until 3 days after the last one (sent at `now`).
    const later = await make(busy, "seeding", new Date(now.getTime() - 3.7 * DAY));
    expect(await runRequestJobs(db, new Date(now.getTime() + 2.5 * DAY))).toEqual({ closed: 0, reminded: 0 });
    expect((await get(later)).remindedAt).toBeNull();
    expect(await runRequestJobs(db, new Date(now.getTime() + 3.1 * DAY))).toEqual({ closed: 0, reminded: 1 });
    expect((await get(later)).remindedAt).not.toBeNull();
  });
});

describe("quick to respond", () => {
  it("is earned when the median first reply over the last 10 answers is under 24 hours", async () => {
    const db = await getDb();
    const b = await brand(db, "agency");
    const c = await creator(db);
    expect(await responseBadge(db, c.id)).toBeNull();
    const answerAfter = async (hours: number, type: P1RequestType) => {
      const createdAt = new Date(Date.now() - 200 * 3_600_000);
      const r = await sendRequest(db, { userId: b.user.id, brand: b.brand, input: ask(c.id, { type }), origin: ORIGIN, now: createdAt });
      await answerRequest(db, { by: { userId: c.id, requestId: r.id }, answer: { decision: "decline", reason: "fit" }, origin: ORIGIN, now: new Date(createdAt.getTime() + hours * 3_600_000) });
    };
    await answerAfter(30, "seeding");
    await answerAfter(40, "event");
    expect(await responseBadge(db, c.id)).toBeNull();
    await answerAfter(2, "licence");
    await answerAfter(3, "feedback_call");
    await answerAfter(5, "seeding");
    expect(await responseBadge(db, c.id)).toBe("quick");
    expect(await db.select().from(s.requests).where(and(eq(s.requests.toCreatorId, c.id), eq(s.requests.status, "declined")))).toHaveLength(5);
  });
});
