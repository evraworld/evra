import type { DB } from "@/lib/db";
import { staffActions } from "@/lib/db/schema";

// Every staff action lands here. Rows that name a member (targetUserId) also belong in that member's activity log.
export async function audit(db: DB, staffId: string, action: string, o: { target?: string | null; reason?: string | null; data?: Record<string, unknown> } = {}) {
  await db.insert(staffActions).values({ staffId, action, targetUserId: o.target ?? null, reason: o.reason ?? null, data: o.data ?? {} });
}
