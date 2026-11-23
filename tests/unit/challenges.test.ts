import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, type DB } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { findOrCreateUser } from "@/lib/users";
import { challengeView, rejectEntry, submitEntry } from "@/lib/challenges";

let n = 0;

async function member(db: DB, role: "creator" | "brand") {
  const i = ++n;
  const { user } = await findOrCreateUser(db, `${role}${i}@challenges.test`);
  await db.update(s.users).set({ role, handle: role === "creator" ? `ch_creator_${i}` : null, onboardedAt: new Date() }).where(eq(s.users.id, user.id));
  return (await db.select().from(s.users).where(eq(s.users.id, user.id)))[0];
}

async function brandWithChallenge(db: DB, perCreatorCap = 1) {
  const owner = await member(db, "brand");
  const [b] = await db.insert(s.brands).values({ name: `Brand ${n}`, plan: "growth", category: "beauty", country: "AE" }).returning();
  await db.insert(s.brandMembers).values({ brandId: b.id, userId: owner.id, role: "owner" });
  // Inserted directly: opening a challenge checks the brand's on-chain balance, which unit tests don't reach.
  const [c] = await db.insert(s.challenges).values({ brandId: b.id, title: "SPF mornings", brief: "Show our SPF in your morning routine.", pricePerEntryCents: 10_000, slots: 3, perCreatorCap }).returning();
  return { owner, c };
}

describe("challenges", () => {
  it("lets a creator enter up to the cap, and only creators", async () => {
    const db = await getDb();
    const { owner, c } = await brandWithChallenge(db, 2);
    const sara = await member(db, "creator");
    await submitEntry(db, sara, c.id, "https://instagram.com/p/one");
    await submitEntry(db, sara, c.id, "https://instagram.com/p/two");
    await expect(submitEntry(db, sara, c.id, "https://instagram.com/p/three")).rejects.toThrow("2 times");
    await expect(submitEntry(db, sara, c.id, "javascript:alert(1)")).rejects.toThrow("https://");
    await expect(submitEntry(db, owner, c.id, "https://instagram.com/p/x")).rejects.toThrow("Only creators");
  });

  it("frees a creator's spot when an entry is not chosen", async () => {
    const db = await getDb();
    const { owner, c } = await brandWithChallenge(db);
    const arjun = await member(db, "creator");
    const e = await submitEntry(db, arjun, c.id, "https://tiktok.com/@a/video/1");
    await rejectEntry(db, owner, e.id);
    await expect(rejectEntry(db, owner, e.id)).rejects.toThrow("already reviewed");
    await submitEntry(db, arjun, c.id, "https://tiktok.com/@a/video/2");
  });

  it("shows the brand every entry and a creator only their own", async () => {
    const db = await getDb();
    const { owner, c } = await brandWithChallenge(db);
    const a = await member(db, "creator");
    const b = await member(db, "creator");
    await submitEntry(db, a, c.id, "https://instagram.com/p/a");
    await submitEntry(db, b, c.id, "https://instagram.com/p/b");
    expect((await challengeView(db, owner, c.id))?.entries).toHaveLength(2);
    const mine = await challengeView(db, a, c.id);
    expect(mine?.mine).toBe(false);
    expect(mine?.entries.map((x) => x.e.url)).toEqual(["https://instagram.com/p/a"]);
    expect(mine?.left).toBe(3);
  });

  it("refuses another brand's review", async () => {
    const db = await getDb();
    const { c } = await brandWithChallenge(db);
    const { owner: other } = await brandWithChallenge(db);
    const e = await submitEntry(db, await member(db, "creator"), c.id, "https://instagram.com/p/z");
    await expect(rejectEntry(db, other, e.id)).rejects.toThrow("not found");
  });
});
