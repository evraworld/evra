import { z } from "zod";
import { getDb } from "@/lib/db";
import { apiStaff } from "@/lib/auth/guards";
import { body, route } from "@/lib/http";
import { findMembers, startView } from "@/lib/ops/support";

// Search is a POST so member emails never travel in a URL.
const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("search"), q: z.string().max(200) }),
  z.object({ action: z.literal("start"), memberId: z.uuid(), reason: z.string().max(500) }),
]);

export const POST = route(async (req) => {
  const staff = await apiStaff();
  const db = await getDb();
  const a = Action.parse(await body(req));
  if (a.action === "search") return { members: await findMembers(db, a.q) };
  return { next: `/ops/support/${await startView(db, staff.id, a.memberId, a.reason)}` };
});
