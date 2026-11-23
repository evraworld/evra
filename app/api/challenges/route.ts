import { z } from "zod";
import { getDb } from "@/lib/db";
import { apiUser } from "@/lib/auth/guards";
import { approveEntry, ChallengeInput, createChallenge, rejectEntry, submitEntry } from "@/lib/challenges";
import { body, route } from "@/lib/http";

const Action = z.discriminatedUnion("action", [
  ChallengeInput.extend({ action: z.literal("create") }),
  z.object({ action: z.literal("enter"), challengeId: z.string().uuid(), url: z.string().max(500) }),
  z.object({ action: z.literal("approve"), entryId: z.string().uuid() }),
  z.object({ action: z.literal("reject"), entryId: z.string().uuid() }),
]);

export const POST = route(async (req) => {
  const user = await apiUser();
  const db = await getDb();
  const a = Action.parse(await body(req));
  switch (a.action) {
    case "create": {
      const c = await createChallenge(db, user, ChallengeInput.parse(a));
      return { next: `/challenges/${c.id}` };
    }
    case "enter":
      await submitEntry(db, user, a.challengeId, a.url);
      return { ok: true };
    case "approve":
      return await approveEntry(db, user, a.entryId);
    case "reject":
      await rejectEntry(db, user, a.entryId);
      return { ok: true };
  }
});
