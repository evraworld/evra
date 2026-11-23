import { z } from "zod";
import { getDb } from "@/lib/db";
import { apiUser } from "@/lib/auth/guards";
import { body, route } from "@/lib/http";
import { COUNTRIES } from "@/lib/onboarding";
import { claimDraft, claimHandleState, deleteByToken } from "@/lib/ops/kits";

// The link is the key: checking a handle and deleting need no sign-in (privacy first); claiming does.
const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("check"), handle: z.string().max(40) }),
  z.object({ action: z.literal("delete") }),
  z.object({ action: z.literal("claim"), handle: z.string().max(40), country: z.enum(COUNTRIES), adult: z.literal(true) }),
]);

export const POST = route<{ params: Promise<{ token: string }> }>(async (req, { params }) => {
  const { token } = await params;
  const db = await getDb();
  const a = Action.parse(await body(req));
  if (a.action === "check") return claimHandleState(db, token, a.handle);
  if (a.action === "delete") return deleteByToken(db, token);
  return claimDraft(db, await apiUser(), token, a);
});
