import { getDb } from "@/lib/db";
import { apiUser, HttpError } from "@/lib/auth/guards";
import { body, route } from "@/lib/http";
import { collectiveAction, CollectiveAction, findCollective } from "@/lib/collectives";

// Join, leave, approve, post, pin and moderator changes; the rules live in lib/collectives.
export const POST = route<{ params: Promise<{ slug: string }> }>(async (req, { params }) => {
  const user = await apiUser();
  if (!user.onboardedAt || user.role === "brand") throw new HttpError(403, "Collectives are for creators and managers.");
  const db = await getDb();
  const c = await findCollective(db, (await params).slug);
  if (!c) throw new HttpError(404, "We couldn't find that collective.");
  return collectiveAction(db, c, user.id, CollectiveAction.parse(await body(req)));
});
