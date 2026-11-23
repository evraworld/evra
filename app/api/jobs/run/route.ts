import { getDb } from "@/lib/db";
import { HttpError } from "@/lib/auth/guards";
import { safeEqual } from "@/lib/crypto";
import { autoReleaseDue } from "@/lib/deals/actions";
import { runRequestJobs } from "@/lib/jobs/requests";
import { purgeExpiredDrafts } from "@/lib/ops/kits";
import { route } from "@/lib/http";

// Every scheduled job in one call, run inside the server that owns the database.
// A scheduler calls this in production; `npm run jobs` calls it locally.
export const POST = route(async (req) => {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("x-cron-secret") ?? "";
  if (!secret || !safeEqual(given, secret)) throw new HttpError(401, "Not allowed.");
  const db = await getDb();
  const now = new Date();
  const results: Record<string, unknown> = {};
  for (const [name, job] of Object.entries({
    autoRelease: () => autoReleaseDue(db, now),
    requests: () => runRequestJobs(db, now),
    kitDrafts: () => purgeExpiredDrafts(db),
  })) {
    try {
      results[name] = await job();
    } catch (e) {
      console.error(`job ${name} failed`, e);
      results[name] = { error: (e as Error).message };
    }
  }
  return { ranAt: now.toISOString(), results };
});
