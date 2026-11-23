import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { HttpError } from "@/lib/auth/guards";

export type Collective = typeof s.collectives.$inferSelect;
export type Member = typeof s.collectiveMembers.$inferSelect;

// Founding Creators is EVRA's own collective, so people create the other kinds.
export const KINDS = ["city", "niche", "roster", "ugc"] as const;
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

export const CollectiveInput = z.object({
  name: z.string().trim().min(3, "Use at least 3 characters.").max(60),
  slug: z.string().trim().toLowerCase().regex(SLUG_RE, "Use 3 to 40 lowercase letters, numbers or dashes."),
  kind: z.enum(KINDS),
  description: z.string().trim().max(500).default(""),
  rules: z.string().trim().max(1000).default(""),
  membersVisible: z.boolean().default(false),
});

export const CollectiveAction = z.discriminatedUnion("action", [
  z.object({ action: z.enum(["join", "leave"]) }),
  z.object({ action: z.enum(["approve", "decline", "promote", "demote"]), userId: z.uuid() }),
  z.object({ action: z.literal("post"), kind: z.enum(["post", "ask"]), body: z.string().trim().min(2, "Write a little more.").max(2000) }),
  z.object({ action: z.enum(["pin", "unpin"]), postId: z.uuid() }),
]);
export type CollectiveAction = z.infer<typeof CollectiveAction>;

export const canModerate = (m: Member | null | undefined) => m?.status === "active" && (m.role === "owner" || m.role === "moderator");

export async function createCollective(db: DB, ownerId: string, input: z.infer<typeof CollectiveInput>) {
  const [c] = await db.insert(s.collectives).values({ ...input, ownerId }).onConflictDoNothing().returning();
  if (!c) throw new HttpError(409, "That link is taken. Try another.");
  await db.insert(s.collectiveMembers).values({ collectiveId: c.id, userId: ownerId, role: "owner", status: "active" });
  return c;
}

export async function findCollective(db: DB, slug: string) {
  const [c] = await db.select().from(s.collectives).where(eq(s.collectives.slug, slug.toLowerCase())).limit(1);
  return c ?? null;
}

export async function membership(db: DB, collectiveId: string, userId: string) {
  const [m] = await db.select().from(s.collectiveMembers).where(and(eq(s.collectiveMembers.collectiveId, collectiveId), eq(s.collectiveMembers.userId, userId))).limit(1);
  return m ?? null;
}

const forbidden = () => new HttpError(403, "Only the owner or a moderator can do that.");

// Every change to a collective goes through here, so the rules live in one place.
export async function collectiveAction(db: DB, c: Collective, actorId: string, a: CollectiveAction) {
  const me = await membership(db, c.id, actorId);
  const member = (userId: string) => and(eq(s.collectiveMembers.collectiveId, c.id), eq(s.collectiveMembers.userId, userId));
  switch (a.action) {
    case "join":
      if (!me) await db.insert(s.collectiveMembers).values({ collectiveId: c.id, userId: actorId, role: "member", status: "requested" }).onConflictDoNothing();
      return { status: me?.status ?? "requested" };
    case "leave":
      // Leaving never touches deals or money; owners hand over first.
      if (me?.role === "owner") throw new HttpError(400, "Owners can't leave their own collective.");
      await db.delete(s.collectiveMembers).where(member(actorId));
      return {};
    case "approve":
    case "decline": {
      if (!canModerate(me)) throw forbidden();
      const pending = and(member(a.userId), eq(s.collectiveMembers.status, "requested"));
      const done = a.action === "approve" ? await db.update(s.collectiveMembers).set({ status: "active" }).where(pending).returning() : await db.delete(s.collectiveMembers).where(pending).returning();
      if (!done.length) throw new HttpError(404, "That request was already handled.");
      return {};
    }
    case "promote":
    case "demote":
      if (me?.role !== "owner" || me.status !== "active") throw new HttpError(403, "Only the owner can change moderators.");
      await db
        .update(s.collectiveMembers)
        .set({ role: a.action === "promote" ? "moderator" : "member" })
        .where(and(member(a.userId), eq(s.collectiveMembers.status, "active"), sql`${s.collectiveMembers.role} <> 'owner'`));
      return {};
    case "post": {
      if (me?.status !== "active") throw new HttpError(403, "Only members can post here.");
      const [post] = await db.insert(s.collectivePosts).values({ collectiveId: c.id, userId: actorId, kind: a.kind, body: a.body }).returning();
      return { postId: post.id };
    }
    case "pin":
    case "unpin":
      if (!canModerate(me)) throw forbidden();
      await db.update(s.collectivePosts).set({ pinned: a.action === "pin" }).where(and(eq(s.collectivePosts.id, a.postId), eq(s.collectivePosts.collectiveId, c.id)));
      return {};
  }
}

