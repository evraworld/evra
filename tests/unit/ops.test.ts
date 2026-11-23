import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { sha256 } from "@/lib/crypto";
import { findOrCreateUser } from "@/lib/users";
import type { StructuredFn } from "@/lib/ai/claude";
import { decide, reviewQueue, tell } from "@/lib/ops/review";
import { approveDraft, claimDraft, claimHandleState, deleteByToken, draftForToken, editDraft, importKits, inviteDraft, kitData, parseKitCsv, purgeExpiredDrafts, redraft } from "@/lib/ops/kits";
import { startView, supportSummary } from "@/lib/ops/support";
import { needsAHuman } from "@/lib/ops/attention";
import { createSlot, endSlot, safeHref } from "@/lib/ops/slots";
import { preview, sendTest, TEMPLATE_KEYS } from "@/lib/ops/messages";

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);
const llm = (async () => ({ headline: "Dubai food spots for weekend plans", bio: "I find the best cheap eats in Dubai.", niches: ["food", "travel", "not-a-niche"] })) as unknown as StructuredFn;

async function user(email: string) {
  return (await findOrCreateUser(await getDb(), email)).user;
}
async function inbox(to: string) {
  return (await getDb()).select().from(s.outbox).where(eq(s.outbox.to, to));
}
const tokenFrom = (body: string) => body.match(/\/claim\/([\w-]+)/)![1];

describe("review queue", () => {
  it("approves in bulk, declines only with a reason, and tells each member once", async () => {
    const db = await getDb();
    const staff = await user("staff-review@evra.test");
    const [a, b, c] = await Promise.all(["flag-a@example.com", "flag-b@example.com", "flag-c@example.com"].map(user));
    const [fa, fb, fc] = await db
      .insert(s.flags)
      .values([
        { userId: a.id, reason: "Large self-reported audience", source: "auto" },
        { userId: b.id, reason: "Founding Creator application", source: "founding_application" },
        { userId: c.id, reason: "Large self-reported audience", source: "auto" },
      ])
      .returning();
    expect((await reviewQueue(db)).open.map((r) => r.flag.id)).toEqual(expect.arrayContaining([fa.id, fb.id, fc.id]));

    expect(await decide(db, staff.id, [fa.id, fb.id], "approved", "")).toBe(2);
    expect(await decide(db, staff.id, [fa.id], "declined", "Changed my mind")).toBe(0);
    await expect(decide(db, staff.id, [fc.id], "declined", "  ")).rejects.toMatchObject({ status: 400 });
    expect(await decide(db, staff.id, [fc.id], "declined", "Audience numbers don't match the profile")).toBe(1);

    const statusOf = async (id: string) => (await db.select({ st: s.users.status }).from(s.users).where(eq(s.users.id, id)))[0].st;
    expect(await statusOf(a.id)).toBe("active");
    expect(await statusOf(c.id)).toBe("declined");
    expect(await inbox(c.email)).toHaveLength(0);
    expect((await reviewQueue(db)).untold.map((r) => r.flag.id)).toEqual(expect.arrayContaining([fa.id, fb.id, fc.id]));

    await expect(tell(db, staff.id, (await db.insert(s.flags).values({ userId: a.id, reason: "x", source: "auto" }).returning())[0].id)).rejects.toMatchObject({ status: 409 });
    await tell(db, staff.id, fc.id);
    await expect(tell(db, staff.id, fc.id)).rejects.toMatchObject({ status: 409 });
    const sent = await inbox(c.email);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ template: "review_decision" });
    expect(sent[0].body).toContain("Audience numbers don't match the profile");

    const log = await db.select().from(s.staffActions).where(eq(s.staffActions.staffId, staff.id));
    expect(log.map((l) => l.action).sort()).toEqual(["review_approved", "review_approved", "review_declined", "review_told"]);
  });
});

