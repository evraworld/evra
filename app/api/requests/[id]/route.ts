import { getDb } from "@/lib/db";
import { apiUser, HttpError } from "@/lib/auth/guards";
import { body, route } from "@/lib/http";
import { isUuid } from "@/lib/opportunities";
import { AnswerInput, answerRequest } from "@/lib/requests";

// The creator answers from their inbox. Accepting a paid collab returns the new Deal Room.
export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const user = await apiUser();
  const { id } = await params;
  if (!isUuid(id)) throw new HttpError(404, "We couldn't find that request.");
  const answer = AnswerInput.parse(await body(req));
  const out = await answerRequest(await getDb(), { by: { userId: user.id, requestId: id }, answer, origin: process.env.APP_ORIGIN ?? "http://localhost:3000" });
  return { status: out.request.status, dealId: out.dealId };
});
