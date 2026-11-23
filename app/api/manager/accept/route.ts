import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { managerLinks } from "@/lib/db/schema";
import { apiUser, HttpError } from "@/lib/auth/guards";
import { sha256 } from "@/lib/crypto";
import { body, route } from "@/lib/http";

// The invited manager accepts while signed in with the invited email; from then on they are copied on the creator's chosen requests.
export const POST = route(async (req) => {
  const user = await apiUser();
  const { token } = z.object({ token: z.string().min(16).max(100) }).parse(await body(req));
  const db = await getDb();
  const [link] = await db.select().from(managerLinks).where(eq(managerLinks.tokenHash, sha256(token))).limit(1);
  if (!link || link.status === "revoked") throw new HttpError(404, "This invite doesn't work any more.");
  if (link.managerEmail.toLowerCase() !== user.email.toLowerCase()) throw new HttpError(403, `This invite is for ${link.managerEmail}. Sign in with that email to accept.`);
  if (link.status === "invited") await db.update(managerLinks).set({ managerUserId: user.id, status: "active" }).where(and(eq(managerLinks.id, link.id), eq(managerLinks.status, "invited")));
  return { ok: true };
});
