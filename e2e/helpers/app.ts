import { expect, type APIRequestContext, type Locator, type Page } from "@playwright/test";

export const BRAND_EMAIL = "team@glowco.demo.evra.world";
export const SARA = "sara.creates";

export const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

type Message = { id: string; template: string; subject: string; data: Record<string, unknown> | null };

// The dev outbox (/api/dev/outbox) is the inbox for sign-in codes and claim codes.
export async function inbox(api: APIRequestContext, to: string): Promise<Message[]> {
  const res = await api.get(`/api/dev/outbox?to=${encodeURIComponent(to)}`);
  expect(res.ok(), `outbox ${res.status()}`).toBeTruthy();
  return (await res.json()).messages;
}

// Newest message of `template` that was not in `seen` (ids read before the action that sends it).
export async function nextMessage(api: APIRequestContext, to: string, template: string, seen: string[] = []) {
  let msg: Message | undefined;
  await expect
    .poll(async () => (msg = (await inbox(api, to)).find((m) => m.template === template && !seen.includes(m.id))), { timeout: 30_000, message: `no ${template} for ${to}` })
    .toBeTruthy();
  return msg!;
}

export const codeIn = (m: Message) => m.subject.match(/\b(\d{6})\b/)?.[1] ?? String(m.data?.code);

export async function seenIds(api: APIRequestContext, to: string) {
  return (await inbox(api, to)).map((m) => m.id);
}

async function post(api: APIRequestContext, url: string, data: unknown) {
  const res = await api.post(url, { data });
  const body = await res.json().catch(() => ({}));
  expect(res.ok(), `${url} ${res.status()}: ${body.error ?? ""}`).toBeTruthy();
  return body;
}

// Signs `api`'s cookie jar in by email code, the same calls the /signin form makes.
export async function signIn(api: APIRequestContext, email: string): Promise<string> {
  const seen = await seenIds(api, email);
  await post(api, "/api/auth/code", { email });
  const code = codeIn(await nextMessage(api, email, "signin_code", seen));
  return (await post(api, "/api/auth/verify", { email, code })).next;
}

// A fresh, onboarded creator. Niche "gaming" has no seeded rate samples, so the kit's Reel price is exactly minRateCents.
export async function newCreator(api: APIRequestContext, minRateCents = 1500) {
  const id = uniq();
  const c = { email: `e2e-creator-${id}@demo.evra.world`, handle: `e2e_${id}`, name: `E2E Creator ${id}` };
  await signIn(api, c.email);
  await post(api, "/api/onboarding", {
    action: "complete",
    data: { role: "creator", name: c.name, handle: c.handle, country: "AE", adult: true, accounts: [{ platform: "instagram", handle: c.handle, followers: 2500, source: "self" }], niches: ["gaming"], openTo: ["paid_collab"], howIHelp: ["content"], minRateCents, headline: "Made by the EVRA end-to-end suite", bio: "A test creator." },
  });
  return c;
}

export const dealAction = (api: APIRequestContext, dealPath: string, data: Record<string, unknown>) => post(api, `/api${dealPath}`, data);

// Brand opens the creator's kit and sends the one-tap offer; returns the Deal Room path.
export async function sendOffer(brandPage: Page, handle: string) {
  await brandPage.goto(`/@${handle}`);
  await brandPage.getByRole("button", { name: "Send an offer" }).click();
  await brandPage.waitForURL(/\/deals\/[0-9a-f-]{36}$/, { timeout: 60_000 });
  return new URL(brandPage.url()).pathname;
}

// Inline errors the app shows (not Next's route announcer, which also has role=alert).
export const appError = (page: Page) => page.locator(".ev-error[role=alert], .ev-notice--bad[role=alert]");

// Waits for `done`, failing straight away with the app's own message if an error shows instead.
export async function expectDone(page: Page, done: Locator, timeout = 60_000) {
  await expect(done.or(appError(page)).first()).toBeVisible({ timeout });
  const err = appError(page).first();
  if (await err.isVisible()) throw new Error(`App error: ${await err.innerText()}`);
}
