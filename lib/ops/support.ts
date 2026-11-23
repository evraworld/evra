import { and, asc, count, desc, eq, gt, ilike, inArray, or } from "drizzle-orm";
import type { DB } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { HttpError } from "@/lib/auth/guards";
import { normalizeHandle } from "@/lib/users";
import { audit } from "./audit";

export const VIEW_MINUTES = 30;

const member = { id: s.users.id, email: s.users.email, name: s.users.name, handle: s.users.handle, role: s.users.role, status: s.users.status };
export type Member = { id: string; email: string; name: string | null; handle: string | null; role: s.Role | null; status: string };

export async function findMembers(db: DB, q: string): Promise<Member[]> {
  const term = q.trim().toLowerCase();
  if (term.length < 2) return [];
  return db
    .select(member)
    .from(s.users)
    .where(or(ilike(s.users.email, `%${term}%`), ilike(s.users.handle, `%${normalizeHandle(term)}%`)))
    .orderBy(asc(s.users.email))
    .limit(20);
}

export async function memberById(db: DB, id: string): Promise<Member | null> {
  const [m] = await db.select(member).from(s.users).where(eq(s.users.id, id)).limit(1);
  return m ?? null;
}

export async function startView(db: DB, staffId: string, memberId: string, rawReason: string) {
  const reason = rawReason.trim();
  if (reason.length < 5) throw new HttpError(400, "Say why you need this view. It goes in the audit log and the member's activity log.");
  if (!(await memberById(db, memberId))) throw new HttpError(404, "That member doesn't exist.");
  const [view] = await db.insert(s.supportViews).values({ staffId, memberId, reason, endsAt: new Date(Date.now() + VIEW_MINUTES * 60_000) }).returning({ id: s.supportViews.id });
  await audit(db, staffId, "support_view", { target: memberId, reason, data: { viewId: view.id, minutes: VIEW_MINUTES } });
  return view.id;
}

export async function openViews(db: DB, staffId: string) {
  return db
    .select({ id: s.supportViews.id, endsAt: s.supportViews.endsAt, email: s.users.email, handle: s.users.handle })
    .from(s.supportViews)
    .innerJoin(s.users, eq(s.users.id, s.supportViews.memberId))
    .where(and(eq(s.supportViews.staffId, staffId), gt(s.supportViews.endsAt, new Date())))
    .orderBy(desc(s.supportViews.startedAt));
}

// The fence: every column below is picked by name. Nothing is read from invoices,
// deal comments, otp codes, sessions or passkeys, and no amounts leave this function.
export async function supportSummary(db: DB, staffId: string, viewId: string) {
  const [view] = await db.select().from(s.supportViews).where(and(eq(s.supportViews.id, viewId), eq(s.supportViews.staffId, staffId))).limit(1);
  if (!view) return { state: "missing" as const };
  if (view.endsAt <= new Date()) return { state: "ended" as const, memberId: view.memberId };
  const id = view.memberId;
  const [[who], [profile], accounts, brands, received, [sent], [kit]] = await Promise.all([
    db.select({ ...member, locale: s.users.locale, country: s.users.country, city: s.users.city, foundingNumber: s.users.foundingNumber, createdAt: s.users.createdAt, onboardedAt: s.users.onboardedAt }).from(s.users).where(eq(s.users.id, id)).limit(1),
    db.select({ displayName: s.creatorProfiles.displayName, headline: s.creatorProfiles.headline, bio: s.creatorProfiles.bio, niches: s.creatorProfiles.niches, openTo: s.creatorProfiles.openTo, kitPublic: s.creatorProfiles.kitPublic }).from(s.creatorProfiles).where(eq(s.creatorProfiles.userId, id)).limit(1),
    db.select({ platform: s.socialAccounts.platform, handle: s.socialAccounts.handle, followers: s.socialAccounts.followers, source: s.socialAccounts.source, verified: s.socialAccounts.verified }).from(s.socialAccounts).where(eq(s.socialAccounts.userId, id)),
    db.select({ id: s.brands.id, name: s.brands.name, role: s.brandMembers.role }).from(s.brandMembers).innerJoin(s.brands, eq(s.brands.id, s.brandMembers.brandId)).where(eq(s.brandMembers.userId, id)),
    db.select({ status: s.requests.status, n: count() }).from(s.requests).where(eq(s.requests.toCreatorId, id)).groupBy(s.requests.status),
    db.select({ n: count() }).from(s.requests).where(eq(s.requests.fromUserId, id)),
    db.select({ status: s.kitDrafts.status, invitedAt: s.kitDrafts.invitedAt }).from(s.kitDrafts).where(eq(s.kitDrafts.claimedBy, id)).limit(1),
  ]);
  if (!who) return { state: "missing" as const };
  const brandIds = brands.map((b) => b.id);
  const deals = await db
    .select({ id: s.deals.id, title: s.deals.title, status: s.deals.status, updatedAt: s.deals.updatedAt })
    .from(s.deals)
    .where(brandIds.length ? or(eq(s.deals.creatorId, id), inArray(s.deals.brandId, brandIds)) : eq(s.deals.creatorId, id))
    .orderBy(desc(s.deals.updatedAt))
    .limit(50);
  return {
    state: "open" as const,
    endsAt: view.endsAt,
    secondsLeft: Math.max(1, Math.ceil((view.endsAt.getTime() - Date.now()) / 1000)),
    reason: view.reason,
    member: who,
    profile: profile ?? null,
    accounts,
    brands: brands.map(({ name, role }) => ({ name, role })),
    deals,
    requests: { received: Object.fromEntries(received.map((r) => [r.status, r.n])) as Record<string, number>, sent: sent.n },
    kitPath: who.role === "creator" && who.handle ? `/@${who.handle}` : null,
    claimedKit: kit ?? null,
  };
}
