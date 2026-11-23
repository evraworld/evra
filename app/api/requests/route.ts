import { getDb } from "@/lib/db";
import { apiUser, HttpError } from "@/lib/auth/guards";
import { brandForUser } from "@/lib/brands";
import { body, route } from "@/lib/http";
import { RequestInput, sendRequest } from "@/lib/requests";

// A brand sends a typed request (module 13). Unfunded asks spend a credit; funded paid collabs never do.
export const POST = route(async (req) => {
  const user = await apiUser();
  const db = await getDb();
  const brand = await brandForUser(db, user.id);
  if (!brand) throw new HttpError(403, "Sign in as a brand to send requests.");
  const input = RequestInput.parse(await body(req));
  const r = await sendRequest(db, { userId: user.id, brand, input, origin: process.env.APP_ORIGIN ?? "http://localhost:3000" });
  return { id: r.id, funded: r.funded, creditsSpent: r.creditsSpent };
});
