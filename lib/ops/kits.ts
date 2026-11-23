import { and, count, desc, eq, gt, inArray, isNotNull, lt } from "drizzle-orm";
import type { DB } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { HttpError } from "@/lib/auth/guards";
import { EMAIL_RE } from "@/lib/auth/otp";
import { sha256, token } from "@/lib/crypto";
import { send } from "@/lib/messages";
import { draftKit } from "@/lib/ai/agents";
import { AgentUnavailable, type StructuredFn } from "@/lib/ai/claude";
import { publicInstagram } from "@/lib/social";
import { HANDLE_RE, handleAvailable, normalizeHandle } from "@/lib/users";
import { rateRange } from "@/lib/rates";
import { defaultRateCard, FOUNDING_SEATS, NICHES, type COUNTRIES } from "@/lib/onboarding";
import { audit } from "./audit";

export const KIT_PLATFORMS = ["instagram", "tiktok", "youtube"] as const;
export type KitPlatform = (typeof KIT_PLATFORMS)[number];
export type KitRow = { platform: KitPlatform; handle: string; email: string; name: string };
export type KitFrom = "csv" | "public_profile" | "staff" | "assistant";
export type KitDraftRow = typeof s.kitDrafts.$inferSelect;

// kit_drafts.data: the stats, plus where each field came from and when (privacy rule for pre-built kits).
export type KitData = {
  followers?: number;
  avgViews?: number;
  engagementBps?: number;
  niches?: string[];
  sources?: Partial<Record<"name" | "followers" | "headline" | "synopsis", { from: KitFrom; at: string }>>;
  deleted?: { by: "creator" | "staff" | "expiry"; at: string };
};

export const KIT_TTL_DAYS = 90;
export const MAX_IMPORT = 50;
export const LINK_GONE = "This link doesn't work anymore. The draft was claimed, deleted or it expired.";
const SOCIAL_HANDLE_RE = /^[a-z0-9_.-]{1,60}$/;

export const kitData = (d: { data: Record<string, unknown> }) => d.data as KitData;
const stamp = (from: KitFrom) => ({ from, at: new Date().toISOString() });

// Deleting keeps only platform and handle, so a creator who said no is never drafted again.
const wiped = (by: "creator" | "staff" | "expiry") => ({
  status: "deleted" as const,
  email: null,
  displayName: null,
  headline: null,
  synopsis: null,
  claimTokenHash: null,
  data: { deleted: { by, at: new Date().toISOString() } } satisfies KitData,
});

// ---------- staff side ----------

