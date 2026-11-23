import { and, desc, eq, isNotNull } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { requests } from "@/lib/db/schema";

const HOUR = 3_600_000;

// "Quick to respond": the median first reply over the creator's last 10 answered requests is under 24 hours.
export async function responseBadge(db: DB, creatorId: string): Promise<"quick" | null> {
  const rows = await db
    .select({ created: requests.createdAt, responded: requests.respondedAt })
    .from(requests)
    .where(and(eq(requests.toCreatorId, creatorId), isNotNull(requests.respondedAt)))
    .orderBy(desc(requests.respondedAt))
    .limit(10);
  if (!rows.length) return null;
  const hours = rows.map((r) => (r.responded!.getTime() - r.created.getTime()) / HOUR).sort((a, b) => a - b);
  const mid = Math.floor(hours.length / 2);
  const median = hours.length % 2 ? hours[mid] : (hours[mid - 1] + hours[mid]) / 2;
  return median < 24 ? "quick" : null;
}
