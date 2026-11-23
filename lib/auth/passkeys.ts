import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import type { DB } from "@/lib/db";
import { passkeys, users, webauthnChallenges } from "@/lib/db/schema";
import { token } from "@/lib/crypto";
import { HttpError } from "./guards";
import type { User } from "./session";

const CHALLENGE_COOKIE = "evra_wa";
const origin = () => process.env.APP_ORIGIN ?? "http://localhost:3000";
const rpID = () => new URL(origin()).hostname;

async function saveChallenge(db: DB, challenge: string, userId: string | null) {
  const id = token(16);
  await db.insert(webauthnChallenges).values({ id, userId, challenge, expiresAt: new Date(Date.now() + 5 * 60_000) });
  (await cookies()).set(CHALLENGE_COOKIE, id, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 300 });
}

async function takeChallenge(db: DB) {
  const jar = await cookies();
  const id = jar.get(CHALLENGE_COOKIE)?.value;
  jar.delete(CHALLENGE_COOKIE);
  if (!id) throw new HttpError(400, "Start again: the Face ID request expired.");
  const [row] = await db.select().from(webauthnChallenges).where(eq(webauthnChallenges.id, id)).limit(1);
  await db.delete(webauthnChallenges).where(eq(webauthnChallenges.id, id));
  if (!row || row.expiresAt < new Date()) throw new HttpError(400, "Start again: the Face ID request expired.");
  return row;
}

export async function registrationOptions(db: DB, user: User) {
  const existing = await db.select().from(passkeys).where(eq(passkeys.userId, user.id));
  const options = await generateRegistrationOptions({
    rpName: "EVRA",
    rpID: rpID(),
    userName: user.email,
    userDisplayName: user.name ?? user.email,
    userID: new TextEncoder().encode(user.id),
    attestationType: "none",
    excludeCredentials: existing.map((p) => ({ id: p.id, transports: p.transports ?? undefined })),
    authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
  });
  await saveChallenge(db, options.challenge, user.id);
  return options;
}

export async function verifyRegistration(db: DB, user: User, response: RegistrationResponseJSON, deviceName?: string) {
  const ch = await takeChallenge(db);
  if (ch.userId !== user.id) throw new HttpError(400, "Start again.");
  const result = await verifyRegistrationResponse({ response, expectedChallenge: ch.challenge, expectedOrigin: origin(), expectedRPID: rpID() });
  if (!result.verified) throw new HttpError(400, "Face ID could not be set up. Try again.");
  const { credential } = result.registrationInfo;
  await db.insert(passkeys).values({
    id: credential.id,
    userId: user.id,
    publicKey: Buffer.from(credential.publicKey).toString("base64url"),
    counter: credential.counter,
    transports: credential.transports ?? null,
    deviceName: deviceName ?? null,
  });
}

export async function authenticationOptions(db: DB) {
  const options = await generateAuthenticationOptions({ rpID: rpID(), userVerification: "preferred" });
  await saveChallenge(db, options.challenge, null);
  return options;
}

export async function verifyAuthentication(db: DB, response: AuthenticationResponseJSON) {
  const ch = await takeChallenge(db);
  const [pk] = await db.select().from(passkeys).where(eq(passkeys.id, response.id)).limit(1);
  if (!pk) throw new HttpError(400, "This passkey isn't registered with EVRA. Sign in with an email code.");
  const result = await verifyAuthenticationResponse({
    response,
    expectedChallenge: ch.challenge,
    expectedOrigin: origin(),
    expectedRPID: rpID(),
    credential: { id: pk.id, publicKey: new Uint8Array(Buffer.from(pk.publicKey, "base64url")), counter: pk.counter, transports: pk.transports ?? undefined },
  });
  if (!result.verified) throw new HttpError(401, "Face ID didn't match. Try again or use an email code.");
  await db.update(passkeys).set({ counter: result.authenticationInfo.newCounter }).where(eq(passkeys.id, pk.id));
  const [user] = await db.select().from(users).where(eq(users.id, pk.userId)).limit(1);
  return user;
}
