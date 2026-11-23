import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { homeSlots, type Locale } from "@/lib/db/schema";
import { HttpError } from "@/lib/auth/guards";
import { audit } from "./audit";

export type SlotInput = {
  kind: "announcement" | "opportunity" | "tip";
  segment: "creator" | "brand" | "all";
  locale: Locale | "all";
  title: string;
  body: string;
  href: string;
  startsOn: string;
  endsOn: string;
};

// Dates arrive as YYYY-MM-DD; a slot runs from the start of its first day to the end of its last (UTC).
const day = (iso: string, end = false) => new Date(`${iso}T${end ? "23:59:59.999" : "00:00:00.000"}Z`);
// Links on Home go to an EVRA page or a full https address, never javascript: or protocol-relative URLs.
export const safeHref = (href: string) => href === "" || /^\/(?!\/)/.test(href) || /^https:\/\/[^\s]+$/.test(href);

export async function createSlot(db: DB, staffId: string, i: SlotInput) {
  const startsAt = day(i.startsOn);
  const endsAt = i.endsOn ? day(i.endsOn, true) : null;
  if (isNaN(startsAt.getTime()) || (endsAt && isNaN(endsAt.getTime()))) throw new HttpError(400, "Check the dates.");
  if (endsAt && endsAt <= startsAt) throw new HttpError(400, "The end date must be on or after the start date.");
  if (!safeHref(i.href)) throw new HttpError(400, "Links must be an EVRA page like /opportunities or a full https:// address.");
  const [slot] = await db
    .insert(homeSlots)
    .values({ kind: i.kind, segment: i.segment, locale: i.locale, title: i.title, body: i.body, href: i.href || null, startsAt, endsAt, createdBy: staffId })
    .returning();
  await audit(db, staffId, "slot_create", { data: { slotId: slot.id, title: slot.title } });
  return slot;
}

export async function endSlot(db: DB, staffId: string, id: string) {
  const now = new Date();
  const [slot] = await db
    .update(homeSlots)
    .set({ endsAt: now })
    .where(and(eq(homeSlots.id, id), or(isNull(homeSlots.endsAt), gt(homeSlots.endsAt, now))))
    .returning({ id: homeSlots.id });
  if (!slot) throw new HttpError(409, "That slot has already ended.");
  await audit(db, staffId, "slot_end", { data: { slotId: id } });
}

export async function listSlots(db: DB) {
  const now = Date.now();
  const rows = await db.select().from(homeSlots).orderBy(desc(homeSlots.startsAt)).limit(200);
  return rows.map((s) => ({ ...s, state: s.endsAt && s.endsAt.getTime() <= now ? ("ended" as const) : s.startsAt.getTime() > now ? ("scheduled" as const) : ("live" as const) }));
}
