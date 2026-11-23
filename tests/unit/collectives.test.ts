import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, type DB } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { findOrCreateUser } from "@/lib/users";
import { collectiveAction, collectiveView, CollectiveInput, createCollective, listCollectives } from "@/lib/collectives";
import { createOpportunity, opportunityFeed } from "@/lib/opportunities";

let n = 0;
async function person(db: DB, name: string) {
  const i = ++n;
  const { user } = await findOrCreateUser(db, `p${i}@collective.test`);
  await db.update(s.users).set({ role: "creator", handle: `col_${i}`, country: "AE", onboardedAt: new Date() }).where(eq(s.users.id, user.id));
  await db.insert(s.creatorProfiles).values({ userId: user.id, displayName: name, niches: ["beauty"] });
  return (await db.select().from(s.users).where(eq(s.users.id, user.id)))[0];
}

const input = (slug: string, membersVisible = false) => CollectiveInput.parse({ name: "Dubai beauty", slug, kind: "city", description: "Beauty creators in Dubai", rules: "Share real rates.", membersVisible });

describe("collectives", () => {
  it("creates a collective with its owner, and refuses a taken or malformed link", async () => {
    const db = await getDb();
    const owner = await person(db, "Owner");
    const c = await createCollective(db, owner.id, input("dubai-beauty"));
    expect((await collectiveView(db, "dubai-beauty", owner.id))!.me).toMatchObject({ role: "owner", status: "active" });
    await expect(createCollective(db, owner.id, input("DUBAI-BEAUTY"))).rejects.toMatchObject({ status: 409 });
    expect(CollectiveInput.safeParse({ name: "Dubai beauty", kind: "city", slug: "no spaces!" }).success).toBe(false);
    expect((await listCollectives(db, owner.id)).mine.map((m) => m.c.id)).toEqual([c.id]);
  });

  it("lets only the owner or a moderator approve join requests", async () => {
    const db = await getDb();
    const owner = await person(db, "Owner");
    const mod = await person(db, "Mod");
    const joiner = await person(db, "Joiner");
    const late = await person(db, "Late");
    const c = await createCollective(db, owner.id, input("join-rules"));
    for (const p of [mod, joiner, late]) expect(await collectiveAction(db, c, p.id, { action: "join" })).toEqual({ status: "requested" });
    await expect(collectiveAction(db, c, joiner.id, { action: "approve", userId: late.id })).rejects.toMatchObject({ status: 403 });
    await collectiveAction(db, c, owner.id, { action: "approve", userId: mod.id });
    await expect(collectiveAction(db, c, mod.id, { action: "approve", userId: joiner.id })).rejects.toMatchObject({ status: 403 });
    await collectiveAction(db, c, owner.id, { action: "promote", userId: mod.id });
    await collectiveAction(db, c, mod.id, { action: "approve", userId: joiner.id });
    await collectiveAction(db, c, mod.id, { action: "decline", userId: late.id });
    await expect(collectiveAction(db, c, mod.id, { action: "approve", userId: late.id })).rejects.toMatchObject({ status: 404 });
    await expect(collectiveAction(db, c, mod.id, { action: "promote", userId: joiner.id })).rejects.toMatchObject({ status: 403 });
    const view = (await collectiveView(db, "join-rules", owner.id))!;
    expect(view.memberCount).toBe(3);
    expect(view.pending).toEqual([]);
    await expect(collectiveAction(db, c, owner.id, { action: "leave" })).rejects.toMatchObject({ status: 400 });
    await collectiveAction(db, c, joiner.id, { action: "leave" });
    expect((await collectiveView(db, "join-rules", owner.id))!.memberCount).toBe(2);
  });

  it("keeps the feed for members, pins first, and hides the member list unless opted in", async () => {
    const db = await getDb();
    const owner = await person(db, "Owner");
    const member = await person(db, "Member");
    const outsider = await person(db, "Outsider");
    const c = await createCollective(db, owner.id, input("feed-rules"));
    await collectiveAction(db, c, member.id, { action: "join" });
    await expect(collectiveAction(db, c, member.id, { action: "post", kind: "post", body: "Hello!" })).rejects.toMatchObject({ status: 403 });
    await collectiveAction(db, c, owner.id, { action: "approve", userId: member.id });
    const { postId } = (await collectiveAction(db, c, owner.id, { action: "post", kind: "post", body: "Rate card template inside" })) as { postId: string };
    await collectiveAction(db, c, member.id, { action: "post", kind: "ask", body: "Rate check: one Reel for a Dubai cafe, 30k followers?" });
    await expect(collectiveAction(db, c, member.id, { action: "pin", postId })).rejects.toMatchObject({ status: 403 });
    await collectiveAction(db, c, owner.id, { action: "pin", postId });

    const asMember = (await collectiveView(db, "feed-rules", member.id))!;
    expect(asMember.posts.map((p) => [p.post.kind, p.post.pinned, p.name])).toEqual([
      ["post", true, "Owner"],
      ["ask", false, "Member"],
    ]);
    expect(asMember.members).toBeNull();
    expect((await collectiveView(db, "feed-rules", owner.id))!.members!.map((m) => m.name)).toEqual(["Owner", "Member"]);
    const asOutsider = (await collectiveView(db, "feed-rules", outsider.id))!;
    expect(asOutsider.posts).toEqual([]);
    expect(asOutsider.members).toBeNull();

    const open = await createCollective(db, owner.id, input("open-list", true));
    expect((await collectiveView(db, "open-list", outsider.id))!.members!.map((m) => m.name)).toEqual(["Owner"]);
    expect(open.membersVisible).toBe(true);
  });

  it("shows collective-only briefs to active members only", async () => {
    const db = await getDb();
    const owner = await person(db, "Owner");
    const pending = await person(db, "Pending");
    const c = await createCollective(db, owner.id, input("brief-rules"));
    await collectiveAction(db, c, pending.id, { action: "join" });
    const { user: b } = await findOrCreateUser(db, `brand${++n}@collective.test`);
    const [brand] = await db.insert(s.brands).values({ name: "Collective Brand" }).returning();
    const opp = await createOpportunity(db, {
      brandId: brand.id,
      userId: b.id,
      input: { title: "Members only", brief: "A brief just for this collective's members.", niches: ["beauty"], platforms: ["instagram"], deliverables: [{ type: "reel", count: 1 }], budgetCents: 40_000, slots: 2, country: null, audience: "collective", collectiveSlug: "brief-rules", invite: [], publicTeaser: false },
    });
    expect((await opportunityFeed(db, owner)).map((f) => f.o.id)).toContain(opp.id);
    expect((await opportunityFeed(db, pending)).map((f) => f.o.id)).not.toContain(opp.id);
    expect((await collectiveView(db, "brief-rules", owner.id))!.opportunities.map((o) => o.id)).toEqual([opp.id]);
    expect((await collectiveView(db, "brief-rules", pending.id))!.opportunities).toEqual([]);
  });
});
