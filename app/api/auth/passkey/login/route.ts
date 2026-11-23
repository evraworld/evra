import { getDb } from "@/lib/db";
import { verifyAuthentication } from "@/lib/auth/passkeys";
import { createSession } from "@/lib/auth/session";
import { body, route } from "@/lib/http";

export const POST = route(async (req) => {
  const db = await getDb();
  const user = await verifyAuthentication(db, (await body(req)).response);
  await createSession(db, user.id, req.headers.get("user-agent"));
  return { next: user.onboardedAt ? "/home" : "/onboarding" };
});
