import { z } from "zod";
import { getDb } from "@/lib/db";
import { apiStaff } from "@/lib/auth/guards";
import { body, route } from "@/lib/http";
import { createSlot, endSlot } from "@/lib/ops/slots";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const Action = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    kind: z.enum(["announcement", "opportunity", "tip"]),
    segment: z.enum(["creator", "brand", "all"]),
    locale: z.enum(["en", "ar", "hi", "all"]),
    title: z.string().trim().min(2).max(80),
    body: z.string().trim().min(2).max(280),
    href: z.string().trim().max(300).default(""),
    startsOn: z.string().regex(DATE),
    endsOn: z.union([z.string().regex(DATE), z.literal("")]).default(""),
  }),
  z.object({ action: z.literal("end"), id: z.uuid() }),
]);

export const POST = route(async (req) => {
  const staff = await apiStaff();
  const db = await getDb();
  const a = Action.parse(await body(req));
  if (a.action === "end") return endSlot(db, staff.id, a.id);
  const slot = await createSlot(db, staff.id, a);
  return { id: slot.id };
});
