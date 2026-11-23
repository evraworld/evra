import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, type DB } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { findOrCreateUser } from "@/lib/users";
import { createDeal, defaultTerms } from "@/lib/deals/create";
import { approveMilestone, approveTerms, startWork, submitWork } from "@/lib/deals/actions";
import { dealAccess } from "@/lib/deals/access";

let n = 0;
async function user(db: DB, role: "creator" | "brand") {
  const { user: u } = await findOrCreateUser(db, `${role}${++n}@mvp.test`);
  await db.update(s.users).set({ role, onboardedAt: new Date() }).where(eq(s.users.id, u.id));
  return (await db.select().from(s.users).where(eq(s.users.id, u.id)))[0];
}

async function setup(slots: number) {
  const db = await getDb();
  const owner = await user(db, "brand");
  const [brand] = await db.insert(s.brands).values({ name: `Brand ${n}` }).returning();
  await db.insert(s.brandMembers).values({ brandId: brand.id, userId: owner.id, role: "owner" });
  const [opp] = await db.insert(s.opportunities).values({ brandId: brand.id, createdBy: owner.id, title: "Brief", brief: "b", budgetCents: 50_000, slots }).returning();
  const offer = async () => {
    const c = await user(db, "creator");
    const d = await createDeal(db, { brandId: brand.id, creatorId: c.id, title: "Deal", terms: defaultTerms({ totalCents: 50_000 }), proposedBy: owner.id, side: "brand", opportunityId: opp.id });
    return { c, d };
  };
  const agree = async (dealId: string, c: typeof owner) => {
    await approveTerms(db, await dealAccess(db, dealId, owner));
    return approveTerms(db, await dealAccess(db, dealId, c));
  };
  return { db, owner, opp, offer, agree };
}

describe("MVP deals (paid outside EVRA)", () => {
  it("a brief takes only as many creators as it has slots, then closes", async () => {
    const { db, opp, offer, agree } = await setup(1);
    const a = await offer();
    const b = await offer();
    expect(await agree(a.d.id, a.c)).toEqual({ agreed: true });
    await expect(agree(b.d.id, b.c)).rejects.toThrow(/slots are already filled/);
    expect((await db.select().from(s.opportunities).where(eq(s.opportunities.id, opp.id)))[0].status).toBe("closed");
  });

  it("the brand starts the work without paying through EVRA, and approval completes the deal", async () => {
    const { db, owner, offer, agree } = await setup(2);
    const { c, d } = await offer();
    await agree(d.id, c);
    await startWork(db, await dealAccess(db, d.id, owner));
    await submitWork(db, await dealAccess(db, d.id, c), { idx: 0, url: "https://instagram.com/p/x", kind: "live" });
    await approveMilestone(db, await dealAccess(db, d.id, owner), { idx: 0, liveConfirmed: true });
    const [done] = await db.select().from(s.deals).where(eq(s.deals.id, d.id));
    expect(done).toMatchObject({ status: "completed" });
  });
});