describe("kit launcher", () => {
  it("parses pasted rows and explains the bad ones", () => {
    const { rows, errors } = parseKitCsv(
      "platform,handle,email,name\ninstagram,@Sara.Eats,SARA@example.com,Sara, Eats\nfacebook,x,x@example.com,X\ntiktok,ok_handle,not-an-email,Y\ninstagram,sara.eats,again@example.com,Dup\n\nyoutube,chef.ali,ali@example.com,",
    );
    expect(rows).toEqual([
      { platform: "instagram", handle: "sara.eats", email: "sara@example.com", name: "Sara, Eats" },
      { platform: "youtube", handle: "chef.ali", email: "ali@example.com", name: "chef.ali" },
    ]);
    expect(errors).toEqual(["Line 3: platform must be instagram, tiktok or youtube.", "Line 4: check the email.", "Line 5: @sara.eats is already in this list."]);
  });

  it("drafts, reviews, invites by hashed link, and lets the link holder claim", async () => {
    const db = await getDb();
    const staff = await user("staff-kits@evra.test");
    await db.insert(s.rateSamples).values([300, 350, 400, 450, 500].map((usd) => ({ niche: "food", country: "AE", platform: "instagram" as const, deliverable: "reel" as const, followers: 20_000, amountCents: usd * 100, source: "seed" as const })));
    const { ids, errors } = await importKits(db, staff.id, "instagram,claire.eats,claire@example.com,Claire Eats");
    expect(errors).toEqual([]);
    const id = ids[0];
    const [fresh] = await db.select().from(s.kitDrafts).where(eq(s.kitDrafts.id, id));
    expect(fresh).toMatchObject({ status: "draft", source: "csv", email: "claire@example.com" });
    expect(fresh.deleteAfter.getTime() - Date.now()).toBeGreaterThan(89 * DAY);

    // No APIFY_TOKEN in tests, so public stats can't be read: staff type the followers.
    await expect(redraft(db, staff.id, id, { llm })).rejects.toMatchObject({ status: 422 });
    await expect(approveDraft(db, staff.id, id)).rejects.toMatchObject({ status: 400 });
    const drafted = await redraft(db, staff.id, id, { followers: 24_000, llm });
    expect(drafted).toMatchObject({ headline: "Dubai food spots for weekend plans", followers: 24_000 });
    await approveDraft(db, staff.id, id);
    await editDraft(db, staff.id, id, { displayName: "Claire Eats", headline: "Cheap eats in Dubai", synopsis: drafted.synopsis });
    await expect(inviteDraft(db, staff.id, id, "https://evra.test")).rejects.toMatchObject({ status: 409 });
    await approveDraft(db, staff.id, id);
    await inviteDraft(db, staff.id, id, "https://evra.test");
    await expect(editDraft(db, staff.id, id, { displayName: "X", headline: "Y", synopsis: "Z" })).rejects.toMatchObject({ status: 409 });

    const [invite] = await inbox("claire@example.com");
    expect(invite.template).toBe("kit_claim_invite");
    const raw = tokenFrom(invite.body);
    const [saved] = await db.select().from(s.kitDrafts).where(eq(s.kitDrafts.id, id));
    expect(saved.claimTokenHash).toBe(sha256(raw));
    expect(kitData(saved).sources).toMatchObject({ name: { from: "csv" }, followers: { from: "staff" }, headline: { from: "staff" }, synopsis: { from: "assistant" } });
    expect(kitData(saved)).toMatchObject({ followers: 24_000, avgViews: 0, engagementBps: 0 }); // typed followers never come with made-up views
    expect((await draftForToken(db, raw))?.id).toBe(id);
    expect(await draftForToken(db, "not-the-token")).toBeNull();
    expect((await importKits(db, staff.id, "instagram,claire.eats,other@example.com,Again")).errors).toEqual(["@claire.eats already has a draft."]);

    const holder = await user("holder@example.com");
    await db.update(s.users).set({ handle: "taken.name" }).where(eq(s.users.id, holder.id));
    const claimer = await user("claimer@example.com");
    expect(await claimHandleState(db, raw, "@Taken.Name")).toMatchObject({ handle: "taken.name", valid: true, available: false });
    await expect(claimDraft(db, claimer, raw, { handle: "taken.name", country: "AE" })).rejects.toMatchObject({ status: 409 });
    expect(await claimDraft(db, claimer, raw, { handle: "claire.eats", country: "AE" })).toEqual({ next: "/me?welcome=1" });

    const [u] = await db.select().from(s.users).where(eq(s.users.id, claimer.id));
    expect(u).toMatchObject({ role: "creator", handle: "claire.eats", name: "Claire Eats", country: "AE", adult: true });
    expect(u.onboardedAt).toBeInstanceOf(Date);
    const [profile] = await db.select().from(s.creatorProfiles).where(eq(s.creatorProfiles.userId, claimer.id));
    expect(profile).toMatchObject({ displayName: "Claire Eats", headline: "Cheap eats in Dubai", bio: drafted.synopsis, niches: ["food", "travel"] });
    const [account] = await db.select().from(s.socialAccounts).where(eq(s.socialAccounts.userId, claimer.id));
    expect(account).toMatchObject({ platform: "instagram", handle: "claire.eats", followers: 24_000, source: "public", verified: false });
    const card = await db.select().from(s.rateCardItems).where(eq(s.rateCardItems.userId, claimer.id));
    expect(card.map((c) => [c.deliverable, c.priceCents]).sort()).toEqual([["reel", 40_000], ["story", 14_000], ["ugc", 20_000]]);
    expect((await db.select().from(s.kitDrafts).where(eq(s.kitDrafts.id, id)))[0]).toMatchObject({ status: "claimed", claimedBy: claimer.id, claimTokenHash: null });
    expect(await draftForToken(db, raw)).toBeNull();
  });

  it("deletes at once from the link, keeps only the handle, and never drafts that creator again", async () => {
    const db = await getDb();
    const staff = await user("staff-delete@evra.test");
    const { ids } = await importKits(db, staff.id, "tiktok,no.thanks,no.thanks@example.com,No Thanks");
    await redraft(db, staff.id, ids[0], { followers: 5_000, llm });
    await approveDraft(db, staff.id, ids[0]);
    await inviteDraft(db, staff.id, ids[0], "https://evra.test");
    const raw = tokenFrom((await inbox("no.thanks@example.com"))[0].body);

    await deleteByToken(db, raw);
    const [gone] = await db.select().from(s.kitDrafts).where(eq(s.kitDrafts.id, ids[0]));
    expect(gone).toMatchObject({ status: "deleted", handle: "no.thanks", email: null, displayName: null, headline: null, synopsis: null, claimTokenHash: null });
    expect(kitData(gone)).toEqual({ deleted: { by: "creator", at: expect.any(String) } });
    await expect(deleteByToken(db, raw)).rejects.toMatchObject({ status: 404 });
    const again = await importKits(db, staff.id, "tiktok,no.thanks,no.thanks@example.com,No Thanks");
    expect(again.ids).toEqual([]);
    expect(again.errors[0]).toContain("asked us to delete");
  });

  it("purges unclaimed drafts after 90 days", async () => {
    const db = await getDb();
    const staff = await user("staff-purge@evra.test");
    const [old] = await db.insert(s.kitDrafts).values({ handle: "too.old", platform: "instagram", email: "old@example.com", displayName: "Old", source: "csv", createdBy: staff.id, deleteAfter: ago(1) }).returning();
    expect(await purgeExpiredDrafts(db)).toBeGreaterThanOrEqual(1);
    const [row] = await db.select().from(s.kitDrafts).where(eq(s.kitDrafts.id, old.id));
    expect(row).toMatchObject({ status: "deleted", email: null, displayName: null });
    expect(kitData(row).deleted?.by).toBe("expiry");
  });
});

