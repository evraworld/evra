import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, type DB } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { findOrCreateUser } from "@/lib/users";
import { defaultTerms } from "@/lib/deals/create";
import { openDispute, resolveDispute } from "@/lib/deals/actions";
import { openDisputeCount, openDisputes } from "@/lib/ops/disputes";

let n = 0;
const user = async (db: DB, set: Partial<typeof s.users.$inferInsert>) => {
  const { user } = await findOrCreateUser(db, `p${++n}@disputes.test`);
  await db.update(s.users).set({ onboardedAt: new Date(), ...set }).where(eq(s.users.id, user.id));
  return (await db.select().from(s.users).where(eq(s.users.id, user.id)))[0];
};

// A delivered single-step deal with no chain, so no network is touched.
async function deliveredDeal(db: DB) {
  const creator = await user(db, { role: "creator", name: `Creator ${n}`, handle: `dispute_c_${n}` });
  const owner = await user(db, { role: "brand" });
  const [brand] = await db.insert(s.brands).values({ name: `Brand ${n}`, plan: "growth", category: "beauty", country: "AE" }).returning();
  await db.insert(s.brandMembers).values({ brandId: brand.id, userId: owner.id, role: "owner" });
  const [deal] = await db.insert(s.deals).values({ brandId: brand.id, creatorId: creator.id, title: "Spring launch", status: "active" }).returning();
  const [t] = await db.insert(s.dealTerms).values({ dealId: deal.id, version: 1, proposedBy: owner.id, proposedBySide: "brand", terms: defaultTerms({ totalCents: 40_000 }) }).returning();
  await db.update(s.deals).set({ currentTermsId: t.id }).where(eq(s.deals.id, deal.id));
  await db.insert(s.milestones).values({ dealId: deal.id, idx: 0, title: "Post live", amountCents: 40_000, status: "submitted", submittedAt: new Date() });
  return { creator, owner, deal: (await db.select().from(s.deals).where(eq(s.deals.id, deal.id)))[0] };
}

describe("disputes", () => {
  it("lists an open dispute for Ops and settles it with the chosen split", async () => {
    const db = await getDb();
    const { creator, deal } = await deliveredDeal(db);
    const staff = await user(db, { staff: true });
    const before = await openDisputeCount(db);
    await openDispute(db, { deal, side: "creator", user: creator }, { idx: 0, reason: "The brand stopped answering after I posted." });

    const open = await openDisputes(db);
    const mine = open.find((r) => r.deal.id === deal.id)!;
    expect(mine).toMatchObject({ openedBy: "creator", brand: expect.stringContaining("Brand"), step: { title: "Post live", amountCents: 40_000 } });
    expect(await openDisputeCount(db)).toBe(before + 1);

    await expect(resolveDispute(db, staff, mine.d.id, 10_001)).rejects.toThrow("between 0% and 100%");
    await resolveDispute(db, staff, mine.d.id, 7_000);
    await expect(resolveDispute(db, staff, mine.d.id, 7_000)).rejects.toThrow("Open dispute not found");

    const [d] = await db.select().from(s.disputes).where(eq(s.disputes.id, mine.d.id));
    expect(d).toMatchObject({ status: "resolved", creatorBps: 7_000, resolvedBy: staff.id });
    const [m] = await db.select().from(s.milestones).where(eq(s.milestones.dealId, deal.id));
    expect(m.status).toBe("resolved");
    const [after] = await db.select().from(s.deals).where(eq(s.deals.id, deal.id));
    expect(after.status).toBe("completed");
    const logged = await db.select().from(s.staffActions).where(eq(s.staffActions.targetUserId, creator.id));
    expect(logged.map((a) => a.action)).toContain("resolve_dispute");
    expect((await openDisputes(db)).some((r) => r.deal.id === deal.id)).toBe(false);
  });

  it("keeps staff out of opening disputes", async () => {
    const db = await getDb();
    const { deal } = await deliveredDeal(db);
    const staff = await user(db, { staff: true });
    await expect(openDispute(db, { deal, side: "staff", user: staff }, { idx: 0, reason: "Staff shouldn't open this one." })).rejects.toThrow("Staff resolve disputes");
  });
});
