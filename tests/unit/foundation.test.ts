import { describe, expect, it } from "vitest";
import { shortId } from "@/lib/crypto";
import { feeCents, formatMoney, parseDollarsToCents } from "@/lib/money";
import { getDb } from "@/lib/db";
import { outbox, rateSamples } from "@/lib/db/schema";
import { OtpError, startOtp, verifyOtp } from "@/lib/auth/otp";
import { rateRange } from "@/lib/rates";
import { findOrCreateUser } from "@/lib/users";
import { eq } from "drizzle-orm";

describe("ids and money", () => {
  it("makes readable receipt ids", () => expect(shortId(8)).toMatch(/^[2-9A-HJ-NP-Z]{8}$/));
  it("charges 5% on released value, rounded down", () => {
    expect(feeCents(30_000)).toBe(1_500);
    expect(feeCents(333)).toBe(16);
  });
  it("parses and formats money for people", () => {
    expect(parseDollarsToCents("$1,250.50")).toBe(125_050);
    expect(parseDollarsToCents("abc")).toBe(0);
    expect(formatMoney(30_000)).toBe("$300");
    expect(formatMoney(12_345)).toBe("$123.45");
  });
});

describe("email codes", () => {
  it("sends a code, rejects a wrong one, accepts the right one once", async () => {
    const db = await getDb();
    await startOtp(db, "Person@Example.com");
    const [msg] = await db.select().from(outbox).where(eq(outbox.to, "person@example.com"));
    const code = msg.subject.match(/(\d{6})/)![1];
    expect(await verifyOtp(db, "person@example.com", code === "000000" ? "111111" : "000000")).toBe(false);
    expect(await verifyOtp(db, "person@example.com", code)).toBe(true);
    expect(await verifyOtp(db, "person@example.com", code)).toBe(false);
  });
  it("counts parallel wrong guesses, so the right code is refused after five", async () => {
    const db = await getDb();
    await startOtp(db, "guessed@example.com");
    const [msg] = await db.select().from(outbox).where(eq(outbox.to, "guessed@example.com"));
    const code = msg.subject.match(/(\d{6})/)![1];
    const wrong = code === "000000" ? "111111" : "000000";
    await Promise.all(Array.from({ length: 20 }, () => verifyOtp(db, "guessed@example.com", wrong)));
    expect(await verifyOtp(db, "guessed@example.com", code)).toBe(false);
  });
  it("rejects bad emails and rate-limits after five codes an hour", async () => {
    const db = await getDb();
    await expect(startOtp(db, "not-an-email")).rejects.toBeInstanceOf(OtpError);
    for (let i = 0; i < 5; i++) await startOtp(db, "busy@example.com");
    await expect(startOtp(db, "busy@example.com")).rejects.toMatchObject({ code: "rate_limited" });
  });
  it("creates each user once", async () => {
    const db = await getDb();
    const a = await findOrCreateUser(db, "once@example.com");
    const b = await findOrCreateUser(db, "ONCE@example.com");
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.user.id).toBe(a.user.id);
  });
});

describe("rate guidance", () => {
  it("stays hidden below five samples, then reports the interquartile range", async () => {
    const db = await getDb();
    const q = { niche: "beauty", country: "AE", deliverable: "reel" as const, followers: 20_000 };
    expect(await rateRange(db, q)).toBeNull();
    await db.insert(rateSamples).values([400, 500, 600, 700, 800].map((usd) => ({ niche: "beauty", country: "AE", platform: "instagram" as const, deliverable: "reel" as const, followers: 25_000, amountCents: usd * 100, source: "deal" as const })));
    const r = await rateRange(db, q);
    expect(r).toMatchObject({ lowCents: 50_000, medianCents: 60_000, highCents: 70_000, sample: 5, illustrative: false, band: "10k-50k" });
  });
});