describe("support view", () => {
  it("needs a reason, shows a fenced summary to the staff member who opened it, and ends after 30 minutes", async () => {
    const db = await getDb();
    const staff = await user("staff-support@evra.test");
    const m = await user("member@example.com");
    await db.update(s.users).set({ role: "creator", handle: "member.one", name: "Member One" }).where(eq(s.users.id, m.id));
    const [brand] = await db.insert(s.brands).values({ name: "Fence Co." }).returning();
    const [deal] = await db.insert(s.deals).values({ brandId: brand.id, creatorId: m.id, title: "Fence reel", status: "active" }).returning();
    await db.insert(s.dealComments).values({ dealId: deal.id, userId: m.id, body: "PRIVATE-COMMENT" });
    await db.insert(s.requests).values({ type: "seeding", fromUserId: staff.id, toCreatorId: m.id, message: "PRIVATE-REQUEST-TEXT" });

    await expect(startView(db, staff.id, m.id, "  ")).rejects.toMatchObject({ status: 400 });
    const viewId = await startView(db, staff.id, m.id, "Member asked why their deal is stuck");
    const summary = await supportSummary(db, staff.id, viewId);
    expect(summary).toMatchObject({ state: "open", kitPath: "/@member.one", requests: { received: { open: 1 }, sent: 0 }, deals: [{ title: "Fence reel", status: "active" }] });
    const text = JSON.stringify(summary);
    for (const secret of ["PRIVATE-COMMENT", "PRIVATE-REQUEST-TEXT"]) expect(text).not.toContain(secret);

    const other = await user("staff-other@evra.test");
    expect(await supportSummary(db, other.id, viewId)).toEqual({ state: "missing" });
    await db.update(s.supportViews).set({ endsAt: new Date(Date.now() - 1000) }).where(eq(s.supportViews.id, viewId));
    expect(await supportSummary(db, staff.id, viewId)).toEqual({ state: "ended", memberId: m.id });
    const [log] = await db.select().from(s.staffActions).where(and(eq(s.staffActions.staffId, staff.id), eq(s.staffActions.action, "support_view")));
    expect(log).toMatchObject({ targetUserId: m.id, reason: "Member asked why their deal is stuck" });
  });
});

