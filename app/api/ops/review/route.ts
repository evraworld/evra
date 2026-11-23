import { z } from "zod";
import { getDb } from "@/lib/db";
import { apiStaff } from "@/lib/auth/guards";
import { body, route } from "@/lib/http";
import { decide, tell } from "@/lib/ops/review";

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("decide"), ids: z.array(z.uuid()).min(1).max(100), decision: z.enum(["approved", "declined"]), reason: z.string().max(500).default("") }),
  z.object({ action: z.literal("tell"), id: z.uuid() }),
]);

export const POST = route(async (req) => {
  const staff = await apiStaff();
  const db = await getDb();
  const a = Action.parse(await body(req));
  if (a.action === "decide") return { decided: await decide(db, staff.id, a.ids, a.decision, a.reason) };
  await tell(db, staff.id, a.id);
});
