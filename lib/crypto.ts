import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export const token = (bytes = 32) => randomBytes(bytes).toString("base64url");

export const sixDigitCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

// Short, unambiguous ids for receipts and invoice numbers people read aloud.
export const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const shortId = (len = 8) => Array.from(randomBytes(len), (b) => ALPHABET[b % ALPHABET.length]).join("");

function secret(name: "SESSION_SECRET") {
  const v = process.env[name];
  if (!v || v.length < 32) throw new Error(`${name} is missing or too short`);
  return v;
}

export const hmac = (value: string) => createHmac("sha256", secret("SESSION_SECRET")).update(value).digest("hex");

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
