import { getDb } from "@/lib/db";
import { apiUser, HttpError } from "@/lib/auth/guards";
import { route } from "@/lib/http";
import { expressInterest, isUuid } from "@/lib/opportunities";

// "I'm interested" opens (or reopens) this creator's Deal Room for the brief.
export const POST = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const user = await apiUser();
  const { id } = await params;
  if (!isUuid(id)) throw new HttpError(404, "That brief isn't open to you.");
  const dealId = await expressInterest(await getDb(), { opportunityId: id, user, origin: process.env.APP_ORIGIN ?? "http://localhost:3000" });
  return { dealId, next: `/deals/${dealId}` };
});
