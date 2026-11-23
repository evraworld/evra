import { and, asc, eq, gt, inArray, isNull, lte } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { brands, requests } from "@/lib/db/schema";
import { creatorNames } from "@/lib/creators";
import { send } from "@/lib/messages";
import { createReplyLink, emailsFor } from "@/lib/requests";

const DAY = 86_400_000;

// Response rules (PRD module 13): a reminder on day 6, closed with a polite note to the sender on day 7,
// and never more than one reminder every 3 days to the same person. Safe to run as often as you like.
export async function runRequestJobs(db: DB, now = new Date()) {
  const origin = process.env.APP_ORIGIN ?? "http://localhost:3000";
  const ago = (days: number) => new Date(now.getTime() - days * DAY);

  // Close first, so nothing due to close today gets a reminder. Credits are not refunded.
  const closed = await db.update(requests).set({ status: "closed_no_response" }).where(and(eq(requests.status, "open"), lte(requests.createdAt, ago(7)))).returning();
  if (closed.length) {
    const [senders, names] = await Promise.all([emailsFor(db, [...new Set(closed.map((r) => r.fromUserId))]), creatorNames(db, [...new Set(closed.map((r) => r.toCreatorId))])]);
    for (const r of closed) {
      const to = senders.get(r.fromUserId);
      if (to) await send(db, { to: to.email, template: "request_no_response", locale: to.locale, data: { creator: names.get(r.toCreatorId) ?? "The creator" } });
    }
  }

  const due = await db
    .select({ id: requests.id, creatorId: requests.toCreatorId, brand: brands.name })
    .from(requests)
    .leftJoin(brands, eq(brands.id, requests.fromBrandId))
    .where(and(eq(requests.status, "open"), isNull(requests.remindedAt), lte(requests.createdAt, ago(6))))
    .orderBy(asc(requests.createdAt));
  let reminded = 0;
  if (due.length) {
    const creatorIds = [...new Set(due.map((d) => d.creatorId))];
    const recent = await db.selectDistinct({ id: requests.toCreatorId }).from(requests).where(and(inArray(requests.toCreatorId, creatorIds), gt(requests.remindedAt, ago(3))));
    const skip = new Set(recent.map((r) => r.id));
    const people = await emailsFor(db, creatorIds);
    for (const d of due) {
      const to = people.get(d.creatorId);
      if (!to || skip.has(d.creatorId)) continue;
      skip.add(d.creatorId);
      // Conditional update, so two overlapping runs can't both remind.
      const [claimed] = await db.update(requests).set({ remindedAt: now }).where(and(eq(requests.id, d.id), isNull(requests.remindedAt))).returning({ id: requests.id });
      if (!claimed) continue;
      const raw = await createReplyLink(db, d.id, d.creatorId, now);
      await send(db, { to: to.email, template: "request_reminder", locale: to.locale, data: { from: d.brand ?? "A brand", url: `${origin}/reply/${raw}` } });
      reminded++;
    }
  }
  return { closed: closed.length, reminded };
}
