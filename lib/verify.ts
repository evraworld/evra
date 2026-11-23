import { and, eq } from "drizzle-orm";
import type { DB } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { ALPHABET, hmac } from "@/lib/crypto";
import { HttpError } from "@/lib/auth/guards";
import { publicInstagram, type Stats } from "@/lib/social";

// Social verification: the creator puts a code in their bio, EVRA reads the public profile, and the code
// proves they own the account. The code is derived from the user and platform, so nothing needs storing.
export const verifyCode = (userId: string, platform: s.Platform) =>
  `EVRA-${Array.from(hmac(`verify:${userId}:${platform}`).slice(0, 8).match(/../g)!, (h) => ALPHABET[parseInt(h, 16) % ALPHABET.length]).join("")}`;

// Claimed and public follower counts can differ a little (the count moves daily); beyond this, a person checks.
export const FOLLOWER_TOLERANCE = 0.2;

export type Verification = { status: "verified" | "failed" | "review"; reason: string; stats: Stats | null };

export function checkVerification(code: string, claimedFollowers: number | null, profile: Stats | null): Verification {
  if (!profile) return { status: "failed", reason: "We couldn't read this profile. Check the handle and that the account is public.", stats: null };
  if (!(profile.bio ?? "").toUpperCase().includes(code.toUpperCase())) return { status: "failed", reason: `The code ${code} isn't in your bio yet. Add it, save, and try again.`, stats: profile };
  if (claimedFollowers && Math.abs(profile.followers - claimedFollowers) / claimedFollowers > FOLLOWER_TOLERANCE)
    return { status: "review", reason: `You entered ${claimedFollowers.toLocaleString("en-US")} followers; the public profile shows ${profile.followers.toLocaleString("en-US")}. A person will check this.`, stats: profile };
  return { status: "verified", reason: "Code found in bio. Followers and engagement read from the public profile.", stats: profile };
}

// Reads the public profile and records the result. A failed check changes nothing and says why.
export async function verifyAccount(db: DB, userId: string, platform: s.Platform, fetchProfile: (handle: string) => Promise<Stats | null> = publicInstagram) {
  const [acct] = await db.select().from(s.socialAccounts).where(and(eq(s.socialAccounts.userId, userId), eq(s.socialAccounts.platform, platform))).limit(1);
  if (!acct) throw new HttpError(404, "Add this account to your kit first.");
  // shortcut: Instagram only (public profile via Apify); add TikTok and YouTube readers when creators ask.
  if (platform !== "instagram") throw new HttpError(400, "Verification works for Instagram first. TikTok and YouTube are next.");
  const v = checkVerification(verifyCode(userId, platform), acct.followers, await fetchProfile(acct.handle));
  if (v.status === "failed") throw new HttpError(400, v.reason);
  const st = v.stats!;
  await db
    .update(s.socialAccounts)
    .set(v.status === "verified" ? { verified: true, source: "public", followers: st.followers, avgViews: st.avgViews || acct.avgViews, engagementBps: st.engagementBps || acct.engagementBps, syncedAt: new Date() } : { verified: false, source: "review", syncedAt: new Date() })
    .where(eq(s.socialAccounts.id, acct.id));
  return { status: v.status, message: v.reason };
}
