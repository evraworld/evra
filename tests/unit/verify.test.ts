import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { findOrCreateUser } from "@/lib/users";
import { checkVerification, verifyAccount, verifyCode } from "@/lib/verify";

const profile = (bio: string, followers: number) => ({ followers, avgViews: 9_000, engagementBps: 400, reach90d: [], captions: [], bio });

describe("social verification", () => {
  it("gives each user and platform a stable, readable code", () => {
    expect(verifyCode("u1", "instagram")).toMatch(/^EVRA-[2-9A-Z]{4}$/);
    expect(verifyCode("u1", "instagram")).toBe(verifyCode("u1", "instagram"));
    expect(verifyCode("u1", "instagram")).not.toBe(verifyCode("u2", "instagram"));
  });
  it("verifies when the code is in the bio and followers match", () => expect(checkVerification("EVRA-7K2Q", 50_000, profile("hi evra-7k2q", 52_000)).status).toBe("verified"));
  it("fails without the code", () => expect(checkVerification("EVRA-7K2Q", 50_000, profile("hi", 50_000)).status).toBe("failed"));
  it("fails when the profile can't be read", () => expect(checkVerification("EVRA-7K2Q", 50_000, null).status).toBe("failed"));
  it("sends big follower gaps to a person", () => expect(checkVerification("EVRA-7K2Q", 120_000, profile("EVRA-7K2Q", 31_000)).status).toBe("review"));

  it("records the result on the account, and a failed check changes nothing", async () => {
    const db = await getDb();
    const { user } = await findOrCreateUser(db, "verify@mvp.test");
    await db.insert(s.socialAccounts).values({ userId: user.id, platform: "instagram", handle: "v.test", followers: 50_000, source: "self" });
    const code = verifyCode(user.id, "instagram");
    const acct = async () => (await db.select().from(s.socialAccounts).where(eq(s.socialAccounts.userId, user.id)))[0];

    await expect(verifyAccount(db, user.id, "instagram", async () => profile("no code", 50_000))).rejects.toThrow(/isn't in your bio/);
    expect(await acct()).toMatchObject({ verified: false, source: "self" });

    expect(await verifyAccount(db, user.id, "instagram", async () => profile(`hi ${code}`, 49_000))).toMatchObject({ status: "verified" });
    expect(await acct()).toMatchObject({ verified: true, source: "public", followers: 49_000 });
  });
});
