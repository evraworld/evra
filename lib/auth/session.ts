import { cookies } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { getDb, type DB } from "@/lib/db";
import { sessions, users } from "@/lib/db/schema";
import { sha256, token } from "@/lib/crypto";

export const SESSION_COOKIE = "evra_session";
const DAYS = 30;

export type User = typeof users.$inferSelect;

export async function createSession(db: DB, userId: string, userAgent?: string | null) {
  const raw = token(32);
  // Only the hash is stored, so a database leak does not leak live sessions.
  await db.insert(sessions).values({ id: sha256(raw), userId, expiresAt: new Date(Date.now() + DAYS * 86_400_000), userAgent: userAgent ?? null });
  (await cookies()).set(SESSION_COOKIE, raw, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DAYS * 86_400,
  });
}

export async function userForSessionToken(db: DB, raw: string): Promise<User | null> {
  const [row] = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, sha256(raw)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return row?.user ?? null;
}

export async function currentUser(): Promise<User | null> {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  return userForSessionToken(await getDb(), raw);
}

export async function destroySession() {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (raw) await (await getDb()).delete(sessions).where(eq(sessions.id, sha256(raw)));
  jar.delete(SESSION_COOKIE);
}
