import { getDb } from "@/lib/db";
import { apiUser, HttpError } from "@/lib/auth/guards";
import { body, route } from "@/lib/http";
import { CollectiveInput, createCollective } from "@/lib/collectives";

export const POST = route(async (req) => {
  const user = await apiUser();
  if (!user.onboardedAt || user.role === "brand") throw new HttpError(403, "Collectives are for creators and managers.");
  const c = await createCollective(await getDb(), user.id, CollectiveInput.parse(await body(req)));
  return { slug: c.slug, next: `/collectives/${c.slug}` };
});