describe("needs a human", () => {
  it("lists stale drafts, quiet deals and idle Founding Creators", async () => {
    const db = await getDb();
    const creator = await user("quiet-creator@example.com");
    const owner = await user("slow-owner@example.com");
    const [brand] = await db.insert(s.brands).values({ name: "Slow Co." }).returning();
    await db.insert(s.brandMembers).values({ brandId: brand.id, userId: owner.id, role: "owner" });
    const [quiet] = await db.insert(s.deals).values({ brandId: brand.id, creatorId: creator.id, title: "Quiet deal", status: "active", fundedAt: ago(5) }).returning();
    const [fresh] = await db.insert(s.deals).values({ brandId: brand.id, creatorId: creator.id, title: "Fresh deal", status: "active", fundedAt: ago(1), createdAt: ago(20) }).returning();
    await db.insert(s.milestones).values([
      { dealId: quiet.id, idx: 0, title: "Draft video", amountCents: 100, status: "submitted", submittedAt: ago(4) },
      { dealId: fresh.id, idx: 0, title: "Recent draft", amountCents: 100, status: "submitted", submittedAt: ago(1) },
    ]);
    const idle = await user("founding-idle@example.com");
    const busy = await user("founding-busy@example.com");
    await db.update(s.users).set({ foundingNumber: 901, createdAt: ago(31) }).where(eq(s.users.id, idle.id));
    await db.update(s.users).set({ foundingNumber: 902, createdAt: ago(31) }).where(eq(s.users.id, busy.id));
    await db.insert(s.deals).values({ brandId: brand.id, creatorId: busy.id, title: "Busy deal", status: "negotiating" });

    const r = await needsAHuman(db);
    expect(r.waiting.map((w) => w.title)).toEqual(expect.arrayContaining(["Draft video"]));
    expect(r.waiting.map((w) => w.title)).not.toContain("Recent draft");
    expect(r.waiting.find((w) => w.title === "Draft video")?.brandOwnerId).toBe(owner.id);
    expect(r.quiet.map((d) => d.id)).toContain(quiet.id);
    expect(r.quiet.map((d) => d.id)).not.toContain(fresh.id);
    expect(r.founding.map((u) => u.id)).toContain(idle.id);
    expect(r.founding.map((u) => u.id)).not.toContain(busy.id);

    await db.insert(s.dealEvents).values({ dealId: quiet.id, actorId: creator.id, actorKind: "creator", kind: "comment" });
    expect((await needsAHuman(db)).quiet.map((d) => d.id)).not.toContain(quiet.id);
  });
});

describe("home slots", () => {
  it("creates slots, refuses unsafe links and backwards dates, and ends them once", async () => {
    const db = await getDb();
    const staff = await user("staff-slots@evra.test");
    expect(["/opportunities", "https://evra.world/academy", ""].every(safeHref)).toBe(true);
    expect(["javascript:alert(1)", "//evil.example", "http://plain.example", "opportunities"].some(safeHref)).toBe(false);
    const base = { kind: "tip" as const, segment: "creator" as const, locale: "all" as const, title: "Price your reels", body: "Use the rate guide before you reply.", href: "/me", startsOn: "2026-10-01", endsOn: "" };
    const slot = await createSlot(db, staff.id, base);
    expect(slot).toMatchObject({ endsAt: null, href: "/me" });
    await expect(createSlot(db, staff.id, { ...base, startsOn: "2026-10-10", endsOn: "2026-10-01" })).rejects.toMatchObject({ status: 400 });
    await expect(createSlot(db, staff.id, { ...base, href: "javascript:alert(1)" })).rejects.toMatchObject({ status: 400 });
    await endSlot(db, staff.id, slot.id);
    await expect(endSlot(db, staff.id, slot.id)).rejects.toMatchObject({ status: 409 });
  });
});

describe("message centre", () => {
  it("previews every template in English, Arabic and Hindi and test-sends to staff only", async () => {
    for (const key of TEMPLATE_KEYS)
      for (const locale of ["en", "ar", "hi"] as const) {
        const m = preview(key, locale);
        expect(m.subject.length * m.body.length).toBeGreaterThan(0);
      }
    const db = await getDb();
    const staff = await user("staff-messages@evra.test");
    await sendTest(db, staff, "kit_claim_invite", "ar");
    expect(await inbox(staff.email)).toMatchObject([{ template: "kit_claim_invite", locale: "ar", test: true }]);
  });
});
