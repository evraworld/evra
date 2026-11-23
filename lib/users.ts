import { eq } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { users, type Locale } from "@/lib/db/schema";
import { shortId } from "@/lib/crypto";

export const isStaffEmail = (email: string) =>
  (process.env.STAFF_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());

export async function findOrCreateUser(db: DB, rawEmail: string, locale: Locale = "en") {
  const email = rawEmail.trim().toLowerCase();
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) return { user: existing, created: false };
  const [user] = await db
    .insert(users)
    .values({ email, locale, staff: isStaffEmail(email), referralCode: shortId(6) })
    .onConflictDoNothing()
    .returning();
  if (user) return { user, created: true };
  const [raced] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return { user: raced, created: false };
}

export const HANDLE_RE = /^[a-z0-9_.]{3,30}$/;
export const normalizeHandle = (h: string) => h.trim().toLowerCase().replace(/^@+/, "");

export async function handleAvailable(db: DB, handle: string, exceptUserId?: string) {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.handle, handle)).limit(1);
  return !row || row.id === exceptUserId;
}
