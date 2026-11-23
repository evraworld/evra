import { z } from "zod";
import { getDb } from "@/lib/db";
import { HttpError } from "@/lib/auth/guards";
import { OtpError, startOtp } from "@/lib/auth/otp";
import { body, route } from "@/lib/http";

const Input = z.object({ email: z.string().max(200), locale: z.enum(["en", "ar", "hi"]).default("en") });

export const POST = route(async (req) => {
  const { email, locale } = Input.parse(await body(req));
  try {
    await startOtp(await getDb(), email, { locale });
  } catch (e) {
    if (e instanceof OtpError && e.code === "invalid_email") throw new HttpError(400, "Enter a valid email address.");
    if (e instanceof OtpError) throw new HttpError(429, "Too many codes. Wait a few minutes and try again.");
    throw e;
  }
  return { ok: true };
});
