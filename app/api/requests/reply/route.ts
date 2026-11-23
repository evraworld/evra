import { z } from "zod";
import { getDb } from "@/lib/db";
import { body, route } from "@/lib/http";
import { AnswerInput, answerRequest } from "@/lib/requests";

const Token = z.object({ token: z.string().min(16).max(100) });

// Reply by secure link, no sign-in: the link works once and expires after 14 days.
export const POST = route(async (req) => {
  const data = await body(req);
  const { token } = Token.parse(data);
  const out = await answerRequest(await getDb(), { by: { token }, answer: AnswerInput.parse(data), origin: process.env.APP_ORIGIN ?? "http://localhost:3000" });
  return { status: out.request.status, dealId: out.dealId };
});
