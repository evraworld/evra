import type { DB } from "@/lib/db";
import { analyticsEvents, viewEvents } from "@/lib/db/schema";

// First-party product events only; nothing leaves EVRA's own database.
export async function track(db: DB, name: string, props: Record<string, unknown> = {}, who: { userId?: string | null; anonId?: string | null } = {}) {
  await db.insert(analyticsEvents).values({ name, props, userId: who.userId ?? null, anonId: who.anonId ?? null });
}

export async function recordView(db: DB, v: { subjectKind: "kit" | "brief" | "offer"; subjectId: string; viewerUserId?: string | null; viewerBrandId?: string | null; section?: string | null; seconds?: number }) {
  await db.insert(viewEvents).values({ ...v, viewerUserId: v.viewerUserId ?? null, viewerBrandId: v.viewerBrandId ?? null, section: v.section ?? null, seconds: Math.max(0, Math.min(3600, Math.round(v.seconds ?? 0))) });
}
