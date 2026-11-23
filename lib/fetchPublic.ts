import { lookup } from "node:dns/promises";
import net from "node:net";

const PRIVATE_V4 = [/^0\./, /^10\./, /^127\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, /^22[4-9]\./, /^2[3-5]\d\./];

export function isPrivateAddress(ip: string) {
  if (net.isIPv4(ip)) return PRIVATE_V4.some((r) => r.test(ip));
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return isPrivateAddress(v.slice(7));
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb");
}

export class FetchBlocked extends Error {}

async function assertPublic(url: URL) {
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new FetchBlocked("Only web addresses can be read.");
  if (url.username || url.password) throw new FetchBlocked("Addresses with passwords can't be read.");
  const { address } = await lookup(url.hostname);
  if (isPrivateAddress(address)) throw new FetchBlocked("That address points to a private network.");
}

// Reads a public web page as plain text for the brand-profile agent. Guards against server-side request
// forgery by refusing private addresses on every redirect hop (DNS rebinding remains a known gap).
export async function fetchPublicText(raw: string, maxBytes = 800_000): Promise<string> {
  let url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  for (let hop = 0; hop < 4; hop++) {
    await assertPublic(url);
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(8_000), headers: { "user-agent": "EVRA-brand-reader/1.0 (+https://evra.world)", accept: "text/html" } });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, url);
      continue;
    }
    if (!res.ok) throw new FetchBlocked(`The site answered ${res.status}.`);
    const reader = res.body?.getReader();
    let html = "";
    let size = 0;
    const dec = new TextDecoder();
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      html += dec.decode(value, { stream: true });
      if (size > maxBytes) {
        await reader.cancel();
        break;
      }
    }
    return htmlToText(html);
  }
  throw new FetchBlocked("Too many redirects.");
}

export const htmlToText = (html: string) =>
  html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<meta[^>]+(name|property)="(description|og:description|og:title)"[^>]+content="([^"]*)"[^>]*>/gi, " $3 ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
