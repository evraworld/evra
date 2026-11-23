import { and, asc, desc, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { brands, flags, users } from "@/lib/db/schema";
import { HttpError } from "@/lib/auth/guards";
import { send } from "@/lib/messages";
import { audit } from "./audit";

export type Decision = "approved" | "declined";

const row = { flag: flags, email: users.email, name: users.name, handle: users.handle, role: users.role, memberStatus: users.status, foundingNumber: users.foundingNumber, brandName: brands.name };

export async function reviewQueue(db: DB) {
  const base = () => db.select(row).from(flags).leftJoin(users, eq(users.id, flags.userId)).leftJoin(brands, eq(brands.id, flags.brandId));
  const [open, untold] = await Promise.all([
    base().where(eq(flags.status, "open")).orderBy(asc(flags.createdAt)).limit(200),
    // Only rows with a member can be told; the rest leave the queue once decided.
    base().where(and(ne(flags.status, "open"), isNull(flags.toldAt), isNotNull(flags.userId))).orderBy(desc(flags.decidedAt)).limit(200),
  ]);
  return { open, untold };
}

// Decides open items only, so a double click or a stale page never overturns an earlier decision.
export async function decide(db: DB, staffId: string, ids: string[], decision: Decision, rawReason: string) {
  const reason = rawReason.trim();
  if (decision === "declined" && reason.length < 3) throw new HttpError(400, "Give a reason for every decline. The member sees it.");
  const done = await db
    .update(flags)
    .set({ status: decision, decisionReason: reason || null, decidedBy: staffId, decidedAt: new Date() })
    .where(and(inArray(flags.id, ids), eq(flags.status, "open")))
    .returning();
  const members = [...new Set(done.map((f) => f.userId).filter((id): id is string => !!id))];
  if (members.length) await db.update(users).set({ status: decision === "approved" ? "active" : "declined" }).where(inArray(users.id, members));
  for (const f of done) await audit(db, staffId, `review_${decision}`, { target: f.userId, reason: reason || null, data: { flagId: f.id, source: f.source } });
  return done.length;
}

// The separate "tell them" step: one message per decision, never two.
export async function tell(db: DB, staffId: string, id: string) {
  const [r] = await db.select({ flag: flags, email: users.email, locale: users.locale }).from(flags).innerJoin(users, eq(users.id, flags.userId)).where(eq(flags.id, id)).limit(1);
  if (!r) throw new HttpError(404, "There's no member to tell for this item.");
  if (r.flag.status === "open") throw new HttpError(409, "Decide first, then tell them.");
  const [marked] = await db.update(flags).set({ toldAt: new Date() }).where(and(eq(flags.id, id), isNull(flags.toldAt))).returning({ id: flags.id });
  if (!marked) throw new HttpError(409, "They were already told.");
  await send(db, { to: r.email, template: "review_decision", locale: r.locale, data: { approved: r.flag.status === "approved", reason: r.flag.decisionReason ?? undefined } });
  await audit(db, staffId, "review_told", { target: r.flag.userId, data: { flagId: id, decision: r.flag.status } });
}
