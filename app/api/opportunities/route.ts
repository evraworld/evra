import { getDb } from "@/lib/db";
import { apiUser, HttpError } from "@/lib/auth/guards";
import { brandForUser } from "@/lib/brands";
import { body, route } from "@/lib/http";
import { createOpportunity, OpportunityInput } from "@/lib/opportunities";

export const POST = route(async (req) => {
  const user = await apiUser();
  const db = await getDb();
  const brand = await brandForUser(db, user.id);
  if (!brand) throw new HttpError(403, "Only brands can post briefs.");
  const opp = await createOpportunity(db, { brandId: brand.id, userId: user.id, input: OpportunityInput.parse(await body(req)) });
  return { id: opp.id };
});
