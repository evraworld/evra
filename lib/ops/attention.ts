import { and, asc, count, eq, gt, inArray, isNotNull, isNull, lt, ne, notExists, sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { kitCounts } from "./kits";

const DAY = 86_400_000;

// "Needs a human" is computed on read, so it never drifts from the deals themselves.
export async function needsAHuman(db: DB, now = new Date()) {
  const d3 = new Date(now.getTime() - 3 * DAY);
  const d30 = new Date(now.getTime() - 30 * DAY);
  const creatorSince3d = db
    .select({ one: sql`1` })
    .from(s.dealEvents)
    .where(and(eq(s.dealEvents.dealId, s.deals.id), eq(s.dealEvents.actorKind, "creator"), gt(s.dealEvents.createdAt, d3)));
  const [waiting, quiet, founding] = await Promise.all([
    db
      .select({ id: s.milestones.id, title: s.milestones.title, submittedAt: s.milestones.submittedAt, dealTitle: s.deals.title, creatorId: s.deals.creatorId, brandId: s.deals.brandId })
      .from(s.milestones)
      .innerJoin(s.deals, eq(s.deals.id, s.milestones.dealId))
      .where(and(eq(s.milestones.status, "submitted"), lt(s.milestones.submittedAt, d3)))
      .orderBy(asc(s.milestones.submittedAt))
      .limit(100),
    db
      .select({ id: s.deals.id, title: s.deals.title, creatorId: s.deals.creatorId, brandId: s.deals.brandId, fundedAt: s.deals.fundedAt, createdAt: s.deals.createdAt })
      .from(s.deals)
      .where(and(eq(s.deals.status, "active"), sql`coalesce(${s.deals.fundedAt}, ${s.deals.createdAt}) < ${d3.toISOString()}`, notExists(creatorSince3d)))
      .orderBy(asc(s.deals.createdAt))
      .limit(100),
    db
      .select({ id: s.users.id, name: s.users.name, email: s.users.email, foundingNumber: s.users.foundingNumber, createdAt: s.users.createdAt })
      .from(s.users)
      .where(and(isNotNull(s.users.foundingNumber), lt(s.users.createdAt, d30), notExists(db.select({ one: sql`1` }).from(s.deals).where(eq(s.deals.creatorId, s.users.id)))))
      .orderBy(asc(s.users.foundingNumber))
      .limit(100),
  ]);
  const brandIds = [...new Set([...waiting, ...quiet].map((r) => r.brandId))];
  const owners = new Map(
    (brandIds.length ? await db.select({ brandId: s.brandMembers.brandId, userId: s.brandMembers.userId }).from(s.brandMembers).where(and(inArray(s.brandMembers.brandId, brandIds), eq(s.brandMembers.role, "owner"))) : []).map((o) => [o.brandId, o.userId]),
  );
  const withOwner = <T extends { brandId: string }>(r: T) => ({ ...r, brandOwnerId: owners.get(r.brandId) ?? null });
  return { waiting: waiting.map(withOwner), quiet: quiet.map(withOwner), founding, total: waiting.length + quiet.length + founding.length };
}

export async function opsCounts(db: DB) {
  const [[open], [untold], kits, attention] = await Promise.all([
    db.select({ n: count() }).from(s.flags).where(eq(s.flags.status, "open")),
    db.select({ n: count() }).from(s.flags).where(and(ne(s.flags.status, "open"), isNull(s.flags.toldAt), isNotNull(s.flags.userId))),
    kitCounts(db),
    needsAHuman(db),
  ]);
  return { open: open.n, untold: untold.n, kits, attention: attention.total };
}
