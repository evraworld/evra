import { z } from "zod";
import { getDb } from "@/lib/db";
import { apiStaff } from "@/lib/auth/guards";
import { body, route } from "@/lib/http";
import { resolveDispute } from "@/lib/deals/actions";

const Input = z.object({ disputeId: z.uuid(), creatorBps: z.number().int().min(0).max(10_000) });

export const POST = route(async (req) => {
  const staff = await apiStaff();
  const { disputeId, creatorBps } = Input.parse(await body(req));
  await resolveDispute(await getDb(), staff, disputeId, creatorBps);
  return { ok: true };
});
