import { and, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { otpCodes, type Locale } from "@/lib/db/schema";
import { hmac, safeEqual, sixDigitCode } from "@/lib/crypto";
import { send } from "@/lib/messages";

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const TTL_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;
// Local end-to-end runs sign in far more often than a person would; production keeps the default of 5.
const MAX_PER_HOUR = Number(process.env.OTP_MAX_PER_HOUR ?? 5);

export class OtpError extends Error {
  constructor(public code: "invalid_email" | "rate_limited") {
    super(code);
  }
}

const hash = (purpose: string, email: string, code: string) => hmac(`${purpose}:${email}:${code}`);

export async function startOtp(db: DB, rawEmail: string, opts: { purpose?: "signin" | "claim"; locale?: Locale; amount?: string } = {}) {
  const email = rawEmail.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new OtpError("invalid_email");
  const purpose = opts.purpose ?? "signin";
  const recent = await db
    .select({ id: otpCodes.id })
    .from(otpCodes)
    .where(and(eq(otpCodes.email, email), gt(otpCodes.createdAt, new Date(Date.now() - 3_600_000))));
  if (recent.length >= MAX_PER_HOUR) throw new OtpError("rate_limited");

  const code = sixDigitCode();
  await db.insert(otpCodes).values({ email, purpose, codeHash: hash(purpose, email, code), expiresAt: new Date(Date.now() + TTL_MS) });
  if (purpose === "claim") await send(db, { to: email, template: "claim_code", locale: opts.locale, data: { code, amount: opts.amount ?? "" } });
  else await send(db, { to: email, template: "signin_code", locale: opts.locale, data: { code } });
}

export async function verifyOtp(db: DB, rawEmail: string, code: string, purpose: "signin" | "claim" = "signin") {
  const email = rawEmail.trim().toLowerCase();
  const [row] = await db
    .select()
    .from(otpCodes)
    .where(and(eq(otpCodes.email, email), eq(otpCodes.purpose, purpose), isNull(otpCodes.consumedAt), gt(otpCodes.expiresAt, new Date())))
    .orderBy(desc(otpCodes.createdAt))
    .limit(1);
  if (!row) return false;
  // Take an attempt in one statement before comparing, so parallel guesses can't all see the same count.
  const [taken] = await db
    .update(otpCodes)
    .set({ attempts: sql`${otpCodes.attempts} + 1` })
    .where(and(eq(otpCodes.id, row.id), lt(otpCodes.attempts, MAX_ATTEMPTS)))
    .returning({ id: otpCodes.id });
  if (!taken || !safeEqual(hash(purpose, email, code.trim()), row.codeHash)) return false;
  const [used] = await db
    .update(otpCodes)
    .set({ consumedAt: new Date() })
    .where(and(eq(otpCodes.id, row.id), isNull(otpCodes.consumedAt)))
    .returning({ id: otpCodes.id });
  return !!used;
}
