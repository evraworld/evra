import { z } from "zod";
import { getDb } from "@/lib/db";
import { HttpError, isStaff } from "@/lib/auth/guards";
import { verifyOtp } from "@/lib/auth/otp";
import { createSession } from "@/lib/auth/session";
import { findOrCreateUser } from "@/lib/users";
import { body, route } from "@/lib/http";

const Input = z.object({ email: z.string().max(200), code: z.string().regex(/^\d{6}$/), locale: z.enum(["en", "ar", "hi"]).default("en") });

export const POST = route(async (req) => {
  const { email, code, locale } = Input.parse(await body(req));
  const db = await getDb();
  if (!(await verifyOtp(db, email, code))) throw new HttpError(400, "That code didn't work. Check it, or ask for a new one.");
  const { user } = await findOrCreateUser(db, email, locale);
  await createSession(db, user.id, req.headers.get("user-agent"));
  return { next: user.onboardedAt ? "/home" : isStaff(user) ? "/ops" : "/onboarding" };
});