const memberCount = sql<number>`(select count(*) from collective_members m where m.collective_id = ${s.collectives.id} and m.status = 'active')`.mapWith(Number);
const personName = sql<string>`coalesce(${s.creatorProfiles.displayName}, ${s.users.name}, 'Member')`;

export async function listCollectives(db: DB, userId: string) {
  const [all, mine] = await Promise.all([
    // shortcut: the newest 200 collectives; add search and paging when there are more.
    db.select({ c: s.collectives, members: memberCount }).from(s.collectives).orderBy(desc(s.collectives.createdAt)).limit(200),
    db.select().from(s.collectiveMembers).where(eq(s.collectiveMembers.userId, userId)),
  ]);
  const by = new Map(mine.map((m) => [m.collectiveId, m]));
  return {
    mine: all.filter((x) => by.has(x.c.id)).map((x) => ({ ...x, me: by.get(x.c.id)! })),
    others: all.filter((x) => !by.has(x.c.id)),
  };
}

// Posts, asks and collective-only briefs are for active members. The member list stays private unless the collective opted in.
export async function collectiveView(db: DB, slug: string, userId: string) {
  const c = await findCollective(db, slug);
  if (!c) return null;
  const me = await membership(db, c.id, userId);
  const active = me?.status === "active";
  const mod = canModerate(me);
  const people = () =>
    db
      .select({ userId: s.collectiveMembers.userId, role: s.collectiveMembers.role, status: s.collectiveMembers.status, name: personName, handle: s.users.handle })
      .from(s.collectiveMembers)
      .innerJoin(s.users, eq(s.users.id, s.collectiveMembers.userId))
      .leftJoin(s.creatorProfiles, eq(s.creatorProfiles.userId, s.collectiveMembers.userId))
      .where(eq(s.collectiveMembers.collectiveId, c.id))
      .orderBy(asc(s.collectiveMembers.createdAt));
  const [[{ n }], posts, everyone, opportunities] = await Promise.all([
    db.select({ n: count() }).from(s.collectiveMembers).where(and(eq(s.collectiveMembers.collectiveId, c.id), eq(s.collectiveMembers.status, "active"))),
    active
      ? db
          .select({ post: s.collectivePosts, name: personName })
          .from(s.collectivePosts)
          .innerJoin(s.users, eq(s.users.id, s.collectivePosts.userId))
          .leftJoin(s.creatorProfiles, eq(s.creatorProfiles.userId, s.collectivePosts.userId))
          .where(eq(s.collectivePosts.collectiveId, c.id))
          .orderBy(desc(s.collectivePosts.pinned), desc(s.collectivePosts.createdAt))
          .limit(100)
      : [],
    c.membersVisible || mod ? people() : [],
    active
      ? db
          .select({ id: s.opportunities.id, title: s.opportunities.title, budgetCents: s.opportunities.budgetCents, brand: s.brands.name })
          .from(s.opportunities)
          .innerJoin(s.brands, eq(s.brands.id, s.opportunities.brandId))
          .where(and(eq(s.opportunities.collectiveId, c.id), eq(s.opportunities.status, "open")))
          .orderBy(desc(s.opportunities.createdAt))
      : [],
  ]);
  return {
    collective: c,
    me,
    canModerate: mod,
    memberCount: n,
    posts,
    members: c.membersVisible || mod ? everyone.filter((p) => p.status === "active") : null,
    pending: mod ? everyone.filter((p) => p.status === "requested") : [],
    opportunities,
  };
}