export function parseKitCsv(text: string) {
  const rows: KitRow[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  text.split(/\r?\n/).forEach((line, i) => {
    const cells = line.split(",").map((c) => c.trim().replace(/^"+|"+$/g, "").trim());
    if (!line.trim() || cells[0].toLowerCase() === "platform") return;
    const [p = "", h = "", e = "", ...rest] = cells;
    const platform = p.toLowerCase() as KitPlatform;
    const handle = normalizeHandle(h);
    const email = e.toLowerCase();
    const at = `Line ${i + 1}`;
    if (!KIT_PLATFORMS.includes(platform)) errors.push(`${at}: platform must be instagram, tiktok or youtube.`);
    else if (!SOCIAL_HANDLE_RE.test(handle)) errors.push(`${at}: check the handle.`);
    else if (!EMAIL_RE.test(email)) errors.push(`${at}: check the email.`);
    else if (seen.has(`${platform}:${handle}`)) errors.push(`${at}: @${handle} is already in this list.`);
    else {
      seen.add(`${platform}:${handle}`);
      rows.push({ platform, handle, email, name: rest.filter(Boolean).join(", ").slice(0, 80) || handle });
    }
  });
  return { rows, errors };
}

export async function importKits(db: DB, staffId: string, csv: string) {
  const { rows, errors } = parseKitCsv(csv);
  if (rows.length > MAX_IMPORT) throw new HttpError(400, `Paste up to ${MAX_IMPORT} creators at a time.`);
  if (!rows.length) return { ids: [] as string[], errors };
  const [prior, members] = await Promise.all([
    db.select({ platform: s.kitDrafts.platform, handle: s.kitDrafts.handle, status: s.kitDrafts.status, data: s.kitDrafts.data }).from(s.kitDrafts).where(inArray(s.kitDrafts.handle, rows.map((r) => r.handle))),
    db.select({ email: s.users.email }).from(s.users).where(inArray(s.users.email, rows.map((r) => r.email))),
  ]);
  const onEvra = new Set(members.map((m) => m.email));
  const fresh = rows.filter((r) => {
    const mine = prior.filter((d) => d.platform === r.platform && d.handle === r.handle);
    if (mine.some((d) => kitData(d).deleted?.by === "creator")) errors.push(`@${r.handle} asked us to delete their draft. We don't draft them again.`);
    else if (mine.some((d) => d.status !== "deleted")) errors.push(`@${r.handle} already has a draft.`);
    else if (onEvra.has(r.email)) errors.push(`${r.email} is already on EVRA.`);
    else return true;
    return false;
  });
  const now = Date.now();
  const created = fresh.length
    ? await db
        .insert(s.kitDrafts)
        .values(fresh.map((r) => ({ handle: r.handle, platform: r.platform, displayName: r.name, email: r.email, source: "csv" as const, createdBy: staffId, data: { sources: { name: stamp("csv") } } satisfies KitData, deleteAfter: new Date(now + KIT_TTL_DAYS * 86_400_000) })))
        .returning({ id: s.kitDrafts.id })
    : [];
  await audit(db, staffId, "kit_import", { data: { created: created.length, skipped: rows.length - created.length } });
  return { ids: created.map((c) => c.id), errors };
}

async function draftIn(db: DB, id: string, statuses: KitDraftRow["status"][], message: string) {
  const [d] = await db.select().from(s.kitDrafts).where(eq(s.kitDrafts.id, id)).limit(1);
  if (!d) throw new HttpError(404, "That draft doesn't exist.");
  if (!statuses.includes(d.status)) throw new HttpError(409, message);
  return d;
}

const LOCKED = "This draft can't change any more. Invited, claimed and deleted drafts are locked.";

// Reads public stats (Instagram only), or uses followers staff typed, then asks the assistant for a headline and synopsis.
// Any change sends the draft back to "draft", so an approval always covers the latest content.
export async function redraft(db: DB, staffId: string, id: string, opts: { followers?: number; llm?: StructuredFn } = {}) {
  const d = await draftIn(db, id, ["draft", "approved"], LOCKED);
  const prev = kitData(d);
  // Typed followers carry no views or engagement: a kit about someone who hasn't signed up states only what we know.
  const typed = opts.followers ? { followers: opts.followers, avgViews: 0, engagementBps: 0, captions: [] as string[] } : null;
  const read = !typed && d.platform === "instagram" ? await publicInstagram(d.handle).catch(() => null) : null;
  const kept = prev.followers ? { followers: prev.followers, avgViews: prev.avgViews ?? 0, engagementBps: prev.engagementBps ?? 0, captions: [] as string[] } : null;
  const stats = typed ?? read ?? kept;
  if (!stats) throw new HttpError(422, "We couldn't read public stats for this account. Type the follower count, then draft again.");

  const data: KitData = { ...prev, followers: stats.followers, avgViews: stats.avgViews, engagementBps: stats.engagementBps, sources: { ...prev.sources, followers: typed ? stamp("staff") : read ? stamp("public_profile") : prev.sources?.followers } };
  await db.update(s.kitDrafts).set({ data, status: "draft", source: typed ? "manual" : read ? "public" : d.source }).where(eq(s.kitDrafts.id, id));

  let kit;
  try {
    kit = await draftKit({ name: d.displayName ?? d.handle, handle: d.handle, platform: d.platform, followers: stats.followers, avgViews: stats.avgViews, captions: stats.captions, locale: "en" }, opts.llm);
  } catch (e) {
    if (e instanceof AgentUnavailable) throw new HttpError(503, `${e.message} The stats are saved, so you can write the headline and synopsis yourself.`);
    throw e;
  }
  const headline = kit.headline.slice(0, 120);
  const synopsis = kit.bio.slice(0, 400);
  await db
    .update(s.kitDrafts)
    .set({ headline, synopsis, data: { ...data, niches: kit.niches, sources: { ...data.sources, headline: stamp("assistant"), synopsis: stamp("assistant") } } })
    .where(eq(s.kitDrafts.id, id));
  await audit(db, staffId, "kit_draft", { data: { draftId: id, statsFrom: data.sources?.followers?.from ?? null } });
  return { headline, synopsis, followers: stats.followers };
}

export async function editDraft(db: DB, staffId: string, id: string, patch: { displayName: string; headline: string; synopsis: string }) {
  const d = await draftIn(db, id, ["draft", "approved"], LOCKED);
  const prev = kitData(d);
  const sources = { ...prev.sources };
  if (patch.displayName !== (d.displayName ?? "")) sources.name = stamp("staff");
  if (patch.headline !== (d.headline ?? "")) sources.headline = stamp("staff");
  if (patch.synopsis !== (d.synopsis ?? "")) sources.synopsis = stamp("staff");
  await db.update(s.kitDrafts).set({ displayName: patch.displayName, headline: patch.headline || null, synopsis: patch.synopsis || null, status: "draft", data: { ...prev, sources } }).where(eq(s.kitDrafts.id, id));
  await audit(db, staffId, "kit_edit", { data: { draftId: id } });
}

export async function approveDraft(db: DB, staffId: string, id: string) {
  const d = await draftIn(db, id, ["draft"], "Only drafts waiting for review can be approved.");
  if (!d.headline || !d.synopsis || !kitData(d).followers) throw new HttpError(400, "Add followers, a headline and a synopsis before approving.");
  await db.update(s.kitDrafts).set({ status: "approved" }).where(eq(s.kitDrafts.id, id));
  await audit(db, staffId, "kit_approve", { data: { draftId: id, handle: d.handle } });
}

// Only the hash of the claim token is stored; a new invite replaces the old link.
export async function inviteDraft(db: DB, staffId: string, id: string, origin: string) {
  const d = await draftIn(db, id, ["approved", "invited"], "Approve the draft before sending an invite.");
  if (!d.email) throw new HttpError(400, "This draft has no email address.");
  const raw = token();
  await db.update(s.kitDrafts).set({ status: "invited", claimTokenHash: sha256(raw), invitedAt: new Date() }).where(eq(s.kitDrafts.id, id));
  await send(db, { to: d.email, template: "kit_claim_invite", data: { name: d.displayName ?? d.handle, url: `${origin}/claim/${raw}` } });
  await audit(db, staffId, "kit_invite", { data: { draftId: id, again: d.status === "invited" } });
}

export async function deleteDraft(db: DB, staffId: string, id: string) {
  const d = await draftIn(db, id, ["draft", "approved", "invited"], "This draft is already claimed or deleted.");
  await db.update(s.kitDrafts).set(wiped("staff")).where(eq(s.kitDrafts.id, id));
  await audit(db, staffId, "kit_delete", { data: { draftId: id, handle: d.handle } });
}

// Unclaimed drafts go after 90 days. Runs whenever the launcher loads and with the scheduled jobs.
export async function purgeExpiredDrafts(db: DB) {
  const gone = await db
    .update(s.kitDrafts)
    .set(wiped("expiry"))
    .where(and(lt(s.kitDrafts.deleteAfter, new Date()), inArray(s.kitDrafts.status, ["draft", "approved", "invited"])))
    .returning({ id: s.kitDrafts.id });
  return gone.length;
}

export async function listDrafts(db: DB) {
  await purgeExpiredDrafts(db);
  return db.select().from(s.kitDrafts).orderBy(desc(s.kitDrafts.createdAt)).limit(300);
}

export async function kitCounts(db: DB) {
  const rows = await db.select({ status: s.kitDrafts.status, n: count() }).from(s.kitDrafts).groupBy(s.kitDrafts.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Partial<Record<KitDraftRow["status"], number>>;
}

// ---------- creator side (whoever holds the claim link) ----------

export async function draftForToken(db: DB, raw: string) {
  if (!raw || raw.length > 128) return null;
  const [d] = await db
    .select()
    .from(s.kitDrafts)
    .where(and(eq(s.kitDrafts.claimTokenHash, sha256(raw)), eq(s.kitDrafts.status, "invited"), gt(s.kitDrafts.deleteAfter, new Date())))
    .limit(1);
  return d ?? null;
}

export async function claimHandleState(db: DB, raw: string, rawHandle: string) {
  if (!(await draftForToken(db, raw))) throw new HttpError(404, LINK_GONE);
  const handle = normalizeHandle(rawHandle);
  const valid = HANDLE_RE.test(handle);
  return { handle, valid, available: valid && (await handleAvailable(db, handle)) };
}

export async function deleteByToken(db: DB, raw: string) {
  const d = await draftForToken(db, raw);
  if (!d) throw new HttpError(404, LINK_GONE);
  await db.update(s.kitDrafts).set(wiped("creator")).where(eq(s.kitDrafts.id, d.id));
}

export async function claimDraft(db: DB, user: typeof s.users.$inferSelect, raw: string, input: { handle: string; country: (typeof COUNTRIES)[number] }) {
  const d = await draftForToken(db, raw);
  if (!d) throw new HttpError(404, LINK_GONE);
  if (user.onboardedAt) throw new HttpError(409, "This email already has an EVRA account. Use another email, or delete this draft.");
  const handle = normalizeHandle(input.handle);
  if (!HANDLE_RE.test(handle)) throw new HttpError(400, "Use 3 to 30 letters, numbers, dots or underscores.");
  if (!(await handleAvailable(db, handle, user.id))) throw new HttpError(409, "That link is taken. Pick another.");

  const data = kitData(d);
  const name = d.displayName ?? d.handle;
  const niches = (data.niches ?? []).filter((n) => (NICHES as readonly string[]).includes(n)).slice(0, 4);
  const followers = data.followers ?? 0;
  const [{ seats }] = await db.select({ seats: count() }).from(s.users).where(isNotNull(s.users.foundingNumber));
  const guide = niches[0] ? await rateRange(db, { niche: niches[0], country: input.country === "IN" ? "IN" : "AE", deliverable: "reel", followers }) : null;
  const reel = guide?.medianCents ?? 0;

  await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(s.kitDrafts)
      .set({ status: "claimed", claimedBy: user.id, claimTokenHash: null })
      .where(and(eq(s.kitDrafts.id, d.id), eq(s.kitDrafts.status, "invited")))
      .returning({ id: s.kitDrafts.id });
    if (!claimed) throw new HttpError(409, LINK_GONE);
    await tx
      .update(s.users)
      .set({ name, role: "creator", handle, country: input.country, adult: true, onboardedAt: new Date(), foundingNumber: user.foundingNumber ?? (seats < FOUNDING_SEATS ? seats + 1 : null) })
      .where(eq(s.users.id, user.id));
    await tx.insert(s.creatorProfiles).values({ userId: user.id, displayName: name, headline: d.headline, bio: d.synopsis, niches }).onConflictDoNothing();
    await tx
      .insert(s.socialAccounts)
      .values({ userId: user.id, platform: d.platform, handle: d.handle, followers, avgViews: data.avgViews ?? 0, engagementBps: data.engagementBps ?? 0, source: "public", verified: false })
      .onConflictDoNothing();
    if (reel > 0) await tx.insert(s.rateCardItems).values(defaultRateCard(user.id, reel));
  });
  return { next: "/me?welcome=1" };
}
